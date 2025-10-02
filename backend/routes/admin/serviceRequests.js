import express from 'express';
import { getPool } from '../../config/database.js';

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
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause dynamically
    const conditions = ['sr.soft_delete = false'];
    const params = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      conditions.push(`LOWER(srs.name) = LOWER($${paramIndex})`);
      params.push(status);
      paramIndex++;
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Validate sortBy to prevent SQL injection
    const validSortColumns = ['created_at', 'updated_at', 'request_number', 'title', 'requested_date', 'scheduled_date'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const query = `
      SELECT
        sr.id,
        sr.request_number,
        sr.title,
        sr.description,
        sr.requested_date,
        sr.requested_time_start,
        sr.requested_time_end,
        sr.scheduled_date,
        sr.scheduled_time_start,
        sr.scheduled_time_end,
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
        srs.name as status,
        srs.color_code as status_color,
        ul.name as urgency,
        ul.color_code as urgency_color,
        pl.name as priority,
        pl.color_code as priority_color,
        st.name as service_type,
        b.business_name,
        sl.address_label as location_name,
        sl.street,
        sl.city,
        sl.state,
        CONCAT(client.first_name, ' ', client.last_name) as client_name,
        client.email as client_email,
        client.phone as client_phone,
        CONCAT(tech.first_name, ' ', tech.last_name) as technician_name,
        tech.email as technician_email,
        CONCAT(ack.first_name, ' ', ack.last_name) as acknowledged_by_name,
        CONCAT(closed.first_name, ' ', closed.last_name) as closed_by_name,
        cr.reason_name as closure_reason,
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
      ${whereClause}
      ORDER BY sr.${safeSortBy} ${safeSortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parseInt(limit), offset);
    const result = await pool.query(query, params);

    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;

    res.json({
      success: true,
      data: {
        serviceRequests: result.rows,
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
        reason_name,
        reason_description,
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
    const { technicianId } = req.body;
    const pool = await getPool();

    if (!technicianId) {
      return res.status(400).json({
        success: false,
        message: 'Technician ID is required'
      });
    }

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
    const assignmentQuery = `
      INSERT INTO service_request_assignments (
        service_request_id,
        technician_id,
        assignment_type,
        is_active
      ) VALUES ($1, $2, 'primary', true)
      ON CONFLICT (service_request_id, technician_id, assignment_type)
      DO UPDATE SET is_active = true, assigned_at = NOW()
    `;

    await pool.query(assignmentQuery, [id, technicianId]);

    res.json({
      success: true,
      message: 'Service request assigned successfully',
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

    const updateQuery = `
      UPDATE service_requests
      SET
        acknowledged_at = NOW(),
        acknowledged_by_employee_id = $1,
        updated_at = NOW()
      WHERE id = $2 AND soft_delete = false
      RETURNING id, request_number, acknowledged_at
    `;

    const result = await pool.query(updateQuery, [employeeId, id]);

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
 * POST /api/admin/service-requests/:id/time-entry
 * Start or stop a time tracking entry for a service request
 */
router.post('/service-requests/:id/time-entry', async (req, res) => {
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
          AND employee_id = $2
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
          employee_id,
          start_time
        ) VALUES ($1, $2, NOW())
        RETURNING id, start_time
      `;
      const result = await pool.query(insertQuery, [id, employeeId]);

      // Update service request started_at if not already set
      await pool.query(`
        UPDATE service_requests
        SET started_at = COALESCE(started_at, NOW()), updated_at = NOW()
        WHERE id = $1
      `, [id]);

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
          AND employee_id = $2
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

      // Update total work duration on service request
      const sumQuery = `
        UPDATE service_requests
        SET
          total_work_duration_minutes = (
            SELECT COALESCE(SUM(duration_minutes), 0)
            FROM service_request_time_entries
            WHERE service_request_id = $1
          ),
          updated_at = NOW()
        WHERE id = $1
        RETURNING total_work_duration_minutes
      `;
      const sumResult = await pool.query(sumQuery, [id]);

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

    // Get the "Completed" status ID
    const statusQuery = `
      SELECT id FROM service_request_statuses
      WHERE LOWER(name) = 'completed'
      LIMIT 1
    `;
    const statusResult = await pool.query(statusQuery);

    if (statusResult.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Completed status not found in database'
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

    // Log closure in history
    const historyQuery = `
      INSERT INTO service_request_history (
        service_request_id,
        changed_by_user_id,
        change_type,
        change_description,
        created_at
      ) VALUES ($1, $2, 'closure', $3, NOW())
    `;

    await pool.query(historyQuery, [
      id,
      employeeId,
      `Request closed with reason ID ${closureReasonId}. Resolution: ${resolutionSummary.substring(0, 100)}...`
    ]);

    res.json({
      success: true,
      message: 'Service request closed successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error closing service request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to close service request',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

export default router;