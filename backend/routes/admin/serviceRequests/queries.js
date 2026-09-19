import express from 'express';
import { logger } from '../../../utils/logger.js';
import { getPool } from '../../../config/database.js';
import filterPresetService from '../../../services/filterPresetService.js';

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
            logger.warn(`Preset filter not found: ${presetName}`);
            // Fallback to exact match
            conditions.push(`LOWER(srs.name) = LOWER($${paramIndex})`);
            params.push(status);
            paramIndex++;
          }
        } catch (error) {
          logger.error('Error applying preset filter:', error);
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

    logger.debug('📊 [Service Requests] Query returned:', result.rows.length, 'rows');
    logger.debug('📊 [Service Requests] Sample row:', result.rows[0]);

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    logger.debug('📊 [Service Requests] Total count:', totalCount);

    // Helper function to calculate cost with tier breakdown
    const calculateCost = async (date, timeStart, timeEnd, businessId, clientId, createdAt, durationMinutes = null) => {
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

        // Check if this is the first non-cancelled service request for this client
        // First-hour comp applies to the first service request that isn't cancelled
        // If all previous requests were cancelled, a new request can still get the comp
        const previousNonCancelledCheck = await pool.query(`
          SELECT COUNT(*) as count
          FROM service_requests sr
          JOIN service_request_statuses srs ON sr.status_id = srs.id
          WHERE sr.client_id = $1
            AND sr.soft_delete = false
            AND sr.created_at < $2
            AND srs.name != 'Cancelled'
        `, [clientId, createdAt]);
        const isFirstRequest = parseInt(previousNonCancelledCheck.rows[0].count) === 0;

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

        // Get day of week (in UTC to match tier times)
        const requestDate = new Date(date + 'T00:00:00Z');
        const dayOfWeek = requestDate.getUTCDay();

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
          const result = matchingTier ? {
            tierName: matchingTier.tier_name,
            multiplier: parseFloat(matchingTier.rate_multiplier)
          } : { tierName: 'Standard', multiplier: 1.0 };

          logger.debug(`🔍 Tier lookup: ${timeString} (${hour}:${minute}) → ${result.tierName} @ ${result.multiplier}x`);
          return result;
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
        logger.error('Error calculating cost:', error.message);
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

          // Extract time in HH:MM:SS format (UTC - matches database tier times)
          const formatTime = (date) => {
            const hours = String(date.getUTCHours()).padStart(2, '0');
            const minutes = String(date.getUTCMinutes()).padStart(2, '0');
            const seconds = String(date.getUTCSeconds()).padStart(2, '0');
            return `${hours}:${minutes}:${seconds}`;
          };

          costTimeStart = formatTime(startDateTime);
          costTimeEnd = formatTime(endDateTime);

          logger.debug(`🕐 [SR-${row.request_number}] Calculating cost:`, {
            utc_datetime: startDateTime.toISOString(),
            utc_hours: startDateTime.getUTCHours(),
            costTimeStart,
            costTimeEnd,
            costDate
          });
        }

        const costInfo = await calculateCost(
          costDate,
          costTimeStart,
          costTimeEnd,
          row.business_id,
          row.client_id,
          row.created_at,
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
    logger.error('Error fetching service requests:', error);
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
    logger.error('Error fetching closure reasons:', error);
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

    // Get business_id and rate for this service request
    const serviceRequestQuery = `
      SELECT
        sr.business_id,
        sr.client_id,
        COALESCE(hrc.base_hourly_rate, 75.00) as base_hourly_rate
      FROM service_requests sr
      LEFT JOIN businesses b ON sr.business_id = b.id
      LEFT JOIN hourly_rate_categories hrc ON b.rate_category_id = hrc.id
      WHERE sr.id = $1
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
    const baseRate = parseFloat(srResult.rows[0].base_hourly_rate) || 75.00;

    // Check if this is the client's first non-cancelled service request
    // First-hour comp applies to the first service request that isn't cancelled
    // If all previous requests were cancelled, a new request can still get the comp
    const previousNonCancelledQuery = `
      SELECT COUNT(*) as count
      FROM service_requests sr
      JOIN service_request_statuses srs ON sr.status_id = srs.id
      WHERE sr.client_id = $1
        AND sr.soft_delete = false
        AND srs.name != 'Cancelled'
        AND sr.created_at < (
          SELECT created_at FROM service_requests WHERE id = $2
        )
    `;
    const previousResult = await pool.query(previousNonCancelledQuery, [clientId, id]);
    const isFirstServiceRequest = parseInt(previousResult.rows[0].count) === 0;

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

    logger.debug('🔍 Time entries found:', timeEntriesResult.rows.length);
    logger.debug('📊 Time entries data:', JSON.stringify(timeEntriesResult.rows, null, 2));

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

      logger.debug('⏱️  Processing entry:', {
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

    logger.debug('📈 Total chronological minutes:', chronologicalMinutes.length);

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

    // Calculate costs
    const standardRate = baseRate;
    const premiumRate = baseRate * 1.5;
    const emergencyRate = baseRate * 2.0;

    const standardCost = standardBillableHours * standardRate;
    const premiumCost = premiumBillableHours * premiumRate;
    const emergencyCost = emergencyBillableHours * emergencyRate;
    const totalCost = standardCost + premiumCost + emergencyCost;

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
        totalBillableHours,
        // Rates
        baseRate,
        standardRate,
        premiumRate,
        emergencyRate,
        // Costs
        standardCost,
        premiumCost,
        emergencyCost,
        totalCost
      }
    });

  } catch (error) {
    logger.error('Error calculating time breakdown:', error);
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
    logger.error('Error fetching service request statuses:', error);
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
    logger.error('Error fetching filter presets:', error);
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
    logger.error('Error fetching technicians:', error);
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
        cf.created_at AT TIME ZONE 'UTC' as created_at,
        cf.uploaded_by_user_id,
        cf.uploaded_by_employee_id,
        COALESCE(u.email, e.email) as uploaded_by_email,
        CASE
          WHEN u.id IS NOT NULL THEN 'client'
          WHEN e.id IS NOT NULL THEN 'employee'
          ELSE 'unknown'
        END as uploaded_by_type
      FROM t_client_files cf
      LEFT JOIN users u ON cf.uploaded_by_user_id = u.id
      LEFT JOIN employees e ON cf.uploaded_by_employee_id = e.id
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
    logger.error('Error fetching service request files:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch files',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

export default router;
