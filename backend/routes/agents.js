import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { query } from '../config/database.js';
import { authenticateAgent, requireAgentMatch } from '../middleware/agentAuthMiddleware.js';
import { authMiddleware, requireEmployee } from '../middleware/authMiddleware.js';
import jwt from 'jsonwebtoken';
import { websocketService } from '../services/websocketService.js';
import meshcentralService from '../services/meshcentralService.js';
import {
  normalizeProgressPayload,
  buildProgressWsMessage,
  buildStartedWsMessage,
  buildRebootCancelledWsMessage,
} from '../utils/agentCommandPayloads.cjs';
import { confluenceDetectionService } from '../services/confluenceDetectionService.js';
import { candleAggregationService } from '../services/candleAggregationService.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { alertEscalationService } from '../services/alertEscalationService.js';
import { evaluateMetricsForAnomalies } from '../services/anomalyDetectionService.js';
import { getLatestForecast, getDiskHistory, forecastSeverity } from '../services/diskForecastService.js';
import { getBaselines } from '../services/anomalyDetectionService.js';
import { getHistory as getWanIpHistory } from '../services/wanIpService.js';
import { getSmartTrend } from '../services/smartTrendService.js';
import trialRoutes from './agents/trial.js';
import commandsRoutes from './agents/commands.js';
import inventoryRoutes from './agents/inventory.js';
import { sanitizeRelativeRedirectPath } from '../utils/redirectSafety.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════
// TRIAL AGENT ENDPOINTS (No Authentication Required)
// Lives in ./agents/trial.js; mounted first to preserve route precedence.
// ═══════════════════════════════════════════════════════════════════════════
router.use(trialRoutes);


// ═══════════════════════════════════════════════════════════════════════════
// REGULAR AGENT ENDPOINTS (Require Authentication)
// ═══════════════════════════════════════════════════════════════════════════

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


// Agent inventory endpoints live in ./agents/inventory.js; mounted here
// to preserve the original route registration order.
router.use(inventoryRoutes);

// Agent remote-command endpoints live in ./agents/commands.js; mounted here
// to preserve the original route registration order.
router.use(commandsRoutes);


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
    const isEmployee = req.user.role !== 'customer' && req.user.role !== 'client';

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
        ad.agent_version,
        ad.remote_control_enabled,
        ad.display_server,
        ad.xauth_status,
        ad.compositor,
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
        sl.country as location_country,
        -- Pending action commands surfaced for the dashboard so the
        -- "Update in progress" / "Reboot scheduled" badges survive
        -- a page refresh. We only include actionable types here
        -- (install_update, reboot_host) and only the most recent
        -- still-in-flight row per type — older rows aren't relevant
        -- once the agent has moved on. requested_at is included so
        -- the UI can render "scheduled at HH:MM".
        (
          SELECT COALESCE(json_agg(row_to_json(p)), '[]'::json)
          FROM (
            SELECT DISTINCT ON (command_type)
              id AS command_id,
              command_type,
              status,
              created_at AS requested_at,
              command_params
            FROM agent_commands
            WHERE agent_device_id = ad.id
              AND command_type IN ('install_update', 'reboot_host')
              AND status IN ('pending', 'delivered', 'executing')
            ORDER BY command_type, created_at DESC
          ) p
        ) AS pending_action_commands,
        -- Latest patch / package-update counts pulled from the
        -- most-recent agent_metrics row. Surfaced so the
        -- AgentDashboard can filter by "Has OS patches" / "Has
        -- package updates" / "Has distro upgrade" without the
        -- frontend having to hit the per-agent metrics endpoint
        -- for every row.
        (
          SELECT row_to_json(latest)
          FROM (
            SELECT
              COALESCE(am.patches_available, 0) AS os_patches,
              COALESCE(am.security_patches_available, 0) AS os_security_patches,
              COALESCE(am.patches_require_reboot, false) AS os_patches_reboot,
              COALESCE(am.package_managers_outdated, 0) AS package_updates,
              COALESCE(am.homebrew_outdated, 0) AS homebrew_outdated,
              COALESCE(am.npm_outdated, 0) AS npm_outdated,
              COALESCE(am.pip_outdated, 0) AS pip_outdated,
              COALESCE(am.mas_outdated, 0) AS mas_outdated,
              (am.distro_upgrade IS NOT NULL) AS distro_upgrade_available,
              am.collected_at AS observed_at
            FROM agent_metrics am
            WHERE am.agent_device_id = ad.id
            ORDER BY am.collected_at DESC
            LIMIT 1
          ) latest
        ) AS patch_summary
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
 * Get Policies Assigned to Agent
 * GET /api/agents/:agent_id/policies
 *
 * Returns all policies assigned to a specific agent (direct + business-level)
 */
router.get('/:agent_id/policies', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const isEmployee = req.user.role !== 'customer' && req.user.role !== 'client';

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

    const agent = accessResult.rows[0];

    // Get all policies assigned to this agent (both direct and business-level)
    const policiesResult = await query(
      `SELECT DISTINCT
        p.id,
        p.policy_name,
        p.description,
        p.policy_type,
        p.execution_mode,
        p.schedule_cron,
        p.enabled,
        s.script_name,
        pa.id as assignment_id,
        pa.assigned_at,
        CASE
          WHEN pa.agent_device_id IS NOT NULL THEN 'direct'
          WHEN pa.business_id IS NOT NULL THEN 'business'
          ELSE 'unknown'
        END as assignment_type,
        e.first_name || ' ' || e.last_name as assigned_by_name
       FROM policy_assignments pa
       INNER JOIN automation_policies p ON pa.policy_id = p.id
       LEFT JOIN automation_scripts s ON p.script_id = s.id
       LEFT JOIN employees e ON pa.assigned_by = e.id
       WHERE (pa.agent_device_id = $1 OR pa.business_id = $2)
         AND p.enabled = true
       ORDER BY pa.assigned_at DESC`,
      [agent_id, agent.business_id]
    );

    res.json({
      success: true,
      data: {
        policies: policiesResult.rows,
        count: policiesResult.rows.length
      }
    });

  } catch (error) {
    console.error('Get agent policies error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent policies',
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
    const isEmployee = req.user.role !== 'customer' && req.user.role !== 'client';

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
      // For clients: Check if this is a trial agent owned by the user OR a regular agent in their business
      queryText += ' AND (ad.trial_user_id = $2 OR ad.business_id = $3)';
      params.push(req.user.id);
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
 * Deactivate Agent
 * PUT /api/agents/:agent_id/deactivate
 *
 * Deactivates an agent (sets is_active = false)
 * Device remains in the client's device list but shows as inactive
 * Inactive devices do not count toward subscription device limits
 */
router.put('/:agent_id/deactivate', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const isEmployee = req.user.role !== 'customer' && req.user.role !== 'client';

    console.log(`⏸️  DEACTIVATE agent request: agent_id=${agent_id}, user_id=${req.user.id}, role=${req.user.role}`);

    // Verify ownership/access to this agent
    let accessCheckQuery = `
      SELECT ad.id, ad.business_id, ad.device_name, ad.trial_user_id, ad.is_trial, ad.is_active
      FROM agent_devices ad
      WHERE ad.id = $1 AND ad.soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      // For clients: Check if this is a trial agent owned by the user OR a regular agent in their business
      accessCheckQuery += ' AND (ad.trial_user_id = $2 OR ad.business_id = $3)';
      accessParams.push(req.user.id);
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

    const agent = accessResult.rows[0];

    // Deactivate the agent (set is_active = false, but keep soft_delete = false so it stays in list)
    await query(
      `UPDATE agent_devices
       SET is_active = false,
           status = 'offline',
           updated_at = NOW()
       WHERE id = $1`,
      [agent_id]
    );

    console.log(`⏸️  Agent deactivated: ${agent.device_name} (${agent_id}) by user ${req.user.email}`);

    res.json({
      success: true,
      message: 'Agent deactivated successfully',
      data: {
        agent_id: agent_id,
        device_name: agent.device_name
      }
    });

  } catch (error) {
    console.error('Deactivate agent error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate agent',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Remove Agent (Soft Delete)
 * DELETE /api/agents/:agent_id
 *
 * Soft deletes an agent (sets is_active = false AND soft_delete = true)
 * This hides the device from the client's device list but preserves all records
 * Clients can only soft delete their own business's agents
 * Employees can access admin tools for permanent deletion if needed
 */
router.delete('/:agent_id', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const isEmployee = req.user.role !== 'customer' && req.user.role !== 'client';

    console.log(`🗑️  DELETE agent request: agent_id=${agent_id}, user_id=${req.user.id}, role=${req.user.role}, business_id=${req.user.business_id}`);

    // Verify ownership/access to this agent
    let accessCheckQuery = `
      SELECT ad.id, ad.business_id, ad.device_name, ad.trial_user_id, ad.is_trial, ad.is_active
      FROM agent_devices ad
      WHERE ad.id = $1 AND ad.soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      // For clients: Check if this is a trial agent owned by the user OR a regular agent in their business
      accessCheckQuery += ' AND (ad.trial_user_id = $2 OR ad.business_id = $3)';
      accessParams.push(req.user.id);
      accessParams.push(req.user.business_id);
      console.log(`🔍 Client access check: trial_user_id=${req.user.id}, business_id=${req.user.business_id}`);
    }

    const accessResult = await query(accessCheckQuery, accessParams);
    console.log(`🔍 Access check result: found ${accessResult.rows.length} agents`, accessResult.rows.length > 0 ? accessResult.rows[0] : 'none');

    if (accessResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    const agent = accessResult.rows[0];

    // Remove the agent (soft delete - set is_active = false AND soft_delete = true)
    await query(
      `UPDATE agent_devices
       SET is_active = false,
           soft_delete = true,
           status = 'offline',
           updated_at = NOW()
       WHERE id = $1`,
      [agent_id]
    );

    console.log(`🗑️  Agent removed (soft deleted): ${agent.device_name} (${agent_id}) by user ${req.user.email}`);

    // Cleanup: also remove the matching node from MeshCentral so
    // the orphan device record doesn't linger as a connectable
    // node a technician could still reach. Best-effort — if
    // MeshCentral is down or the node was never enrolled (free
    // tier, never enabled remote control), the soft-delete still
    // succeeds and we just log.
    try {
      const result = await meshcentralService.removeDeviceByName(agent.device_name);
      if (result.removed > 0) {
        console.log(`🗑️  MeshCentral cleanup: removed ${result.removed} node(s) named "${agent.device_name}"`);
      }
    } catch (mcErr) {
      console.warn(`⚠ MeshCentral cleanup for "${agent.device_name}" failed (non-fatal):`, mcErr.message);
    }

    res.json({
      success: true,
      message: 'Agent removed successfully',
      data: {
        agent_id: agent_id,
        device_name: agent.device_name
      }
    });

  } catch (error) {
    console.error('Deactivate agent error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate agent',
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
    const isEmployee = req.user.role !== 'customer' && req.user.role !== 'client';

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
      // Raw data for short time ranges (1-24 hours) - return ALL columns for full metric display
      metricsQuery = `
        SELECT *
        FROM agent_metrics
        WHERE agent_device_id = $1
          AND collected_at >= NOW() - INTERVAL '${hoursInt} hours'
        ORDER BY collected_at ASC
      `;
    }

    const metricsResult = await query(metricsQuery, [agent_id]);

    // If using aggregation, also fetch the latest full metric for overview display
    // (aggregated data doesn't include patch status, EOL info, disk health, etc.)
    let latestMetric = null;
    if (aggregationInterval) {
      const latestMetricResult = await query(
        `SELECT * FROM agent_metrics
         WHERE agent_device_id = $1
         ORDER BY collected_at DESC
         LIMIT 1`,
        [agent_id]
      );
      latestMetric = latestMetricResult.rows[0] || null;
    }

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
        latest_metric: latestMetric, // Full metric data for overview (null if no aggregation)
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
    const isEmployee = req.user.role !== 'customer' && req.user.role !== 'client';

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

    // Generate new opaque agent token (see authenticateAgent
    // middleware for rationale). Used to rotate a single agent's
    // token without affecting any others.
    const newToken = crypto.randomBytes(48).toString('base64url');

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

// =============================================================================
// Stage 1 Health Checks — see docs/PRPs/STAGE1_HEALTH_CHECKS.md
//   POST /:agent_id/check-result            (agent → backend, agent JWT)
//   GET  /:agent_id/health-checks           (employee, requires permission)
//   GET  /:agent_id/health-checks/:check_type/history  (employee, requires permission)
// Client transparency endpoint lives at /api/client/agents/:agent_id/transparency-report
// (separate router, gated by business_id ownership instead of permission key).
// =============================================================================

const VALID_CHECK_TYPES = new Set([
  // Stage 1
  'reboot_pending', 'time_drift', 'crashdumps', 'top_processes',
  'listening_ports', 'update_history_failures', 'domain_status', 'mapped_drives',
  // Stage 2.4 / 2.5 / 2.6
  'battery_health', 'power_policy', 'gpu_status',
  // Stage 3.7 / 3.5 / 3.2
  'certificate_expiry', 'scheduled_tasks', 'peripherals',
  // Stage 3.6 / 3.3 / 3.4
  'logon_history', 'browser_extensions', 'license_keys'
]);

router.post('/:agent_id/check-result', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { check_type, severity, passed, payload, collected_at } = req.body;

    if (!check_type || typeof check_type !== 'string' || !VALID_CHECK_TYPES.has(check_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing check_type',
        code: 'INVALID_CHECK_TYPE'
      });
    }
    if (payload === undefined || payload === null) {
      return res.status(400).json({
        success: false,
        message: 'Missing payload',
        code: 'MISSING_PAYLOAD'
      });
    }
    const sev = ['info', 'warning', 'critical'].includes(severity) ? severity : 'info';

    // No per-check gating here — the subscription model is per-device-count,
    // not per-feature. Quota enforcement lives at registration time. Every
    // device that successfully authed gets every check_type.

    // Look up business_id (denormalized into the row for tenant isolation).
    const { rows: agentRows } = await query(
      'SELECT business_id, device_name, status FROM agent_devices WHERE id = $1',
      [agent_id]
    );
    if (agentRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    const business_id = agentRows[0].business_id;

    // Compare to previous to drive change-only history inserts.
    const { rows: prevRows } = await query(
      `SELECT payload FROM agent_check_results
        WHERE agent_device_id = $1 AND check_type = $2`,
      [agent_id, check_type]
    );
    const previous = prevRows[0]?.payload ?? null;

    // Upsert latest snapshot.
    const collectedTimestamp = collected_at ? new Date(collected_at) : new Date();
    await query(`
      INSERT INTO agent_check_results
        (agent_device_id, business_id, check_type, severity, passed, payload, collected_at, reported_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      ON CONFLICT (agent_device_id, check_type) DO UPDATE
        SET severity = EXCLUDED.severity,
            passed = EXCLUDED.passed,
            payload = EXCLUDED.payload,
            collected_at = EXCLUDED.collected_at,
            reported_at = now()
    `, [agent_id, business_id, check_type, sev, !!passed, JSON.stringify(payload), collectedTimestamp]);

    // Append to history only on payload change (bounds growth by churn rate).
    const payloadChanged = !previous || JSON.stringify(previous) !== JSON.stringify(payload);
    if (payloadChanged) {
      await query(`
        INSERT INTO agent_check_history
          (agent_device_id, business_id, check_type, severity, passed, payload, collected_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [agent_id, business_id, check_type, sev, !!passed, JSON.stringify(payload), collectedTimestamp]);
    }

    // Live broadcast for the admin Health Checks tab.
    if (websocketService && websocketService.io) {
      websocketService.io.emit('agent-check-result', {
        agentId: agent_id,
        businessId: business_id,
        deviceName: agentRows[0].device_name,
        checkType: check_type,
        severity: sev,
        passed: !!passed,
        payload,
        collectedAt: collectedTimestamp.toISOString(),
        changed: payloadChanged
      });
    }

    // Fire alert pipeline for warning/critical (deduped 4h, opt-in subscribers
    // via alert_subscribers / client_alert_subscriptions). Async — failures here
    // never block the check_result write path.
    if (sev === 'warning' || sev === 'critical') {
      alertEscalationService.processHealthCheckResult({
        agent_device_id: agent_id,
        business_id,
        check_type,
        severity: sev,
        payload,
        device_name: agentRows[0].device_name,
      }).catch(err => {
        console.error(`❌ processHealthCheckResult failed for agent ${agent_id} check ${check_type}:`, err);
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Agent check-result upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to ingest check result',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/:agent_id/health-checks',
  authMiddleware,
  requirePermission('view.agent_health_checks.enable'),
  async (req, res) => {
    try {
      const { agent_id } = req.params;
      const { rows } = await query(`
        SELECT check_type, severity, passed, payload, collected_at, reported_at
          FROM agent_check_results
         WHERE agent_device_id = $1
         ORDER BY check_type
      `, [agent_id]);
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('Health checks fetch error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch health checks' });
    }
  }
);

router.get('/:agent_id/health-checks/:check_type/history',
  authMiddleware,
  requirePermission('view.agent_health_checks.enable'),
  async (req, res) => {
    try {
      const { agent_id, check_type } = req.params;
      if (!VALID_CHECK_TYPES.has(check_type)) {
        return res.status(400).json({ success: false, message: 'Invalid check_type' });
      }
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
      const { rows } = await query(`
        SELECT severity, passed, payload, collected_at
          FROM agent_check_history
         WHERE agent_device_id = $1
           AND check_type = $2
           AND collected_at >= now() - ($3::int || ' days')::interval
         ORDER BY collected_at DESC
         LIMIT 200
      `, [agent_id, check_type, days]);
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('Health check history fetch error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch history' });
    }
  }
);

// =============================================================================
// Stage 2 — Trends / Forecast / Baseline read endpoints
// See docs/PRPs/STAGE2_TRENDS.md.
// =============================================================================

router.get('/:agent_id/disk-forecast',
  authMiddleware,
  requirePermission('view.agent_disk_forecast.enable'),
  async (req, res) => {
    try {
      const { agent_id } = req.params;
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
      const [forecast, history] = await Promise.all([
        getLatestForecast(agent_id),
        getDiskHistory(agent_id, days),
      ]);
      const severity = forecast ? forecastSeverity(forecast.days_until_full) : null;
      res.json({ success: true, data: { forecast, history, severity } });
    } catch (error) {
      console.error('Disk forecast fetch error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch disk forecast' });
    }
  }
);

router.get('/:agent_id/baselines',
  authMiddleware,
  requirePermission('view.agent_trends.enable'),
  async (req, res) => {
    try {
      const { agent_id } = req.params;
      const baselines = await getBaselines(agent_id);
      res.json({ success: true, data: baselines });
    } catch (error) {
      console.error('Baselines fetch error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch baselines' });
    }
  }
);

router.get('/:agent_id/wan-ip-history',
  authMiddleware,
  requirePermission('view.agent_trends.enable'),
  async (req, res) => {
    try {
      const { agent_id } = req.params;
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
      const rows = await getWanIpHistory(agent_id, limit);
      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('WAN IP history fetch error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch WAN IP history' });
    }
  }
);

router.get('/:agent_id/smart-trend',
  authMiddleware,
  requirePermission('view.agent_trends.enable'),
  async (req, res) => {
    try {
      const { agent_id } = req.params;
      const trend = await getSmartTrend(agent_id);
      res.json({ success: true, data: trend });
    } catch (error) {
      console.error('SMART trend fetch error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch SMART trend' });
    }
  }
);

// AGGREGATION LEVEL CONFIGURATION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get Aggregation Level Information
 * GET /api/agents/aggregation-levels
 *
 * Returns available aggregation levels with descriptions
 */
router.get('/aggregation-levels', authMiddleware, async (req, res) => {
  try {
    const levels = candleAggregationService.getAggregationLevelInfo();

    res.json({
      success: true,
      data: levels
    });

  } catch (error) {
    console.error('Get aggregation levels error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve aggregation levels',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Update Agent Aggregation Level
 * PUT /api/agents/:agent_id/aggregation-level
 *
 * Sets the alert aggregation level for a specific agent device
 * Clients can only update their own devices
 * Pass null to remove override and use user default
 */
router.put('/:agent_id/aggregation-level', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { aggregation_level } = req.body;
    const isEmployee = req.user.role !== 'customer' && req.user.role !== 'client';

    console.log(`⚙️  UPDATE aggregation level: agent=${agent_id}, level=${aggregation_level}, user=${req.user.email}`);

    // Verify ownership/access to this agent
    let accessCheckQuery = `
      SELECT ad.id, ad.business_id, ad.device_name, ad.trial_user_id, ad.is_trial
      FROM agent_devices ad
      WHERE ad.id = $1 AND ad.soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      // For clients: Check if this is a trial agent owned by the user OR a regular agent in their business
      accessCheckQuery += ' AND (ad.trial_user_id = $2 OR ad.business_id = $3)';
      accessParams.push(req.user.id);
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

    // Update aggregation level
    const updated = await candleAggregationService.updateAgentAggregationLevel(
      agent_id,
      aggregation_level
    );

    res.json({
      success: true,
      message: 'Aggregation level updated successfully',
      data: updated
    });

  } catch (error) {
    console.error('Update agent aggregation level error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update aggregation level',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Agent Aggregation Settings
 * GET /api/agents/:agent_id/aggregation-settings
 *
 * Returns current aggregation settings for an agent
 */
router.get('/:agent_id/aggregation-settings', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const isEmployee = req.user.role !== 'customer' && req.user.role !== 'client';

    // Verify ownership/access to this agent
    let accessCheckQuery = `
      SELECT
        ad.id,
        ad.device_name,
        ad.alert_aggregation_level as device_override,
        u.default_alert_aggregation_level as user_default,
        COALESCE(ad.alert_aggregation_level, u.default_alert_aggregation_level, 'raw') as effective_level
      FROM agent_devices ad
      LEFT JOIN users u ON ad.trial_user_id = u.id OR (ad.business_id = u.business_id AND u.is_primary_contact = true)
      WHERE ad.id = $1 AND ad.soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      // For clients: Check if this is a trial agent owned by the user OR a regular agent in their business
      accessCheckQuery += ' AND (ad.trial_user_id = $2 OR ad.business_id = $3)';
      accessParams.push(req.user.id);
      accessParams.push(req.user.business_id);
    }

    const result = await query(accessCheckQuery, accessParams);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    const settings = result.rows[0];

    res.json({
      success: true,
      data: {
        agent_id: agent_id,
        device_name: settings.device_name,
        device_override: settings.device_override,
        user_default: settings.user_default,
        effective_level: settings.effective_level
      }
    });

  } catch (error) {
    console.error('Get agent aggregation settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve aggregation settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Backfill Candles for Agent
 * POST /api/agents/:agent_id/backfill-candles
 *
 * Backfill historical candles for an agent (employee only)
 * Used when enabling aggregated alerting for the first time
 */
router.post('/:agent_id/backfill-candles', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { days_back = 7 } = req.body;

    console.log(`📦 BACKFILL CANDLES: agent=${agent_id}, days=${days_back}, user=${req.user.email}`);

    // Verify agent exists
    const agentResult = await query(
      `SELECT id, device_name FROM agent_devices WHERE id = $1 AND soft_delete = false`,
      [agent_id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Trigger backfill
    const summary = await candleAggregationService.backfillCandlesForAgent(agent_id, days_back);

    res.json({
      success: true,
      message: 'Candle backfill completed',
      data: summary
    });

  } catch (error) {
    console.error('Backfill candles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to backfill candles',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get vulnerability advisories for a package version range
 * GET /api/agents/packages/vulnerabilities?ecosystem=PyPI&package=X&from_version=A&to_version=B
 *
 * Used by the dashboard's "click on Latest version → see what's
 * changed / what CVEs were patched" flow. Backed by OSV.dev's free
 * /v1/query API — covers PyPI / npm / Go / Maven / RubyGems / Crates /
 * Packagist / Linux distros (Debian, Ubuntu, Alpine, Rocky, etc.) /
 * NPM / OSS-Fuzz. Returns vulnerabilities affecting any version
 * `> from_version` and `<= to_version` so the user sees what they're
 * gaining by updating.
 *
 * In-memory cache keyed on (ecosystem, package, from, to) with 1h TTL
 * to keep us a polite OSV.dev citizen — the free tier doesn't ratelimit
 * but published etiquette is "cache aggressively".
 */
const osvCache = new Map(); // key → { fetchedAt: ms, payload }
const OSV_TTL_MS = 60 * 60 * 1000;

router.get('/packages/vulnerabilities', authMiddleware, async (req, res) => {
  try {
    const { ecosystem, package: pkgName, from_version, to_version } = req.query;
    if (!ecosystem || !pkgName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required query params: ecosystem, package',
      });
    }

    const cacheKey = `${ecosystem}|${pkgName}|${from_version || ''}|${to_version || ''}`;
    const cached = osvCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < OSV_TTL_MS) {
      return res.json(cached.payload);
    }

    // OSV /v1/query — sending package alone returns ALL vulns ever
    // recorded for that package; we filter client-side by the version
    // range below. Sending {version: from} narrows to "what affects
    // this version" but we want the diff, not the snapshot.
    const osvBody = { package: { ecosystem, name: pkgName } };
    const osvResp = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(osvBody),
    });
    if (!osvResp.ok) {
      const text = await osvResp.text();
      return res.status(502).json({
        success: false,
        message: `OSV.dev returned ${osvResp.status}`,
        detail: text.slice(0, 500),
      });
    }
    const osvData = await osvResp.json();
    const allVulns = Array.isArray(osvData.vulns) ? osvData.vulns : [];

    // Filter to vulnerabilities whose `affected[].ranges[].events`
    // intersect (from_version, to_version]. OSV's range model is
    // event-stream; rather than reimplement semver semantics here we
    // keep it lenient: include the vuln if ANY of its `affected`
    // entries lists from_version or any version literally between
    // them, OR if from_version isn't supplied (return everything).
    const fromV = from_version ? String(from_version) : null;
    const toV = to_version ? String(to_version) : null;

    // Lightweight filtering — OSV format is rich enough that doing
    // bulletproof range-intersection client-side is its own project.
    // For v1 we return all vulns that mention from_version in their
    // affected ranges as "introduced" or "fixed", AND we leave the
    // rest out only when from_version is set; that's a useful
    // approximation for "what changed between A and B?".
    const filtered = !fromV
      ? allVulns
      : allVulns.filter(v => {
          if (!Array.isArray(v.affected)) return true; // be inclusive on uncertain shape
          for (const a of v.affected) {
            if (!Array.isArray(a.ranges)) continue;
            for (const r of a.ranges) {
              if (!Array.isArray(r.events)) continue;
              for (const e of r.events) {
                // OSV "fixed" events for the to_version side — vulnerabilities
                // patched in or before our target are exactly what we want.
                if (e.fixed && toV && versionLte(e.fixed, toV)) return true;
                if (e.introduced && fromV && versionLte(e.introduced, toV)) return true;
              }
            }
          }
          return false;
        });

    // Trim each vuln to a UI-friendly subset; full CVE blob is huge.
    const trimmed = filtered.map(v => ({
      id: v.id,
      summary: v.summary || '',
      details: v.details || '',
      severity: v.severity || [],
      aliases: Array.isArray(v.aliases) ? v.aliases : [],
      references: Array.isArray(v.references) ? v.references.map(r => ({ type: r.type, url: r.url })) : [],
      published: v.published,
      modified: v.modified,
    }));

    const payload = {
      success: true,
      data: {
        ecosystem, package: pkgName, from_version: fromV, to_version: toV,
        count: trimmed.length, vulnerabilities: trimmed,
      },
    };
    osvCache.set(cacheKey, { fetchedAt: Date.now(), payload });
    return res.json(payload);
  } catch (error) {
    console.error('OSV vulnerability lookup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to look up vulnerabilities',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// versionLte does a tolerant lexicographic-with-numeric-promotion
// compare. OSV often sends pre-release / build-metadata strings that
// strict semver libraries reject; for our display-only "did the patch
// land before our target?" query, this approximation is adequate.
function versionLte(a, b) {
  const partsA = String(a).split(/[.\-+]/).map(p => /^\d+$/.test(p) ? parseInt(p, 10) : p);
  const partsB = String(b).split(/[.\-+]/).map(p => /^\d+$/.test(p) ? parseInt(p, 10) : p);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const x = partsA[i] === undefined ? 0 : partsA[i];
    const y = partsB[i] === undefined ? 0 : partsB[i];
    if (typeof x === typeof y) {
      if (x < y) return true;
      if (x > y) return false;
    } else {
      // Mixed types: numeric is "less than" string (1 < "1.0-alpha")
      if (typeof x === 'number') return true;
      if (typeof y === 'number') return false;
    }
  }
  return true; // equal
}

export default router;
