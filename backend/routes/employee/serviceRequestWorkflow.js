import express from 'express';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { requirePermission } from '../../middleware/permissionMiddleware.js';
import { validateAndUseToken } from '../../utils/workflowTokens.js';
import {
  handleServiceRequestAcknowledged,
  handleServiceRequestStarted,
  handleServiceRequestClosed
} from '../../services/workflowService.js';
import { getPool } from '../../config/database.js';

const router = express.Router();

/**
 * POST /api/employee/service-requests/acknowledge/:token
 * Acknowledge a service request using a unique token
 */
router.post('/acknowledge/:token', authMiddleware, requirePermission('start.service_request_work.enable'), async (req, res) => {
  try {
    const { token } = req.params;
    const employeeId = req.user.employeeId;

    // Validate token
    const validation = await validateAndUseToken(token, employeeId);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.error || 'Invalid or expired token'
      });
    }

    // Verify action type
    if (validation.actionType !== 'acknowledge') {
      return res.status(400).json({
        success: false,
        message: 'Token is not for acknowledgment action'
      });
    }

    // Handle acknowledgment workflow
    await handleServiceRequestAcknowledged(validation.serviceRequestId, employeeId);

    // Update service request assignment and status
    const pool = await getPool();

    // Get Acknowledged status ID
    const statusQuery = await pool.query(`
      SELECT id FROM service_request_statuses
      WHERE name = 'Acknowledged' AND is_active = true
      LIMIT 1
    `);

    if (statusQuery.rows.length > 0) {
      await pool.query(`
        UPDATE service_requests
        SET assigned_technician_id = $1,
            status_id = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [employeeId, statusQuery.rows[0].id, validation.serviceRequestId]);
    } else {
      // Fallback if Acknowledged status not found
      await pool.query(`
        UPDATE service_requests
        SET assigned_technician_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [employeeId, validation.serviceRequestId]);
    }

    // Broadcast service request update via WebSocket
    console.log('🔍 [ACKNOWLEDGE] Attempting to broadcast WebSocket update...');
    const websocketService = req.app.get('websocketService');
    console.log('🔍 [ACKNOWLEDGE] websocketService exists:', !!websocketService);
    if (websocketService) {
      console.log('🔍 [ACKNOWLEDGE] Calling broadcastServiceRequestUpdate for SR:', validation.serviceRequestId);
      websocketService.broadcastServiceRequestUpdate(validation.serviceRequestId, 'updated', {
        status: 'acknowledged',
        assignedTechnician: employeeId
      });
      console.log('✅ [ACKNOWLEDGE] Broadcast completed');
    } else {
      console.log('❌ [ACKNOWLEDGE] websocketService not available on req.app!');
    }

    res.json({
      success: true,
      message: 'Service request acknowledged successfully',
      data: {
        serviceRequestId: validation.serviceRequestId
      }
    });

  } catch (error) {
    console.error('❌ Error acknowledging service request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to acknowledge service request'
    });
  }
});

/**
 * POST /api/employee/service-requests/start/:token
 * Start a service request using a unique token
 */
router.post('/start/:token', authMiddleware, requirePermission('start.service_request_work.enable'), async (req, res) => {
  try {
    const { token } = req.params;
    const employeeId = req.user.employeeId;

    // Validate token
    const validation = await validateAndUseToken(token, employeeId);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.error || 'Invalid or expired token'
      });
    }

    // Verify action type
    if (validation.actionType !== 'start') {
      return res.status(400).json({
        success: false,
        message: 'Token is not for start action'
      });
    }

    // Check that the service request is in acknowledged state
    const pool = await getPool();
    const stateCheck = await pool.query(`
      SELECT current_state, acknowledged_by_employee_id
      FROM service_request_workflow_state
      WHERE service_request_id = $1
    `, [validation.serviceRequestId]);

    if (stateCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request workflow state not found'
      });
    }

    const workflowState = stateCheck.rows[0];

    if (workflowState.current_state !== 'acknowledged') {
      return res.status(400).json({
        success: false,
        message: `Service request cannot be started from ${workflowState.current_state} state`
      });
    }

    // Verify employee is the one who acknowledged
    if (workflowState.acknowledged_by_employee_id !== employeeId) {
      return res.status(403).json({
        success: false,
        message: 'Only the employee who acknowledged can start this service request'
      });
    }

    // Handle start workflow
    await handleServiceRequestStarted(validation.serviceRequestId, employeeId);

    // Update service request status to "In Progress"
    const statusQuery = await pool.query(`
      SELECT id FROM service_request_statuses
      WHERE name = 'In Progress' AND is_active = true
      LIMIT 1
    `);

    if (statusQuery.rows.length > 0) {
      await pool.query(`
        UPDATE service_requests
        SET status_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [statusQuery.rows[0].id, validation.serviceRequestId]);
    }

    // Broadcast service request update via WebSocket
    const websocketService = req.app.get('websocketService');
    if (websocketService) {
      websocketService.broadcastServiceRequestUpdate(validation.serviceRequestId, 'updated', {
        status: 'in_progress'
      });
    }

    res.json({
      success: true,
      message: 'Service request started successfully',
      data: {
        serviceRequestId: validation.serviceRequestId
      }
    });

  } catch (error) {
    console.error('❌ Error starting service request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start service request'
    });
  }
});

/**
 * POST /api/employee/service-requests/close/:token
 * Close a service request using a unique token
 */
router.post('/close/:token', authMiddleware, requirePermission('stop.service_request_work.enable'), async (req, res) => {
  try {
    const { token } = req.params;
    const { closeReasonId, resolution, actualCost, actualDuration } = req.body;
    const employeeId = req.user.employeeId;

    if (!closeReasonId) {
      return res.status(400).json({
        success: false,
        message: 'Closure reason is required'
      });
    }

    // Validate token
    const validation = await validateAndUseToken(token, employeeId);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.error || 'Invalid or expired token'
      });
    }

    // Verify action type
    if (validation.actionType !== 'close') {
      return res.status(400).json({
        success: false,
        message: 'Token is not for close action'
      });
    }

    // Check that the service request is in started state
    const pool = await getPool();
    const stateCheck = await pool.query(`
      SELECT current_state, started_by_employee_id
      FROM service_request_workflow_state
      WHERE service_request_id = $1
    `, [validation.serviceRequestId]);

    if (stateCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service request workflow state not found'
      });
    }

    const workflowState = stateCheck.rows[0];

    if (workflowState.current_state !== 'started') {
      return res.status(400).json({
        success: false,
        message: `Service request cannot be closed from ${workflowState.current_state} state`
      });
    }

    // Handle close workflow
    await handleServiceRequestClosed(validation.serviceRequestId, employeeId, closeReasonId);

    // Update service request with closure details
    const statusQuery = await pool.query(`
      SELECT id FROM service_request_statuses
      WHERE name = 'Completed' AND is_active = true
      LIMIT 1
    `);

    const updateQuery = `
      UPDATE service_requests
      SET
        status_id = $1,
        resolution_summary = $2,
        actual_cost = $3,
        actual_duration_minutes = $4,
        completed_date = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
    `;

    await pool.query(updateQuery, [
      statusQuery.rows[0]?.id,
      resolution || null,
      actualCost || null,
      actualDuration || null,
      validation.serviceRequestId
    ]);

    // Record closure reason
    await pool.query(`
      INSERT INTO service_request_history (
        service_request_id,
        action_type,
        action_description,
        performed_by_employee_id
      ) VALUES ($1, 'closed', $2, $3)
    `, [
      validation.serviceRequestId,
      `Service request closed with reason ID: ${closeReasonId}`,
      employeeId
    ]);

    // Broadcast service request update via WebSocket
    const websocketService = req.app.get('websocketService');
    if (websocketService) {
      websocketService.broadcastServiceRequestUpdate(validation.serviceRequestId, 'updated', {
        status: 'completed'
      });
    }

    res.json({
      success: true,
      message: 'Service request closed successfully',
      data: {
        serviceRequestId: validation.serviceRequestId
      }
    });

  } catch (error) {
    console.error('❌ Error closing service request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to close service request'
    });
  }
});

/**
 * GET /api/employee/service-requests/:id/workflow-state
 * Get workflow state for a service request
 */
router.get('/:id/workflow-state', authMiddleware, requirePermission('view.service_request_time_entries.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const query = `
      SELECT
        ws.current_state,
        ws.acknowledged_at,
        ws.started_at,
        ws.completed_at,
        ws.acknowledgment_reminder_count,
        ws.start_reminder_count,
        e1.first_name as acknowledged_by_first_name,
        e1.last_name as acknowledged_by_last_name,
        e2.first_name as started_by_first_name,
        e2.last_name as started_by_last_name,
        e3.first_name as completed_by_first_name,
        e3.last_name as completed_by_last_name
      FROM service_request_workflow_state ws
      LEFT JOIN employees e1 ON ws.acknowledged_by_employee_id = e1.id
      LEFT JOIN employees e2 ON ws.started_by_employee_id = e2.id
      LEFT JOIN employees e3 ON ws.completed_by_employee_id = e3.id
      WHERE ws.service_request_id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Workflow state not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error fetching workflow state:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch workflow state'
    });
  }
});

export default router;
