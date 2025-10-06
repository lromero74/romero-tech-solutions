import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import crypto from 'crypto';
import { getPool } from '../../config/database.js';
import { sendEmployeeNoteNotificationToClient } from '../../services/emailService.js';
import { websocketService } from '../../services/websocketService.js';
import filterPresetService from '../../services/filterPresetService.js';
import virusScanService from '../../services/virusScanService.js';
import quotaManagementService from '../../services/quotaManagementService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * GET /api/admin/service-requests
 * Get all service requests with full details (admin view)
 */
router.get('/service-requests', async (req, res) => {
  try {
    const pool = await getPool();
    const {
      page = 1,
      limit = 20,
      status,
      urgency,
      priority,
      businessId,
      technicianId,
      search,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause dynamically
    const conditions = ['sr.soft_delete = false'];
    const params = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      // Check if this is a preset filter (starts with *)
      if (status.startsWith('*')) {
        const presetName = status.substring(1); // Remove the * prefix
        try {
          // Fetch the preset
          const presets = await filterPresetService.getActivePresets('status');
          const preset = presets.find(p => p.name === presetName);

          if (preset) {
            // Build WHERE clause from preset criteria
            const presetClause = filterPresetService.buildWhereClause(preset.criteria);
            conditions.push(presetClause);
          } else {
            console.warn(`Preset filter not found: ${presetName}`);
            // Fallback to exact match
            conditions.push(`LOWER(srs.name) = LOWER($${paramIndex})`);
            params.push(status);
            paramIndex++;
          }
        } catch (error) {
          console.error('Error applying preset filter:', error);
          // Fallback to exact match
          conditions.push(`LOWER(srs.name) = LOWER($${paramIndex})`);
          params.push(status);
          paramIndex++;
        }
      } else {
        // Regular status filter (exact match)
        conditions.push(`LOWER(srs.name) = LOWER($${paramIndex})`);
        params.push(status);
        paramIndex++;
      }
    }

    if (urgency && urgency !== 'all') {
      conditions.push(`ul.id = $${paramIndex}`);
      params.push(urgency);
      paramIndex++;
    }

    if (priority && priority !== 'all') {
      conditions.push(`pl.id = $${paramIndex}`);
      params.push(priority);
      paramIndex++;
    }

    if (businessId && businessId !== 'all') {
      conditions.push(`sr.business_id = $${paramIndex}`);
      params.push(businessId);
      paramIndex++;
    }

    if (technicianId && technicianId !== 'all') {
      conditions.push(`sr.assigned_to_employee_id = $${paramIndex}`);
      params.push(technicianId);
      paramIndex++;
    }

    if (search && search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      conditions.push(`(
        LOWER(sr.request_number) LIKE $${paramIndex} OR
        LOWER(sr.title) LIKE $${paramIndex} OR
        LOWER(u.first_name || ' ' || u.last_name) LIKE $${paramIndex} OR
        LOWER(b.business_name) LIKE $${paramIndex}
      )`);
      params.push(searchTerm);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Validate sortBy to prevent SQL injection
    const validSortColumns = ['created_at', 'updated_at', 'request_number', 'title', 'requested_datetime', 'scheduled_datetime'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const query = `
      SELECT
        sr.id,
        sr.request_number,
        sr.title,
        sr.description,
        sr.requested_datetime,
        sr.requested_duration_minutes,
        sr.scheduled_datetime,
        sr.scheduled_duration_minutes,
        sr.completed_date,
        sr.created_at,
        sr.updated_at,
        sr.last_status_change,
        sr.acknowledged_at,
        sr.started_at,
        sr.closed_at,
        sr.total_work_duration_minutes,
        sr.estimated_duration_minutes,
        sr.actual_duration_minutes,
        sr.client_satisfaction_rating,
        sr.requires_follow_up,
        sr.follow_up_date,
        sr.business_id,
        sr.client_id,
        sr.assigned_to_employee_id as assigned_technician_id,
        srs.name as status,
        srs.color_code as status_color,
        ul.name as urgency,
        ul.color_code as urgency_color,
        pl.name as priority,
        pl.color_code as priority_color,
        st.name as service_type,
        b.business_name,
        b.is_individual,
        sl.address_label as location_name,
        sl.street_address_1,
        sl.street_address_2,
        sl.city,
        sl.state,
        sl.zip_code,
        sl.contact_phone as location_contact_phone,
        sl.contact_person as location_contact_person,
        sl.contact_email as location_contact_email,
        CONCAT(client.first_name, ' ', client.last_name) as client_name,
        client.email as client_email,
        client.phone as client_phone,
        CONCAT(tech.first_name, ' ', tech.last_name) as technician_name,
        tech.email as technician_email,
        CONCAT(ack.first_name, ' ', ack.last_name) as acknowledged_by_name,
        CONCAT(closed.first_name, ' ', closed.last_name) as closed_by_name,
        cr.reason_name as closure_reason,
        inv.id as invoice_id,
        inv.invoice_number,
        inv.total_amount as invoice_total,
        inv.payment_status as invoice_payment_status,
        COUNT(*) OVER() as total_count
      FROM service_requests sr
      LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
      LEFT JOIN urgency_levels ul ON sr.urgency_level_id = ul.id
      LEFT JOIN priority_levels pl ON sr.priority_level_id = pl.id
      LEFT JOIN service_types st ON sr.service_type_id = st.id
      LEFT JOIN businesses b ON sr.business_id = b.id
      LEFT JOIN service_locations sl ON sr.service_location_id = sl.id
      LEFT JOIN users client ON sr.client_id = client.id
      LEFT JOIN employees tech ON sr.assigned_to_employee_id = tech.id
      LEFT JOIN employees ack ON sr.acknowledged_by_employee_id = ack.id
      LEFT JOIN employees closed ON sr.closed_by_employee_id = closed.id
      LEFT JOIN service_request_closure_reasons cr ON sr.closure_reason_id = cr.id
      LEFT JOIN invoices inv ON sr.id = inv.service_request_id
      ${whereClause}
      ORDER BY sr.${safeSortBy} ${safeSortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parseInt(limit), offset);
    const result = await pool.query(query, params);

    console.log('📊 [Service Requests] Query returned:', result.rows.length, 'rows');
    console.log('📊 [Service Requests] Sample row:', result.rows[0]);

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    console.log('📊 [Service Requests] Total count:', totalCount);

    // Helper function to calculate cost with tier breakdown
    const calculateCost = async (date, timeStart, timeEnd, businessId, clientId, durationMinutes = null) => {
      if (!date || !timeStart || (!timeEnd && !durationMinutes)) {
        return null;
      }

      try {
        // Get business's assigned rate category, or default if none assigned
        const rateQuery = `
          SELECT COALESCE(hrc_business.base_hourly_rate, hrc_default.base_hourly_rate, 75) as base_hourly_rate
          FROM businesses b
          LEFT JOIN hourly_rate_categories hrc_business ON b.rate_category_id = hrc_business.id
          LEFT JOIN hourly_rate_categories hrc_default ON hrc_default.is_default = true AND hrc_default.is_active = true
          WHERE b.id = $1
          LIMIT 1
        `;
        const rateResult = await pool.query(rateQuery, [businessId]);
        const baseRate = rateResult.rows[0]?.base_hourly_rate || 75;

        // Check if client has any completed (Closed) service requests
        // First-hour comp should only apply to first COMPLETED service request, not cancelled ones
        const completedRequestCheck = await pool.query(`
          SELECT COUNT(*) as completed_count
          FROM service_requests sr
          JOIN service_request_statuses srs ON sr.status_id = srs.id
          WHERE sr.client_id = $1
            AND sr.soft_delete = false
            AND srs.name = 'Closed'
        `, [clientId]);
        const isFirstRequest = parseInt(completedRequestCheck.rows[0].completed_count) === 0;

        // Parse times
        const [startHour, startMin] = timeStart.split(':').map(Number);

        // Calculate duration
        let durationHours;
        if (durationMinutes !== null) {
          // Use provided duration (already handles midnight crossover)
          durationHours = durationMinutes / 60;
        } else if (timeEnd) {
          // Calculate from start/end times, handling midnight crossover
          const [endHour, endMin] = timeEnd.split(':').map(Number);
          const startMinutes = startHour * 60 + startMin;
          let endMinutes = endHour * 60 + endMin;

          // Handle midnight crossover: if end < start, add 24 hours
          if (endMinutes <= startMinutes) {
            endMinutes += 1440; // 24 hours in minutes
          }

          durationHours = (endMinutes - startMinutes) / 60;
        } else {
          return null;
        }

        // Calculate end time for tier calculations
        const totalMinutes = startHour * 60 + startMin + (durationHours * 60);
        const endHour = Math.floor(totalMinutes / 60) % 24;
        const endMin = totalMinutes % 60;

        // Get day of week
        const requestDate = new Date(date);
        const dayOfWeek = requestDate.getDay();

        // Load rate tiers
        const tiersQuery = `
          SELECT tier_name, tier_level, time_start, time_end, rate_multiplier
          FROM service_hour_rate_tiers
          WHERE is_active = true AND day_of_week = $1
          ORDER BY tier_level DESC
        `;
        const tiersResult = await pool.query(tiersQuery, [dayOfWeek]);
        const rateTiers = tiersResult.rows;

        // Helper to find rate tier
        const findRateTier = (hour, minute) => {
          const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
          const matchingTier = rateTiers.find(tier =>
            timeString >= tier.time_start && timeString < tier.time_end
          );
          return matchingTier ? {
            tierName: matchingTier.tier_name,
            multiplier: parseFloat(matchingTier.rate_multiplier)
          } : { tierName: 'Standard', multiplier: 1.0 };
        };

        // Calculate cost by 30-minute increments
        let totalCost = 0;
        const tierBlocks = [];
        let currentBlock = null;
        let currentHour = startHour;
        let currentMinute = startMin;

        while (currentHour < endHour || (currentHour === endHour && currentMinute < endMin)) {
          const tier = findRateTier(currentHour, currentMinute);
          const incrementCost = (baseRate * tier.multiplier) / 2;
          totalCost += incrementCost;

          if (currentBlock && currentBlock.tierName === tier.tierName && currentBlock.multiplier === tier.multiplier) {
            currentBlock.halfHourCount += 1;
          } else {
            if (currentBlock) {
              const hours = currentBlock.halfHourCount / 2;
              tierBlocks.push({
                tierName: currentBlock.tierName,
                multiplier: currentBlock.multiplier,
                hours,
                cost: hours * baseRate * currentBlock.multiplier
              });
            }
            currentBlock = { tierName: tier.tierName, multiplier: tier.multiplier, halfHourCount: 1 };
          }

          currentMinute += 30;
          if (currentMinute >= 60) {
            currentMinute = 0;
            currentHour += 1;
          }
        }

        if (currentBlock) {
          const hours = currentBlock.halfHourCount / 2;
          tierBlocks.push({
            tierName: currentBlock.tierName,
            multiplier: currentBlock.multiplier,
            hours,
            cost: hours * baseRate * currentBlock.multiplier
          });
        }

        // Apply first-hour comp
        let firstHourDiscount = 0;
        const firstHourCompBreakdown = [];

        if (isFirstRequest && durationHours >= 1) {
          let hoursAccounted = 0;
          for (const block of tierBlocks) {
            if (hoursAccounted >= 1) break;
            const hoursInThisBlock = Math.min(block.hours, 1 - hoursAccounted);
            const discountForThisBlock = hoursInThisBlock * baseRate * block.multiplier;
            firstHourCompBreakdown.push({
              tierName: block.tierName,
              multiplier: block.multiplier,
              hours: hoursInThisBlock,
              discount: discountForThisBlock
            });
            firstHourDiscount += discountForThisBlock;
            hoursAccounted += hoursInThisBlock;
          }
        }

        const finalTotal = Math.max(0, totalCost - firstHourDiscount);

        return {
          baseRate,
          durationHours,
          total: finalTotal,
          subtotal: totalCost,
          firstHourDiscount: firstHourDiscount > 0 ? firstHourDiscount : undefined,
          firstHourCompBreakdown: firstHourCompBreakdown.length > 0 ? firstHourCompBreakdown : undefined,
          breakdown: tierBlocks,
          isFirstRequest
        };
      } catch (error) {
        console.error('Error calculating cost:', error.message);
        return null;
      }
    };

    // Add cost calculations to service requests
    const serviceRequestsWithCosts = await Promise.all(
      result.rows.map(async (row) => {
        // Prefer new datetime fields over old time fields (which have timezone bugs)
        let costDate, costTimeStart, costTimeEnd;

        if (row.requested_datetime && row.requested_duration_minutes) {
          // Use datetime fields
          const startDateTime = new Date(row.requested_datetime);
          const endDateTime = new Date(startDateTime.getTime() + row.requested_duration_minutes * 60000);

          // Extract date in YYYY-MM-DD format
          costDate = startDateTime.toISOString().split('T')[0];

          // Extract time in HH:MM:SS format
          const formatTime = (date) => {
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${hours}:${minutes}:${seconds}`;
          };

          costTimeStart = formatTime(startDateTime);
          costTimeEnd = formatTime(endDateTime);
        }

        const costInfo = await calculateCost(
          costDate,
          costTimeStart,
          costTimeEnd,
          row.business_id,
          row.client_id,
          row.requested_duration_minutes // Pass duration to avoid recalculating
        );

        // Build locationDetails object if location data exists
        const locationDetails = row.street_address_1 ? {
          name: row.location_name,
          street_address_1: row.street_address_1,
          street_address_2: row.street_address_2,
          city: row.city,
          state: row.state,
          zip_code: row.zip_code,
          contact_phone: row.location_contact_phone,
          contact_person: row.location_contact_person,
          contact_email: row.location_contact_email
        } : null;

        // Remove individual location fields from row to avoid duplication
        const {
          street_address_1,
          street_address_2,
          zip_code,
          location_contact_phone,
          location_contact_person,
          location_contact_email,
          ...cleanRow
        } = row;

        return {
          ...cleanRow,
          locationDetails,
          cost: costInfo
        };
      })
    );

    res.json({
      success: true,
      data: {
        serviceRequests: serviceRequestsWithCosts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalCount,
          totalPages: Math.ceil(totalCount / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error fetching service requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service requests',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/service-requests/closure-reasons
 * Get all available closure reasons
 */
router.get('/service-requests/closure-reasons', async (req, res) => {
  try {
    const pool = await getPool();

    const query = `
      SELECT
        id,
        reason_name AS reason,
        reason_description AS description,
        is_active
      FROM service_request_closure_reasons
      WHERE is_active = true
      ORDER BY reason_name
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching closure reasons:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch closure reasons',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/service-requests/:id/time-breakdown
 * Calculate time breakdown by rate tier (Standard/Premium/Emergency)
 * Includes first-time client discount (first hour free) and rounds to nearest half hour
 */
router.get('/service-requests/:id/time-breakdown', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    // Get business_id for this service request to check if it's their first request
    const serviceRequestQuery = `
      SELECT business_id, client_id
      FROM service_requests
      WHERE id = $1
    `;
    const srResult = await pool.query(serviceRequestQuery, [id]);

    if (srResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    const businessId = srResult.rows[0].business_id;
    const clientId = srResult.rows[0].client_id;

    // Check if this is the client's first COMPLETED service request
    // Only count "Closed" status (not "Cancelled") that were created before this one
    const completedRequestsQuery = `
      SELECT COUNT(*) as count
      FROM service_requests sr
      JOIN service_request_statuses srs ON sr.status_id = srs.id
      WHERE sr.client_id = $1
        AND srs.name = 'Closed'
        AND sr.created_at < (
          SELECT created_at FROM service_requests WHERE id = $2
        )
    `;
    const completedResult = await pool.query(completedRequestsQuery, [clientId, id]);
    const isFirstServiceRequest = parseInt(completedResult.rows[0].count) === 0;

    // Get all time entries for this service request (including active ones)
    // Round start time DOWN to nearest 5 minutes, end time UP to nearest 30 minutes
    const timeEntriesQuery = `
      SELECT
        id,
        start_time,
        -- Round start time DOWN to nearest 5 minutes
        date_trunc('hour', start_time) + INTERVAL '5 min' * FLOOR(EXTRACT(minute FROM start_time) / 5) as rounded_start_time,
        -- Round end time UP to nearest 30 minutes
        CASE
          WHEN end_time IS NULL THEN
            date_trunc('hour', NOW()) + INTERVAL '30 min' * CEIL(EXTRACT(minute FROM NOW()) / 30)
          ELSE
            date_trunc('hour', end_time) + INTERVAL '30 min' * CEIL(EXTRACT(minute FROM end_time) / 30)
        END as rounded_end_time,
        CASE
          WHEN end_time IS NULL THEN NOW()
          ELSE end_time
        END as end_time,
        CASE
          WHEN end_time IS NULL THEN
            EXTRACT(EPOCH FROM (
              (date_trunc('hour', NOW()) + INTERVAL '30 min' * CEIL(EXTRACT(minute FROM NOW()) / 30)) -
              (date_trunc('hour', start_time) + INTERVAL '5 min' * FLOOR(EXTRACT(minute FROM start_time) / 5))
            )) / 60
          ELSE
            EXTRACT(EPOCH FROM (
              (date_trunc('hour', end_time) + INTERVAL '30 min' * CEIL(EXTRACT(minute FROM end_time) / 30)) -
              (date_trunc('hour', start_time) + INTERVAL '5 min' * FLOOR(EXTRACT(minute FROM start_time) / 5))
            )) / 60
        END as duration_minutes
      FROM service_request_time_entries
      WHERE service_request_id = $1
      ORDER BY start_time
    `;

    const timeEntriesResult = await pool.query(timeEntriesQuery, [id]);

    console.log('🔍 Time entries found:', timeEntriesResult.rows.length);
    console.log('📊 Time entries data:', JSON.stringify(timeEntriesResult.rows, null, 2));

    if (timeEntriesResult.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          isFirstServiceRequest,
          waivedMinutes: 0,
          waivedHours: 0,
          standardMinutes: 0,
          premiumMinutes: 0,
          emergencyMinutes: 0,
          standardBillableHours: 0,
          premiumBillableHours: 0,
          emergencyBillableHours: 0,
          totalMinutes: 0,
          totalBillableHours: 0
        }
      });
    }

    // Get rate tiers
    const tiersQuery = `
      SELECT
        tier_name,
        tier_level,
        day_of_week,
        time_start,
        time_end
      FROM service_hour_rate_tiers
      WHERE is_active = true
      ORDER BY tier_level DESC
    `;

    const tiersResult = await pool.query(tiersQuery);
    const tiers = tiersResult.rows;

    // Build a chronological array of minutes with their tier assignments
    const chronologicalMinutes = [];

    // Process each time entry
    for (let i = 0; i < timeEntriesResult.rows.length; i++) {
      const entry = timeEntriesResult.rows[i];
      const isLastEntry = i === timeEntriesResult.rows.length - 1;

      // Start time is always actual (no rounding)
      const startTime = new Date(entry.start_time);
      const rawEndTime = new Date(entry.end_time);

      // Only round the FINAL end time up to nearest 15 minutes
      let endTime = rawEndTime;
      if (isLastEntry) {
        const endMinutes = rawEndTime.getUTCMinutes();
        const roundedUpMinutes = Math.ceil(endMinutes / 15) * 15;
        endTime = new Date(rawEndTime);
        if (roundedUpMinutes === 60) {
          endTime.setUTCHours(endTime.getUTCHours() + 1);
          endTime.setUTCMinutes(0, 0, 0);
        } else {
          endTime.setUTCMinutes(roundedUpMinutes, 0, 0);
        }
      }

      console.log('⏱️  Processing entry:', {
        start_time: entry.start_time,
        end_time: entry.end_time,
        duration_minutes: entry.duration_minutes,
        startTime: startTime.toISOString(),
        rawEndTime: rawEndTime.toISOString(),
        finalEndTime: endTime.toISOString(),
        isLastEntry,
        isValidEndTime: !isNaN(endTime.getTime())
      });

      // Break down the time entry into 1-minute intervals
      let currentTime = new Date(startTime);

      while (currentTime < endTime) {
        // All timestamps are UTC - compare directly
        const dayOfWeek = currentTime.getUTCDay(); // 0=Sunday, 1=Monday, etc.
        const hours = String(currentTime.getUTCHours()).padStart(2, '0');
        const minutes = String(currentTime.getUTCMinutes()).padStart(2, '0');
        const seconds = String(currentTime.getUTCSeconds()).padStart(2, '0');
        const timeString = `${hours}:${minutes}:${seconds}`; // HH:MM:SS format in UTC

        // Find the tier for this specific minute
        let assignedTier = 'Standard'; // default

        for (const tier of tiers) {
          const tierDay = tier.day_of_week;

          if (tierDay === dayOfWeek && timeString >= tier.time_start && timeString < tier.time_end) {
            assignedTier = tier.tier_name;
            break;
          }
        }

        chronologicalMinutes.push({
          timestamp: new Date(currentTime),
          tier: assignedTier
        });

        // Move to next minute
        currentTime.setMinutes(currentTime.getMinutes() + 1);
      }
    }

    console.log('📈 Total chronological minutes:', chronologicalMinutes.length);

    // Apply first-time client discount (waive first 60 minutes)
    let waivedMinutes = 0;
    const minutesToWaive = isFirstServiceRequest ? 60 : 0;

    // Separate waived and billable minutes
    const waivedArray = chronologicalMinutes.slice(0, minutesToWaive);
    const billableArray = chronologicalMinutes.slice(minutesToWaive);

    waivedMinutes = waivedArray.length;

    // Calculate breakdown for billable time
    let standardMinutes = 0;
    let premiumMinutes = 0;
    let emergencyMinutes = 0;

    for (const minute of billableArray) {
      if (minute.tier === 'Standard') {
        standardMinutes++;
      } else if (minute.tier === 'Premium') {
        premiumMinutes++;
      } else if (minute.tier === 'Emergency') {
        emergencyMinutes++;
      }
    }

    // Convert minutes to hours (no additional rounding - end time already rounded)
    const standardBillableHours = standardMinutes / 60;
    const premiumBillableHours = premiumMinutes / 60;
    const emergencyBillableHours = emergencyMinutes / 60;
    const totalBillableHours = standardBillableHours + premiumBillableHours + emergencyBillableHours;

    res.json({
      success: true,
      data: {
        isFirstServiceRequest,
        waivedMinutes,
        waivedHours: (waivedMinutes / 60).toFixed(2),
        standardMinutes,
        premiumMinutes,
        emergencyMinutes,
        standardBillableHours,
        premiumBillableHours,
        emergencyBillableHours,
        totalMinutes: chronologicalMinutes.length,
        totalBillableMinutes: billableArray.length,
        totalBillableHours
      }
    });

  } catch (error) {
    console.error('Error calculating time breakdown:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate time breakdown',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/service-requests/statuses
 * Get all available service request statuses
 */
router.get('/service-requests/statuses', async (req, res) => {
  try {
    const pool = await getPool();

    const query = `
      SELECT
        id,
        name,
        description,
        color_code,
        display_order as sort_order,
        is_final_status,
        requires_technician
      FROM service_request_statuses
      WHERE is_active = true
      ORDER BY display_order
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching service request statuses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service request statuses',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/service-requests/filter-presets
 * Get all active filter presets
 */
router.get('/service-requests/filter-presets', async (req, res) => {
  try {
    const { filterType = 'status' } = req.query;
    const presets = await filterPresetService.getActivePresets(filterType);

    res.json({
      success: true,
      data: presets
    });

  } catch (error) {
    console.error('Error fetching filter presets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch filter presets',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/service-requests/technicians
 * Get all active technicians available for assignment
 */
router.get('/service-requests/technicians', async (req, res) => {
  try {
    const pool = await getPool();

    const query = `
      SELECT
        e.id,
        e.first_name,
        e.last_name,
        e.email,
        e.phone,
        CONCAT(e.first_name, ' ', e.last_name) as full_name,
        ws.status_name as working_status,
        ws.display_name as working_status_display,
        COUNT(DISTINCT sr.id) as active_requests
      FROM employees e
      LEFT JOIN employee_working_statuses ws ON e.working_status_id = ws.id
      LEFT JOIN service_request_assignments sra ON e.id = sra.technician_id AND sra.is_active = true
      LEFT JOIN service_requests sr ON sra.service_request_id = sr.id AND sr.soft_delete = false
      WHERE e.is_active = true
      GROUP BY e.id, e.first_name, e.last_name, e.email, e.phone, ws.status_name, ws.display_name
      ORDER BY e.first_name, e.last_name
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching technicians:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch technicians',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/service-requests/:id/files
 * Get all files attached to a service request
 */
router.get('/service-requests/:id/files', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify service request exists
    const serviceRequestQuery = `
      SELECT id FROM service_requests
      WHERE id = $1 AND soft_delete = false
    `;

    const pool = await getPool();
    const serviceRequestResult = await pool.query(serviceRequestQuery, [id]);

    if (serviceRequestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    // Get associated files with uploader information
    const filesQuery = `
      SELECT
        cf.id,
        cf.original_filename,
        cf.stored_filename,
        cf.file_size_bytes,
        cf.content_type,
        cf.file_description,
        cf.created_at,
        cf.uploaded_by_user_id,
        COALESCE(u.email, e.email) as uploaded_by_email,
        CASE
          WHEN u.id IS NOT NULL THEN 'client'
          WHEN e.id IS NOT NULL THEN 'employee'
          ELSE 'unknown'
        END as uploaded_by_type
      FROM t_client_files cf
      LEFT JOIN users u ON cf.uploaded_by_user_id = u.id
      LEFT JOIN employees e ON cf.uploaded_by_user_id = e.id
      WHERE cf.service_request_id = $1 AND cf.soft_delete = false
      ORDER BY cf.created_at DESC
    `;

    const filesResult = await pool.query(filesQuery, [id]);

    res.json({
      success: true,
      data: {
        serviceRequestId: id,
        files: filesResult.rows.map(row => ({
          id: row.id,
          original_filename: row.original_filename,
          stored_filename: row.stored_filename,
          file_size_bytes: parseInt(row.file_size_bytes),
          content_type: row.content_type,
          description: row.file_description,
          created_at: row.created_at,
          uploaded_by_email: row.uploaded_by_email,
          uploaded_by_type: row.uploaded_by_type
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching service request files:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch files',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/service-requests/:id/notes
 * Get all notes for a service request (admin can see all notes)
 */
router.get('/service-requests/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;

    // Verify service request exists
    const serviceRequestQuery = `
      SELECT id FROM service_requests
      WHERE id = $1 AND soft_delete = false
    `;

    const pool = await getPool();
    const serviceRequestResult = await pool.query(serviceRequestQuery, [id]);

    if (serviceRequestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    // Get all notes (admin can see all notes, including those not visible to client)
    const notesQuery = `
      SELECT
        id,
        note_text,
        note_type,
        created_by_type,
        created_by_name,
        created_at,
        is_visible_to_client
      FROM service_request_notes
      WHERE service_request_id = $1
      ORDER BY created_at DESC
    `;

    const notesResult = await pool.query(notesQuery, [id]);

    res.json({
      success: true,
      data: {
        serviceRequestId: id,
        notes: notesResult.rows.map(row => ({
          id: row.id,
          note_text: row.note_text,
          note_type: row.note_type,
          created_by_type: row.created_by_type,
          created_by_name: row.created_by_name,
          created_at: row.created_at,
          is_visible_to_client: row.is_visible_to_client
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching service request notes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notes',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/admin/service-requests/:id/notes
 * Add a new note to a service request
 */
router.post('/service-requests/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { noteText, isVisibleToClient = true } = req.body;
    const employeeId = req.user.id;
    const employeeName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;

    if (!noteText || noteText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Note text is required'
      });
    }

    // Verify service request exists
    const serviceRequestQuery = `
      SELECT id FROM service_requests
      WHERE id = $1 AND soft_delete = false
    `;

    const pool = await getPool();
    const serviceRequestResult = await pool.query(serviceRequestQuery, [id]);

    if (serviceRequestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    // Insert note
    const insertQuery = `
      INSERT INTO service_request_notes (
        service_request_id,
        note_text,
        note_type,
        created_by_type,
        created_by_id,
        created_by_name,
        is_visible_to_client
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, note_text, note_type, created_by_type, created_by_name, created_at, is_visible_to_client
    `;

    const insertResult = await pool.query(insertQuery, [
      id,
      noteText.trim(),
      'employee_note',
      'employee',
      employeeId,
      employeeName,
      isVisibleToClient
    ]);

    const newNote = insertResult.rows[0];

    console.log(`📝 Note added to service request ${id} by employee ${employeeName}`);

    // Get service request details and employee info for email notification
    const detailsQuery = `
      SELECT
        sr.id,
        sr.request_number,
        sr.title,
        COALESCE(srs.name, 'Unknown') as status,
        sl.location_name,
        sl.street_address_1,
        sl.street_address_2,
        sl.city,
        sl.state,
        sl.zip_code,
        u.id as client_id,
        u.email as client_email,
        u.first_name as client_first_name,
        u.last_name as client_last_name,
        u.phone as client_phone,
        e.email as employee_email,
        e.phone as employee_phone,
        e.first_name as employee_first_name,
        e.last_name as employee_last_name
      FROM service_requests sr
      LEFT JOIN service_locations sl ON sr.service_location_id = sl.id
      LEFT JOIN users u ON sr.client_id = u.id
      LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
      LEFT JOIN employees e ON e.id = $2
      WHERE sr.id = $1
    `;

    const details = await pool.query(detailsQuery, [id, employeeId]);
    const serviceRequest = details.rows[0];

    // Send email notification to client (non-blocking) - only if client is NOT actively viewing
    if (serviceRequest && serviceRequest.client_email && serviceRequest.client_id) {
      const isClientViewing = websocketService.isClientViewingRequest(serviceRequest.client_id, id);

      if (isClientViewing) {
        console.log(`📧 Skipping email notification - client is actively viewing service request ${id}`);
      } else {
        sendEmployeeNoteNotificationToClient({
          serviceRequest: {
            requestNumber: serviceRequest.request_number,
            title: serviceRequest.title,
            status: serviceRequest.status,
            locationName: serviceRequest.location_name,
            locationAddress: {
              street1: serviceRequest.street_address_1,
              street2: serviceRequest.street_address_2,
              city: serviceRequest.city,
              state: serviceRequest.state,
              zip: serviceRequest.zip_code
            }
          },
          note: {
            noteText: newNote.note_text,
            createdAt: newNote.created_at
          },
          employee: {
            name: `${serviceRequest.employee_first_name} ${serviceRequest.employee_last_name}`.trim() || employeeName,
            email: serviceRequest.employee_email,
            phone: serviceRequest.employee_phone
          },
          client: {
            email: serviceRequest.client_email,
            firstName: serviceRequest.client_first_name,
            lastName: serviceRequest.client_last_name
          }
        }).catch(err => {
          console.error('❌ Failed to send employee note email notification:', err);
        });
      }
    }

    // Broadcast service request update via websocket for real-time note updates
    // Include the full note data so clients can insert it without reloading all notes
    websocketService.broadcastServiceRequestUpdate(id, 'updated', {
      noteAdded: true,
      note: {
        id: newNote.id,
        note_text: newNote.note_text,
        note_type: newNote.note_type,
        created_by_type: newNote.created_by_type,
        created_by_name: newNote.created_by_name,
        created_at: newNote.created_at,
        is_visible_to_client: newNote.is_visible_to_client
      }
    });

    res.json({
      success: true,
      data: {
        note: {
          id: newNote.id,
          note_text: newNote.note_text,
          note_type: newNote.note_type,
          created_by_type: newNote.created_by_type,
          created_by_name: newNote.created_by_name,
          created_at: newNote.created_at,
          is_visible_to_client: newNote.is_visible_to_client
        }
      }
    });

  } catch (error) {
    console.error('Error adding service request note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add note',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/service-requests/:id
 * Get single service request with full details
 */
router.get('/service-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const query = `
      SELECT
        sr.*,
        sr.assigned_to_employee_id as assigned_technician_id,
        srs.name as status_name,
        srs.description as status_description,
        srs.color_code as status_color,
        ul.name as urgency_name,
        ul.color_code as urgency_color,
        ul.max_response_time_hours,
        pl.name as priority_name,
        pl.color_code as priority_color,
        pl.escalation_hours,
        st.name as service_type_name,
        b.business_name,
        sl.address_label as location_name,
        sl.street,
        sl.city,
        sl.state,
        sl.zip_code,
        sl.contact_person as location_contact_person,
        sl.contact_phone as location_contact_phone,
        client.first_name as client_first_name,
        client.last_name as client_last_name,
        client.email as client_email,
        client.phone as client_phone,
        tech.first_name as technician_first_name,
        tech.last_name as technician_last_name,
        tech.email as technician_email,
        tech.phone as technician_phone,
        ack.first_name as acknowledged_by_first_name,
        ack.last_name as acknowledged_by_last_name,
        closed.first_name as closed_by_first_name,
        closed.last_name as closed_by_last_name,
        cr.reason_name as closure_reason,
        cr.reason_description as closure_reason_description
      FROM service_requests sr
      LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
      LEFT JOIN urgency_levels ul ON sr.urgency_level_id = ul.id
      LEFT JOIN priority_levels pl ON sr.priority_level_id = pl.id
      LEFT JOIN service_types st ON sr.service_type_id = st.id
      LEFT JOIN businesses b ON sr.business_id = b.id
      LEFT JOIN service_locations sl ON sr.service_location_id = sl.id
      LEFT JOIN users client ON sr.client_id = client.id
      LEFT JOIN employees tech ON sr.assigned_to_employee_id = tech.id
      LEFT JOIN employees ack ON sr.acknowledged_by_employee_id = ack.id
      LEFT JOIN employees closed ON sr.closed_by_employee_id = closed.id
      LEFT JOIN service_request_closure_reasons cr ON sr.closure_reason_id = cr.id
      WHERE sr.id = $1 AND sr.soft_delete = false
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching service request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * PUT /api/admin/service-requests/:id/assign
 * Assign service request to technician
 */
router.put('/service-requests/:id/assign', async (req, res) => {
  try {
    const { id } = req.params;
    const { technicianId, assumeOwnership } = req.body;
    const assignedByUserId = req.user?.id; // Get the current user performing the assignment
    const pool = await getPool();

    if (!technicianId) {
      return res.status(400).json({
        success: false,
        message: 'Technician ID is required'
      });
    }

    if (!assignedByUserId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required for assignment'
      });
    }

    // Get the previous assignment for logging
    const previousQuery = `
      SELECT assigned_to_employee_id,
             (SELECT CONCAT(first_name, ' ', last_name) FROM employees WHERE id = assigned_to_employee_id) as previous_tech_name
      FROM service_requests
      WHERE id = $1 AND soft_delete = false
    `;
    const previousResult = await pool.query(previousQuery, [id]);
    const previousTechnicianId = previousResult.rows[0]?.assigned_to_employee_id;

    // Update service request
    const updateQuery = `
      UPDATE service_requests
      SET
        assigned_to_employee_id = $1,
        updated_at = NOW()
      WHERE id = $2 AND soft_delete = false
      RETURNING id, request_number
    `;

    const result = await pool.query(updateQuery, [technicianId, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    // Also create assignment record in service_request_assignments table
    // First, check if an assignment already exists
    const existingAssignment = await pool.query(
      `SELECT id FROM service_request_assignments
       WHERE service_request_id = $1 AND technician_id = $2 AND assignment_type = 'primary'`,
      [id, technicianId]
    );

    if (existingAssignment.rows.length > 0) {
      // Update existing assignment
      await pool.query(
        `UPDATE service_request_assignments
         SET is_active = true, assigned_at = NOW(), assigned_by_user_id = $3
         WHERE service_request_id = $1 AND technician_id = $2 AND assignment_type = 'primary'`,
        [id, technicianId, assignedByUserId]
      );
    } else {
      // Create new assignment
      await pool.query(
        `INSERT INTO service_request_assignments (
          service_request_id,
          technician_id,
          assigned_by_user_id,
          assignment_type,
          is_active,
          assigned_at
        ) VALUES ($1, $2, $3, 'primary', true, NOW())`,
        [id, technicianId, assignedByUserId]
      );
    }

    // If this is an ownership assumption, create an automatic note
    if (assumeOwnership) {
      const newTechQuery = await pool.query('SELECT CONCAT(first_name, \' \', last_name) as name FROM employees WHERE id = $1', [technicianId]);
      const newTechName = newTechQuery.rows[0]?.name || 'Unknown';
      const previousTechName = previousResult.rows[0]?.previous_tech_name;

      let noteText;
      if (previousTechnicianId) {
        noteText = `${newTechName} assumed ownership of this service request from ${previousTechName}`;
      } else {
        noteText = `${newTechName} assumed ownership of this unassigned service request`;
      }

      // Create a system note for the ownership assumption
      await pool.query(`
        INSERT INTO service_request_notes (
          service_request_id,
          note_text,
          note_type,
          created_by_type,
          created_by_id,
          created_by_name,
          is_visible_to_client,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        id,                      // service_request_id
        noteText,                // note_text
        'system',                // note_type
        'employee',              // created_by_type
        technicianId,            // created_by_id
        newTechName,             // created_by_name
        false                    // is_visible_to_client (system notes are internal)
      ]);
    }

    res.json({
      success: true,
      message: assumeOwnership ? 'Ownership assumed successfully' : 'Service request assigned successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error assigning service request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign service request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * PUT /api/admin/service-requests/:id/acknowledge
 * Acknowledge service request (technician acknowledges they've seen the assignment)
 */
router.put('/service-requests/:id/acknowledge', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    // Get employee ID from req.user (set by auth middleware)
    const employeeId = req.user?.id || req.user?.employeeId;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID not found in session'
      });
    }

    // Get "Acknowledged" status ID
    const statusQuery = await pool.query(`
      SELECT id FROM service_request_statuses
      WHERE name = 'Acknowledged' AND is_active = true
      LIMIT 1
    `);

    const acknowledgeStatusId = statusQuery.rows[0]?.id;

    const updateQuery = `
      UPDATE service_requests
      SET
        acknowledged_at = NOW(),
        acknowledged_by_employee_id = $1,
        assigned_to_employee_id = $1,
        status_id = $2,
        last_status_change = NOW(),
        updated_at = NOW()
      WHERE id = $3 AND soft_delete = false
      RETURNING id, request_number, acknowledged_at
    `;

    const result = await pool.query(updateQuery, [employeeId, acknowledgeStatusId, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    res.json({
      success: true,
      message: 'Service request acknowledged successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error acknowledging service request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to acknowledge service request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * PUT /api/admin/service-requests/:id/time-entry
 * Start or stop a time tracking entry for a service request
 */
router.put('/service-requests/:id/time-entry', async (req, res) => {
  console.log('🎯 TIME ENTRY ROUTE HIT:', { id: req.params.id, action: req.body.action, userId: req.user?.id });
  try {
    const { id } = req.params;
    const { action } = req.body; // 'start' or 'stop'
    const pool = await getPool();

    // Get employee ID from req.user
    const employeeId = req.user?.id || req.user?.employeeId;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID not found in session'
      });
    }

    if (action === 'start') {
      // Check if there's already an active time entry for this employee and request
      const checkQuery = `
        SELECT id FROM service_request_time_entries
        WHERE service_request_id = $1
          AND technician_id = $2
          AND end_time IS NULL
      `;
      const checkResult = await pool.query(checkQuery, [id, employeeId]);

      if (checkResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Time entry already started. Please stop the current entry first.'
        });
      }

      // Start new time entry
      const insertQuery = `
        INSERT INTO service_request_time_entries (
          service_request_id,
          technician_id,
          start_time,
          work_description
        ) VALUES ($1, $2, NOW(), $3)
        RETURNING id, start_time
      `;
      const result = await pool.query(insertQuery, [
        id,
        employeeId,
        'Time tracking in progress'
      ]);

      // Get current status to determine if this is "start" or "resume"
      const currentStatusQuery = await pool.query(`
        SELECT s.name
        FROM service_requests sr
        JOIN service_request_statuses s ON sr.status_id = s.id
        WHERE sr.id = $1
      `, [id]);
      const currentStatus = currentStatusQuery.rows[0]?.name;
      const isResuming = currentStatus === 'Paused';

      // Get "Started" status ID
      const statusQuery = await pool.query(`
        SELECT id FROM service_request_statuses
        WHERE name = 'Started' AND is_active = true
        LIMIT 1
      `);
      const startedStatusId = statusQuery.rows[0]?.id;

      // Update service request: set status to "Started", update timestamps
      await pool.query(`
        UPDATE service_requests
        SET
          status_id = $1,
          started_at = COALESCE(started_at, NOW()),
          last_status_change = NOW(),
          updated_at = NOW()
        WHERE id = $2
      `, [startedStatusId, id]);

      // Add a note documenting the state change
      const employeeName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
      const noteText = isResuming
        ? `Work resumed by ${employeeName}`
        : `Work started by ${employeeName}`;

      await pool.query(`
        INSERT INTO service_request_notes (
          service_request_id,
          note_text,
          note_type,
          created_by_type,
          created_by_id,
          created_by_name,
          is_visible_to_client
        ) VALUES ($1, $2, 'status_change', 'employee', $3, $4, false)
      `, [
        id,
        noteText,
        employeeId,
        employeeName
      ]);

      res.json({
        success: true,
        message: 'Time tracking started',
        data: result.rows[0]
      });

    } else if (action === 'stop') {
      // Find the active time entry
      const findQuery = `
        SELECT id, start_time FROM service_request_time_entries
        WHERE service_request_id = $1
          AND technician_id = $2
          AND end_time IS NULL
        ORDER BY start_time DESC
        LIMIT 1
      `;
      const findResult = await pool.query(findQuery, [id, employeeId]);

      if (findResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No active time entry found to stop'
        });
      }

      const timeEntryId = findResult.rows[0].id;

      // Stop the time entry and calculate duration
      const updateQuery = `
        UPDATE service_request_time_entries
        SET
          end_time = NOW(),
          duration_minutes = EXTRACT(EPOCH FROM (NOW() - start_time)) / 60
        WHERE id = $1
        RETURNING id, start_time, end_time, duration_minutes
      `;
      const result = await pool.query(updateQuery, [timeEntryId]);

      // Get "Paused" status ID
      const pausedStatusQuery = await pool.query(`
        SELECT id FROM service_request_statuses
        WHERE name = 'Paused' AND is_active = true
        LIMIT 1
      `);
      const pausedStatusId = pausedStatusQuery.rows[0]?.id;

      // Update service request: change status to "Paused", update total duration
      const sumQuery = `
        UPDATE service_requests
        SET
          status_id = $1,
          total_work_duration_minutes = (
            SELECT COALESCE(SUM(duration_minutes), 0)
            FROM service_request_time_entries
            WHERE service_request_id = $2
          ),
          last_status_change = NOW(),
          updated_at = NOW()
        WHERE id = $2
        RETURNING total_work_duration_minutes
      `;
      const sumResult = await pool.query(sumQuery, [pausedStatusId, id]);

      // Add a note documenting the pause action
      const employeeName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
      const durationHours = (result.rows[0].duration_minutes / 60).toFixed(2);
      await pool.query(`
        INSERT INTO service_request_notes (
          service_request_id,
          note_text,
          note_type,
          created_by_type,
          created_by_id,
          created_by_name,
          is_visible_to_client
        ) VALUES ($1, $2, 'status_change', 'employee', $3, $4, false)
      `, [
        id,
        `Work paused by ${employeeName} (Session: ${durationHours} hours)`,
        employeeId,
        employeeName
      ]);

      res.json({
        success: true,
        message: 'Time tracking stopped',
        data: {
          timeEntry: result.rows[0],
          totalDuration: sumResult.rows[0].total_work_duration_minutes
        }
      });

    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "start" or "stop"'
      });
    }

  } catch (error) {
    console.error('Error managing time entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to manage time entry',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * PUT /api/admin/service-requests/:id/status
 * Update service request status
 */
router.put('/service-requests/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { statusId, notes } = req.body;
    const pool = await getPool();

    if (!statusId) {
      return res.status(400).json({
        success: false,
        message: 'Status ID is required'
      });
    }

    const updateQuery = `
      UPDATE service_requests
      SET
        status_id = $1,
        last_status_change = NOW(),
        updated_at = NOW()
      WHERE id = $2 AND soft_delete = false
      RETURNING id, request_number
    `;

    const result = await pool.query(updateQuery, [statusId, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    // Log status change in history
    if (notes) {
      const historyQuery = `
        INSERT INTO service_request_history (
          service_request_id,
          changed_by_user_id,
          change_type,
          change_description,
          created_at
        ) VALUES ($1, $2, 'status_change', $3, NOW())
      `;

      // Note: req.user.id should be available from auth middleware
      await pool.query(historyQuery, [id, req.user?.id || null, notes]);
    }

    res.json({
      success: true,
      message: 'Service request status updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating service request status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service request status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * Calculate cost estimate for a service request
 */
const calculateCost = async (pool, date, timeStart, timeEnd, baseRate, isFirstRequest, categoryName) => {
  if (!date || !timeStart || !timeEnd || !baseRate) return null;

  // Parse times
  const [startHour, startMin] = timeStart.split(':').map(Number);
  const [endHour, endMin] = timeEnd.split(':').map(Number);

  // Calculate duration in hours
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  const durationHours = (endMinutes - startMinutes) / 60;

  // Get day of week from date
  const requestDate = new Date(date);
  const dayOfWeek = requestDate.getDay();

  // Load rate tiers for this day
  const tiersQuery = `
    SELECT tier_name, tier_level, time_start, time_end, rate_multiplier
    FROM service_hour_rate_tiers
    WHERE is_active = true AND day_of_week = $1
    ORDER BY tier_level DESC
  `;
  const tiersResult = await pool.query(tiersQuery, [dayOfWeek]);
  const rateTiers = tiersResult.rows;

  // Helper to find rate tier for a specific time
  const findRateTier = (hour, minute) => {
    const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
    const matchingTier = rateTiers.find(tier =>
      timeString >= tier.time_start && timeString < tier.time_end
    );
    return matchingTier ? {
      tierName: matchingTier.tier_name,
      multiplier: parseFloat(matchingTier.rate_multiplier)
    } : { tierName: 'Standard', multiplier: 1.0 };
  };

  // Calculate cost by 30-minute increments
  let totalCost = 0;
  const tierBlocks = [];
  let currentBlock = null;

  let currentHour = startHour;
  let currentMinute = startMin;

  while (currentHour < endHour || (currentHour === endHour && currentMinute < endMin)) {
    const tier = findRateTier(currentHour, currentMinute);
    const incrementCost = (baseRate * tier.multiplier) / 2; // Half-hour rate
    totalCost += incrementCost;

    // Group contiguous blocks of same tier
    if (currentBlock && currentBlock.tierName === tier.tierName && currentBlock.multiplier === tier.multiplier) {
      currentBlock.halfHourCount += 1;
    } else {
      if (currentBlock) {
        const hours = currentBlock.halfHourCount / 2;
        tierBlocks.push({
          tierName: currentBlock.tierName,
          multiplier: currentBlock.multiplier,
          hours,
          cost: hours * baseRate * currentBlock.multiplier
        });
      }
      currentBlock = { tierName: tier.tierName, multiplier: tier.multiplier, halfHourCount: 1 };
    }

    // Advance by 30 minutes
    currentMinute += 30;
    if (currentMinute >= 60) {
      currentMinute = 0;
      currentHour += 1;
    }
  }

  // Save final block
  if (currentBlock) {
    const hours = currentBlock.halfHourCount / 2;
    tierBlocks.push({
      tierName: currentBlock.tierName,
      multiplier: currentBlock.multiplier,
      hours,
      cost: hours * baseRate * currentBlock.multiplier
    });
  }

  // Apply first-hour comp for first-time clients
  let firstHourDiscount = 0;
  const firstHourCompBreakdown = [];

  if (isFirstRequest && durationHours >= 1) {
    let hoursAccounted = 0;
    for (const block of tierBlocks) {
      if (hoursAccounted >= 1) break;

      const hoursInThisBlock = Math.min(block.hours, 1 - hoursAccounted);
      const discountForThisBlock = hoursInThisBlock * baseRate * block.multiplier;

      firstHourCompBreakdown.push({
        tierName: block.tierName,
        multiplier: block.multiplier,
        hours: hoursInThisBlock,
        discount: discountForThisBlock
      });

      firstHourDiscount += discountForThisBlock;
      hoursAccounted += hoursInThisBlock;
    }
  }

  const finalTotal = Math.max(0, totalCost - firstHourDiscount);

  return {
    baseRate,
    rateCategoryName: categoryName,
    durationHours,
    total: finalTotal,
    subtotal: totalCost,
    firstHourDiscount: firstHourDiscount > 0 ? firstHourDiscount : undefined,
    firstHourCompBreakdown: firstHourCompBreakdown.length > 0 ? firstHourCompBreakdown : undefined,
    breakdown: tierBlocks,
    isFirstRequest
  };
};

/**
 * PUT /api/admin/service-requests/:id/close
 * Close/complete a service request with closure reason and resolution summary
 */
router.put('/service-requests/:id/close', async (req, res) => {
  try {
    const { id } = req.params;
    const { closureReasonId, resolutionSummary, actualDurationMinutes, equipmentUsed } = req.body;
    const pool = await getPool();

    // Get employee ID from req.user
    const employeeId = req.user?.id || req.user?.employeeId;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID not found in session'
      });
    }

    if (!closureReasonId || !resolutionSummary) {
      return res.status(400).json({
        success: false,
        message: 'Closure reason and resolution summary are required'
      });
    }

    // Get the "Closed" status ID
    const statusQuery = `
      SELECT id FROM service_request_statuses
      WHERE LOWER(name) = 'closed'
      LIMIT 1
    `;
    const statusResult = await pool.query(statusQuery);

    if (statusResult.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Closed status not found in database'
      });
    }

    const completedStatusId = statusResult.rows[0].id;

    // Update service request
    // Note: Using equipment_needed field to store actual equipment used (equipment_used column doesn't exist in schema)
    const updateQuery = `
      UPDATE service_requests
      SET
        status_id = $1,
        closed_at = NOW(),
        closed_by_employee_id = $2,
        closure_reason_id = $3,
        resolution_summary = $4,
        actual_duration_minutes = $5,
        equipment_needed = $6,
        completed_date = NOW(),
        last_status_change = NOW(),
        updated_at = NOW()
      WHERE id = $7 AND soft_delete = false
      RETURNING id, request_number, closed_at
    `;
    const result = await pool.query(updateQuery, [
      completedStatusId,
      employeeId,
      closureReasonId,
      resolutionSummary,
      actualDurationMinutes || null,
      equipmentUsed || null, // This will be stored in equipment_needed field
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    const closedAt = result.rows[0].closed_at;

    // Close any open time entries (set end_time to the closure time)
    const closeTimeEntriesQuery = `
      UPDATE service_request_time_entries
      SET end_time = $1, updated_at = NOW()
      WHERE service_request_id = $2 AND end_time IS NULL
    `;
    const closeTimeEntriesResult = await pool.query(closeTimeEntriesQuery, [closedAt, id]);

    if (closeTimeEntriesResult.rowCount > 0) {
      console.log(`⏱️ Closed ${closeTimeEntriesResult.rowCount} open time entries for service request ${id}`);
    }

    // Log closure in history
    const historyQuery = `
      INSERT INTO service_request_history (
        service_request_id,
        changed_by_employee_id,
        action_type,
        notes,
        created_at
      ) VALUES ($1, $2, 'closure', $3, NOW())
    `;

    await pool.query(historyQuery, [
      id,
      employeeId,
      `Request closed with reason ID ${closureReasonId}. Resolution: ${resolutionSummary.substring(0, 100)}...`
    ]);

    // Generate invoice
    // Get service request details with business info and rate
    const srDetailsQuery = `
      SELECT
        sr.id,
        sr.request_number,
        sr.title,
        sr.business_id,
        sr.created_at as service_start_date,
        sr.closed_at,
        sr.requested_datetime,
        sr.requested_duration_minutes,
        b.business_name,
        b.rate_category_id,
        hrc.base_hourly_rate,
        hrc.category_name as rate_category_name
      FROM service_requests sr
      JOIN businesses b ON sr.business_id = b.id
      LEFT JOIN hourly_rate_categories hrc ON b.rate_category_id = hrc.id
      WHERE sr.id = $1
    `;
    const srDetails = await pool.query(srDetailsQuery, [id]);

    if (srDetails.rows.length === 0) {
      throw new Error('Failed to fetch service request details for invoice');
    }

    const serviceRequest = srDetails.rows[0];
    const baseRate = parseFloat(serviceRequest.base_hourly_rate) || 75.00; // Default to Standard rate

    // Get time breakdown with first-time client discount
    const timeBreakdownUrl = `/service-requests/${id}/time-breakdown`;
    const timeBreakdownQuery = `
      SELECT business_id, client_id
      FROM service_requests
      WHERE id = $1
    `;
    const srResult = await pool.query(timeBreakdownQuery, [id]);

    if (srResult.rows.length === 0) {
      throw new Error('Service request not found for time breakdown');
    }

    const businessId = srResult.rows[0].business_id;
    const clientId = srResult.rows[0].client_id;

    // Check if this is the client's first COMPLETED service request
    // Only count "Closed" status (not "Cancelled") that were created before this one
    const completedRequestsQuery = `
      SELECT COUNT(*) as count
      FROM service_requests sr
      JOIN service_request_statuses srs ON sr.status_id = srs.id
      WHERE sr.client_id = $1
        AND srs.name = 'Closed'
        AND sr.created_at < (
          SELECT created_at FROM service_requests WHERE id = $2
        )
    `;
    const completedResult = await pool.query(completedRequestsQuery, [clientId, id]);
    const isFirstServiceRequest = parseInt(completedResult.rows[0].count) === 0;

    // Get all time entries for this service request (including active ones)
    // Round start time DOWN to nearest 5 minutes, end time UP to nearest 30 minutes
    const timeEntriesQuery = `
      SELECT
        id,
        start_time,
        -- Round start time DOWN to nearest 5 minutes
        date_trunc('hour', start_time) + INTERVAL '5 min' * FLOOR(EXTRACT(minute FROM start_time) / 5) as rounded_start_time,
        -- Round end time UP to nearest 30 minutes
        CASE
          WHEN end_time IS NULL THEN
            date_trunc('hour', NOW()) + INTERVAL '30 min' * CEIL(EXTRACT(minute FROM NOW()) / 30)
          ELSE
            date_trunc('hour', end_time) + INTERVAL '30 min' * CEIL(EXTRACT(minute FROM end_time) / 30)
        END as rounded_end_time,
        CASE
          WHEN end_time IS NULL THEN NOW()
          ELSE end_time
        END as end_time,
        CASE
          WHEN end_time IS NULL THEN
            EXTRACT(EPOCH FROM (
              (date_trunc('hour', NOW()) + INTERVAL '30 min' * CEIL(EXTRACT(minute FROM NOW()) / 30)) -
              (date_trunc('hour', start_time) + INTERVAL '5 min' * FLOOR(EXTRACT(minute FROM start_time) / 5))
            )) / 60
          ELSE
            EXTRACT(EPOCH FROM (
              (date_trunc('hour', end_time) + INTERVAL '30 min' * CEIL(EXTRACT(minute FROM end_time) / 30)) -
              (date_trunc('hour', start_time) + INTERVAL '5 min' * FLOOR(EXTRACT(minute FROM start_time) / 5))
            )) / 60
        END as duration_minutes
      FROM service_request_time_entries
      WHERE service_request_id = $1
      ORDER BY start_time
    `;
    const timeEntriesResult = await pool.query(timeEntriesQuery, [id]);

    // Get rate tiers
    const tiersQuery = `
      SELECT
        tier_name,
        tier_level,
        day_of_week,
        time_start,
        time_end,
        rate_multiplier
      FROM service_hour_rate_tiers
      WHERE is_active = true
      ORDER BY tier_level DESC
    `;
    const tiersResult = await pool.query(tiersQuery);
    const tiers = tiersResult.rows;

    // Build chronological array of minutes
    const chronologicalMinutes = [];
    for (let i = 0; i < timeEntriesResult.rows.length; i++) {
      const entry = timeEntriesResult.rows[i];
      const isLastEntry = i === timeEntriesResult.rows.length - 1;

      // Start time is always actual (no rounding)
      const startTime = new Date(entry.start_time);
      const rawEndTime = new Date(entry.end_time);

      // Only round the FINAL end time up to nearest 15 minutes
      let endTime = rawEndTime;
      if (isLastEntry) {
        const endMinutes = rawEndTime.getUTCMinutes();
        const roundedUpMinutes = Math.ceil(endMinutes / 15) * 15;
        endTime = new Date(rawEndTime);
        if (roundedUpMinutes === 60) {
          endTime.setUTCHours(endTime.getUTCHours() + 1);
          endTime.setUTCMinutes(0, 0, 0);
        } else {
          endTime.setUTCMinutes(roundedUpMinutes, 0, 0);
        }
      }

      let currentTime = new Date(startTime);

      while (currentTime < endTime) {
        // All timestamps are UTC - compare directly
        const dayOfWeek = currentTime.getUTCDay();
        const hours = String(currentTime.getUTCHours()).padStart(2, '0');
        const minutes = String(currentTime.getUTCMinutes()).padStart(2, '0');
        const seconds = String(currentTime.getUTCSeconds()).padStart(2, '0');
        const timeString = `${hours}:${minutes}:${seconds}`;
        let assignedTier = 'Standard';
        let rateMultiplier = 1.0;

        for (const tier of tiers) {
          const tierDay = tier.day_of_week;
          if (tierDay === dayOfWeek && timeString >= tier.time_start && timeString < tier.time_end) {
            assignedTier = tier.tier_name;
            rateMultiplier = parseFloat(tier.rate_multiplier);
            break;
          }
        }

        chronologicalMinutes.push({
          timestamp: new Date(currentTime),
          tier: assignedTier,
          multiplier: rateMultiplier
        });

        currentTime.setMinutes(currentTime.getMinutes() + 1);
      }
    }

    // Apply first-time client discount
    const minutesToWaive = isFirstServiceRequest ? 60 : 0;
    const waivedArray = chronologicalMinutes.slice(0, minutesToWaive);
    const billableArray = chronologicalMinutes.slice(minutesToWaive);

    // Calculate breakdown
    let standardMinutes = 0, premiumMinutes = 0, emergencyMinutes = 0;
    for (const minute of billableArray) {
      if (minute.tier === 'Standard') standardMinutes++;
      else if (minute.tier === 'Premium') premiumMinutes++;
      else if (minute.tier === 'Emergency') emergencyMinutes++;
    }

    // Convert minutes to hours (no additional rounding - end time already rounded)
    const standardBillableHours = standardMinutes / 60;
    const premiumBillableHours = premiumMinutes / 60;
    const emergencyBillableHours = emergencyMinutes / 60;

    // Calculate costs
    const standardRate = baseRate * 1.0;
    const premiumRate = baseRate * 1.5;
    const emergencyRate = baseRate * 2.0;

    const standardCost = standardBillableHours * standardRate;
    const premiumCost = premiumBillableHours * premiumRate;
    const emergencyCost = emergencyBillableHours * emergencyRate;

    const subtotal = standardCost + premiumCost + emergencyCost;

    // Get company settings
    const settingsQuery = `SELECT setting_key, setting_value FROM company_settings`;
    const settingsResult = await pool.query(settingsQuery);
    const settings = {};
    settingsResult.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });

    const dueDays = parseInt(settings.invoice_due_days) || 30;
    const taxRate = parseFloat(settings.invoice_tax_rate) || 0;
    const taxAmount = subtotal * taxRate;
    const totalAmount = subtotal + taxAmount;

    // Generate unique invoice number (format: INV-YYYYMMDD-XXXX)
    const invoiceDate = new Date();
    const dateStr = invoiceDate.toISOString().slice(0, 10).replace(/-/g, '');
    const countQuery = `SELECT COUNT(*) as count FROM invoices WHERE invoice_number LIKE $1`;
    const countResult = await pool.query(countQuery, [`INV-${dateStr}-%`]);
    const invoiceCount = parseInt(countResult.rows[0].count) + 1;
    const invoiceNumber = `INV-${dateStr}-${invoiceCount.toString().padStart(4, '0')}`;

    // Calculate due date
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + dueDays);

    // Calculate original cost estimate (snapshot at invoice time)
    let originalCostEstimate = null;
    if (serviceRequest.requested_datetime && serviceRequest.requested_duration_minutes) {
      // Convert datetime + duration to date, time_start, time_end format for calculateCost
      const startDateTime = new Date(serviceRequest.requested_datetime);
      const endDateTime = new Date(startDateTime.getTime() + serviceRequest.requested_duration_minutes * 60000);

      const formatTime = (date) => {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
      };

      const costDate = startDateTime.toISOString().split('T')[0];
      const costTimeStart = formatTime(startDateTime);
      const costTimeEnd = formatTime(endDateTime);

      originalCostEstimate = await calculateCost(
        pool,
        costDate,
        costTimeStart,
        costTimeEnd,
        baseRate,
        isFirstServiceRequest,
        serviceRequest.rate_category_name || 'Standard'
      );
    }

    // Build actual hours breakdown from time entries
    const actualHoursBreakdown = {
      timeEntries: timeEntriesResult.rows.map(entry => ({
        startTime: entry.start_time,
        endTime: entry.end_time
      })),
      standard: {
        actualMinutes: chronologicalMinutes.filter(m => m.tier === 'Standard').length,
        actualHours: (chronologicalMinutes.filter(m => m.tier === 'Standard').length / 60).toFixed(2),
        roundedHours: standardBillableHours.toFixed(2)
      },
      premium: {
        actualMinutes: chronologicalMinutes.filter(m => m.tier === 'Premium').length,
        actualHours: (chronologicalMinutes.filter(m => m.tier === 'Premium').length / 60).toFixed(2),
        roundedHours: premiumBillableHours.toFixed(2)
      },
      emergency: {
        actualMinutes: chronologicalMinutes.filter(m => m.tier === 'Emergency').length,
        actualHours: (chronologicalMinutes.filter(m => m.tier === 'Emergency').length / 60).toFixed(2),
        roundedHours: emergencyBillableHours.toFixed(2)
      }
    };

    // Insert invoice with snapshots
    const invoiceQuery = `
      INSERT INTO invoices (
        service_request_id,
        business_id,
        invoice_number,
        base_hourly_rate,
        standard_hours,
        standard_rate,
        standard_cost,
        premium_hours,
        premium_rate,
        premium_cost,
        emergency_hours,
        emergency_rate,
        emergency_cost,
        waived_hours,
        is_first_service_request,
        subtotal,
        tax_rate,
        tax_amount,
        total_amount,
        issue_date,
        due_date,
        payment_status,
        work_description,
        rate_tiers_snapshot,
        original_cost_estimate,
        actual_hours_breakdown
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, 'due', $22, $23, $24, $25
      )
      RETURNING id, invoice_number
    `;

    const invoiceResult = await pool.query(invoiceQuery, [
      id,
      serviceRequest.business_id,
      invoiceNumber,
      baseRate,
      standardBillableHours,
      standardRate,
      standardCost,
      premiumBillableHours,
      premiumRate,
      premiumCost,
      emergencyBillableHours,
      emergencyRate,
      emergencyCost,
      waivedArray.length / 60,
      isFirstServiceRequest,
      subtotal,
      taxRate,
      taxAmount,
      totalAmount,
      invoiceDate,
      dueDate,
      resolutionSummary,
      JSON.stringify(tiers),                    // rate_tiers_snapshot
      JSON.stringify(originalCostEstimate),     // original_cost_estimate
      JSON.stringify(actualHoursBreakdown)      // actual_hours_breakdown
    ]);

    const createdInvoice = invoiceResult.rows[0];

    // Get client ID to notify about new invoice
    const clientQuery = await pool.query(`
      SELECT u.id as client_id
      FROM businesses b
      JOIN users u ON b.id = u.business_id
      WHERE b.id = $1
      LIMIT 1
    `, [serviceRequest.business_id]);

    if (clientQuery.rows.length > 0) {
      const { client_id } = clientQuery.rows[0];

      // Notify the client about the new invoice
      websocketService.notifyClientOfInvoiceUpdate(client_id, {
        invoiceId: createdInvoice.id,
        invoiceNumber: createdInvoice.invoice_number,
        totalAmount: totalAmount,
        paymentStatus: 'due',
        type: 'new_invoice'
      });
    }

    // Also notify admins
    websocketService.broadcastInvoiceUpdateToAdmins({
      invoiceId: createdInvoice.id,
      invoiceNumber: createdInvoice.invoice_number,
      totalAmount: totalAmount,
      type: 'new_invoice'
    });

    res.json({
      success: true,
      message: 'Service request closed successfully and invoice generated',
      data: {
        ...result.rows[0],
        invoice: {
          id: createdInvoice.id,
          invoiceNumber: createdInvoice.invoice_number
        }
      }
    });

  } catch (error) {
    console.error('Error closing service request:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to close service request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/admin/service-requests/:id/uncancel
 * Restore a cancelled service request (only if it hasn't started yet)
 */
router.post('/service-requests/:id/uncancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const pool = await getPool();

    console.log(`📋 Admin uncancelling service request ${id}...`);

    // Get service request details
    const serviceRequestQuery = `
      SELECT
        sr.id,
        sr.request_number,
        sr.title,
        sr.requested_datetime,
        srs.name as status_name,
        srs.is_final_status
      FROM service_requests sr
      LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
      WHERE sr.id = $1 AND sr.soft_delete = false
    `;

    const serviceRequestResult = await pool.query(serviceRequestQuery, [id]);

    if (serviceRequestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    const serviceRequest = serviceRequestResult.rows[0];

    // Check if request is cancelled
    if (serviceRequest.status_name.toLowerCase() !== 'cancelled') {
      return res.status(400).json({
        success: false,
        message: `Cannot uncancel service request with status: ${serviceRequest.status_name}`
      });
    }

    // Check if service request has already started or passed
    const now = new Date();
    const requestedDateTime = new Date(serviceRequest.requested_datetime);

    if (requestedDateTime < now) {
      return res.status(400).json({
        success: false,
        message: 'Cannot uncancel service request that has already started or passed'
      });
    }

    // Get "Submitted" status ID
    const submittedStatusQuery = `
      SELECT id FROM service_request_statuses
      WHERE name = 'Submitted' AND is_active = true
      LIMIT 1
    `;
    const submittedStatusResult = await pool.query(submittedStatusQuery);

    if (submittedStatusResult.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Submitted status not found in system. Please contact administrator.'
      });
    }

    const submittedStatusId = submittedStatusResult.rows[0].id;

    // Update service request status to Submitted
    const updateQuery = `
      UPDATE service_requests
      SET
        status_id = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING updated_at
    `;

    await pool.query(updateQuery, [submittedStatusId, id]);

    // Add uncancellation note
    const noteText = reason && reason.trim()
      ? `Service request restored by admin. Reason: ${reason.trim()}`
      : 'Service request restored by admin.';

    const insertNoteQuery = `
      INSERT INTO service_request_notes (
        service_request_id,
        note_text,
        note_type,
        created_by_type,
        created_by_id,
        created_by_name,
        is_visible_to_client
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    const employeeId = req.user?.id || null;
    const employeeName = req.user?.name || req.user?.email || 'Admin';

    await pool.query(insertNoteQuery, [
      id,
      noteText,
      'status_change',
      'employee',
      employeeId,
      employeeName,
      true
    ]);

    console.log(`✅ Service request ${serviceRequest.request_number} restored by ${employeeName}`);

    res.json({
      success: true,
      message: 'Service request restored successfully',
      data: {
        id: serviceRequest.id,
        requestNumber: serviceRequest.request_number,
        status: 'Submitted'
      }
    });

  } catch (error) {
    console.error('❌ Error uncancelling service request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to uncancel service request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * DELETE /api/admin/service-requests/:requestId/files/:fileId
 * Delete a file attachment with note logging
 */
router.delete('/service-requests/:requestId/files/:fileId', async (req, res) => {
  try {
    const pool = await getPool();
    const { requestId, fileId } = req.params;

    // Support both body and query params for deletedBy
    const deletedBy = req.body.deletedBy || {
      id: req.query.updatedById,
      name: req.query.updatedByName,
      type: req.query.updatedByType
    };

    if (!deletedBy || !deletedBy.id || !deletedBy.name || !deletedBy.type) {
      return res.status(400).json({
        success: false,
        message: 'deletedBy information is required (id, name, type)'
      });
    }

    // Get file info before deletion
    const fileResult = await pool.query(
      'SELECT original_filename FROM t_client_files WHERE id = $1 AND service_request_id = $2 AND soft_delete = false',
      [fileId, requestId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    const fileName = fileResult.rows[0].original_filename;

    // Soft delete the file
    await pool.query(
      'UPDATE t_client_files SET soft_delete = true, deleted_at = NOW(), deleted_by_user_id = $1 WHERE id = $2',
      [deletedBy.id, fileId]
    );

    // Create note entry
    const noteText = `**${deletedBy.name}** removed file attachment: **${fileName}**`;

    await pool.query(`
      INSERT INTO service_request_notes (
        service_request_id,
        note_text,
        note_type,
        created_by_type,
        created_by_id,
        created_by_name,
        is_visible_to_client
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      requestId,
      noteText,
      'file_change',
      deletedBy.type,
      deletedBy.id,
      deletedBy.name,
      true
    ]);

    // Notify via WebSocket
    websocketService.broadcastEntityUpdate('serviceRequest', requestId, 'updated', {
      fileDeleted: true,
      fileName: fileName,
      deletedBy: deletedBy
    });

    res.json({
      success: true,
      message: `File "${fileName}" deleted successfully`
    });

  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete file',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * PATCH /api/admin/service-requests/:requestId/files/:fileId/rename
 * Rename a file attachment with note logging
 */
router.patch('/service-requests/:requestId/files/:fileId/rename', async (req, res) => {
  try {
    const pool = await getPool();
    const { requestId, fileId } = req.params;
    const { newFileName, renamedBy } = req.body;

    if (!newFileName) {
      return res.status(400).json({
        success: false,
        message: 'newFileName is required'
      });
    }

    if (!renamedBy || !renamedBy.id || !renamedBy.name || !renamedBy.type) {
      return res.status(400).json({
        success: false,
        message: 'renamedBy information is required (id, name, type)'
      });
    }

    // Get current file info
    const fileResult = await pool.query(
      'SELECT original_filename FROM t_client_files WHERE id = $1 AND service_request_id = $2 AND soft_delete = false',
      [fileId, requestId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    const oldFileName = fileResult.rows[0].original_filename;

    if (oldFileName === newFileName) {
      return res.json({
        success: true,
        message: 'No change in filename'
      });
    }

    // Update the filename
    await pool.query(
      'UPDATE t_client_files SET original_filename = $1 WHERE id = $2',
      [newFileName, fileId]
    );

    // Create note entry
    const noteText = `**${renamedBy.name}** renamed file attachment:\n- **${oldFileName}**\n+ **${newFileName}**`;

    await pool.query(`
      INSERT INTO service_request_notes (
        service_request_id,
        note_text,
        note_type,
        created_by_type,
        created_by_id,
        created_by_name,
        is_visible_to_client
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      requestId,
      noteText,
      'file_change',
      renamedBy.type,
      renamedBy.id,
      renamedBy.name,
      true
    ]);

    res.json({
      success: true,
      message: 'File renamed successfully',
      data: { oldFileName, newFileName }
    });

  } catch (error) {
    console.error('Error renaming file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rename file',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * PATCH /api/admin/service-requests/:id/details
 * Update title and/or description with change tracking
 */
router.patch('/service-requests/:id/details', async (req, res) => {
  try {
    const pool = await getPool();
    const { id } = req.params;
    const { title, description, updatedBy } = req.body;

    // Validate input
    if (!title && !description) {
      return res.status(400).json({
        success: false,
        message: 'At least one field (title or description) must be provided'
      });
    }

    if (!updatedBy || !updatedBy.id || !updatedBy.name || !updatedBy.type) {
      return res.status(400).json({
        success: false,
        message: 'updatedBy information is required (id, name, type)'
      });
    }

    // Get current service request details
    const currentResult = await pool.query(
      'SELECT title, description FROM service_requests WHERE id = $1',
      [id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    const current = currentResult.rows[0];
    const updates = [];
    const params = [];
    let paramIndex = 1;
    const changes = [];

    // Helper function to generate unified diff
    const generateDiff = (oldText, newText, fieldName) => {
      const oldLines = (oldText || '').split('\n');
      const newLines = (newText || '').split('\n');

      let diff = `--- ${fieldName} (before)\n+++ ${fieldName} (after)\n`;

      const maxLines = Math.max(oldLines.length, newLines.length);
      for (let i = 0; i < maxLines; i++) {
        const oldLine = oldLines[i] || '';
        const newLine = newLines[i] || '';

        if (oldLine !== newLine) {
          if (oldLine) diff += `- ${oldLine}\n`;
          if (newLine) diff += `+ ${newLine}\n`;
        } else if (oldLine) {
          diff += `  ${oldLine}\n`;
        }
      }

      return diff;
    };

    // Track title changes
    if (title !== undefined && title !== current.title) {
      updates.push(`title = $${paramIndex}`);
      params.push(title);
      paramIndex++;

      const diff = generateDiff(current.title, title, 'Title');
      changes.push({
        field: 'title',
        oldValue: current.title,
        newValue: title,
        diff
      });
    }

    // Track description changes
    if (description !== undefined && description !== current.description) {
      updates.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;

      const diff = generateDiff(current.description, description, 'Description');
      changes.push({
        field: 'description',
        oldValue: current.description,
        newValue: description,
        diff
      });
    }

    // If no changes detected
    if (updates.length === 0) {
      return res.json({
        success: true,
        message: 'No changes detected',
        data: current
      });
    }

    // Update the service request
    updates.push(`updated_at = NOW()`);
    params.push(id);

    const updateQuery = `
      UPDATE service_requests
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, params);

    // Create note entries for each change
    for (const change of changes) {
      const noteText = `**${updatedBy.name}** updated the **${change.field}**:\n\n${change.diff}`;

      await pool.query(`
        INSERT INTO service_request_notes (
          service_request_id,
          note_text,
          note_type,
          created_by_type,
          created_by_id,
          created_by_name,
          is_visible_to_client
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        id,
        noteText,
        'field_change',
        updatedBy.type, // 'employee' or 'client'
        updatedBy.id,
        updatedBy.name,
        true // Visible to client
      ]);
    }

    res.json({
      success: true,
      message: `Successfully updated ${changes.map(c => c.field).join(' and ')}`,
      data: updateResult.rows[0],
      changes: changes.map(c => ({ field: c.field, diff: c.diff }))
    });

  } catch (error) {
    console.error('Error updating service request details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service request details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * POST /api/admin/service-requests/filter-presets
 * Create a new filter preset
 */
router.post('/service-requests/filter-presets', async (req, res) => {
  try {
    const { name, description, filter_type, criteria, display_order } = req.body;
    const employeeId = req.employeeId || req.user?.id;

    if (!name || !criteria) {
      return res.status(400).json({
        success: false,
        message: 'Name and criteria are required'
      });
    }

    const preset = await filterPresetService.createPreset(
      { name, description, filter_type, criteria, display_order },
      employeeId
    );

    res.status(201).json({
      success: true,
      message: 'Filter preset created successfully',
      data: preset
    });

  } catch (error) {
    console.error('Error creating filter preset:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create filter preset',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * PUT /api/admin/service-requests/filter-presets/:id
 * Update a filter preset
 */
router.put('/service-requests/filter-presets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const preset = await filterPresetService.updatePreset(id, updates);

    res.json({
      success: true,
      message: 'Filter preset updated successfully',
      data: preset
    });

  } catch (error) {
    console.error('Error updating filter preset:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update filter preset',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * DELETE /api/admin/service-requests/filter-presets/:id
 * Delete a filter preset
 */
router.delete('/service-requests/filter-presets/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await filterPresetService.deletePreset(id);

    res.json({
      success: true,
      message: 'Filter preset deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting filter preset:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete filter preset',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /api/admin/service-requests/filter-presets/all
 * Get all filter presets (including inactive ones, for management)
 */
router.get('/service-requests/filter-presets/all', async (req, res) => {
  try {
    const presets = await filterPresetService.getAllPresets();

    res.json({
      success: true,
      data: presets
    });

  } catch (error) {
    console.error('Error fetching all filter presets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch filter presets',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ============================================================================
// FILE UPLOAD CONFIGURATION AND ENDPOINTS
// ============================================================================

const clientUploadsDir = path.join(__dirname, '..', '..', 'uploads', 'clients');

async function ensureDirectoryExists(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dirPath}`);
  }
}

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      // For admin uploads, we need to get the businessId from the service request
      const pool = await getPool();
      const { id: serviceRequestId } = req.params;

      const result = await pool.query(
        'SELECT sr.business_id FROM service_requests sr WHERE sr.id = $1',
        [serviceRequestId]
      );

      const businessId = result.rows[0]?.business_id || 'unknown';
      const businessDir = path.join(clientUploadsDir, businessId);
      await ensureDirectoryExists(businessDir);
      cb(null, businessDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    try {
      // Fix UTF-8 encoding issue - multer interprets UTF-8 as Latin-1
      const originalBytes = Buffer.from(file.originalname, 'latin1');
      file.originalname = originalBytes.toString('utf8');

      const fileExtension = path.extname(file.originalname);
      const randomId = crypto.randomUUID();
      const timestamp = Date.now();
      const secureFilename = `${timestamp}_${randomId}${fileExtension}`;

      cb(null, secureFilename);
    } catch (error) {
      console.error('Error generating filename:', error);
      cb(error, null);
    }
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit per file
    files: 5 // Maximum 5 files per request
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'text/plain',
      'text/csv',
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/x-7z-compressed'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype}`), false);
    }
  }
});

/**
 * POST /api/admin/service-requests/:id/files/upload
 * Upload files to a service request (admin/employee)
 */
router.post('/service-requests/:id/files/upload', upload.array('files', 5), async (req, res) => {
  const uploadedFiles = [];
  const failedFiles = [];
  let totalSizeBytes = 0;

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const { id: serviceRequestId } = req.params;
    const employeeId = req.user.id; // Employee ID from auth middleware
    const pool = await getPool();

    // Verify service request exists and get details
    const requestCheck = await pool.query(
      'SELECT sr.id, sr.request_number, sr.business_id FROM service_requests sr WHERE sr.id = $1 AND sr.soft_delete = false',
      [serviceRequestId]
    );

    if (requestCheck.rows.length === 0) {
      // Cleanup uploaded files
      await Promise.all(req.files.map(file =>
        fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err))
      ));

      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    const requestNumber = requestCheck.rows[0].request_number;
    const businessId = requestCheck.rows[0].business_id;

    // Calculate total upload size
    totalSizeBytes = req.files.reduce((sum, file) => sum + file.size, 0);

    console.log(`📤 [Admin] Processing ${req.files.length} file(s) upload for service request ${requestNumber}`);

    // Check quota
    const quotaCheck = await quotaManagementService.checkQuotaAvailability(
      businessId,
      totalSizeBytes,
      null,
      null // No specific user for admin uploads
    );

    if (!quotaCheck.canUpload) {
      await Promise.all(req.files.map(file =>
        fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err))
      ));

      return res.status(413).json({
        success: false,
        message: quotaCheck.message,
        quotaInfo: quotaCheck
      });
    }

    // Process each file
    for (const file of req.files) {
      try {
        console.log(`🔍 Processing file: ${file.originalname} (${quotaManagementService.formatBytes(file.size)})`);

        // Perform virus scan
        const scanResult = await virusScanService.scanFile(file.path, {
          originalName: file.originalname,
          size: file.size,
          employeeId: employeeId,
          businessId: businessId,
          serviceRequestId: serviceRequestId
        });

        if (scanResult.isInfected) {
          await virusScanService.quarantineFile(file.path, scanResult);

          failedFiles.push({
            originalName: file.originalname,
            error: `File infected with virus: ${scanResult.virusName}`,
            scanId: scanResult.scanId
          });

          console.log(`🚨 Infected file quarantined: ${file.originalname}`);
          continue;
        }

        if (!scanResult.scanSuccess) {
          await fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err));

          failedFiles.push({
            originalName: file.originalname,
            error: `Virus scan failed: ${scanResult.errorMessage}`,
            scanId: scanResult.scanId
          });

          console.log(`❌ Scan failed for file: ${file.originalname}`);
          continue;
        }

        // File is clean, record in database
        const fileData = {
          businessId: businessId,
          serviceLocationId: null,
          userId: null, // Admin upload, no user
          fileName: file.filename,
          originalName: file.originalname,
          fileSizeBytes: file.size,
          mimeType: file.mimetype,
          filePath: file.path,
          categoryId: null,
          description: '',
          isPublic: false,
          metadata: {
            scanId: scanResult.scanId,
            uploadedByEmployee: employeeId,
            uploadedByEmail: req.user.email,
            uploadIp: req.ip,
            userAgent: req.get('User-Agent'),
            serviceRequestId: serviceRequestId
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        };

        const uploadResult = await quotaManagementService.recordFileUpload(fileData);

        if (uploadResult.success) {
          // Link file to service request
          await pool.query(
            'UPDATE t_client_files SET service_request_id = $1 WHERE id = $2',
            [serviceRequestId, uploadResult.fileId]
          );

          uploadedFiles.push({
            fileId: uploadResult.fileId,
            originalName: file.originalname,
            fileName: file.filename,
            size: file.size,
            mimeType: file.mimetype,
            scanId: scanResult.scanId,
            scanStatus: scanResult.isInfected ? 'infected' : 'clean',
            uploadedAt: uploadResult.createdAt
          });

          console.log(`✅ File uploaded successfully: ${file.originalname}`);
        } else {
          await fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err));

          failedFiles.push({
            originalName: file.originalname,
            error: `Database error: ${uploadResult.error}`
          });
        }

      } catch (error) {
        console.error(`❌ Error processing file ${file.originalname}:`, error);

        await fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err));

        failedFiles.push({
          originalName: file.originalname,
          error: error.message
        });
      }
    }

    // Create automatic note if any files were uploaded successfully
    if (uploadedFiles.length > 0) {
      const employeeQuery = await pool.query(
        'SELECT first_name, last_name FROM employees WHERE id = $1',
        [employeeId]
      );
      const employeeName = employeeQuery.rows[0] ? `${employeeQuery.rows[0].first_name} ${employeeQuery.rows[0].last_name}` : 'Employee';

      const now = new Date();
      const utcTime = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
      const localTime = now.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }) + ' PST';

      const fileList = uploadedFiles.map(f => `- ${f.originalName} (${quotaManagementService.formatBytes(f.size)})`).join('\n');
      const allClean = uploadedFiles.every(f => f.scanStatus === 'clean');
      const virusStatus = allClean ? '✅ Clean' : '⚠️ Some files flagged';

      const noteText = `📎 **${employeeName}** uploaded **${uploadedFiles.length}** file(s) on ${utcTime} (${localTime})

**Files:**
${fileList}

**Virus scan:** ${virusStatus}`;

      await pool.query(`
        INSERT INTO service_request_notes (
          service_request_id,
          note_text,
          note_type,
          created_by_type,
          created_by_id,
          created_by_name,
          is_visible_to_client
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        serviceRequestId,
        noteText,
        'file_upload',
        'employee',
        employeeId,
        employeeName,
        true
      ]);

      console.log(`📝 Created auto-note for ${uploadedFiles.length} uploaded file(s)`);

      // Broadcast file upload to admins/employees and client via WebSocket
      websocketService.broadcastServiceRequestUpdate(serviceRequestId, 'updated', {
        filesUploaded: true,
        fileCount: uploadedFiles.length,
        uploadedFiles: uploadedFiles
      });
    }

    // Get updated quota information
    const updatedQuotaInfo = await quotaManagementService.getBusinessQuotaInfo(businessId);

    res.status(uploadedFiles.length > 0 ? 200 : 400).json({
      success: uploadedFiles.length > 0,
      message: `Upload completed. ${uploadedFiles.length} file(s) uploaded successfully${failedFiles.length > 0 ? `, ${failedFiles.length} failed` : ''}.`,
      data: {
        uploadedFiles,
        failedFiles,
        quotaInfo: updatedQuotaInfo
      }
    });

  } catch (error) {
    console.error('❌ [Admin] File upload error:', error);

    // Cleanup all uploaded files on error
    if (req.files) {
      await Promise.all(req.files.map(file =>
        fs.unlink(file.path).catch(err => console.error('Failed to cleanup file:', err))
      ));
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error during file upload'
    });
  }
});

export default router;