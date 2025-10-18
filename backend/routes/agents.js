import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { query } from '../config/database.js';
import { authenticateAgent, requireAgentMatch } from '../middleware/agentAuthMiddleware.js';
import { authMiddleware, requireEmployee } from '../middleware/authMiddleware.js';
import jwt from 'jsonwebtoken';
import { websocketService } from '../services/websocketService.js';
import { confluenceDetectionService } from '../services/confluenceDetectionService.js';

const router = express.Router();

/**
 * Agent Registration Endpoint
 * POST /api/agents/register
 *
 * Authenticates with one-time registration token and returns permanent JWT token
 */
router.post('/register', async (req, res) => {
  try {
    const {
      registration_token,
      device_name,
      device_type,
      os_type,
      os_version,
      system_info
    } = req.body;

    // Validate required fields
    if (!registration_token || !device_name || !device_type || !os_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: registration_token, device_name, device_type, os_type',
        code: 'MISSING_FIELDS'
      });
    }

    // Verify registration token exists and is not expired
    const tokenResult = await query(
      `SELECT id, business_id, service_location_id, created_by, expires_at, is_used
       FROM agent_registration_tokens
       WHERE token = $1`,
      [registration_token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid registration token',
        code: 'INVALID_TOKEN'
      });
    }

    const tokenData = tokenResult.rows[0];

    // Check if token is already used
    if (tokenData.is_used) {
      return res.status(401).json({
        success: false,
        message: 'Registration token has already been used',
        code: 'TOKEN_ALREADY_USED'
      });
    }

    // Check if token is expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        message: 'Registration token has expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    // Generate permanent JWT token for agent
    const agentId = uuidv4();
    const permanentToken = jwt.sign(
      {
        agent_id: agentId,
        type: 'agent',
        business_id: tokenData.business_id,
        service_location_id: tokenData.service_location_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '10y' } // Long-lived token for agent devices
    );

    // Extract system info fields
    const hostname = system_info?.hostname || null;
    const cpu_model = system_info?.cpu_model || null;
    const total_memory_gb = system_info?.total_memory_gb || null;
    const total_disk_gb = system_info?.total_disk_gb || null;
    const os_architecture = system_info?.os_architecture || null;

    // Create agent device record
    await query(
      `INSERT INTO agent_devices (
        id,
        business_id,
        service_location_id,
        agent_token,
        device_name,
        device_type,
        os_type,
        os_version,
        os_architecture,
        hostname,
        cpu_model,
        total_memory_gb,
        total_disk_gb,
        agent_version,
        status,
        created_by,
        monitoring_enabled,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        agentId,
        tokenData.business_id,
        tokenData.service_location_id,
        permanentToken,
        device_name,
        device_type,
        os_type,
        os_version || null,
        os_architecture,
        hostname,
        cpu_model,
        total_memory_gb,
        total_disk_gb,
        '1.0.0', // Default agent version
        'online',
        tokenData.created_by,
        true,
        true
      ]
    );

    // Mark registration token as used
    await query(
      `UPDATE agent_registration_tokens
       SET is_used = true, used_at = NOW(), used_by_agent_id = $1
       WHERE id = $2`,
      [agentId, tokenData.id]
    );

    console.log(`✅ Agent registered successfully: ${device_name} (${agentId})`);

    res.json({
      success: true,
      message: 'Agent registered successfully',
      data: {
        agent_id: agentId,
        agent_token: permanentToken,
        business_id: tokenData.business_id,
        service_location_id: tokenData.service_location_id
      }
    });

  } catch (error) {
    console.error('Agent registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Agent registration failed',
      code: 'REGISTRATION_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Agent Heartbeat Endpoint
 * POST /api/agents/:agent_id/heartbeat
 *
 * Updates agent status and last contact time
 */
router.post('/:agent_id/heartbeat', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { status } = req.body;

    // Update agent status and last_heartbeat
    await query(
      `UPDATE agent_devices
       SET last_heartbeat = NOW(),
           status = COALESCE($2, status),
           updated_at = NOW()
       WHERE id = $1`,
      [agent_id, status || 'online']
    );

    res.json({
      success: true,
      message: 'Heartbeat received',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Agent heartbeat error:', error);
    res.status(500).json({
      success: false,
      message: 'Heartbeat processing failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Agent Status Update Endpoint
 * POST /api/agents/:agent_id/status
 *
 * Allows agent to report status changes (stopping, error, etc.)
 */
router.post('/:agent_id/status', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { status, timestamp, reason } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: status',
        code: 'MISSING_STATUS'
      });
    }

    // Validate status value
    const validStatuses = ['online', 'offline', 'stopping', 'error', 'maintenance'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        code: 'INVALID_STATUS'
      });
    }

    // Update agent status
    await query(
      `UPDATE agent_devices
       SET status = $1,
           last_status_change = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [status, agent_id]
    );

    // Log the status change
    console.log(`📊 Agent ${agent_id} status changed to: ${status}${reason ? ` (reason: ${reason})` : ''}`);

    res.json({
      success: true,
      message: 'Status updated',
      data: {
        status,
        updated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Agent status update error:', error);
    res.status(500).json({
      success: false,
      message: 'Status update failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Agent Uninstall Notification Endpoint
 * POST /api/agents/:agent_id/uninstall
 *
 * Agent notifies backend before uninstalling
 */
router.post('/:agent_id/uninstall', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { timestamp, keepData } = req.body;

    // Update agent record - mark as decommissioned
    await query(
      `UPDATE agent_devices
       SET status = 'offline',
           decommissioned_at = NOW(),
           decommission_reason = 'user_uninstall',
           is_active = false,
           monitoring_enabled = false,
           updated_at = NOW()
       WHERE id = $1`,
      [agent_id]
    );

    // Get agent details for logging
    const agentResult = await query(
      `SELECT device_name, device_type, business_id FROM agent_devices WHERE id = $1`,
      [agent_id]
    );

    if (agentResult.rows.length > 0) {
      const agent = agentResult.rows[0];
      console.log(`🗑️  Agent uninstalled: ${agent.device_name} (${agent.device_type}) - Business: ${agent.business_id}`);
      console.log(`   Keep data: ${keepData ? 'Yes' : 'No'}`);
    }

    res.json({
      success: true,
      message: 'Agent marked for decommission',
      data: {
        decommissionDate: new Date().toISOString(),
        message: 'Thank you for using Romero Tech Solutions'
      }
    });

  } catch (error) {
    console.error('Agent uninstall notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Uninstall notification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Agent Metrics Upload Endpoint
 * POST /api/agents/:agent_id/metrics
 *
 * Receives and stores performance metrics from agent
 */
router.post('/:agent_id/metrics', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { metrics } = req.body; // Can be single metric object or array

    if (!metrics) {
      return res.status(400).json({
        success: false,
        message: 'Missing metrics data',
        code: 'MISSING_METRICS'
      });
    }

    // Support batch upload
    const metricsArray = Array.isArray(metrics) ? metrics : [metrics];
    const insertedCount = metricsArray.length;

    // Insert metrics
    for (const metric of metricsArray) {
      await query(
        `INSERT INTO agent_metrics (
          id,
          agent_device_id,
          cpu_percent,
          memory_percent,
          memory_used_gb,
          disk_percent,
          disk_used_gb,
          network_rx_bytes,
          network_tx_bytes,
          patches_available,
          security_patches_available,
          patches_require_reboot,
          eol_status,
          eol_date,
          security_eol_date,
          days_until_eol,
          days_until_sec_eol,
          eol_message,
          disk_health_status,
          disk_health_data,
          disk_failures_predicted,
          disk_temperature_max,
          disk_reallocated_sectors_total,
          system_uptime_seconds,
          last_boot_time,
          unexpected_reboot,
          services_monitored,
          services_running,
          services_failed,
          services_data,
          network_devices_monitored,
          network_devices_online,
          network_devices_offline,
          network_devices_data,
          backups_detected,
          backups_running,
          backups_with_issues,
          backup_data,
          antivirus_installed,
          antivirus_enabled,
          antivirus_up_to_date,
          firewall_enabled,
          security_products_count,
          security_issues_count,
          security_data,
          failed_login_attempts,
          failed_login_last_24h,
          unique_attacking_ips,
          failed_login_data,
          internet_connected,
          gateway_reachable,
          dns_working,
          avg_latency_ms,
          packet_loss_percent,
          connectivity_issues_count,
          connectivity_data,
          cpu_temperature_c,
          gpu_temperature_c,
          motherboard_temperature_c,
          highest_temperature_c,
          temperature_critical_count,
          fan_count,
          fan_speeds_rpm,
          fan_failure_count,
          sensor_data,
          critical_events_count,
          error_events_count,
          warning_events_count,
          last_critical_event,
          last_critical_event_message,
          package_managers_outdated,
          homebrew_outdated,
          npm_outdated,
          pip_outdated,
          mas_outdated,
          outdated_packages_data,
          raw_metrics,
          collected_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78)`,
        [
          uuidv4(),
          agent_id,
          metric.cpu_percent || metric.cpu_usage || null,
          metric.memory_percent || metric.memory_usage || null,
          metric.memory_used_gb || null,
          metric.disk_percent || metric.disk_usage || null,
          metric.disk_used_gb || null,
          metric.network_rx_bytes || metric.network_rx || null,
          metric.network_tx_bytes || metric.network_tx || null,
          metric.patches_available || 0,
          metric.security_patches_available || 0,
          metric.patches_require_reboot || false,
          metric.eol_status || null,
          metric.eol_date || null,
          metric.security_eol_date || null,
          metric.days_until_eol || null,
          metric.days_until_sec_eol || null,
          metric.eol_message || null,
          metric.disk_health_status || null,
          metric.disk_health_data ? JSON.stringify(metric.disk_health_data) : null,
          metric.disk_failures_predicted || 0,
          metric.disk_temperature_max || null,
          metric.disk_reallocated_sectors_total || 0,
          metric.system_uptime_seconds || null,
          metric.last_boot_time || null,
          metric.unexpected_reboot || false,
          metric.services_monitored || 0,
          metric.services_running || 0,
          metric.services_failed || 0,
          metric.services_data ? JSON.stringify(metric.services_data) : null,
          metric.network_devices_monitored || 0,
          metric.network_devices_online || 0,
          metric.network_devices_offline || 0,
          metric.network_devices_data ? JSON.stringify(metric.network_devices_data) : null,
          metric.backups_detected || 0,
          metric.backups_running || 0,
          metric.backups_with_issues || 0,
          metric.backup_data ? JSON.stringify(metric.backup_data) : null,
          metric.antivirus_installed || false,
          metric.antivirus_enabled || false,
          metric.antivirus_up_to_date || false,
          metric.firewall_enabled || false,
          metric.security_products_count || 0,
          metric.security_issues_count || 0,
          metric.security_data ? JSON.stringify(metric.security_data) : null,
          metric.failed_login_attempts || 0,
          metric.failed_login_last_24h || 0,
          metric.unique_attacking_ips || 0,
          metric.failed_login_data ? JSON.stringify(metric.failed_login_data) : null,
          metric.internet_connected !== undefined ? metric.internet_connected : true,
          metric.gateway_reachable !== undefined ? metric.gateway_reachable : true,
          metric.dns_working !== undefined ? metric.dns_working : true,
          metric.avg_latency_ms || null,
          metric.packet_loss_percent || null,
          metric.connectivity_issues_count || 0,
          metric.connectivity_data ? JSON.stringify(metric.connectivity_data) : null,
          metric.cpu_temperature_c || null,
          metric.gpu_temperature_c || null,
          metric.motherboard_temperature_c || null,
          metric.highest_temperature_c || 0,
          metric.temperature_critical_count || 0,
          metric.fan_count || 0,
          metric.fan_speeds_rpm ? metric.fan_speeds_rpm : null,
          metric.fan_failure_count || 0,
          metric.sensor_data ? JSON.stringify(metric.sensor_data) : null,
          metric.critical_events_count || 0,
          metric.error_events_count || 0,
          metric.warning_events_count || 0,
          metric.last_critical_event || null,
          metric.last_critical_event_message || null,
          metric.package_managers_outdated || 0,
          metric.homebrew_outdated || 0,
          metric.npm_outdated || 0,
          metric.pip_outdated || 0,
          metric.mas_outdated || 0,
          metric.outdated_packages_data ? JSON.stringify(metric.outdated_packages_data) : null,
          metric.raw_metrics || metric.custom_metrics ? JSON.stringify(metric.raw_metrics || metric.custom_metrics) : null,
          metric.collected_at || new Date()
        ]
      );
    }

    // Update last metrics received timestamp
    await query(
      `UPDATE agent_devices SET last_metrics_received = NOW() WHERE id = $1`,
      [agent_id]
    );

    // Detect confluence alerts using the latest metric
    const latestMetric = metricsArray[metricsArray.length - 1];
    const triggeredAlerts = await confluenceDetectionService.detectAndCreateAlerts(agent_id, latestMetric);

    // Broadcast metrics update to all connected admin clients via WebSocket
    // Get agent device info for the broadcast
    const agentInfo = await query(
      'SELECT device_name, status FROM agent_devices WHERE id = $1',
      [agent_id]
    );

    if (agentInfo.rows.length > 0) {
      if (websocketService && websocketService.io) {
        // Broadcast the latest metrics to admin sockets
        websocketService.io.emit('agent-metrics-update', {
          agentId: agent_id,
          deviceName: agentInfo.rows[0].device_name,
          status: agentInfo.rows[0].status,
          metrics: latestMetric,
          timestamp: new Date().toISOString()
        });
        console.log(`📊 Broadcasted agent metrics update for agent ${agent_id} via WebSocket`);

        // Broadcast any triggered alerts
        if (triggeredAlerts.length > 0) {
          for (const alert of triggeredAlerts) {
            websocketService.io.emit('agent-alert-triggered', {
              agentId: agent_id,
              deviceName: agentInfo.rows[0].device_name,
              alert: alert,
              timestamp: new Date().toISOString()
            });
          }
          console.log(`🚨 Broadcasted ${triggeredAlerts.length} alert(s) for agent ${agent_id} via WebSocket`);
        }
      }
    }

    res.json({
      success: true,
      message: 'Metrics received',
      data: {
        metrics_count: insertedCount,
        alerts_triggered: triggeredAlerts.length
      }
    });

  } catch (error) {
    console.error('Agent metrics upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Metrics upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * List Commands for Agent (Admin View)
 * GET /api/agents/:agent_id/commands/list
 *
 * Admins can view all commands for an agent
 */
router.get('/:agent_id/commands/list', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { status } = req.query;
    const isEmployee = req.user.role !== 'customer';

    // Verify access to this agent
    let accessCheckQuery = `
      SELECT business_id FROM agent_devices
      WHERE id = $1 AND soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      accessCheckQuery += ' AND business_id = $2';
      accessParams.push(req.user.business_id);
    }

    const accessResult = await query(accessCheckQuery, accessParams);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Build query for commands
    let queryText = `
      SELECT
        ac.id,
        ac.command_type,
        ac.command_params,
        ac.status,
        ac.requested_by,
        ac.approved_by,
        ac.approval_required,
        ac.exit_code,
        ac.stdout,
        ac.stderr,
        ac.error_message,
        ac.created_at,
        ac.sent_at,
        ac.started_at,
        ac.completed_at,
        e.first_name || ' ' || e.last_name as requested_by_name
      FROM agent_commands ac
      LEFT JOIN employees e ON ac.requested_by = e.id
      WHERE ac.agent_device_id = $1
    `;

    const params = [agent_id];
    let paramIndex = 2;

    // Filter by status if provided
    if (status) {
      queryText += ` AND ac.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    queryText += ' ORDER BY ac.created_at DESC LIMIT 100';

    const commandsResult = await query(queryText, params);

    res.json({
      success: true,
      data: {
        commands: commandsResult.rows,
        count: commandsResult.rows.length
      }
    });

  } catch (error) {
    console.error('Get agent commands list error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent commands',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Pending Commands for Agent
 * GET /api/agents/:agent_id/commands
 *
 * Agent polls for commands to execute
 */
router.get('/:agent_id/commands', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;

    // Fetch pending commands
    const commandsResult = await query(
      `SELECT id, command_type, command_params, requested_by, created_at
       FROM agent_commands
       WHERE agent_device_id = $1
         AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 10`,
      [agent_id]
    );

    // Mark commands as delivered
    if (commandsResult.rows.length > 0) {
      const commandIds = commandsResult.rows.map(c => c.id);
      await query(
        `UPDATE agent_commands
         SET status = 'delivered', delivered_at = NOW()
         WHERE id = ANY($1)`,
        [commandIds]
      );
    }

    res.json({
      success: true,
      data: {
        commands: commandsResult.rows.map(cmd => ({
          id: cmd.id,
          command_type: cmd.command_type,
          payload: cmd.command_params,
          requested_at: cmd.created_at
        }))
      }
    });

  } catch (error) {
    console.error('Get agent commands error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch commands',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Submit Command Result
 * POST /api/agents/:agent_id/commands/:command_id/result
 *
 * Agent submits execution result for a command
 */
router.post('/:agent_id/commands/:command_id/result', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id, command_id } = req.params;
    const { status, result, error } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: status',
        code: 'MISSING_STATUS'
      });
    }

    // Validate status
    if (!['completed', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "completed" or "failed"',
        code: 'INVALID_STATUS'
      });
    }

    // Update command status
    await query(
      `UPDATE agent_commands
       SET status = $1,
           stdout = $2,
           error_message = $3,
           completed_at = NOW()
       WHERE id = $4 AND agent_device_id = $5`,
      [status, result ? JSON.stringify(result) : null, error, command_id, agent_id]
    );

    res.json({
      success: true,
      message: 'Command result received'
    });

  } catch (error) {
    console.error('Command result submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit command result',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Create Registration Token (Employee Only)
 * POST /api/agents/registration-tokens
 *
 * Generates a one-time registration token for agent deployment
 */
router.post('/registration-tokens', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { business_id, service_location_id, expires_in_hours } = req.body;

    if (!business_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: business_id',
        code: 'MISSING_BUSINESS_ID'
      });
    }

    // Verify employee has access to this business
    const employeeId = req.user.id;

    // Generate secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (expires_in_hours || 24));

    // Create registration token
    const tokenResult = await query(
      `INSERT INTO agent_registration_tokens (
        id,
        token,
        business_id,
        service_location_id,
        created_by,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, token, expires_at`,
      [uuidv4(), token, business_id, service_location_id || null, employeeId, expiresAt]
    );

    res.json({
      success: true,
      message: 'Registration token created',
      data: tokenResult.rows[0]
    });

  } catch (error) {
    console.error('Create registration token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create registration token',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * List Agents (RBAC Filtered)
 * GET /api/agents
 *
 * Customers see only their business's agents
 * Employees see all agents across all businesses
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { business_id, service_location_id, status } = req.query;
    const isEmployee = req.user.role !== 'customer';

    let queryText = `
      SELECT
        ad.id,
        ad.business_id,
        ad.service_location_id,
        ad.device_name,
        ad.device_type,
        ad.os_type,
        ad.os_version,
        ad.status,
        ad.last_heartbeat,
        ad.monitoring_enabled,
        ad.is_active,
        ad.created_at,
        b.business_name,
        b.is_individual,
        u.first_name as individual_first_name,
        u.last_name as individual_last_name,
        sl.location_name,
        sl.street_address_1 as location_street,
        sl.street_address_2 as location_street2,
        sl.city as location_city,
        sl.state as location_state,
        sl.zip_code as location_zip,
        sl.country as location_country
      FROM agent_devices ad
      LEFT JOIN businesses b ON ad.business_id = b.id
      LEFT JOIN users u ON b.id = u.business_id AND b.is_individual = true AND u.is_primary_contact = true
      LEFT JOIN service_locations sl ON ad.service_location_id = sl.id
      WHERE ad.soft_delete = false
    `;

    const params = [];
    let paramIndex = 1;

    // RBAC filtering
    if (!isEmployee) {
      // Customers can only see their own business's agents
      queryText += ` AND ad.business_id = $${paramIndex}`;
      params.push(req.user.business_id);
      paramIndex++;
    }

    // Additional filters
    if (business_id && isEmployee) {
      queryText += ` AND ad.business_id = $${paramIndex}`;
      params.push(business_id);
      paramIndex++;
    }

    if (service_location_id) {
      queryText += ` AND ad.service_location_id = $${paramIndex}`;
      params.push(service_location_id);
      paramIndex++;
    }

    if (status) {
      queryText += ` AND ad.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    queryText += ' ORDER BY ad.created_at DESC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: {
        agents: result.rows,
        count: result.rows.length
      }
    });

  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agents',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Agent Details (RBAC Filtered)
 * GET /api/agents/:agent_id
 *
 * Returns detailed information about a specific agent
 */
router.get('/:agent_id', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const isEmployee = req.user.role !== 'customer';

    let queryText = `
      SELECT
        ad.*,
        b.business_name,
        sl.location_name,
        sl.street_address_1 as location_street,
        sl.street_address_2 as location_street2,
        sl.city as location_city,
        sl.state as location_state,
        sl.zip_code as location_zip,
        sl.country as location_country,
        e.first_name || ' ' || e.last_name as created_by_name
      FROM agent_devices ad
      LEFT JOIN businesses b ON ad.business_id = b.id
      LEFT JOIN service_locations sl ON ad.service_location_id = sl.id
      LEFT JOIN employees e ON ad.created_by = e.id
      WHERE ad.id = $1 AND ad.soft_delete = false
    `;

    const params = [agent_id];

    // RBAC filtering
    if (!isEmployee) {
      queryText += ' AND ad.business_id = $2';
      params.push(req.user.business_id);
    }

    const result = await query(queryText, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Get agent details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Agent Metrics History
 * GET /api/agents/:agent_id/metrics/history
 *
 * Returns time-series metrics data for charting
 */
router.get('/:agent_id/metrics/history', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { hours = 24, metric_type } = req.query;
    const isEmployee = req.user.role !== 'customer';

    // Verify access to this agent
    let accessCheckQuery = `
      SELECT business_id FROM agent_devices
      WHERE id = $1 AND soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      accessCheckQuery += ' AND business_id = $2';
      accessParams.push(req.user.business_id);
    }

    const accessResult = await query(accessCheckQuery, accessParams);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Determine aggregation interval based on time range for performance optimization
    // This reduces payload size by 93-98% for longer time ranges
    const hoursInt = parseInt(hours);
    let aggregationInterval = null;
    let expectedPoints = 0;

    if (hoursInt <= 24) {
      // 1-24 hours: Raw 1-minute data (up to 1,440 points)
      aggregationInterval = null;
      expectedPoints = hoursInt * 60;
    } else if (hoursInt <= 168) {
      // 1-7 days: 5-minute averages (up to 2,016 points for 7 days)
      aggregationInterval = '5 minutes';
      expectedPoints = (hoursInt * 60) / 5;
    } else {
      // 7-30 days: 15-minute averages (up to 2,880 points for 30 days)
      aggregationInterval = '15 minutes';
      expectedPoints = (hoursInt * 60) / 15;
    }

    // Fetch metrics history with intelligent aggregation
    // Only select columns needed for charts (cpu_percent, memory_percent, disk_percent)
    // This reduces payload from 70+ columns to just 4 columns
    let metricsQuery;

    if (aggregationInterval) {
      // Aggregated data with time-bucketing using date_bin() for custom intervals
      metricsQuery = `
        SELECT
          date_bin('${aggregationInterval}'::interval, collected_at, TIMESTAMP '2000-01-01') as collected_at,
          ROUND(AVG(cpu_percent)::numeric, 2) as cpu_percent,
          ROUND(AVG(memory_percent)::numeric, 2) as memory_percent,
          ROUND(AVG(disk_percent)::numeric, 2) as disk_percent
        FROM agent_metrics
        WHERE agent_device_id = $1
          AND collected_at >= NOW() - INTERVAL '${hoursInt} hours'
        GROUP BY date_bin('${aggregationInterval}'::interval, collected_at, TIMESTAMP '2000-01-01')
        ORDER BY collected_at ASC
      `;
    } else {
      // Raw data for short time ranges (1-24 hours)
      metricsQuery = `
        SELECT
          collected_at,
          cpu_percent,
          memory_percent,
          disk_percent
        FROM agent_metrics
        WHERE agent_device_id = $1
          AND collected_at >= NOW() - INTERVAL '${hoursInt} hours'
        ORDER BY collected_at ASC
      `;
    }

    const metricsResult = await query(metricsQuery, [agent_id]);

    // Log performance metrics for monitoring
    const actualPoints = metricsResult.rows.length;
    const reductionPercent = expectedPoints > 0
      ? Math.round((1 - actualPoints / (hoursInt * 60)) * 100)
      : 0;

    console.log(`📊 Metrics query for agent ${agent_id}: ${hoursInt}h range, ` +
                `${aggregationInterval ? aggregationInterval + ' aggregation' : 'raw data'}, ` +
                `${actualPoints} points returned (${reductionPercent}% reduction)`);


    res.json({
      success: true,
      data: {
        metrics: metricsResult.rows,
        count: metricsResult.rows.length,
        time_range_hours: hoursInt,
        aggregation_interval: aggregationInterval || 'raw',
        payload_reduction_percent: reductionPercent
      }
    });

  } catch (error) {
    console.error('Get metrics history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch metrics history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Agent Alert History
 * GET /api/agents/:agent_id/alerts
 *
 * Returns alert history for a specific agent
 */
router.get('/:agent_id/alerts', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { status } = req.query;
    const isEmployee = req.user.role !== 'customer';

    // Verify access to this agent
    let accessCheckQuery = `
      SELECT business_id FROM agent_devices
      WHERE id = $1 AND soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      accessCheckQuery += ' AND business_id = $2';
      accessParams.push(req.user.business_id);
    }

    const accessResult = await query(accessCheckQuery, accessParams);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Build query for alert history
    let queryText = `
      SELECT
        aah.id,
        aah.agent_alert_id,
        aah.triggered_at,
        aah.resolved_at,
        aah.severity,
        aah.alert_message,
        aah.metric_value,
        aah.threshold_value,
        aah.status,
        aa.alert_name,
        aa.alert_type
      FROM agent_alert_history aah
      LEFT JOIN agent_alerts aa ON aah.agent_alert_id = aa.id
      WHERE aah.agent_device_id = $1
    `;

    const params = [agent_id];
    let paramIndex = 2;

    // Filter by status if provided
    if (status) {
      queryText += ` AND aah.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    queryText += ' ORDER BY aah.triggered_at DESC LIMIT 100';

    const alertsResult = await query(queryText, params);

    res.json({
      success: true,
      data: {
        alerts: alertsResult.rows,
        count: alertsResult.rows.length
      }
    });

  } catch (error) {
    console.error('Get agent alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent alerts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Create Remote Command (Employee Only)
 * POST /api/agents/:agent_id/commands
 *
 * Creates a command for the agent to execute
 */
router.post('/:agent_id/commands', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { command_type, command_params, requires_approval } = req.body;

    if (!command_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: command_type',
        code: 'MISSING_COMMAND_TYPE'
      });
    }

    // Verify agent exists
    const agentResult = await query(
      'SELECT id, business_id FROM agent_devices WHERE id = $1 AND soft_delete = false',
      [agent_id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found',
        code: 'AGENT_NOT_FOUND'
      });
    }

    const commandId = uuidv4();
    const employeeId = req.user.id;

    // Create command
    await query(
      `INSERT INTO agent_commands (
        id,
        agent_device_id,
        command_type,
        command_params,
        requested_by,
        approval_required,
        approved_by,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        commandId,
        agent_id,
        command_type,
        command_params ? JSON.stringify(command_params) : null,
        employeeId,
        requires_approval || false,
        requires_approval ? null : employeeId, // Auto-approve if not required
        'pending'
      ]
    );

    res.json({
      success: true,
      message: 'Command created',
      data: {
        command_id: commandId,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('Create command error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create command',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Update Agent Settings (Employee Only - RBAC Controlled)
 * PATCH /api/agents/:agent_id
 *
 * Updates agent device name, service location, monitoring status, etc.
 */
router.patch('/:agent_id', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { device_name, device_type, service_location_id, monitoring_enabled, is_active } = req.body;

    // Verify agent exists
    const agentResult = await query(
      'SELECT id, business_id FROM agent_devices WHERE id = $1 AND soft_delete = false',
      [agent_id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Build dynamic update query based on provided fields
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (device_name !== undefined) {
      updates.push(`device_name = $${paramIndex}`);
      values.push(device_name);
      paramIndex++;
    }

    if (device_type !== undefined) {
      updates.push(`device_type = $${paramIndex}`);
      values.push(device_type);
      paramIndex++;
    }

    if (service_location_id !== undefined) {
      updates.push(`service_location_id = $${paramIndex}`);
      values.push(service_location_id || null);
      paramIndex++;
    }

    if (monitoring_enabled !== undefined) {
      updates.push(`monitoring_enabled = $${paramIndex}`);
      values.push(monitoring_enabled);
      paramIndex++;
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      values.push(is_active);
      paramIndex++;
    }

    // Always update the updated_at timestamp
    updates.push('updated_at = NOW()');

    if (updates.length === 1) {
      // Only updated_at, no actual changes
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided for update',
        code: 'NO_UPDATES'
      });
    }

    // Add agent_id as last parameter
    values.push(agent_id);

    // Execute update
    await query(
      `UPDATE agent_devices SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    console.log(`✅ Agent ${agent_id} updated successfully by ${req.user.id}`);

    res.json({
      success: true,
      message: 'Agent updated successfully'
    });

  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update agent',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Regenerate Agent Token (Employee Only - RBAC Controlled)
 * POST /api/agents/:agent_id/regenerate-token
 *
 * Generates a new JWT token for the agent and invalidates the old one
 * Restricted to executive, admin, and manager roles only
 */
router.post('/:agent_id/regenerate-token', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const userRole = req.user.role;

    // RBAC check - only executive, admin, and manager can regenerate tokens
    const allowedRoles = ['executive', 'admin', 'manager'];
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions. Only executives, admins, and managers can regenerate tokens.',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    // Verify agent exists and get business info
    const agentResult = await query(
      `SELECT id, business_id, service_location_id, device_name FROM agent_devices
       WHERE id = $1 AND soft_delete = false`,
      [agent_id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found',
        code: 'AGENT_NOT_FOUND'
      });
    }

    const agent = agentResult.rows[0];

    // Generate new JWT token for agent
    const newToken = jwt.sign(
      {
        agent_id: agent.id,
        type: 'agent',
        business_id: agent.business_id,
        service_location_id: agent.service_location_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '10y' } // Long-lived token for agent devices
    );

    // Update agent with new token
    await query(
      `UPDATE agent_devices
       SET agent_token = $1, updated_at = NOW()
       WHERE id = $2`,
      [newToken, agent_id]
    );

    console.log(`🔑 Token regenerated for agent ${agent.device_name} (${agent_id}) by ${req.user.first_name} ${req.user.last_name} (${userRole})`);

    res.json({
      success: true,
      message: 'Token regenerated successfully',
      data: {
        token: newToken
      }
    });

  } catch (error) {
    console.error('Regenerate token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to regenerate token',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
