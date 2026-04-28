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
import meshcentral, { listDevices } from '../services/meshcentralService.js';
import { issueDashboardTicket } from '../services/waylandTunnelService.js';

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
      // Mint an SSO login cookie (NOT a createLoginToken). The
      // cookie is server-encrypted and binds the iframe's session
      // to the management user directly, so the iframe inherits
      // that user's full mesh-link rights and Connect/RDP/HW
      // buttons enable correctly.
      //
      // Earlier we used createLoginToken + ?user=&pass= URL params.
      // That auto-logged the iframe in but the resulting session
      // had rights=0 for every device — Connect was greyed out and
      // the desktop view stayed black. The token-user MC creates
      // does NOT inherit the creator's mesh-link rights even
      // though it inherits the userid in session machinery. The
      // login-cookie path bypasses that hole entirely.
      let loginCookie;
      try {
        loginCookie = await meshcentral.getLoginCookie();
      } catch (e) {
        return fail(res, 502, 'MESHCENTRAL_UNREACHABLE',
          'Could not mint MeshCentral session cookie', e);
      }
      if (!loginCookie) {
        return fail(res, 502, 'MESHCENTRAL_TOKEN_MALFORMED',
          'MeshCentral did not return a login cookie',
          new Error('empty cookie'));
      }

      // 3. Build the iframe URL.
      //
      // MeshCentral's auto-login URL params (verified against
      // MeshCentral webserver.js master, route handler at
      // ~line 2989):
      //   ?user=<tokenUser>&pass=<tokenPass> — auto-login via
      //                                         createLoginToken creds
      //   &gotodevicename=<name>             — deep-link by device name
      //   &viewmode=11                       — land on the Desktop tab
      //
      // PRIOR BUG: this code used to send `?login=<base64(user:pass)>`,
      // borrowed from older MeshCentral docs / blog posts. In modern
      // MeshCentral the `?login=` param is reserved for SERVER-SIGNED
      // encrypted cookies (used for password-reset emails); user:pass
      // sent there is silently ignored and MC falls through to the
      // login form — which is what the technician was seeing instead
      // of a transparent SSO.
      const meshUrl = process.env.MESHCENTRAL_URL ||
        'https://mesh.romerotechsolutions.com';

      // Resolve our agent's device_name to MeshCentral's actual node
      // _id. We can't rely on gotodevicename matching directly because
      // MeshAgent registers under whatever the OS reports (macOS:
      // sometimes `scutil --get ComputerName`, sometimes
      // `Albondigas.lan` from BSD-style hostname; Linux: usually
      // `uname -n`; Windows: NetBIOS name). Our agent reports
      // `os.Hostname()`, which doesn't always match.
      //
      // Strategy: list every node MC sees, then match by stem (the
      // part before the first dot, lowercased). "Albondigas.local",
      // "Albondigas.lan", and "Albondigas" all share stem
      // "albondigas" — so any of those finds the right node. If the
      // lookup fails (network issue, MC slow, node not yet
      // registered), fall back to gotodevicename so the iframe at
      // least loads MC's device list.
      const targetStem = agent.device_name.split('.')[0].toLowerCase();
      let meshNodeId = null;
      try {
        const nodeList = await listDevices();
        for (const meshId of Object.keys(nodeList?.nodes || {})) {
          for (const n of nodeList.nodes[meshId] || []) {
            const stem = (n.name || '').split('.')[0].toLowerCase();
            if (stem === targetStem) { meshNodeId = n._id; break; }
          }
          if (meshNodeId) break;
        }
      } catch (e) {
        console.warn(`[remoteControl] MC node lookup failed for ${agent.device_name}:`, e.message);
      }
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
      // Prefer gotonode=<bareid> (exact MC node id, no name
      // ambiguity) when we resolved the node above. Fall back to
      // gotodevicename for the legacy path.
      //
      // MC's `gotonode` URL param expects just the base64 id
      // portion, NOT the full "node/<domain>/<id>" form — its
      // client-side handler builds the full id as
      //   `node/${domain}/${args.gotonode}`
      // so passing the full id results in `node//node/<domain>/<id>`
      // which doesn't match anything → silent no-op, blank MC view.
      // Strip the leading `node/<domain>/` (domain is empty in our
      // setup, so it shows up as `node//`).
      const bareNodeId = meshNodeId
        ? meshNodeId.replace(/^node\/[^/]*\//, '')
        : '';
      const targetParam = bareNodeId
        ? `gotonode=${encodeURIComponent(bareNodeId)}`
        : `gotodevicename=${encodeURIComponent(agent.device_name)}`;
      // ?login=<server-encrypted-cookie> is the SSO mechanism
      // (handleRootRequestEx in MC's webserver.js, ~line 3054).
      // The cookie was minted above via the management API.
      const sessionUrl = `${meshUrl}/` +
        `?login=${encodeURIComponent(loginCookie)}` +
        `&${targetParam}` +
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
          meshcentral_auth: 'logincookie',
          mesh_node_id: meshNodeId || null,
          cookie_expiry_minutes: 60,
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
      // 240s budget covers worst-case path: the agent picks up
      // commands on its 60s heartbeat tick, the user can take up
      // to 120s to find and click the GNOME consent dialog, plus
      // ~10s for screencast-live's PipeWire+gst pipeline to come
      // up. Earlier 90s was sized for an in-process command queue
      // ("interval ~5s") that doesn't reflect the agent reality.
      const deadline = Date.now() + 240_000;
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
      // Mint three one-shot tickets — rfb (input + display),
      // video (H.264 / WebCodecs), audio (Opus/WebM via MSE).
      // All expire in 60s; each is consumed on first valid use.
      const rfbTicket = issueDashboardTicket(audit.id, req.user.id);
      const videoTicket = issueDashboardTicket(audit.id, req.user.id);
      const audioTicket = issueDashboardTicket(audit.id, req.user.id);
      const relayPath = `/ws/wayland-tunnel/${audit.id}/dashboard?ticket=${rfbTicket}`;
      const videoRelayPath = `/ws/wayland-tunnel/${audit.id}/video-dashboard?ticket=${videoTicket}`;
      const audioRelayPath = `/ws/wayland-tunnel/${audit.id}/audio-dashboard?ticket=${audioTicket}`;

      return res.json({
        success: true,
        audit_id: audit.id,
        device_name: agent.device_name,
        vnc_port: port,
        relay_path: relayPath,
        video_relay_path: videoRelayPath,
        audio_relay_path: audioRelayPath,
        relay_url: null, // backward-compat
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
