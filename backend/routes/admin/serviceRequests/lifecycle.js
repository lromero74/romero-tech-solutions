import express from 'express';
import { getPool } from '../../../config/database.js';
import { websocketService } from '../../../services/websocketService.js';
// NOTE: pushRoutes is imported lazily inside the reschedule handler (not at
// module top) because it configures web-push at load and crashes without
// VAPID keys — same pattern as utils/mfaUtils.js.

const router = express.Router();

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
        srs.name as status,
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

    // Broadcast service request update via WebSocket
    console.log('🔍 [ASSIGN] Attempting to broadcast WebSocket update...');
    const websocketService = req.app.get('websocketService');
    console.log('🔍 [ASSIGN] websocketService exists:', !!websocketService);
    if (websocketService) {
      console.log('🔍 [ASSIGN] Calling broadcastServiceRequestUpdate for SR:', id);
      websocketService.broadcastServiceRequestUpdate(id, 'updated', {
        action: 'assigned',
        assignedTechnicianId: technicianId
      });
      console.log('✅ [ASSIGN] Broadcast completed');
    } else {
      console.log('❌ [ASSIGN] websocketService not available on req.app!');
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

    // Get previous status name for the note
    const prevStatusQuery = await pool.query(`
      SELECT s.name as old_status
      FROM service_requests sr
      LEFT JOIN service_request_statuses s ON s.id = sr.status_id
      WHERE sr.id = $1
    `, [id]);
    const oldStatus = prevStatusQuery.rows[0]?.old_status || 'Submitted';

    // Add a note documenting the status change with timestamps
    const employeeName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
    const acknowledgedAt = result.rows[0].acknowledged_at;
    const localTime = new Date(acknowledgedAt).toLocaleString('en-US');
    const utcTime = new Date(acknowledgedAt).toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    const noteText = `Status changed from "${oldStatus}" to "Acknowledged" by ${employeeName}\nLocal Time: ${localTime}\nUTC: ${utcTime}`;

    const noteResult = await pool.query(`
      INSERT INTO service_request_notes (
        service_request_id,
        note_text,
        note_type,
        created_by_type,
        created_by_id,
        created_by_name,
        is_visible_to_client
      ) VALUES ($1, $2, 'status_change', 'employee', $3, $4, true)
      RETURNING id, note_text, note_type, created_by_type, created_by_name, created_at, is_visible_to_client
    `, [
      id,
      noteText,
      employeeId,
      employeeName
    ]);

    const newNote = noteResult.rows[0];

    // Broadcast service request update via WebSocket with note data
    console.log('🔍 [ADMIN-ACKNOWLEDGE] Attempting to broadcast WebSocket update...');
    const websocketService = req.app.get('websocketService');
    console.log('🔍 [ADMIN-ACKNOWLEDGE] websocketService exists:', !!websocketService);
    if (websocketService) {
      console.log('🔍 [ADMIN-ACKNOWLEDGE] Calling broadcastServiceRequestUpdate for SR:', id);
      websocketService.broadcastServiceRequestUpdate(id, 'updated', {
        status: 'acknowledged',
        assignedTechnician: employeeId,
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
      console.log('✅ [ADMIN-ACKNOWLEDGE] Broadcast completed');
    } else {
      console.log('❌ [ADMIN-ACKNOWLEDGE] websocketService not available on req.app!');
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

      // Add a note documenting the state change with timestamps
      const employeeName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
      const now = new Date();
      const localTime = now.toLocaleString('en-US');
      const utcTime = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

      const noteText = isResuming
        ? `Status changed from "Paused" to "Started" by ${employeeName}\nLocal Time: ${localTime}\nUTC: ${utcTime}`
        : `Status changed from "${currentStatus}" to "Started" by ${employeeName}\nLocal Time: ${localTime}\nUTC: ${utcTime}`;

      const noteResult = await pool.query(`
        INSERT INTO service_request_notes (
          service_request_id,
          note_text,
          note_type,
          created_by_type,
          created_by_id,
          created_by_name,
          is_visible_to_client
        ) VALUES ($1, $2, 'status_change', 'employee', $3, $4, true)
        RETURNING id, note_text, note_type, created_by_type, created_by_name, created_at, is_visible_to_client
      `, [
        id,
        noteText,
        employeeId,
        employeeName
      ]);

      const newNote = noteResult.rows[0];

      // Broadcast service request update via WebSocket with note data
      console.log('🔍 [TIME-ENTRY-START] Attempting to broadcast WebSocket update...');
      const websocketService = req.app.get('websocketService');
      console.log('🔍 [TIME-ENTRY-START] websocketService exists:', !!websocketService);
      if (websocketService) {
        console.log('🔍 [TIME-ENTRY-START] Calling broadcastServiceRequestUpdate for SR:', id);
        websocketService.broadcastServiceRequestUpdate(id, 'updated', {
          action: 'time_entry_started',
          statusId: startedStatusId,
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
        console.log('✅ [TIME-ENTRY-START] Broadcast completed');
      } else {
        console.log('❌ [TIME-ENTRY-START] websocketService not available on req.app!');
      }

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

      // Add a note documenting the pause action with timestamps
      const employeeName = `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
      const durationHours = (result.rows[0].duration_minutes / 60).toFixed(2);
      const now = new Date();
      const localTime = now.toLocaleString('en-US');
      const utcTime = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

      const noteText = `Status changed from "Started" to "Paused" by ${employeeName} (Session: ${durationHours} hours)\nLocal Time: ${localTime}\nUTC: ${utcTime}`;

      const noteResult = await pool.query(`
        INSERT INTO service_request_notes (
          service_request_id,
          note_text,
          note_type,
          created_by_type,
          created_by_id,
          created_by_name,
          is_visible_to_client
        ) VALUES ($1, $2, 'status_change', 'employee', $3, $4, true)
        RETURNING id, note_text, note_type, created_by_type, created_by_name, created_at, is_visible_to_client
      `, [
        id,
        noteText,
        employeeId,
        employeeName
      ]);

      const newNote = noteResult.rows[0];

      // Broadcast service request update via WebSocket with note data
      console.log('🔍 [TIME-ENTRY-STOP] Attempting to broadcast WebSocket update...');
      const websocketServiceStop = req.app.get('websocketService');
      console.log('🔍 [TIME-ENTRY-STOP] websocketService exists:', !!websocketServiceStop);
      if (websocketServiceStop) {
        console.log('🔍 [TIME-ENTRY-STOP] Calling broadcastServiceRequestUpdate for SR:', id);
        websocketServiceStop.broadcastServiceRequestUpdate(id, 'updated', {
          action: 'time_entry_stopped',
          statusId: pausedStatusId,
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
        console.log('✅ [TIME-ENTRY-STOP] Broadcast completed');
      } else {
        console.log('❌ [TIME-ENTRY-STOP] websocketService not available on req.app!');
      }

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

    // Broadcast service request update via WebSocket
    console.log('🔍 [STATUS-UPDATE] Attempting to broadcast WebSocket update...');
    const websocketService = req.app.get('websocketService');
    console.log('🔍 [STATUS-UPDATE] websocketService exists:', !!websocketService);
    if (websocketService) {
      console.log('🔍 [STATUS-UPDATE] Calling broadcastServiceRequestUpdate for SR:', id);
      websocketService.broadcastServiceRequestUpdate(id, 'updated', {
        statusId: statusId
      });
      console.log('✅ [STATUS-UPDATE] Broadcast completed');
    } else {
      console.log('❌ [STATUS-UPDATE] websocketService not available on req.app!');
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

  // Get day of week from date (in UTC to match tier times)
  const requestDate = new Date(date + 'T00:00:00Z');
  const dayOfWeek = requestDate.getUTCDay();

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

    // Check if closure reason is "Complete" - only generate invoice for completed requests
    const closureReasonQuery = await pool.query(`
      SELECT reason_name
      FROM service_request_closure_reasons
      WHERE id = $1
    `, [closureReasonId]);

    const closureReasonName = closureReasonQuery.rows[0]?.reason_name || '';
    const isCompleted = closureReasonName.toLowerCase() === 'complete';

    let createdInvoice = null;

    // Only generate invoice if the request was completed successfully
    if (isCompleted) {
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
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');
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
    } // End of invoice generation (only for completed requests)

    // Broadcast service request status change to all admins/employees
    console.log('🔍 [CLOSE] Attempting to broadcast WebSocket update...');
    const websocketService = req.app.get('websocketService');
    console.log('🔍 [CLOSE] websocketService exists:', !!websocketService);
    if (websocketService) {
      console.log('🔍 [CLOSE] Calling broadcastServiceRequestUpdate for SR:', id);
      websocketService.broadcastServiceRequestUpdate(id, 'updated', {
        action: 'closed',
        statusChanged: true,
        newStatus: 'Closed',
        closed: true,
        invoiceGenerated: createdInvoice !== null,
        invoiceId: createdInvoice?.id,
        statusId: completedStatusId,
        closureReason: closureReasonName
      });
      console.log('✅ [CLOSE] Broadcast completed');
    } else {
      console.log('❌ [CLOSE] websocketService not available on req.app!');
    }

    res.json({
      success: true,
      message: createdInvoice
        ? 'Service request closed successfully and invoice generated'
        : `Service request closed successfully (${closureReasonName})`,
      data: {
        ...result.rows[0],
        invoice: createdInvoice ? {
          id: createdInvoice.id,
          invoiceNumber: createdInvoice.invoice_number
        } : null
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

export const detailsRoutes = express.Router();

/**
 * PATCH /api/admin/service-requests/:id/details
 * Update title and/or description with change tracking
 */
detailsRoutes.patch('/service-requests/:id/details', async (req, res) => {
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

export const rescheduleRoutes = express.Router();

/**
 * PATCH /api/admin/service-requests/:id/reschedule
 * Reschedule a service request (admin can reschedule any request)
 */
rescheduleRoutes.patch('/service-requests/:id/reschedule', async (req, res) => {
  try {
    const { id } = req.params;
    const { requestedDatetime, requestedDurationMinutes } = req.body;

    console.log('📅 [Admin] Reschedule request:', { id, requestedDatetime, requestedDurationMinutes });

    // Validate inputs
    if (!requestedDatetime || !requestedDurationMinutes) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: requestedDatetime and requestedDurationMinutes'
      });
    }

    const pool = await getPool();

    // Verify the service request exists
    const checkQuery = `
      SELECT id, status_id, title, request_number, client_id
      FROM service_requests
      WHERE id = $1 AND soft_delete = false
    `;
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request not found'
      });
    }

    const serviceRequest = checkResult.rows[0];

    // Check if request can be rescheduled (not closed or cancelled)
    const statusQuery = `
      SELECT name, is_final_status
      FROM service_request_statuses
      WHERE id = $1
    `;
    const statusResult = await pool.query(statusQuery, [serviceRequest.status_id]);

    if (statusResult.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Invalid service request status'
      });
    }

    const status = statusResult.rows[0];
    if (status.is_final_status) {
      return res.status(400).json({
        success: false,
        message: `Cannot reschedule a ${status.name} service request`
      });
    }

    // Update the service request
    const updateQuery = `
      UPDATE service_requests
      SET
        requested_datetime = $1,
        requested_duration_minutes = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING
        id,
        request_number,
        title,
        requested_datetime,
        requested_duration_minutes,
        updated_at
    `;

    const updateResult = await pool.query(updateQuery, [
      requestedDatetime,
      requestedDurationMinutes,
      id
    ]);

    const updatedRequest = updateResult.rows[0];

    console.log('✅ [Admin] Service request rescheduled:', updatedRequest.request_number);

    // Send WebSocket notification to client and technicians
    try {
      websocketService.notifyServiceRequestUpdate(id, {
        type: 'rescheduled',
        requestNumber: updatedRequest.request_number,
        title: updatedRequest.title,
        requestedDatetime: updatedRequest.requested_datetime,
        requestedDurationMinutes: updatedRequest.requested_duration_minutes,
        updatedAt: updatedRequest.updated_at
      });
    } catch (wsError) {
      console.error('Failed to send WebSocket notification:', wsError);
      // Don't fail the request if WebSocket fails
    }

    // Send push notification to employees
    const sendReschedulePushNotification = async () => {
      try {
        console.log(`🔔 [Admin Reschedule] Starting push notification process for ${updatedRequest.request_number}`);

        // Get service request details for notification
        const detailsQuery = await pool.query(`
          SELECT
            sr.business_id,
            b.business_name
          FROM service_requests sr
          LEFT JOIN businesses b ON sr.business_id = b.id
          WHERE sr.id = $1
        `, [id]);

        const businessName = detailsQuery.rows[0]?.business_name || 'Unknown Business';

        // Format datetime for notification
        const dateObj = new Date(updatedRequest.requested_datetime);
        const dateStr = dateObj.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });

        const notificationData = {
          title: '📅 Service Request Rescheduled (Admin)',
          body: `Admin rescheduled ${updatedRequest.title || 'Service Request'} #${updatedRequest.request_number} (${businessName}) to ${dateStr}`,
          icon: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
          badge: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
          vibrate: [200, 100, 200],
          requireInteraction: false,
          tag: `service-request-reschedule-${id}`,
          renotify: true,
          data: {
            type: 'service_request_rescheduled',
            serviceRequestId: id,
            requestNumber: updatedRequest.request_number,
            businessName: businessName,
            title: updatedRequest.title || 'Service Request',
            requestedDatetime: updatedRequest.requested_datetime,
            requestedDurationMinutes: updatedRequest.requested_duration_minutes,
            timestamp: Date.now(),
            url: `/admin/service-requests/${id}`
          }
        };

        const { sendNotificationToEmployees, sendNotificationToUser } = await import('../../pushRoutes.js');
        console.log(`🔔 [Admin Reschedule] Calling sendNotificationToEmployees for ${updatedRequest.request_number}`);
        const result = await sendNotificationToEmployees(
          'service_request_updated',
          notificationData,
          'view.service_requests.enable'
        );
        console.log(`✅ [Admin Reschedule] Push notification result for ${updatedRequest.request_number}:`, result);
      } catch (notificationError) {
        console.error(`⚠️ [Admin Reschedule] Failed to send push notification for ${updatedRequest.request_number}:`, notificationError);
        // Don't fail the request if notification fails
      }
    };

    // Send push notification asynchronously
    sendReschedulePushNotification();

    // Also send push notification to the client
    const sendClientPushNotification = async () => {
      try {
        console.log(`🔔 [Admin Reschedule] Starting client push notification for ${updatedRequest.request_number}`);

        // Get client ID for this service request
        const clientQuery = await pool.query(`
          SELECT client_id, business_id
          FROM service_requests
          WHERE id = $1
        `, [id]);

        const clientId = clientQuery.rows[0]?.client_id;
        if (!clientId) {
          console.log(`⚠️ [Admin Reschedule] No client ID found for ${updatedRequest.request_number}`);
          return;
        }

        // Format datetime for notification
        const dateObj = new Date(updatedRequest.requested_datetime);
        const dateStr = dateObj.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });

        const clientNotificationData = {
          title: '📅 Service Request Rescheduled',
          body: `Your service request "${updatedRequest.title || 'Service Request'}" #${updatedRequest.request_number} has been rescheduled to ${dateStr}`,
          icon: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
          badge: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
          vibrate: [200, 100, 200],
          requireInteraction: false,
          tag: `service-request-reschedule-client-${id}`,
          renotify: true,
          data: {
            type: 'service_request_rescheduled',
            serviceRequestId: id,
            requestNumber: updatedRequest.request_number,
            title: updatedRequest.title || 'Service Request',
            requestedDatetime: updatedRequest.requested_datetime,
            requestedDurationMinutes: updatedRequest.requested_duration_minutes,
            timestamp: Date.now(),
            url: `/service-requests/${id}`
          }
        };

        console.log(`🔔 [Admin Reschedule] Calling sendNotificationToUser for client ${clientId}`);
        const result = await sendNotificationToUser(clientId, clientNotificationData, false);
        console.log(`✅ [Admin Reschedule] Client push notification result for ${updatedRequest.request_number}:`, result);
      } catch (notificationError) {
        console.error(`⚠️ [Admin Reschedule] Failed to send client push notification for ${updatedRequest.request_number}:`, notificationError);
        // Don't fail the request if notification fails
      }
    };

    // Send client push notification asynchronously
    sendClientPushNotification();

    res.json({
      success: true,
      message: 'Service request rescheduled successfully',
      data: updatedRequest
    });

  } catch (error) {
    console.error('❌ [Admin] Error rescheduling service request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reschedule service request'
    });
  }
});

export default router;
