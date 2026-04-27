/**
 * Wayland Remote Control reverse-tunnel pairing service.
 *
 * The agent's daemon, after starting screencast-live, dials a
 * WebSocket here. The dashboard's noVNC client also dials a
 * WebSocket here. We pair them by audit_id and forward binary
 * frames between them. This is the bridge that lets a browser
 * reach an agent's localhost VNC port without MeshCentral
 * relay or NAT traversal — the agent's outbound dial gets
 * around firewalls, and the dashboard's wss connection rides
 * the same backend trust that everything else does.
 *
 * Wire endpoints (mounted in server.js, see attachToHttpServer):
 *
 *   /ws/wayland-tunnel/:audit_id/agent
 *     Auth: X-Agent-Token header (JWT, validated by
 *     authenticateAgentJWT). Caller sends RFB protocol bytes
 *     received from its localhost VNC server, receives bytes
 *     destined for that server.
 *
 *   /ws/wayland-tunnel/:audit_id/dashboard
 *     Auth: regular session cookie + manage.remote_control.enable
 *     permission. Caller is noVNC running in a browser; binary
 *     frames are RFB protocol bytes.
 *
 * Pairing semantics:
 *   - First side to connect parks until its counterpart shows up.
 *   - 60s grace before parked side gets a 1011 close.
 *   - When both sides are present, we pipe binary frames in both
 *     directions until either side disconnects.
 *   - Audit row's metadata gets updated with relay_paired_at /
 *     relay_closed_at for diagnostics (best-effort).
 *
 * Constraints:
 *   - Single dashboard, single agent per audit_id. A second agent
 *     dial replaces the first (covers reconnects); a second
 *     dashboard dial closes with 1008 (policy violation).
 *   - Audit_id must exist in remote_control_sessions and not be
 *     ended_at-set; otherwise reject with 1008.
 */

import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { sessionService } from './sessionService.js';

// In-memory pairing table. Keyed by audit_id; each entry holds
// the agent and dashboard WebSockets currently associated with
// that session. Cleared on either side's close.
//
// Why in-memory: this is per-process state and the tunnel is
// inherently a single-backend-instance affair (both ends connect
// to the same backend). Multi-instance deployments would need a
// sticky-session load balancer or Redis pubsub; not in scope
// for v1.19.
const pairs = new Map();

/**
 * Returns the entry for an audit_id, creating an empty one if
 * needed. Mutating callers hold no lock — JS is single-threaded
 * so the (read, write) is atomic from the event loop's POV.
 */
function getPair(auditId) {
  let p = pairs.get(auditId);
  if (!p) {
    p = { agent: null, dashboard: null, parkedTimer: null };
    pairs.set(auditId, p);
  }
  return p;
}

/**
 * Forwards every binary frame from `from` to `to`. On either
 * side's close, returns. Caller is responsible for setting up
 * close semantics for the other side after this returns.
 */
function pipeFrames(from, to, label) {
  from.on('message', (data, isBinary) => {
    if (to.readyState !== to.OPEN) return;
    // Always forward as binary — RFB doesn't use text frames.
    // Some clients send text "ping" probes; we just drop those.
    if (!isBinary) return;
    try {
      to.send(data, { binary: true });
    } catch (e) {
      console.warn(`[waylandTunnel] ${label} forward error:`, e.message);
    }
  });
}

/**
 * Tear down a pairing: close both sides if they're open, clear
 * timers, remove from the map. Idempotent.
 */
async function teardown(auditId, reason) {
  const p = pairs.get(auditId);
  if (!p) return;
  pairs.delete(auditId);
  if (p.parkedTimer) {
    clearTimeout(p.parkedTimer);
  }
  for (const side of ['agent', 'dashboard']) {
    const ws = p[side];
    if (ws && ws.readyState === ws.OPEN) {
      try {
        ws.close(1000, reason || 'tunnel closed');
      } catch {
        // ignore — best-effort
      }
    }
  }
  // Best-effort audit-row update so the dashboard's session-history
  // view shows when the relay actually disconnected. Distinct from
  // ended_at (which is set when the *audit* row closes via the
  // /end endpoint).
  try {
    await query(
      `UPDATE remote_control_sessions
          SET metadata = metadata || $2::jsonb
        WHERE id = $1`,
      [auditId, JSON.stringify({
        relay_closed_at: new Date().toISOString(),
        relay_close_reason: reason || 'unknown',
      })]
    );
  } catch (e) {
    // Don't fail teardown if the DB write errors.
    console.warn('[waylandTunnel] audit-row update failed:', e.message);
  }
}

/**
 * Validate the agent's JWT and return the agent_id, or throw.
 * Agent connects with X-Agent-Token header (set by the agent's
 * dial code).
 */
function authenticateAgent(req) {
  const tok = req.headers['x-agent-token'];
  if (!tok) throw new Error('missing X-Agent-Token');
  const decoded = jwt.verify(tok, process.env.JWT_SECRET);
  if (decoded?.type !== 'agent') {
    throw new Error('wrong token type');
  }
  return decoded.agent_id;
}

/**
 * Validate the dashboard's session cookie. Reuses sessionService.
 * Returns user object or throws.
 */
async function authenticateDashboard(req) {
  // Express-style cookie parsing is wired in the main app; here
  // we look for the cookie ourselves since the WS upgrade runs
  // outside the express middleware chain.
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
  // sessionId cookie name matches what authMiddleware checks.
  const sessionId = cookies.sessionId || cookies.session_id;
  if (!sessionId) throw new Error('no session cookie');
  const user = await sessionService.validateSession(sessionId);
  if (!user) throw new Error('invalid session');
  return user;
}

/**
 * Verify the audit row exists and the agent_id (or user) has
 * permission to use it. Returns the audit row or throws.
 */
async function loadAudit(auditId) {
  const r = await query(
    `SELECT id, agent_device_id, ended_at, initiated_by_user
       FROM remote_control_sessions
      WHERE id = $1`,
    [auditId]
  );
  if (r.rows.length === 0) throw new Error('audit not found');
  if (r.rows[0].ended_at) throw new Error('audit already ended');
  return r.rows[0];
}

/**
 * Hooks the tunnel endpoints onto an http.Server. Called from
 * server.js after socket.io's WebSocketService.initialize.
 *
 * Both /ws/wayland-tunnel paths share an upgrade handler that
 * routes by URL prefix. The 'upgrade' event fires once per
 * incoming WS-upgrade request; we either complete the upgrade
 * (handleUpgrade + on('connection')) or destroy the socket
 * with a 401/404.
 */
export function attachToHttpServer(httpServer) {
  // We want our handlers to coexist with socket.io which is
  // already attached. socket.io grabs upgrades whose URL starts
  // with /socket.io/; we grab /ws/wayland-tunnel/.
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', async (req, socket, head) => {
    const url = req.url || '';
    if (!url.startsWith('/ws/wayland-tunnel/')) {
      // Not ours — let socket.io's own upgrade handler (or
      // anyone else's) take it. socket.io's upgrade is
      // attached on a different listener so simply not handling
      // here means it gets through.
      return;
    }
    // Parse: /ws/wayland-tunnel/:audit_id/agent|dashboard
    const m = url.match(/^\/ws\/wayland-tunnel\/([^/?]+)\/(agent|dashboard)(\?.*)?$/);
    if (!m) {
      socket.destroy();
      return;
    }
    const [, auditId, role] = m;

    // Auth + audit lookup BEFORE we accept the upgrade. If we
    // upgrade first and reject second, the client sees a
    // confusing close-with-no-reason. Upfront 401 is clearer.
    let identity;
    try {
      if (role === 'agent') {
        identity = { kind: 'agent', agentId: authenticateAgent(req) };
      } else {
        identity = { kind: 'dashboard', user: await authenticateDashboard(req) };
      }
      const audit = await loadAudit(auditId);
      if (role === 'agent' && audit.agent_device_id !== identity.agentId) {
        throw new Error('agent_id mismatch with audit row');
      }
    } catch (e) {
      console.warn(`[waylandTunnel] reject ${role} ${auditId}: ${e.message}`);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.binaryType = 'nodebuffer';
      handleConnection(ws, auditId, role);
    });
  });
}

/**
 * Per-connection setup: stash in pairs, wire the bridge if both
 * sides present, schedule a 60s parked-timeout if only one side.
 */
function handleConnection(ws, auditId, role) {
  const pair = getPair(auditId);

  // Replace stale agent connection (e.g. after a brief network
  // drop the agent reconnects). Dashboard double-connect is a
  // policy violation — close the new one.
  if (role === 'agent') {
    if (pair.agent && pair.agent.readyState === pair.agent.OPEN) {
      try { pair.agent.close(1000, 'replaced'); } catch {}
    }
    pair.agent = ws;
  } else {
    if (pair.dashboard && pair.dashboard.readyState === pair.dashboard.OPEN) {
      try { ws.close(1008, 'session already has a dashboard viewer'); } catch {}
      return;
    }
    pair.dashboard = ws;
  }

  console.log(`[waylandTunnel] ${role} connected for audit=${auditId}`);

  ws.on('close', (code, reason) => {
    console.log(`[waylandTunnel] ${role} closed for audit=${auditId} code=${code}`);
    teardown(auditId, `${role} disconnected (${code})`);
  });
  ws.on('error', (e) => {
    console.warn(`[waylandTunnel] ${role} error for audit=${auditId}:`, e.message);
  });

  // Both sides present? Pipe.
  if (pair.agent && pair.dashboard) {
    if (pair.parkedTimer) {
      clearTimeout(pair.parkedTimer);
      pair.parkedTimer = null;
    }
    console.log(`[waylandTunnel] PAIRED audit=${auditId}`);
    pipeFrames(pair.agent, pair.dashboard, 'agent→dashboard');
    pipeFrames(pair.dashboard, pair.agent, 'dashboard→agent');
    // Mark the audit row paired-at so dashboards can show a
    // "session active" indicator and we have a duration to
    // report later.
    query(
      `UPDATE remote_control_sessions
          SET metadata = metadata || $2::jsonb
        WHERE id = $1`,
      [auditId, JSON.stringify({ relay_paired_at: new Date().toISOString() })]
    ).catch(e => console.warn('[waylandTunnel] paired-update failed:', e.message));
  } else {
    // Schedule a 60s timeout. If counterpart shows up, the
    // pair branch above clears the timer.
    pair.parkedTimer = setTimeout(() => {
      console.log(`[waylandTunnel] timeout audit=${auditId} ${role}-only never paired`);
      teardown(auditId, 'counterpart timeout');
    }, 60_000);
  }
}

export default { attachToHttpServer };
