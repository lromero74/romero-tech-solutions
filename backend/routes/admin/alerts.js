/**
 * Admin Alert Management Routes
 * API endpoints for managing indicator confluence alert configurations and history
 */

import express from 'express';
import authMiddleware from '../../middleware/authMiddleware.js';
import { requirePermission } from '../../middleware/permissionMiddleware.js';
import { alertConfigService } from '../../services/alertConfigService.js';
import { alertHistoryService } from '../../services/alertHistoryService.js';
import { subscriberManagementService } from '../../services/subscriberManagementService.js';
import { query } from '../../config/database.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// ============================================================================
// ALERT CONFIGURATIONS
// ============================================================================

/**
 * GET /api/admin/alerts/configurations
 * Get all alert configurations
 */
router.get('/configurations', requirePermission('view.agents.enable'), async (req, res) => {
  try {
    const { enabled } = req.query;

    let configs;
    if (enabled === 'true') {
      configs = await alertConfigService.getAllConfigs();
    } else if (enabled === 'false') {
      // Get all configurations including disabled
      const result = await query(
        'SELECT * FROM alert_configurations WHERE enabled = false ORDER BY id'
      );
      configs = result.rows;
    } else {
      // Get all configurations
      const result = await query(
        'SELECT * FROM alert_configurations ORDER BY id'
      );
      configs = result.rows;
    }

    res.json({
      success: true,
      data: configs,
    });
  } catch (error) {
    console.error('Error fetching alert configurations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch alert configurations',
      error: error.message,
    });
  }
});

/**
 * GET /api/admin/alerts/configurations/:id
 * Get alert configuration by ID
 */
router.get('/configurations/:id', requirePermission('view.agents.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const config = await alertConfigService.getConfigById(id);

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Alert configuration not found',
      });
    }

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('Error fetching alert configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch alert configuration',
      error: error.message,
    });
  }
});

/**
 * POST /api/admin/alerts/configurations
 * Create new alert configuration
 */
router.post('/configurations', requirePermission('modify.agents.enable'), async (req, res) => {
  try {
    const configData = req.body;
    const createdBy = req.user.id;

    const newConfig = await alertConfigService.createConfig(configData, createdBy);

    res.status(201).json({
      success: true,
      message: 'Alert configuration created successfully',
      data: newConfig,
    });
  } catch (error) {
    console.error('Error creating alert configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create alert configuration',
      error: error.message,
    });
  }
});

/**
 * PUT /api/admin/alerts/configurations/:id
 * Update alert configuration
 */
router.put('/configurations/:id', requirePermission('modify.agents.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const updatedBy = req.user.id;

    const updatedConfig = await alertConfigService.updateConfig(id, updates, updatedBy);

    if (!updatedConfig) {
      return res.status(404).json({
        success: false,
        message: 'Alert configuration not found',
      });
    }

    res.json({
      success: true,
      message: 'Alert configuration updated successfully',
      data: updatedConfig,
    });
  } catch (error) {
    console.error('Error updating alert configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update alert configuration',
      error: error.message,
    });
  }
});

/**
 * DELETE /api/admin/alerts/configurations/:id
 * Delete (disable) alert configuration
 */
router.delete('/configurations/:id', requirePermission('modify.agents.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const updatedBy = req.user.id;

    const deletedConfig = await alertConfigService.deleteConfig(id, updatedBy);

    if (!deletedConfig) {
      return res.status(404).json({
        success: false,
        message: 'Alert configuration not found',
      });
    }

    res.json({
      success: true,
      message: 'Alert configuration disabled successfully',
      data: deletedConfig,
    });
  } catch (error) {
    console.error('Error deleting alert configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete alert configuration',
      error: error.message,
    });
  }
});

// ============================================================================
// ALERT HISTORY
// ============================================================================

/**
 * GET /api/admin/alerts/history
 * Get alert history with filters
 */
router.get('/history', requirePermission('view.agents.enable'), async (req, res) => {
  try {
    const {
      agentId,
      metricType,
      alertType,
      severity,
      startDate,
      endDate,
      acknowledged,
      resolved,
      limit,
      offset,
    } = req.query;

    const filters = {
      agentId: agentId ? parseInt(agentId) : undefined,
      metricType,
      alertType,
      severity,
      startDate,
      endDate,
      acknowledged: acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined,
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    };

    const history = await alertHistoryService.getAlertHistory(filters);

    res.json({
      success: true,
      data: history,
      count: history.length,
    });
  } catch (error) {
    console.error('Error fetching alert history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch alert history',
      error: error.message,
    });
  }
});

/**
 * GET /api/admin/alerts/active
 * Get active (unresolved) alerts
 */
router.get('/active', requirePermission('view.agents.enable'), async (req, res) => {
  try {
    const { agentId } = req.query;
    const activeAlerts = await alertHistoryService.getActiveAlerts(agentId ? parseInt(agentId) : null);

    res.json({
      success: true,
      data: activeAlerts,
      count: activeAlerts.length,
    });
  } catch (error) {
    console.error('Error fetching active alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active alerts',
      error: error.message,
    });
  }
});

/**
 * POST /api/admin/alerts/history/:id/acknowledge
 * Acknowledge an alert
 */
router.post('/history/:id/acknowledge', requirePermission('modify.agents.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const employeeId = req.user.id;

    const alert = await alertHistoryService.acknowledgeAlert(id, employeeId);

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found',
      });
    }

    res.json({
      success: true,
      message: 'Alert acknowledged successfully',
      data: alert,
    });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to acknowledge alert',
      error: error.message,
    });
  }
});

/**
 * POST /api/admin/alerts/history/:id/resolve
 * Resolve an alert
 */
router.post('/history/:id/resolve', requirePermission('modify.agents.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const employeeId = req.user.id;

    const alert = await alertHistoryService.resolveAlert(id, employeeId, notes);

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found',
      });
    }

    res.json({
      success: true,
      message: 'Alert resolved successfully',
      data: alert,
    });
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve alert',
      error: error.message,
    });
  }
});

/**
 * DELETE /api/admin/alerts/history/:id
 * Delete an alert from history (permanently removes it)
 */
router.delete('/history/:id', requirePermission('modify.agents.enable'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM alert_history WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found',
      });
    }

    res.json({
      success: true,
      message: 'Alert deleted successfully',
      data: { id: parseInt(id) },
    });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete alert',
      error: error.message,
    });
  }
});

/**
 * GET /api/admin/alerts/stats
 * Get alert statistics
 */
router.get('/stats', requirePermission('view.agents.enable'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const stats = await alertHistoryService.getAlertStats(startDate, endDate);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching alert statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch alert statistics',
      error: error.message,
    });
  }
});

// ============================================================================
// TEST/DEVELOPMENT ENDPOINTS
// ============================================================================

/**
 * POST /api/admin/alerts/test/trigger
 * Trigger a test alert for development/testing purposes
 */
router.post('/test/trigger', requirePermission('modify.agents.enable'), async (req, res) => {
  try {
    // Get a random agent for the test alert
    const agentResult = await query('SELECT id, device_name FROM agent_devices ORDER BY RANDOM() LIMIT 1');

    if (agentResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No agents found. Please add an agent first.',
      });
    }

    const agent = agentResult.rows[0];

    // Get the most recent metric for this agent to use real timestamp
    const metricsResult = await query(
      'SELECT collected_at, cpu_percent, memory_percent, disk_percent FROM agent_metrics WHERE agent_device_id = $1 ORDER BY collected_at DESC LIMIT 1',
      [agent.id]
    );

    const recentMetric = metricsResult.rows[0];
    const alertTimestamp = recentMetric?.collected_at || new Date().toISOString();

    // Create test alert data with detailed context for each indicator
    // Use 3 indicators which should result in MEDIUM severity per confluence logic
    const indicatorCount = 3;
    let severity;
    if (indicatorCount >= 5) severity = 'critical';
    else if (indicatorCount >= 4) severity = 'high';
    else if (indicatorCount >= 3) severity = 'medium';
    else severity = 'low';

    const testAlertData = {
      agent_id: agent.id,
      configuration_id: null, // Test alert without specific configuration
      alert_name: '[TEST] High CPU Utilization Detected',
      alert_type: 'high_utilization',
      severity: severity, // Calculated based on indicator count
      indicator_count: indicatorCount,
      contributing_indicators: {
        rsi: {
          indicator: 'RSI',
          value: 85.5,
          threshold: 70,
          signal: 'overbought',
          resource: 'cpu',
          resource_value: recentMetric?.cpu_percent || 89.7,
          timestamp: alertTimestamp,
          agent_id: agent.id,
          agent_name: agent.device_name,
          chart_period: '1h', // Time period shown in chart
          clickable: true // Flag to indicate this can be clicked to drill down
        },
        stochastic: {
          indicator: 'Stochastic',
          k: 92.3,
          d: 88.1,
          threshold: 80,
          signal: 'overbought',
          resource: 'memory',
          resource_value: recentMetric?.memory_percent || 72.3,
          timestamp: alertTimestamp,
          agent_id: agent.id,
          agent_name: agent.device_name,
          chart_period: '1h',
          clickable: true
        },
        williams_r: {
          indicator: 'Williams %R',
          value: -5.2,
          threshold: -20,
          signal: 'overbought',
          resource: 'cpu',
          resource_value: recentMetric?.cpu_percent || 89.7,
          timestamp: alertTimestamp,
          agent_id: agent.id,
          agent_name: agent.device_name,
          chart_period: '1h',
          clickable: true
        }
      },
      metric_values: {
        cpu_percent: recentMetric?.cpu_percent || 89.7,
        memory_percent: recentMetric?.memory_percent || 72.3,
        disk_percent: recentMetric?.disk_percent || 45.1
      },
      notify_email: false,
      notify_dashboard: true,
      notify_websocket: true,
    };

    // Save the test alert (this will trigger WebSocket notification)
    const savedAlert = await alertHistoryService.saveAlert(testAlertData);

    res.json({
      success: true,
      message: `Test alert triggered for agent: ${agent.device_name}`,
      data: savedAlert,
    });
  } catch (error) {
    console.error('Error triggering test alert:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger test alert',
      error: error.message,
    });
  }
});

// ============================================================================
// ALERT SUBSCRIPTIONS (Employee)
// ============================================================================

/**
 * GET /api/admin/alerts/subscriptions
 * Get employee alert subscriptions
 * Permissions: view_own, view_team, view_all
 */
router.get('/subscriptions', requirePermission('alert_subscriptions.view_own'), async (req, res) => {
  try {
    const { employee_id, include_inactive } = req.query;
    const requestingEmployeeId = req.user.id;
    const userPermissions = req.user.permissions || [];

    // Determine what subscriptions user can view
    let targetEmployeeId = null;

    if (employee_id) {
      // Specific employee requested
      const canViewAll = userPermissions.includes('alert_subscriptions.view_all');
      const canViewTeam = userPermissions.includes('alert_subscriptions.view_team');

      if (employee_id === requestingEmployeeId) {
        // Viewing own subscriptions - always allowed
        targetEmployeeId = employee_id;
      } else if (canViewAll) {
        // Can view any employee's subscriptions
        targetEmployeeId = employee_id;
      } else if (canViewTeam) {
        // TODO: Check if target employee is in requester's team
        // For now, allow if user has view_team permission
        targetEmployeeId = employee_id;
      } else {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this employee\'s subscriptions'
        });
      }
    } else {
      // No specific employee - return requester's own subscriptions
      targetEmployeeId = requestingEmployeeId;
    }

    const subscriptions = await subscriberManagementService.getEmployeeSubscriptions(
      targetEmployeeId,
      include_inactive === 'true'
    );

    res.json({
      success: true,
      data: subscriptions,
      count: subscriptions.length
    });
  } catch (error) {
    console.error('Error fetching alert subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch alert subscriptions',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/alerts/subscriptions
 * Create employee alert subscription
 */
router.post('/subscriptions', requirePermission('alert_subscriptions.manage_own'), async (req, res) => {
  try {
    const subscriptionData = {
      ...req.body,
      employee_id: req.user.id, // Force to current user's ID
      created_by: req.user.id
    };

    const result = await subscriberManagementService.createEmployeeSubscription(subscriptionData);

    res.status(201).json({
      success: true,
      message: 'Alert subscription created successfully',
      data: result.subscription
    });
  } catch (error) {
    console.error('Error creating alert subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create alert subscription',
      error: error.message
    });
  }
});

/**
 * PUT /api/admin/alerts/subscriptions/:id
 * Update employee alert subscription
 */
router.put('/subscriptions/:id', requirePermission('alert_subscriptions.manage_own'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const requestingEmployeeId = req.user.id;
    const userPermissions = req.user.permissions || [];

    // Check if user can manage this subscription
    const canManage = await subscriberManagementService.canManageSubscription(
      requestingEmployeeId,
      parseInt(id),
      userPermissions
    );

    if (!canManage) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to modify this subscription'
      });
    }

    const result = await subscriberManagementService.updateEmployeeSubscription(
      parseInt(id),
      updates
    );

    res.json({
      success: true,
      message: 'Alert subscription updated successfully',
      data: result.subscription
    });
  } catch (error) {
    console.error('Error updating alert subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update alert subscription',
      error: error.message
    });
  }
});

/**
 * DELETE /api/admin/alerts/subscriptions/:id
 * Delete employee alert subscription
 */
router.delete('/subscriptions/:id', requirePermission('alert_subscriptions.manage_own'), async (req, res) => {
  try {
    const { id } = req.params;
    const requestingEmployeeId = req.user.id;
    const userPermissions = req.user.permissions || [];

    // Check if user can manage this subscription
    const canManage = await subscriberManagementService.canManageSubscription(
      requestingEmployeeId,
      parseInt(id),
      userPermissions
    );

    if (!canManage) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this subscription'
      });
    }

    await subscriberManagementService.deleteEmployeeSubscription(parseInt(id));

    res.json({
      success: true,
      message: 'Alert subscription deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting alert subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete alert subscription',
      error: error.message
    });
  }
});

// ============================================================================
// NOTIFICATION LOGS
// ============================================================================

/**
 * GET /api/admin/alerts/notifications
 * Get notification delivery logs
 */
router.get('/notifications', requirePermission('alert_notifications.view_own'), async (req, res) => {
  try {
    const { alert_id, channel, status, start_date, end_date, limit, offset } = req.query;
    const requestingEmployeeId = req.user.id;
    const userPermissions = req.user.permissions || [];
    const canViewAll = userPermissions.includes('alert_notifications.view_all');

    let sql = `
      SELECT
        an.*,
        ah.alert_type,
        ah.severity,
        ah.triggered_at,
        ad.device_name as agent_name
      FROM alert_notifications an
      JOIN alert_history ah ON an.alert_history_id = ah.id
      JOIN agent_devices ad ON ah.agent_id = ad.id
      WHERE 1=1
    `;

    const values = [];
    let paramCount = 1;

    // If user can't view all, limit to their own notifications
    if (!canViewAll) {
      sql += ` AND an.recipient_type = 'employee' AND an.recipient_id = $${paramCount}`;
      values.push(requestingEmployeeId);
      paramCount++;
    }

    if (alert_id) {
      sql += ` AND an.alert_history_id = $${paramCount}`;
      values.push(parseInt(alert_id));
      paramCount++;
    }

    if (channel) {
      sql += ` AND an.channel = $${paramCount}`;
      values.push(channel);
      paramCount++;
    }

    if (status) {
      sql += ` AND an.status = $${paramCount}`;
      values.push(status);
      paramCount++;
    }

    if (start_date) {
      sql += ` AND an.created_at >= $${paramCount}`;
      values.push(start_date);
      paramCount++;
    }

    if (end_date) {
      sql += ` AND an.created_at <= $${paramCount}`;
      values.push(end_date);
      paramCount++;
    }

    sql += ` ORDER BY an.created_at DESC`;

    if (limit) {
      sql += ` LIMIT $${paramCount}`;
      values.push(parseInt(limit));
      paramCount++;
    }

    if (offset) {
      sql += ` OFFSET $${paramCount}`;
      values.push(parseInt(offset));
    }

    const result = await query(sql, values);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching notification logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification logs',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/alerts/notifications/stats
 * Get notification statistics
 */
router.get('/notifications/stats', requirePermission('alert_notifications.view_all'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    const startDate = start_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = end_date || new Date().toISOString();

    const stats = await subscriberManagementService.getNotificationStats(
      new Date(startDate),
      new Date(endDate)
    );

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification statistics',
      error: error.message
    });
  }
});

// ============================================================================
// ESCALATION POLICIES
// ============================================================================

/**
 * GET /api/admin/alerts/escalation-policies
 * Get all escalation policies
 */
router.get('/escalation-policies', requirePermission('escalation_policies.view'), async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM alert_escalation_policies
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching escalation policies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch escalation policies',
      error: error.message
    });
  }
});

/**
 * POST /api/admin/alerts/escalation-policies
 * Create new escalation policy
 */
router.post('/escalation-policies', requirePermission('escalation_policies.manage'), async (req, res) => {
  try {
    const {
      policy_name,
      description,
      trigger_after_minutes,
      severity_levels,
      escalate_to_role_ids,
      escalate_to_employee_ids,
      use_email,
      use_sms,
      use_phone_call,
      max_escalations,
      escalation_interval_minutes
    } = req.body;

    const sql = `
      INSERT INTO alert_escalation_policies (
        policy_name, description, trigger_after_minutes, severity_levels,
        escalate_to_role_ids, escalate_to_employee_ids,
        use_email, use_sms, use_phone_call,
        max_escalations, escalation_interval_minutes,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const result = await query(sql, [
      policy_name,
      description,
      trigger_after_minutes,
      severity_levels,
      escalate_to_role_ids,
      escalate_to_employee_ids || null,
      use_email,
      use_sms,
      use_phone_call || false,
      max_escalations,
      escalation_interval_minutes,
      req.user.id
    ]);

    res.status(201).json({
      success: true,
      message: 'Escalation policy created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating escalation policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create escalation policy',
      error: error.message
    });
  }
});

/**
 * PUT /api/admin/alerts/escalation-policies/:id
 * Update escalation policy
 */
router.put('/escalation-policies/:id', requirePermission('escalation_policies.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const allowedFields = [
      'description', 'trigger_after_minutes', 'severity_levels',
      'escalate_to_role_ids', 'escalate_to_employee_ids',
      'use_email', 'use_sms', 'use_phone_call',
      'max_escalations', 'escalation_interval_minutes', 'enabled'
    ];

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field)) {
        setClauses.push(`${field} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(parseInt(id));

    const sql = `
      UPDATE alert_escalation_policies
      SET ${setClauses.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Escalation policy not found'
      });
    }

    res.json({
      success: true,
      message: 'Escalation policy updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating escalation policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update escalation policy',
      error: error.message
    });
  }
});

/**
 * DELETE /api/admin/alerts/escalation-policies/:id
 * Delete escalation policy
 */
router.delete('/escalation-policies/:id', requirePermission('escalation_policies.manage'), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      'DELETE FROM alert_escalation_policies WHERE id = $1 RETURNING id',
      [parseInt(id)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Escalation policy not found'
      });
    }

    res.json({
      success: true,
      message: 'Escalation policy deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting escalation policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete escalation policy',
      error: error.message
    });
  }
});

/**
 * GET /api/admin/alerts/subscription-stats
 * Get subscription statistics
 */
router.get('/subscription-stats', requirePermission('alert_subscriptions.view_all'), async (req, res) => {
  try {
    const stats = await subscriberManagementService.getSubscriptionStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching subscription stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription statistics',
      error: error.message
    });
  }
});

export default router;
