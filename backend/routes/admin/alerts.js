/**
 * Admin Alert Management Routes
 * API endpoints for managing indicator confluence alert configurations and history
 */

import express from 'express';
import authMiddleware from '../../middleware/authMiddleware.js';
import { requirePermission } from '../../middleware/permissionMiddleware.js';
import { alertConfigService } from '../../services/alertConfigService.js';
import { alertHistoryService } from '../../services/alertHistoryService.js';
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
    const testAlertData = {
      agent_id: agent.id,
      configuration_id: null, // Test alert without specific configuration
      alert_name: 'Test Alert - High CPU Utilization Detected',
      alert_type: 'high_utilization',
      severity: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)], // Random severity
      indicator_count: 3,
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

export default router;
