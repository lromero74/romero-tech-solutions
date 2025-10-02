import express from 'express';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { clientContextMiddleware, requireClientAccess } from '../../middleware/clientMiddleware.js';
import { sanitizeInputMiddleware } from '../../utils/inputValidation.js';
import { getPool } from '../../config/database.js';
import { systemSettingsService } from '../../services/systemSettingsService.js';
import { timezoneService } from '../../utils/timezoneUtils.js';

const router = express.Router();

// Apply base middleware to all routes
router.use(authMiddleware);
router.use(sanitizeInputMiddleware);

/**
 * GET /api/client/scheduler-config
 * Get scheduler configuration settings
 */
router.get('/scheduler-config', clientContextMiddleware, requireClientAccess(['business', 'location']), async (req, res) => {
  try {
    const settings = await systemSettingsService.getSettings([
      'scheduler_buffer_before_hours',
      'scheduler_buffer_after_hours',
      'scheduler_default_slot_duration_hours',
      'scheduler_minimum_advance_hours'
    ]);

    const config = {
      bufferBeforeHours: parseInt(settings.scheduler_buffer_before_hours || '2'),
      bufferAfterHours: parseInt(settings.scheduler_buffer_after_hours || '1'),
      defaultSlotDurationHours: parseInt(settings.scheduler_default_slot_duration_hours || '2'),
      minimumAdvanceHours: parseInt(settings.scheduler_minimum_advance_hours || '1')
    };

    res.json({
      success: true,
      data: config
    });

  } catch (error) {
    console.error('❌ Error fetching scheduler config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch scheduler configuration'
    });
  }
});

/**
 * GET /api/client/rate-tiers
 * Get service hour rate tiers for time slot coloring
 */
router.get('/rate-tiers', async (req, res) => {
  try {
    const pool = await getPool();

    const query = `
      SELECT
        id,
        tier_name,
        tier_level,
        day_of_week,
        time_start,
        time_end,
        rate_multiplier,
        color_code,
        description
      FROM service_hour_rate_tiers
      WHERE is_active = true
      ORDER BY day_of_week, tier_level, time_start
    `;

    const result = await pool.query(query);

    const rateTiers = result.rows.map(row => ({
      id: row.id,
      tierName: row.tier_name,
      tierLevel: row.tier_level,
      dayOfWeek: row.day_of_week,
      timeStart: row.time_start,
      timeEnd: row.time_end,
      rateMultiplier: parseFloat(row.rate_multiplier),
      colorCode: row.color_code,
      description: row.description
    }));

    res.json({
      success: true,
      data: rateTiers
    });

  } catch (error) {
    console.error('❌ Error fetching rate tiers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rate tiers'
    });
  }
});

/**
 * GET /api/client/resources
 * Get available resources (service locations) for scheduling
 */
router.get('/resources', clientContextMiddleware, requireClientAccess(['business', 'location']), async (req, res) => {
  try {
    const { date } = req.query;
    const businessId = req.user.businessId;

    const query = `
      SELECT
        sl.id,
        sl.location_name as name,
        sl.location_type as type,
        sl.notes as description,
        sl.is_active as isAvailable
      FROM service_locations sl
      WHERE sl.business_id = $1 AND sl.soft_delete = false AND sl.is_active = true
      ORDER BY sl.location_name
    `;

    const pool = await getPool();
    const result = await pool.query(query, [businessId]);

    const resources = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type || 'Service Location',
      description: row.description,
      isAvailable: row.isavailable
    }));

    res.json({
      success: true,
      data: resources
    });

  } catch (error) {
    console.error('❌ Error fetching resources:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch resources'
    });
  }
});

/**
 * GET /api/client/bookings
 * Get existing bookings for a specific date (SYSTEM-WIDE, not resource-specific)
 * Returns all service requests to enable proper 1-hour buffer enforcement
 */
router.get('/bookings', clientContextMiddleware, requireClientAccess(['business', 'location']), async (req, res) => {
  try {
    const { date } = req.query;
    const clientId = req.user.userId;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required'
      });
    }

    // IMPORTANT: Query system-wide bookings (removed business_id filter)
    // This allows clients to see all appointments to avoid scheduling conflicts
    const query = `
      SELECT
        sr.id,
        sr.service_location_id as resourceId,
        sr.requested_date,
        sr.requested_time_start,
        sr.requested_time_end,
        sr.scheduled_date,
        sr.scheduled_time_start,
        sr.scheduled_time_end,
        u.first_name,
        u.last_name,
        st.name as serviceType,
        sr.client_id,
        CASE WHEN sr.client_id = $1 THEN true ELSE false END as isOwnBooking
      FROM service_requests sr
      LEFT JOIN users u ON sr.client_id = u.id
      LEFT JOIN service_types st ON sr.service_type_id = st.id
      WHERE (sr.requested_date = $2 OR sr.scheduled_date = $2)
        AND sr.soft_delete = false
        AND sr.status_id NOT IN (
          SELECT id FROM service_request_statuses
          WHERE name IN ('Cancelled', 'Completed', 'Rejected')
        )
      ORDER BY
        COALESCE(sr.scheduled_time_start, sr.requested_time_start),
        COALESCE(sr.scheduled_date, sr.requested_date)
    `;

    const pool = await getPool();
    const result = await pool.query(query, [clientId, date]);

    const bookings = result.rows.map(row => {
      // Use scheduled time if available, otherwise use requested time
      const useDate = row.scheduled_date || row.requested_date;
      const startTime = row.scheduled_time_start || row.requested_time_start;
      const endTime = row.scheduled_time_end || row.requested_time_end;

      const startDateTime = new Date(`${useDate}T${startTime}`);
      let endDateTime;

      if (endTime) {
        endDateTime = new Date(`${useDate}T${endTime}`);
      } else {
        // Default to 1 hour if no end time specified (changed from 2 hours)
        endDateTime = new Date(startDateTime.getTime() + (1 * 60 * 60 * 1000));
      }

      return {
        id: row.id,
        resourceId: row.resourceid,
        startTime: startDateTime,
        endTime: endDateTime,
        clientName: row.isownbooking ? 'You' : `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Client',
        serviceType: row.servicetype || 'Service Request',
        isOwnBooking: row.isownbooking
      };
    });

    res.json({
      success: true,
      data: bookings
    });

  } catch (error) {
    console.error('❌ Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings'
    });
  }
});

/**
 * POST /api/client/schedule-appointment
 * Create a new appointment booking with strict 1-hour buffer rules
 */
router.post('/schedule-appointment', clientContextMiddleware, requireClientAccess(['business', 'location']), async (req, res) => {
  try {
    const {
      resourceId,
      startTime,
      endTime,
      serviceTypeId,
      description,
      urgencyLevelId,
      priorityLevelId
    } = req.body;

    const businessId = req.user.businessId;
    const clientId = req.user.userId;

    if (!resourceId || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Resource ID, start time, and end time are required',
        ruleViolation: 'missing_data'
      });
    }

    const startDateTime = new Date(startTime);
    const endDateTime = new Date(endTime);
    const now = new Date();

    // RULE 1: Must be at least 1 hour in the future
    const minimumStartTime = new Date(now.getTime() + (1 * 60 * 60 * 1000));
    if (startDateTime < minimumStartTime) {
      return res.status(400).json({
        success: false,
        message: 'Appointments must be scheduled at least 1 hour in the future',
        ruleViolation: 'rule_1_minimum_advance',
        minimumTime: minimumStartTime.toISOString()
      });
    }

    // RULE 11: Duration must be between 1-6 hours
    const durationHours = (endDateTime - startDateTime) / (1000 * 60 * 60);
    if (durationHours < 1) {
      return res.status(400).json({
        success: false,
        message: 'Appointment duration must be at least 1 hour',
        ruleViolation: 'rule_11_minimum_duration',
        requestedDuration: durationHours
      });
    }
    if (durationHours > 6) {
      return res.status(400).json({
        success: false,
        message: 'Appointment duration cannot exceed 6 hours',
        ruleViolation: 'rule_11_maximum_duration',
        requestedDuration: durationHours
      });
    }

    // Check for conflicts with existing bookings SYSTEM-WIDE
    // IMPORTANT: Removed business_id and resource filters for system-wide conflict detection
    const conflictQuery = `
      SELECT
        sr.id,
        sr.requested_date,
        sr.requested_time_start,
        sr.requested_time_end,
        sr.scheduled_date,
        sr.scheduled_time_start,
        sr.scheduled_time_end,
        sr.client_id,
        sr.service_location_id
      FROM service_requests sr
      WHERE (sr.requested_date = $1 OR sr.scheduled_date = $1)
        AND sr.soft_delete = false
        AND sr.status_id NOT IN (
          SELECT id FROM service_request_statuses
          WHERE name IN ('Cancelled', 'Completed', 'Rejected')
        )
      ORDER BY
        COALESCE(sr.scheduled_time_start, sr.requested_time_start)
    `;

    const requestDate = startDateTime.toISOString().split('T')[0];
    const pool = await getPool();
    const conflictResult = await pool.query(conflictQuery, [requestDate]);

    // FIXED BUFFER: 1 hour before and after every appointment
    const BUFFER_HOURS = 1;

    // Check each existing booking for conflicts
    for (const booking of conflictResult.rows) {
      const existingUseDate = booking.scheduled_date || booking.requested_date;
      const existingStartTime = booking.scheduled_time_start || booking.requested_time_start;
      const existingEndTime = booking.scheduled_time_end || booking.requested_time_end;

      const existingStart = new Date(`${existingUseDate}T${existingStartTime}`);
      let existingEnd;

      if (existingEndTime) {
        existingEnd = new Date(`${existingUseDate}T${existingEndTime}`);
      } else {
        existingEnd = new Date(existingStart.getTime() + (1 * 60 * 60 * 1000));
      }

      // RULE 8: Must not overlap any existing service request
      if (startDateTime < existingEnd && endDateTime > existingStart) {
        return res.status(409).json({
          success: false,
          message: `Cannot schedule: Your appointment overlaps with an existing service request (${existingStart.toLocaleTimeString()} - ${existingEnd.toLocaleTimeString()})`,
          ruleViolation: 'rule_8_overlap',
          conflictingAppointment: {
            start: existingStart.toISOString(),
            end: existingEnd.toISOString()
          }
        });
      }

      // RULE 7: Must not be more than 1 hour after any existing service request
      // This means: new start time must be at least 1 hour AFTER existing end time
      const oneHourAfterExisting = new Date(existingEnd.getTime() + (BUFFER_HOURS * 60 * 60 * 1000));
      if (startDateTime > existingEnd && startDateTime < oneHourAfterExisting) {
        return res.status(409).json({
          success: false,
          message: `Cannot schedule: Must wait at least 1 hour after existing appointment ending at ${existingEnd.toLocaleTimeString()}`,
          ruleViolation: 'rule_7_buffer_after',
          conflictingAppointment: {
            end: existingEnd.toISOString()
          },
          earliestAvailable: oneHourAfterExisting.toISOString()
        });
      }

      // RULE 9: Must end at least 1 hour before any other scheduled service request
      const oneHourBeforeExisting = new Date(existingStart.getTime() - (BUFFER_HOURS * 60 * 60 * 1000));
      if (endDateTime > oneHourBeforeExisting && endDateTime <= existingStart) {
        return res.status(409).json({
          success: false,
          message: `Cannot schedule: Must end at least 1 hour before existing appointment starting at ${existingStart.toLocaleTimeString()}`,
          ruleViolation: 'rule_9_buffer_before',
          conflictingAppointment: {
            start: existingStart.toISOString()
          },
          latestAvailable: oneHourBeforeExisting.toISOString()
        });
      }
    }

    // Get default status and priority/urgency if not provided
    const defaultsQuery = `
      SELECT
        (SELECT id FROM service_request_statuses WHERE name = 'Pending' ORDER BY display_order ASC LIMIT 1) as status_id,
        (SELECT id FROM urgency_levels WHERE urgency_name = 'Normal' OR urgency_name = 'Medium' ORDER BY urgency_level ASC LIMIT 1) as urgency_id,
        (SELECT id FROM priority_levels WHERE priority_name = 'Normal' OR priority_name = 'Medium' ORDER BY priority_level ASC LIMIT 1) as priority_id
    `;

    const defaultsResult = await pool.query(defaultsQuery);
    const defaults = defaultsResult.rows[0];

    // Generate unique request number
    const requestNumber = `SR-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Create the service request
    const insertQuery = `
      INSERT INTO service_requests (
        request_number,
        title,
        description,
        client_id,
        business_id,
        service_location_id,
        created_by_user_id,
        requested_date,
        requested_time_start,
        requested_time_end,
        urgency_level_id,
        priority_level_id,
        status_id,
        service_type_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      ) RETURNING id, request_number, created_at
    `;

    const values = [
      requestNumber,
      'Scheduled Appointment',
      description || 'Appointment scheduled via time slot picker',
      clientId,
      businessId,
      resourceId,
      clientId,
      requestDate,
      startDateTime.toTimeString().slice(0, 8), // HH:MM:SS format
      endDateTime.toTimeString().slice(0, 8),
      urgencyLevelId || defaults.urgency_id,
      priorityLevelId || defaults.priority_id,
      defaults.status_id,
      serviceTypeId
    ];

    const result = await pool.query(insertQuery, values);

    console.log(`📅 Appointment scheduled: ${requestNumber} for ${startDateTime.toLocaleString()}`);

    res.status(201).json({
      success: true,
      message: 'Appointment scheduled successfully',
      data: {
        id: result.rows[0].id,
        requestNumber: result.rows[0].request_number,
        startTime: startDateTime,
        endTime: endDateTime,
        createdAt: result.rows[0].created_at
      }
    });

  } catch (error) {
    console.error('❌ Error scheduling appointment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule appointment'
    });
  }
});

/**
 * POST /api/client/suggest-available-slot
 * Auto-suggest the first available time slot that fits all scheduling rules
 * Note: Only requires authentication, not business access (queries system-wide)
 */
router.post('/suggest-available-slot', async (req, res) => {
  try {
    const { date, durationHours, tierPreference } = req.body;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required'
      });
    }

    const requestedDuration = durationHours || 1; // Default to 1 hour
    const tierPref = tierPreference || 'any'; // Default to 'any'

    // Validate duration
    if (requestedDuration < 1 || requestedDuration > 6) {
      return res.status(400).json({
        success: false,
        message: 'Duration must be between 1 and 6 hours'
      });
    }

    // Map tier preference to tier levels
    const tierLevelMap = {
      'standard': 1,
      'premium': 2,
      'emergency': 3,
      'any': null // No filtering
    };

    const preferredTierLevel = tierLevelMap[tierPref];

    const pool = await getPool();

    // Initialize timezone service
    await timezoneService.init();

    const now = new Date();
    const minimumStartTime = new Date(now.getTime() + (1 * 60 * 60 * 1000)); // 1 hour from now

    // Helper function to get blocked ranges for a specific date
    const getBlockedRangesForDate = async (searchDate) => {
      const query = `
        SELECT
          sr.requested_date,
          sr.requested_time_start,
          sr.requested_time_end,
          sr.scheduled_date,
          sr.scheduled_time_start,
          sr.scheduled_time_end
        FROM service_requests sr
        WHERE (sr.requested_date = $1 OR sr.scheduled_date = $1)
          AND sr.soft_delete = false
          AND sr.status_id NOT IN (
            SELECT id FROM service_request_statuses
            WHERE name IN ('Cancelled', 'Completed', 'Rejected')
          )
        ORDER BY
          COALESCE(sr.scheduled_time_start, sr.requested_time_start)
      `;

      const result = await pool.query(query, [searchDate]);
      const blockedRanges = [];
      const BUFFER_HOURS = 1;

      for (const booking of result.rows) {
        const useDate = booking.scheduled_date || booking.requested_date;
        const startTime = booking.scheduled_time_start || booking.requested_time_start;
        const endTime = booking.scheduled_time_end || booking.requested_time_end;

        const start = new Date(`${useDate}T${startTime}`);
        let end;

        if (endTime) {
          end = new Date(`${useDate}T${endTime}`);
        } else {
          end = new Date(start.getTime() + (1 * 60 * 60 * 1000));
        }

        // Add buffer before and after
        const bufferStart = new Date(start.getTime() - (BUFFER_HOURS * 60 * 60 * 1000));
        const bufferEnd = new Date(end.getTime() + (BUFFER_HOURS * 60 * 60 * 1000));

        blockedRanges.push({ start: bufferStart, end: bufferEnd });
      }

      return blockedRanges;
    };

    // Helper function to search for slot on a specific date (in UTC)
    const searchDateForSlot = async (searchDateString, blockedRanges) => {
      // Business hours: 24/7 (all day, every day)
      // Convert to UTC for the search
      const startOfBusinessDay = timezoneService.businessTimeToUTC(searchDateString, '00:00:00');
      const endOfBusinessDay = timezoneService.businessTimeToUTC(searchDateString, '23:59:59');

      let trySlot = new Date(startOfBusinessDay);
      let fallbackSlot = null;

      while (trySlot < endOfBusinessDay) {
        const slotEnd = new Date(trySlot.getTime() + (requestedDuration * 60 * 60 * 1000));

        // Check if slot end exceeds business hours
        if (slotEnd > endOfBusinessDay) {
          break;
        }

        // Check if slot is at least 1 hour in the future
        if (trySlot < minimumStartTime) {
          trySlot = new Date(trySlot.getTime() + (30 * 60 * 1000));
          continue;
        }

        // Check if this slot conflicts with any blocked ranges
        let hasConflict = false;
        for (const blocked of blockedRanges) {
          if (trySlot < blocked.end && slotEnd > blocked.start) {
            hasConflict = true;
            break;
          }
        }

        if (!hasConflict) {
          // Get rate tier based on business timezone
          const rateTier = await timezoneService.getRateTierForUTC(trySlot);

          // Check if slot matches tier preference
          // If user selected "any" tier, accept all slots
          // If user selected specific tier, prioritize exact matches but accept others as fallback
          const isExactMatch = preferredTierLevel === null ||
                              (rateTier && rateTier.tierLevel === preferredTierLevel);

          const isFallbackMatch = preferredTierLevel !== null &&
                                 rateTier &&
                                 rateTier.tierLevel !== preferredTierLevel;

          // Store first fallback slot in case no exact match is found
          if (isFallbackMatch && !fallbackSlot) {
            fallbackSlot = {
              startTime: trySlot.toISOString(),
              endTime: slotEnd.toISOString(),
              duration: requestedDuration,
              rateTier: rateTier ? {
                tierName: rateTier.tierName,
                rateMultiplier: rateTier.rateMultiplier
              } : null
            };
          }

          // If exact match found, return immediately
          if (isExactMatch) {
            return {
              startTime: trySlot.toISOString(),
              endTime: slotEnd.toISOString(),
              duration: requestedDuration,
              rateTier: rateTier ? {
                tierName: rateTier.tierName,
                rateMultiplier: rateTier.rateMultiplier
              } : null
            };
          }
        }

        // Move to next 30-minute slot
        trySlot = new Date(trySlot.getTime() + (30 * 60 * 1000));
      }

      // If no exact match found but we have a fallback, return it
      return fallbackSlot;
    };

    // Parse starting date string
    const startDate = new Date(date + 'T00:00:00');

    // Search forward up to 30 days
    const MAX_DAYS_TO_SEARCH = 30;
    let foundSlot = null;

    for (let dayOffset = 0; dayOffset < MAX_DAYS_TO_SEARCH; dayOffset++) {
      const currentSearchDate = new Date(startDate);
      currentSearchDate.setDate(startDate.getDate() + dayOffset);

      const dateString = currentSearchDate.toISOString().split('T')[0];
      const blockedRanges = await getBlockedRangesForDate(dateString);

      foundSlot = await searchDateForSlot(dateString, blockedRanges);

      if (foundSlot) {
        // Found a matching slot
        return res.json({
          success: true,
          data: foundSlot
        });
      }
    }

    // No available slots found within 30 days
    const tierMessage = preferredTierLevel !== null
      ? `No available ${tierPref} rate ${requestedDuration}-hour time slots found within the next 30 days.`
      : `No available ${requestedDuration}-hour time slots found within the next 30 days.`;

    res.status(404).json({
      success: false,
      message: `${tierMessage} Please try a different duration or rate preference.`
    });

  } catch (error) {
    console.error('❌ Error suggesting available slot:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to suggest available slot'
    });
  }
});

export default router;