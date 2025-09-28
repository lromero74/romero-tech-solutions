import express from 'express';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { clientContextMiddleware, requireClientAccess } from '../../middleware/clientMiddleware.js';
import { sanitizeInputMiddleware } from '../../utils/inputValidation.js';
import { getPool } from '../../config/database.js';
import { systemSettingsService } from '../../services/systemSettingsService.js';

const router = express.Router();

// Apply middleware
router.use(authMiddleware);
router.use(clientContextMiddleware);
router.use(requireClientAccess(['business', 'location']));
router.use(sanitizeInputMiddleware);

/**
 * GET /api/client/scheduler-config
 * Get scheduler configuration settings
 */
router.get('/scheduler-config', async (req, res) => {
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
 * GET /api/client/resources
 * Get available resources (service locations) for scheduling
 */
router.get('/resources', async (req, res) => {
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
 * Get existing bookings for a specific date
 */
router.get('/bookings', async (req, res) => {
  try {
    const { date } = req.query;
    const businessId = req.user.businessId;
    const clientId = req.user.userId;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required'
      });
    }

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
        CASE WHEN sr.client_id = $2 THEN true ELSE false END as isOwnBooking
      FROM service_requests sr
      LEFT JOIN users u ON sr.client_id = u.id
      LEFT JOIN service_types st ON sr.service_type_id = st.id
      WHERE sr.business_id = $1
        AND (sr.requested_date = $3 OR sr.scheduled_date = $3)
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
    const result = await pool.query(query, [businessId, clientId, date]);

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
        // Default to 2 hours if no end time specified
        endDateTime = new Date(startDateTime.getTime() + (2 * 60 * 60 * 1000));
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
 * Create a new appointment booking
 */
router.post('/schedule-appointment', async (req, res) => {
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
        message: 'Resource ID, start time, and end time are required'
      });
    }

    const startDateTime = new Date(startTime);
    const endDateTime = new Date(endTime);

    // Validate that the appointment is in the future
    const now = new Date();
    if (startDateTime <= now) {
      return res.status(400).json({
        success: false,
        message: 'Appointment must be scheduled in the future'
      });
    }

    // Get scheduler configuration for buffer validation
    const settings = await systemSettingsService.getSettings([
      'scheduler_buffer_before_hours',
      'scheduler_buffer_after_hours',
      'scheduler_minimum_advance_hours'
    ]);

    const bufferBeforeHours = parseInt(settings.scheduler_buffer_before_hours || '2');
    const bufferAfterHours = parseInt(settings.scheduler_buffer_after_hours || '1');
    const minimumAdvanceHours = parseInt(settings.scheduler_minimum_advance_hours || '1');

    // Check minimum advance time
    const minimumStartTime = new Date(now.getTime() + (minimumAdvanceHours * 60 * 60 * 1000));
    if (startDateTime < minimumStartTime) {
      return res.status(400).json({
        success: false,
        message: `Appointments must be scheduled at least ${minimumAdvanceHours} hour(s) in advance`
      });
    }

    // Check for conflicts with existing bookings
    const conflictQuery = `
      SELECT
        sr.id,
        sr.requested_date,
        sr.requested_time_start,
        sr.requested_time_end,
        sr.scheduled_date,
        sr.scheduled_time_start,
        sr.scheduled_time_end,
        sr.client_id
      FROM service_requests sr
      WHERE sr.business_id = $1
        AND sr.service_location_id = $2
        AND (sr.requested_date = $3 OR sr.scheduled_date = $3)
        AND sr.soft_delete = false
        AND sr.status_id NOT IN (
          SELECT id FROM service_request_statuses
          WHERE name IN ('Cancelled', 'Completed', 'Rejected')
        )
    `;

    const requestDate = startDateTime.toISOString().split('T')[0];
    const pool = await getPool();
    const conflictResult = await pool.query(conflictQuery, [businessId, resourceId, requestDate]);

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
        existingEnd = new Date(existingStart.getTime() + (2 * 60 * 60 * 1000));
      }

      // Calculate buffer zones (don't apply buffer to own bookings)
      let bufferStart = existingStart;
      let bufferEnd = existingEnd;

      if (booking.client_id !== clientId) {
        bufferStart = new Date(existingStart.getTime() - (bufferBeforeHours * 60 * 60 * 1000));
        bufferEnd = new Date(existingEnd.getTime() + (bufferAfterHours * 60 * 60 * 1000));
      }

      // Check for overlap
      if (startDateTime < bufferEnd && endDateTime > bufferStart) {
        return res.status(409).json({
          success: false,
          message: booking.client_id === clientId
            ? 'You already have an appointment at this time'
            : `This time conflicts with buffer requirements around existing appointments (${bufferBeforeHours}h before, ${bufferAfterHours}h after)`
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

export default router;