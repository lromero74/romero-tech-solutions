/**
 * Remote-control routes — Phase 2 §16.3 of the MeshCentral PRP
 * (.plan/2026.04.26.02-remote-control-meshcentral-PRP.md).
 *
 * Three endpoints:
 *
 *   POST /api/remote-control/agents/:agent_id/start
 *     - Auth: employee session (authMiddleware) + manage.remote_control.enable
 *     - Verifies agent exists + is online
 *     - Mints a short-lived MeshCentral login token
 *     - INSERT into remote_control_sessions (audit row)
 *     - Returns { session_url, expires_at, audit_id }
 *
 *   POST /api/remote-control/sessions/:session_id/end
 *     - Auth: employee session + manage.remote_control.enable
 *     - Looks up MeshCentral session id from audit row
 *     - Calls meshcentralService.disconnectSession()
 *     - UPDATE audit row with ended_at + disconnect_reason='admin_force'
 *
 *   GET /api/remote-control/server-health
 *     - Auth: employee session + manage.remote_control.enable
 *     - Calls meshcentralService.serverInfo() to verify connectivity
 *     - Returns { status, meshCentralVersion, deviceGroupsVisible }
 *
 * Mounted in server.js as:
 *   app.use('/api/remote-control', generalLimiter, remoteControlRoutes);
 */

import express from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import meshcentral from '../services/meshcentralService.js';

const router = express.Router();

// Feature flag — when false, all routes return 503. Lets us deploy
// the backend before the dashboard is ready without exposing the
// half-built feature.
const featureEnabled = () => process.env.FEATURE_REMOTE_CONTROL === 'true';

// Tiny helper: turn an unhandled error into a structured 500 + log.
function fail(res, status, code, message, error) {
  if (error) console.error(`[remoteControl] ${code}:`, error);
  return res.status(status).json({ success: false, code, message });
}

// ──── POST /agents/:agent_id/start ────────────────────────────────────
router.post(
  '/agents/:agent_id/start',
  authMiddleware,
  requirePermission('manage.remote_control.enable'),
  async (req, res) => {
    if (!featureEnabled()) {
      return res.status(503).json({
        success: false,
        code: 'FEATURE_DISABLED',
        message: 'Remote control feature is currently disabled',
      });
    }

    const { agent_id } = req.params;
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'UNAUTHENTICATED', 'No user in session');

    try {
      // 1. Verify the agent exists, is active, and is online.
      const agentRow = await query(
        `SELECT id, device_name, status, last_heartbeat
           FROM agent_devices
          WHERE id = $1 AND soft_delete = false`,
        [agent_id]
      );
      if (agentRow.rows.length === 0) {
        return fail(res, 404, 'AGENT_NOT_FOUND', 'Agent device not found');
      }
      const agent = agentRow.rows[0];
      if (agent.status !== 'online') {
        return fail(res, 409, 'AGENT_OFFLINE',
          `Agent ${agent.device_name} is ${agent.status}; cannot initiate remote control`);
      }

      // 2. Mint the MeshCentral login token. We use a 5-minute
      // expiry — long enough for the technician to react to any
      // 2FA prompts on their dashboard and click through the iframe
      // load, short enough that an intercepted URL can't be replayed
      // hours later.
      let tokenResp;
      try {
        tokenResp = await meshcentral.mintLoginToken(300);
      } catch (e) {
        return fail(res, 502, 'MESHCENTRAL_UNREACHABLE',
          'Could not contact MeshCentral to mint session URL', e);
      }
      // MeshCentral's createLoginToken response uses `tokenUser`
      // (NOT `tokenName` or `username` — verified against the live
      // 1.1.59 server during Phase 5 dogfood). Fall through to the
      // legacy field names so a future MC version that switches
      // back doesn't silently break.
      const tokenName = tokenResp?.tokenUser || tokenResp?.tokenName || tokenResp?.username;
      const tokenPass = tokenResp?.tokenPass || tokenResp?.password;
      if (!tokenName || !tokenPass) {
        return fail(res, 502, 'MESHCENTRAL_TOKEN_MALFORMED',
          'MeshCentral did not return a usable login token',
          new Error(JSON.stringify(tokenResp)));
      }

      // 3. Build the iframe URL.
      //
      // MeshCentral supports several URL params after login:
      //   ?login=<base64(user:pass)>      — auto-login
      //   &gotodevicename=<name>          — deep-link by device name
      //                                     (matched against nodes[].name)
      //   &viewmode=11                    — land on the Desktop tab
      //                                     directly (1=MyDevices, 10=info,
      //                                     11=Desktop, 12=Terminal, etc.)
      //
      // We use gotodevicename rather than gotonode because the
      // agent device_name maps cleanly to MeshCentral's node name
      // (the MeshAgent installer registers under the host's
      // computer name) — no extra lookup needed.
      const meshUrl = process.env.MESHCENTRAL_URL ||
        'https://mesh.romerotechsolutions.com';
      const credBlob = Buffer.from(`${tokenName}:${tokenPass}`, 'utf8').toString('base64');
      // hide=63 strips MeshCentral's own UI chrome so the iframe
      // shows just the device's desktop view + the bottom toolbar
      // (Send Ctrl+Alt+Del, Clipboard, etc.). Bitmask:
      //   1=masthead (top "RTS Remote Control" bar with logo+user)
      //   2=topbar (search/filter row)
      //   4=footer (MeshCentral footer + Powered-By)
      //   8=title bar ("Desktop - WinVM" header)
      //   16=leftbar (main navigation column)
      //   32=back-button arrow
      // Sum=63 = full chrome strip. Our dashboard modal already
      // shows device name + Disconnect, so the embedded view can
      // be stripped clean.
      const sessionUrl = `${meshUrl}/?login=${encodeURIComponent(credBlob)}` +
        `&gotodevicename=${encodeURIComponent(agent.device_name)}` +
        `&viewmode=11&hide=63`;

      // 4. INSERT audit row.
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress || null;
      const auditRow = await query(
        `INSERT INTO remote_control_sessions
           (agent_device_id, initiated_by_user, technician_ip, metadata)
         VALUES ($1, $2, $3::inet, $4)
         RETURNING id, started_at`,
        [agent_id, userId, ip, JSON.stringify({
          meshcentral_token_name: tokenName,
          token_expiry_seconds: 300,
        })]
      );
      const audit = auditRow.rows[0];

      const expiresAt = new Date(Date.now() + 300_000).toISOString();
      console.log(
        `[remoteControl] session START audit=${audit.id} ` +
        `agent=${agent.device_name}/${agent_id} user=${userId}`
      );

      return res.json({
        success: true,
        session_url: sessionUrl,
        expires_at: expiresAt,
        audit_id: audit.id,
        device_name: agent.device_name,
      });
    } catch (e) {
      return fail(res, 500, 'INTERNAL', 'Failed to initiate remote-control session', e);
    }
  }
);

// ──── POST /sessions/:session_id/end ──────────────────────────────────
router.post(
  '/sessions/:session_id/end',
  authMiddleware,
  requirePermission('manage.remote_control.enable'),
  async (req, res) => {
    if (!featureEnabled()) {
      return res.status(503).json({
        success: false,
        code: 'FEATURE_DISABLED',
        message: 'Remote control feature is currently disabled',
      });
    }

    const { session_id } = req.params;
    try {
      const row = await query(
        `SELECT id, meshcentral_session_id, ended_at
           FROM remote_control_sessions
          WHERE id = $1`,
        [session_id]
      );
      if (row.rows.length === 0) {
        return fail(res, 404, 'SESSION_NOT_FOUND', 'Audit row not found');
      }
      const session = row.rows[0];
      if (session.ended_at) {
        return res.json({
          success: true,
          message: 'Session was already ended',
          ended_at: session.ended_at,
        });
      }

      // Best-effort: ask MeshCentral to disconnect. We don't fail
      // the request if MeshCentral is unreachable — the audit row
      // is still updated so the dashboard reflects the admin's intent.
      if (session.meshcentral_session_id) {
        try {
          await meshcentral.disconnectSession(session.meshcentral_session_id);
        } catch (e) {
          console.warn(`[remoteControl] MeshCentral disconnect failed:`, e.message);
        }
      }

      const updated = await query(
        `UPDATE remote_control_sessions
           SET ended_at = NOW(),
               disconnect_reason = 'admin_force',
               duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
         WHERE id = $1
         RETURNING ended_at, duration_seconds`,
        [session_id]
      );
      console.log(`[remoteControl] session END audit=${session_id} forced by admin`);
      return res.json({
        success: true,
        ended_at: updated.rows[0].ended_at,
        duration_seconds: updated.rows[0].duration_seconds,
      });
    } catch (e) {
      return fail(res, 500, 'INTERNAL', 'Failed to end remote-control session', e);
    }
  }
);

// ──── POST /agents/:agent_id/wayland/start ────────────────────────────
//
// Wayland Remote Control entry point (v1.19+). Used by AgentDashboard
// when the target host is Linux + Wayland and MeshCentral's KVM
// can't capture the screen.
//
// Flow:
//   1. INSERT a remote_control_sessions audit row.
//   2. INSERT an agent_commands row with command_type =
//      'start_wayland_remote_control'. Daemon picks it up on its
//      next poll (~5s).
//   3. Poll the command row for completion (up to 90s — covers
//      portal consent + gst pipeline init).
//   4. Read the chosen port out of the command result. Persist
//      it on the audit row.
//   5. Return the audit_id, agent's node id, and (eventually) the
//      MeshCentral relay tunnel URL the dashboard noVNC client
//      will connect to.
//
// TODO(v1.19-rc): wire the actual MeshCentral relay tunnel URL.
// Today this returns a placeholder `relay_url: null` and the
// dashboard falls back to a dev-mode SSH tunnel. Production
// needs the meshcentralService to mint a wss URL bound to
// (agent's MeshAgent nodeid, agent's localhost VNC port).
router.post(
  '/agents/:agent_id/wayland/start',
  authMiddleware,
  requirePermission('manage.remote_control.enable'),
  async (req, res) => {
    if (!featureEnabled()) {
      return res.status(503).json({
        success: false,
        code: 'FEATURE_DISABLED',
        message: 'Remote control feature is currently disabled',
      });
    }

    const { agent_id } = req.params;
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'UNAUTHENTICATED', 'No user in session');

    try {
      // 1. Verify the agent exists, online, and is on Wayland.
      const agentRow = await query(
        `SELECT id, device_name, status, os_type, display_server
           FROM agent_devices
          WHERE id = $1 AND soft_delete = false`,
        [agent_id]
      );
      if (agentRow.rows.length === 0) {
        return fail(res, 404, 'AGENT_NOT_FOUND', 'Agent device not found');
      }
      const agent = agentRow.rows[0];
      if (agent.status !== 'online') {
        return fail(res, 409, 'AGENT_OFFLINE',
          `Agent ${agent.device_name} is ${agent.status}; cannot initiate Wayland Remote Control`);
      }
      if (agent.os_type !== 'linux' || agent.display_server !== 'wayland') {
        return fail(res, 400, 'NOT_WAYLAND',
          `Agent ${agent.device_name} is not on Linux Wayland (os_type=${agent.os_type} display=${agent.display_server}); use the regular Remote Control endpoint instead`);
      }

      // 2. INSERT audit row first so we have an ID to thread.
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress || null;
      const auditRow = await query(
        `INSERT INTO remote_control_sessions
           (agent_device_id, initiated_by_user, technician_ip, metadata)
         VALUES ($1, $2, $3::inet, $4)
         RETURNING id, started_at`,
        [agent_id, userId, ip, JSON.stringify({
          transport: 'wayland_pipewire',
          v1_19: true,
        })]
      );
      const audit = auditRow.rows[0];

      // 3. Enqueue start_wayland_remote_control for the agent.
      // No params needed; the daemon figures out the active user
      // and stream from the local environment. The audit_id goes
      // in command_params so we can correlate when the result
      // comes back.
      const { v4: uuidv4 } = await import('uuid');
      const commandId = uuidv4();
      await query(
        `INSERT INTO agent_commands (
           id, agent_device_id, command_type, command_params,
           requested_by, approval_required, approved_by, status
         ) VALUES ($1, $2, 'start_wayland_remote_control', $3, $4, false, $4, 'pending')`,
        [commandId, agent_id, JSON.stringify({ audit_id: audit.id }), userId]
      );

      // 4. Poll the command row for completion. Daemon poll
      // interval is ~5s, command itself takes ~10s once running
      // (consent dialog + gst init), so a 90s overall budget is
      // plenty. If the user denies the dialog the command will
      // fail and we surface the error.
      const deadline = Date.now() + 90_000;
      let port = null;
      let cmdErr = null;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 1500));
        const cmdRow = await query(
          `SELECT status, stdout, error_message
             FROM agent_commands
            WHERE id = $1`,
          [commandId]
        );
        if (cmdRow.rows.length === 0) {
          // Race: command got cleaned up. Bail.
          break;
        }
        const cmd = cmdRow.rows[0];
        if (cmd.status === 'completed') {
          // The daemon stores the result struct in stdout (the
          // CommandResult.Result field gets serialized there by
          // the agent's result-submit code).
          try {
            const parsed = JSON.parse(cmd.stdout || '{}');
            port = parsed.port;
          } catch {
            // ignore parse failure; will fall through to error path
          }
          break;
        }
        if (cmd.status === 'failed') {
          cmdErr = cmd.error_message || 'agent reported start_wayland_remote_control failure';
          break;
        }
      }

      if (cmdErr) {
        return fail(res, 502, 'AGENT_REJECTED',
          `Agent could not start Wayland Remote Control: ${cmdErr}`);
      }
      if (!port) {
        return fail(res, 504, 'AGENT_TIMEOUT',
          `Timed out waiting for ${agent.device_name} to start Wayland session`);
      }

      // 5. Persist port on audit row.
      await query(
        `UPDATE remote_control_sessions
            SET metadata = metadata || $2::jsonb
          WHERE id = $1`,
        [audit.id, JSON.stringify({ vnc_port: port })]
      );

      console.log(
        `[remoteControl] Wayland session START audit=${audit.id} ` +
        `agent=${agent.device_name}/${agent_id} port=${port}`
      );

      // Build the relay URL the dashboard's noVNC client connects
      // to. The agent's command handler also dials this same audit
      // ID's /agent endpoint as a reverse tunnel; the backend
      // pairs them in waylandTunnelService.js. Browser-origin URL
      // construction handled client-side via location.origin so
      // the dev (localhost) and prod (api.) deployments both work.
      // Backend just returns the path; dashboard prepends the wss
      // host on its end.
      const relayPath = `/ws/wayland-tunnel/${audit.id}/dashboard`;

      return res.json({
        success: true,
        audit_id: audit.id,
        device_name: agent.device_name,
        vnc_port: port,
        relay_path: relayPath,
        // Kept for backward-compat with v1.19-alpha dashboards.
        relay_url: null,
      });
    } catch (e) {
      return fail(res, 500, 'INTERNAL', 'Failed to initiate Wayland Remote Control session', e);
    }
  }
);

// ──── POST /sessions/:audit_id/wayland/end ────────────────────────────
//
// Terminates a Wayland Remote Control session: enqueues
// stop_wayland_remote_control on the agent, marks the audit row
// ended. Idempotent — calling twice is harmless.
router.post(
  '/sessions/:audit_id/wayland/end',
  authMiddleware,
  requirePermission('manage.remote_control.enable'),
  async (req, res) => {
    if (!featureEnabled()) {
      return res.status(503).json({
        success: false,
        code: 'FEATURE_DISABLED',
        message: 'Remote control feature is currently disabled',
      });
    }

    const { audit_id } = req.params;
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'UNAUTHENTICATED', 'No user in session');

    try {
      const auditRow = await query(
        `SELECT id, agent_device_id, ended_at
           FROM remote_control_sessions
          WHERE id = $1`,
        [audit_id]
      );
      if (auditRow.rows.length === 0) {
        return fail(res, 404, 'AUDIT_NOT_FOUND', 'Session audit row not found');
      }
      const audit = auditRow.rows[0];
      if (audit.ended_at) {
        // Already ended; nothing to do but return success.
        return res.json({ success: true, already_ended: true });
      }

      const { v4: uuidv4 } = await import('uuid');
      await query(
        `INSERT INTO agent_commands (
           id, agent_device_id, command_type, command_params,
           requested_by, approval_required, approved_by, status
         ) VALUES ($1, $2, 'stop_wayland_remote_control', $3, $4, false, $4, 'pending')`,
        [uuidv4(), audit.agent_device_id, JSON.stringify({ audit_id }), userId]
      );

      await query(
        `UPDATE remote_control_sessions
            SET ended_at = NOW(),
                disconnect_reason = 'user_requested'
          WHERE id = $1`,
        [audit_id]
      );

      console.log(`[remoteControl] Wayland session END audit=${audit_id}`);
      return res.json({ success: true });
    } catch (e) {
      return fail(res, 500, 'INTERNAL', 'Failed to end Wayland Remote Control session', e);
    }
  }
);

// ──── GET /server-health ──────────────────────────────────────────────
router.get(
  '/server-health',
  authMiddleware,
  requirePermission('manage.remote_control.enable'),
  async (req, res) => {
    if (!featureEnabled()) {
      return res.status(503).json({
        success: false,
        code: 'FEATURE_DISABLED',
        message: 'Remote control feature is currently disabled',
      });
    }

    try {
      const info = await meshcentral.serverInfo();
      const groups = await meshcentral.listDeviceGroups();
      return res.json({
        success: true,
        status: 'healthy',
        meshcentral_version: info?.serverinfo?.version || 'unknown',
        device_groups_visible: groups?.meshes?.length || 0,
        domain: info?.serverinfo?.domain ?? '',
      });
    } catch (e) {
      return res.status(503).json({
        success: false,
        status: 'unhealthy',
        code: 'MESHCENTRAL_UNREACHABLE',
        message: e.message,
      });
    }
  }
);

export default router;
