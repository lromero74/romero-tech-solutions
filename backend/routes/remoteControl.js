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
      const tokenName = tokenResp?.tokenName || tokenResp?.username;
      const tokenPass = tokenResp?.tokenPass || tokenResp?.password;
      if (!tokenName || !tokenPass) {
        return fail(res, 502, 'MESHCENTRAL_TOKEN_MALFORMED',
          'MeshCentral did not return a usable login token',
          new Error(JSON.stringify(tokenResp)));
      }

      // 3. Build the iframe URL. MeshCentral's login-token URL format
      // is: https://<server>/?login=<base64(name:pass)>&node=<nodeid>
      // The node= parameter pre-selects the device so the iframe
      // lands on the device's page rather than the My Devices home.
      const meshUrl = process.env.MESHCENTRAL_URL ||
        'https://mesh.romerotechsolutions.com';
      const credBlob = Buffer.from(`${tokenName}:${tokenPass}`, 'utf8').toString('base64');
      // Note: we don't have the agent's MeshCentral node id stored
      // anywhere yet — Phase 3 will plumb that through. For now the
      // iframe lands on My Devices and the technician picks the
      // device. v2 acceptance criterion is to land directly on the
      // device's Desktop tab.
      const sessionUrl = `${meshUrl}/?login=${encodeURIComponent(credBlob)}`;

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
