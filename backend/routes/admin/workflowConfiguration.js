import express from 'express';
import { authMiddleware, requireRole } from '../../middleware/authMiddleware.js';
import { getPool } from '../../config/database.js';

const router = express.Router();

// Require executive or admin role for all workflow configuration routes
router.use(authMiddleware);
router.use(requireRole(['executive', 'admin']));

/**
 * GET /api/admin/workflow-configuration/rules
 * Get all workflow notification rules
 */
router.get('/rules', async (req, res) => {
  try {
    const pool = await getPool();

    const query = `
      SELECT
        id,
        rule_name,
        rule_description,
        trigger_event,
        recipient_type,
        recipient_roles,
        recipient_employee_ids,
        notification_type,
        email_template_name,
        timeout_minutes,
        max_retry_count,
        retry_interval_minutes,
        execution_order,
        is_active,
        created_at,
        updated_at
      FROM workflow_notification_rules
      ORDER BY execution_order ASC, created_at ASC
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      data: {
        rules: result.rows
      }
    });

  } catch (error) {
    console.error('❌ Error fetching workflow rules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch workflow rules'
    });
  }
});

/**
 * GET /api/admin/workflow-configuration/rules/:id
 * Get a specific workflow rule by ID
 */
router.get('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const query = `
      SELECT
        id,
        rule_name,
        rule_description,
        trigger_event,
        recipient_type,
        recipient_roles,
        recipient_employee_ids,
        notification_type,
        email_template_name,
        timeout_minutes,
        max_retry_count,
        retry_interval_minutes,
        execution_order,
        is_active,
        created_at,
        updated_at
      FROM workflow_notification_rules
      WHERE id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Workflow rule not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error fetching workflow rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch workflow rule'
    });
  }
});

/**
 * PUT /api/admin/workflow-configuration/rules/:id
 * Update a workflow notification rule
 */
router.put('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      rule_name,
      rule_description,
      timeout_minutes,
      max_retry_count,
      retry_interval_minutes,
      is_active
    } = req.body;

    const pool = await getPool();

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCounter = 1;

    if (rule_name !== undefined) {
      updates.push(`rule_name = $${paramCounter++}`);
      values.push(rule_name);
    }

    if (rule_description !== undefined) {
      updates.push(`rule_description = $${paramCounter++}`);
      values.push(rule_description);
    }

    if (timeout_minutes !== undefined) {
      updates.push(`timeout_minutes = $${paramCounter++}`);
      values.push(timeout_minutes);
    }

    if (max_retry_count !== undefined) {
      updates.push(`max_retry_count = $${paramCounter++}`);
      values.push(max_retry_count);
    }

    if (retry_interval_minutes !== undefined) {
      updates.push(`retry_interval_minutes = $${paramCounter++}`);
      values.push(retry_interval_minutes);
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCounter++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE workflow_notification_rules
      SET ${updates.join(', ')}
      WHERE id = $${paramCounter}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Workflow rule not found'
      });
    }

    res.json({
      success: true,
      message: 'Workflow rule updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error updating workflow rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update workflow rule'
    });
  }
});

/**
 * GET /api/admin/workflow-configuration/stats
 * Get workflow statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const pool = await getPool();

    // Get counts by workflow state
    const stateStatsQuery = `
      SELECT
        current_state,
        COUNT(*) as count
      FROM service_request_workflow_state
      GROUP BY current_state
      ORDER BY count DESC
    `;

    const stateStatsResult = await pool.query(stateStatsQuery);

    // Get notification statistics
    const notificationStatsQuery = `
      SELECT
        trigger_event,
        COUNT(*) as count,
        COUNT(CASE WHEN delivery_status = 'sent' THEN 1 END) as sent_count,
        COUNT(CASE WHEN delivery_status = 'failed' THEN 1 END) as failed_count
      FROM workflow_notification_log
      WHERE sent_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
      GROUP BY trigger_event
      ORDER BY count DESC
    `;

    const notificationStatsResult = await pool.query(notificationStatsQuery);

    // Get pending actions
    const pendingActionsQuery = `
      SELECT
        COUNT(*) as pending_count,
        MIN(next_scheduled_action_at) as next_action_time
      FROM service_request_workflow_state
      WHERE next_scheduled_action_at IS NOT NULL
        AND next_scheduled_action_at > CURRENT_TIMESTAMP
    `;

    const pendingActionsResult = await pool.query(pendingActionsQuery);

    res.json({
      success: true,
      data: {
        stateStats: stateStatsResult.rows,
        notificationStats: notificationStatsResult.rows,
        pendingActions: pendingActionsResult.rows[0]
      }
    });

  } catch (error) {
    console.error('❌ Error fetching workflow stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch workflow statistics'
    });
  }
});

/**
 * GET /api/admin/workflow-configuration/notification-log
 * Get recent notification logs
 */
router.get('/notification-log', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const pool = await getPool();

    const query = `
      SELECT
        nl.id,
        nl.service_request_id,
        sr.request_number,
        nl.trigger_event,
        nl.notification_type,
        nl.recipient_email,
        nl.recipient_type,
        nl.sent_at,
        nl.delivery_status,
        nl.retry_attempt,
        e.first_name as recipient_first_name,
        e.last_name as recipient_last_name
      FROM workflow_notification_log nl
      JOIN service_requests sr ON nl.service_request_id = sr.id
      LEFT JOIN employees e ON nl.recipient_employee_id = e.id
      ORDER BY nl.sent_at DESC
      LIMIT $1 OFFSET $2
    `;

    const countQuery = `
      SELECT COUNT(*) as total_count
      FROM workflow_notification_log
    `;

    const [result, countResult] = await Promise.all([
      pool.query(query, [limit, offset]),
      pool.query(countQuery)
    ]);

    const totalCount = parseInt(countResult.rows[0].total_count);
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      success: true,
      data: {
        logs: result.rows,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching notification log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification log'
    });
  }
});

export default router;
