import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { query } from '../../config/database.js';
import { authenticateAgent, requireAgentMatch } from '../../middleware/agentAuthMiddleware.js';
import jwt from 'jsonwebtoken';
import { websocketService } from '../../services/websocketService.js';
import { confluenceDetectionService } from '../../services/confluenceDetectionService.js';
import { alertEscalationService } from '../../services/alertEscalationService.js';
import { evaluateMetricsForAnomalies } from '../../services/anomalyDetectionService.js';
import { sanitizeRelativeRedirectPath } from '../../utils/redirectSafety.js';

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
      agent_version,
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

    // Generate permanent opaque agent token (see authenticateAgent
    // middleware for rationale).
    const agentId = uuidv4();
    const permanentToken = crypto.randomBytes(48).toString('base64url');

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
        agent_version || '1.0.0', // Honour what the agent reported; pre-1.16.93 agents didn't send it
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
 * Release Registration (rollback)
 * POST /api/agents/:agent_id/release-registration
 *
 * The agent calls this when local setup fails AFTER /register
 * succeeded — typically because the just-issued JWT couldn't be
 * persisted to disk (e.g. polkit prompt cancelled, /etc not
 * writable). Effect: deletes the orphan agent_devices row and
 * frees the registration_token for re-use.
 *
 * Guarded against undoing a real, working registration:
 *   - last_heartbeat must still be NULL
 *   - row must be < 1h old
 *   - JWT in Authorization header authenticates the agent
 *
 * Best-effort: failures are not surfaced to the agent's UX (the
 * underlying save failure is what gets shown). The endpoint is
 * idempotent — calling it twice on the same agent returns 404
 * the second time.
 */
router.post('/:agent_id/release-registration', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;

    // Confirm the agent has never heartbeated and is recent. The
    // 1h cap stops a misbehaving agent from being able to release
    // long after the fact (defense-in-depth — the JWT is good for
    // 10y but the rollback window is narrow).
    const agentRow = await query(
      `SELECT id, last_heartbeat, created_at
         FROM agent_devices
        WHERE id = $1
          AND last_heartbeat IS NULL
          AND created_at > NOW() - INTERVAL '1 hour'`,
      [agent_id]
    );

    if (agentRow.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No releasable registration found for this agent',
        code: 'NOT_RELEASABLE'
      });
    }

    // Free the token first (so a retry can immediately reuse it).
    // This UPDATE is idempotent — if for some reason the agent
    // row has no associated token row, we still delete the orphan.
    await query(
      `UPDATE agent_registration_tokens
          SET is_used = false,
              used_at = NULL,
              used_by_agent_id = NULL
        WHERE used_by_agent_id = $1
          AND is_used = true`,
      [agent_id]
    );

    // Drop the orphan device row.
    await query(`DELETE FROM agent_devices WHERE id = $1`, [agent_id]);

    console.log(`↩️  Registration released: agent ${agent_id} (token freed, orphan row deleted)`);

    res.json({
      success: true,
      message: 'Registration released'
    });
  } catch (error) {
    console.error('Release registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Release registration failed',
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
/**
 * Agent Dashboard Magic-Link Endpoint
 * POST /api/agents/:agent_id/dashboard-link
 *
 * Generates a short-lived magic-link for agent to open user-specific dashboard
 * Requires agent authentication
 */
router.post('/:agent_id/dashboard-link', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { redirect } = req.body; // Extract redirect parameter from request body

    // Get agent details including business_id and service_location_id
    const agentResult = await query(
      `SELECT ad.id, ad.business_id, ad.service_location_id, ad.device_name,
              b.id as business_uuid, b.business_name
       FROM agent_devices ad
       LEFT JOIN businesses b ON ad.business_id = b.id
       WHERE ad.id = $1 AND ad.is_active = true`,
      [agent_id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or inactive',
        code: 'AGENT_NOT_FOUND'
      });
    }

    const agent = agentResult.rows[0];

    // Find primary user account for this business
    // Look for customer/client role user associated with this business
    const userResult = await query(
      `SELECT id, email, first_name, last_name, role, time_format_preference
       FROM users
       WHERE business_id = $1 AND role IN ('customer', 'client') AND is_active = true AND email_verified = true
       ORDER BY created_at ASC
       LIMIT 1`,
      [agent.business_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No customer/client account found for this agent',
        code: 'NO_CUSTOMER_ACCOUNT'
      });
    }

    const user = userResult.rows[0];

    // Generate magic-link token with agent and user info
    const tokenPayload = {
      agent_id: agent_id,
      user_id: user.id,
      business_id: agent.business_id,
      type: 'agent_magic_link'
    };

    // Include redirect path if provided
    const safeRedirect = sanitizeRelativeRedirectPath(redirect);
    if (safeRedirect) {
      tokenPayload.redirect = safeRedirect;
    }

    const magicToken = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: '10m' } // 10 minute expiration
    );

    const magicLinkUrl = `https://www.romerotechsolutions.com/agent/login?token=${magicToken}`;

    const redirectInfo = safeRedirect ? ` → ${safeRedirect}` : '';
    console.log(`🔗 Generated agent magic-link for ${agent.device_name} (agent: ${agent_id}, user: ${user.email})${redirectInfo}`);

    res.json({
      success: true,
      message: 'Magic-link generated',
      data: {
        magic_link_url: magicLinkUrl,
        expires_in: '10m',
        agent_name: agent.device_name,
        business_name: agent.business_name,
        redirect: safeRedirect || null
      }
    });

  } catch (error) {
    console.error('Agent dashboard-link error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate dashboard link',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.post('/:agent_id/heartbeat', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const {
      status,
      agent_version,
      os_version,
      remote_control_enabled,
      // v1.18.6+: Linux daemon reports active session type so the
      // dashboard can route Remote Control around the MeshCentral
      // Wayland limitation. Empty/omitted from non-Linux hosts and
      // older agents — COALESCE preserves prior value either way.
      display_server,
      xauth_status,
      compositor,
    } = req.body;

    // Whitelist values from the agent payload before they hit the
    // database — agents are first-party but we still don't want a
    // typo or future field confusion to write garbage that bypasses
    // the column CHECK constraint and produces an opaque DB error.
    const allowedDisplayServer = ['x11', 'wayland', 'headless', 'unknown'];
    const allowedXauth = ['ok', 'missing', 'unknown'];
    const safeDisplayServer = allowedDisplayServer.includes(display_server)
      ? display_server : null;
    const safeXauth = allowedXauth.includes(xauth_status) ? xauth_status : null;
    // Compositor is free-form text but cap length defensively.
    const safeCompositor = (typeof compositor === 'string' && compositor.length > 0 && compositor.length <= 64)
      ? compositor : null;

    // Update agent status and last_heartbeat. agent_version (v1.16.77+),
    // os_version (v1.16.87+), remote_control_enabled (v1.18.1+),
    // display_server / xauth_status / compositor (v1.18.6+) are all
    // included on every heartbeat from the daemon so the dashboard
    // can flag outdated builds, reflect post-Windows-Update OS
    // changes, gray out Remote Control when opted-out, and route
    // Wayland Linux hosts around MeshCentral's KVM limitation.
    // COALESCE preserves the prior value when an older agent (no
    // field in payload) checks in.
    //
    // RETURNING gives us the post-update row so we can broadcast
    // the freshly-stored values. Either way the dashboard sees
    // the truth that's now in the DB.
    const updateResult = await query(
      `UPDATE agent_devices
       SET last_heartbeat = NOW(),
           status = COALESCE($2, status),
           agent_version = COALESCE($3, agent_version),
           os_version = COALESCE($4, os_version),
           remote_control_enabled = COALESCE($5, remote_control_enabled),
           display_server = COALESCE($6, display_server),
           xauth_status = COALESCE($7, xauth_status),
           compositor = COALESCE($8, compositor),
           updated_at = NOW()
       WHERE id = $1
       RETURNING device_name, status, agent_version, os_version, last_heartbeat,
                 remote_control_enabled, display_server, xauth_status, compositor`,
      [agent_id, status || 'online', agent_version || null, os_version || null,
       (remote_control_enabled === true || remote_control_enabled === false) ? remote_control_enabled : null,
       safeDisplayServer, safeXauth, safeCompositor]
    );

    // Push the heartbeat-derived state to the admin dashboards in
    // real time so the AgentDashboard table refreshes without a
    // page reload. Particularly important for the "Update agent"
    // flow: the admin clicks Update, and as soon as the agent
    // comes back on the new binary the version cell flips. Best-
    // effort — no broadcast = no UX bug, just no auto-refresh.
    if (updateResult.rows.length > 0) {
      const row = updateResult.rows[0];
      // Sweep stale 'executing' install_update rows for this agent.
      // The agent leaves them in 'executing' on purpose (so a
      // dashboard refresh keeps the "Update in progress" badge
      // alive while the install runs); we mark them 'completed'
      // once the agent comes back heartbeating, so the badge
      // doesn't stick forever after the upgrade.
      //
      // Order matters: sweep BEFORE the websocket broadcast so the
      // openCommandTypes derivation below sees the post-sweep state.
      // Without this ordering, the dashboard's local
      // `updateInProgress` Map sees the broadcast first (still
      // carrying the stale "executing" hint) and never clears,
      // because the agent_version comparison the clear logic relies
      // on is identity if the heartbeat lands AFTER the install
      // already advanced (Albondigas 2026-04-27 incident).
      //
      // 90s is the right threshold: long enough to cover a typical
      // dpkg/rpm install + postinst (3s grace + ~30s install +
      // service restart + first heartbeat ~10s after restart),
      // short enough that the dashboard's "in progress" state
      // clears promptly. If the install actually takes longer
      // (slow network, large package), the badge is shown for an
      // extra heartbeat cycle — annoying but correct.
      try {
        // agent_commands has no JSONB result_payload — record the
        // completion context in stdout (free-form text column) and
        // just bump status + completed_at.
        await query(
          `UPDATE agent_commands
           SET status = 'completed',
               completed_at = NOW(),
               stdout = COALESCE(stdout, '') ||
                        E'\n[heartbeat-sweep] agent_version=' || COALESCE($2, 'unknown') ||
                        E'\n[heartbeat-sweep] swept_at=' || to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS')
           WHERE agent_device_id = $1
             AND command_type = 'install_update'
             AND status = 'executing'
             AND created_at < NOW() - INTERVAL '90 seconds'`,
          [agent_id, row.agent_version || null]
        );
      } catch (sweepErr) {
        console.warn('⚠ Failed to sweep stale install_update rows:', sweepErr.message);
      }

      // Re-derive the open-command-types set AFTER the sweep so the
      // dashboard's badges (Update in progress / Reboot scheduled)
      // can clear from server truth instead of sticky local state.
      // Without this signal, the dashboard's local updateInProgress
      // Map disagrees with reality whenever the version-comparison
      // clear logic happens to compare the agent's just-heartbeated
      // version against itself (the case that bit Albondigas
      // 2026-04-27 — the install completed via .pkg before the
      // dashboard's first post-update heartbeat broadcast landed,
      // so the seeding picked up the new version as the "from"
      // version and the badge stuck forever).
      let openCommandTypes = [];
      try {
        const openResult = await query(
          `SELECT DISTINCT command_type
             FROM agent_commands
            WHERE agent_device_id = $1
              AND status IN ('pending', 'delivered', 'executing')
              AND command_type IN ('install_update', 'reboot_host')`,
          [agent_id]
        );
        openCommandTypes = openResult.rows.map(r => r.command_type);
      } catch (e) {
        // Read failure here doesn't block the heartbeat — the
        // dashboard simply falls back to the (stale) local state
        // and a page refresh fixes it.
        console.warn('⚠ Failed to derive openCommandTypes:', e.message);
      }

      try {
        websocketService.broadcastAgentStatusUpdate({
          agentId: agent_id,
          status: row.status,
          lastHeartbeat: row.last_heartbeat,
          deviceName: row.device_name,
          agentVersion: row.agent_version,
          osVersion: row.os_version,
          remoteControlEnabled: row.remote_control_enabled,
          displayServer: row.display_server,
          xauthStatus: row.xauth_status,
          compositor: row.compositor,
          openCommandTypes,
        });
      } catch (broadcastErr) {
        console.warn('⚠ Failed to broadcast agent-status-update:', broadcastErr.message);
      }
    }

    // Get subscription information for tray display
    const agentResult = await query(
      `SELECT business_id FROM agent_devices WHERE id = $1`,
      [agent_id]
    );

    let subscriptionInfo = null;

    if (agentResult.rows.length > 0 && agentResult.rows[0].business_id) {
      const businessId = agentResult.rows[0].business_id;

      // Get user subscription tier
      const userResult = await query(
        `SELECT subscription_tier, devices_allowed FROM users WHERE business_id = $1`,
        [businessId]
      );

      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];

        // Count active devices for this business (excluding soft-deleted and inactive devices)
        const deviceCountResult = await query(
          `SELECT COUNT(*) as count FROM agent_devices
           WHERE business_id = $1 AND soft_delete = false AND is_active = true`,
          [businessId]
        );

        const devicesUsed = parseInt(deviceCountResult.rows[0].count) || 0;
        const devicesAllowed = parseInt(user.devices_allowed) || 0;

        // Map tier to display name
        let tierDisplay = user.subscription_tier;
        if (tierDisplay === 'free') tierDisplay = 'Free';
        else if (tierDisplay === 'subscribed') tierDisplay = 'Pro';
        else if (tierDisplay === 'enterprise') tierDisplay = 'Enterprise';

        subscriptionInfo = {
          tier: user.subscription_tier,
          tier_display: tierDisplay,
          devices_used: devicesUsed,
          devices_allowed: devicesAllowed
        };
      }
    }

    res.json({
      success: true,
      message: 'Heartbeat received',
      data: {
        timestamp: new Date().toISOString(),
        subscription: subscriptionInfo
      }
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
          clt_update_available,
          os_patches_data,
          distro_upgrade,
          raw_metrics,
          collected_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78, $79, $80, $81)`,
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
          metric.clt_update_available || false,
          metric.os_patches_data ? JSON.stringify(metric.os_patches_data) : null,
          metric.distro_upgrade ? JSON.stringify(metric.distro_upgrade) : null,
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

    // Stage 2.2 — sustained 2σ anomaly detection. Fire-and-forget; failures
    // here must not block the metrics write path. Anomalies that cross the
    // 15-min sustained threshold get reported via the existing alert pipeline.
    // Snapshot req.agent locals here so the .then closure doesn't depend on
    // variables declared later in this handler.
    const _agentBusinessId = req.agent && req.agent.business_id;
    const _agentDeviceName = req.agent && req.agent.device_name;
    evaluateMetricsForAnomalies(agent_id, latestMetric)
      .then(fired => {
        for (const f of fired) {
          alertEscalationService.processHealthCheckResult({
            agent_device_id: agent_id,
            business_id: _agentBusinessId,
            check_type: `metric_anomaly_${f.metric_type}`,
            severity: 'warning',
            payload: f,
            device_name: _agentDeviceName,
          }).catch(err => console.error(`❌ anomaly alert dispatch failed:`, err));
        }
      })
      .catch(err => console.error(`❌ anomaly evaluation failed for agent ${agent_id}:`, err));

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

export default router;
