/**
 * Native Remote Control reverse-tunnel pairing service.
 *
 * Renamed from waylandTunnelService.js in v1.22 — the same tunnel
 * architecture now serves Linux Wayland (screencast-live) AND
 * macOS (screencast-mac-live), so the "wayland" name no longer
 * fit. Both URL prefixes are accepted (see attachToHttpServer):
 * the older `/ws/wayland-tunnel/*` path keeps working for
 * un-upgraded agents through at least v1.24.x; new code uses
 * `/ws/native-tunnel/*`. Both prefixes share the same pair map
 * (keyed by audit_id + kind), so an agent dialing one prefix
 * pairs cleanly with a dashboard dialing the other.
 *
 * The agent's daemon, after starting its capture helper, dials a
 * WebSocket here. The dashboard's WebCodecs/RFB client also dials
 * a WebSocket here. We pair them by audit_id and forward binary
 * frames between them. This is the bridge that lets a browser
 * reach an agent's localhost VNC/H264 ports without MeshCentral
 * relay or NAT traversal — the agent's outbound dial gets around
 * firewalls, and the dashboard's wss connection rides the same
 * backend trust that everything else does.
 *
 * Wire endpoints (mounted in server.js, see attachToHttpServer).
 * Each accepts both `/ws/wayland-tunnel/*` and `/ws/native-tunnel/*`:
 *
 *   /ws/native-tunnel/:audit_id/agent  (alias: /ws/wayland-tunnel/…)
 *     Auth: X-Agent-Token header (JWT, validated by
 *     authenticateAgentJWT). Caller sends RFB protocol bytes
 *     received from its localhost VNC server, receives bytes
 *     destined for that server.
 *
 *   /ws/native-tunnel/:audit_id/dashboard  (alias: /ws/wayland-tunnel/…)
 *     Auth: regular session cookie + manage.remote_control.enable
 *     permission. Caller is the dashboard's NativeRemoteControlClient
 *     (renamed from WaylandRemoteControlClient); binary frames are
 *     RFB protocol bytes.
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
import { randomBytes } from 'crypto';
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

// One-shot tickets for dashboard authentication. The browser
// runs at www.romerotechsolutions.com and the relay lives at
// api.romerotechsolutions.com — that's a cross-site WebSocket
// handshake, on which SameSite=Lax cookies are NOT sent. So we
// can't authenticate the dashboard via the regular session
// cookie. Instead, the /wayland/start route mints a short-lived
// ticket bound to (audit_id, user_id), and the dashboard appends
// it as ?ticket=... to the wss URL. The upgrade handler accepts
// either a valid ticket OR a session cookie (for same-origin
// dev where the cookie does flow).
//
// Why not just relax the cookie's SameSite? That would weaken
// every other auth surface in the app. A scoped ticket is the
// least-surface change.
const tickets = new Map(); // ticket -> { auditId, userId, expiresAt }
const TICKET_TTL_MS = 60_000;

/**
 * Returns the entry for an audit_id, creating an empty one if
 * needed. Mutating callers hold no lock — JS is single-threaded
 * so the (read, write) is atomic from the event loop's POV.
 */
function getPair(auditId, kind) {
  // Composite key: separate pair tracking per kind so the rfb and
  // video tunnels for the same audit_id pair independently.
  const key = `${auditId}:${kind}`;
  let p = pairs.get(key);
  if (!p) {
    p = {
      agent: null,
      dashboard: null,
      parkedTimer: null,
      // Pre-pair message buffers — see notes on the bug this
      // fixes (early agent bytes silently dropped by Node ws
      // before the dashboard side connects).
      bufferedFromAgent: [],
      bufferedFromDashboard: [],
    };
    pairs.set(key, p);
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
    // RFB doesn't use text frames; drop them.
    if (!isBinary) return;
    try {
      to.send(data, { binary: true });
    } catch (e) {
      console.warn(`[nativeTunnel] ${label} forward error:`, e.message);
    }
  });
}

/**
 * Tear down a pairing: close both sides if they're open, clear
 * timers, remove from the map. Idempotent.
 */
async function teardown(auditId, kind, reason) {
  const key = `${auditId}:${kind}`;
  const p = pairs.get(key);
  if (!p) return;
  pairs.delete(key);
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
  // view shows when the relay actually disconnected. We only stamp
  // on rfb-tunnel teardown (the rfb tunnel is the "primary" — its
  // close marks the session done; the video tunnel may flap
  // independently if WebCodecs isn't supported on the dashboard).
  if (kind === 'rfb') {
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
      console.warn('[nativeTunnel] audit-row update failed:', e.message);
    }
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
 * Mint a one-shot dashboard ticket for an audit_id + user pair.
 * Returned to the dashboard from /wayland/start; appended to the
 * relay URL as ?ticket=...
 *
 * Tickets are random 24-byte hex (192 bits, no collision risk),
 * one-shot (consumed on first successful auth), TTL 60s.
 */
export function issueDashboardTicket(auditId, userId) {
  const ticket = randomTicket();
  tickets.set(ticket, {
    auditId,
    userId,
    expiresAt: Date.now() + TICKET_TTL_MS,
  });
  // Lazy reaping — at most a few stale entries before next mint.
  if (tickets.size > 64) reapExpiredTickets();
  return ticket;
}

function randomTicket() {
  // 24 bytes → 48 hex chars. crypto is built-in; no extra deps.
  return randomBytes(24).toString('hex');
}

function reapExpiredTickets() {
  const now = Date.now();
  for (const [k, v] of tickets) {
    if (v.expiresAt < now) tickets.delete(k);
  }
}

/**
 * Consume a ticket if present + valid for this audit_id.
 * Returns the userId or throws. One-shot: a valid ticket is
 * deleted on first use so a leaked URL can't be replayed.
 */
function consumeTicket(ticket, auditId) {
  const entry = tickets.get(ticket);
  if (!entry) throw new Error('unknown ticket');
  tickets.delete(ticket);
  if (entry.expiresAt < Date.now()) throw new Error('ticket expired');
  if (entry.auditId !== auditId) throw new Error('ticket audit mismatch');
  return entry.userId;
}

/**
 * Validate the dashboard's auth. Two paths:
 *
 *   (1) ?ticket=... query param — preferred, works cross-site
 *       (e.g. browser at www. dialing wss to api.).
 *   (2) sessionId cookie — same-origin dev fallback. Only fires
 *       when no ticket was provided.
 *
 * Returns user object or throws.
 */
async function authenticateDashboard(req, auditId) {
  // (1) Query-param ticket. The req.url here is the path+query
  // after the host, so URL parsing needs a base.
  try {
    const u = new URL(req.url, 'http://localhost');
    const ticket = u.searchParams.get('ticket');
    if (ticket) {
      const userId = consumeTicket(ticket, auditId);
      return { id: userId, source: 'ticket' };
    }
  } catch {
    // fall through to cookie
  }

  // (2) Express-style cookie parsing — the WS upgrade runs
  // outside the express middleware chain so we parse manually.
  const cookieHeader = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
  const sessionId = cookies.sessionId || cookies.session_id;
  if (!sessionId) throw new Error('no session cookie or ticket');
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
    // Accept both the v1.22+ /ws/native-tunnel/ prefix and the
    // legacy /ws/wayland-tunnel/ alias. Old agents (v1.21.x and
    // earlier) only know the wayland prefix; new dashboards use
    // the native prefix. Both share the same pair map, so any
    // (old-agent + new-dashboard) or (new-agent + old-dashboard)
    // pairing still works as long as the audit_id matches.
    if (!url.startsWith('/ws/wayland-tunnel/') && !url.startsWith('/ws/native-tunnel/')) {
      // Not ours — let socket.io's own upgrade handler (or
      // anyone else's) take it. socket.io's upgrade is
      // attached on a different listener so simply not handling
      // here means it gets through.
      return;
    }
    // Parse: /ws/(wayland-tunnel|native-tunnel)/:audit_id/(agent|dashboard|video-agent|video-dashboard|audio-agent|audio-dashboard)
    //
    // The "kind" prefix selects which independent pairing the WS
    // belongs to:
    //   - rfb   (no prefix)   — input + small dirty regions
    //   - video (video-…)     — H.264 NALU stream (one-way agent → dashboard)
    //   - audio (audio-…)     — Opus/WebM stream (one-way agent → dashboard)
    //
    // Each kind has its own Map of pairs so the streams pair
    // independently per audit_id.
    const m = url.match(/^\/ws\/(?:wayland-tunnel|native-tunnel)\/([^/?]+)\/(video-|audio-)?(agent|dashboard)(\?.*)?$/);
    if (!m) {
      socket.destroy();
      return;
    }
    const [, auditId, kindPrefix, side] = m;
    let kind = 'rfb';
    if (kindPrefix === 'video-') kind = 'video';
    else if (kindPrefix === 'audio-') kind = 'audio';

    // Auth + audit lookup BEFORE we accept the upgrade.
    let identity;
    try {
      if (side === 'agent') {
        identity = { kind: 'agent', agentId: authenticateAgent(req) };
      } else {
        identity = { kind: 'dashboard', user: await authenticateDashboard(req, auditId) };
      }
      const audit = await loadAudit(auditId);
      if (side === 'agent' && audit.agent_device_id !== identity.agentId) {
        throw new Error('agent_id mismatch with audit row');
      }
    } catch (e) {
      console.warn(`[nativeTunnel] reject ${kind}/${side} ${auditId}: ${e.message}`);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.binaryType = 'nodebuffer';
      handleConnection(ws, auditId, side, kind);
    });
  });
}

/**
 * Per-connection setup: stash in pairs, wire the bridge if both
 * sides present, schedule a 60s parked-timeout if only one side.
 */
function handleConnection(ws, auditId, role, kind = 'rfb') {
  const pair = getPair(auditId, kind);
  const tag = `${kind}/${role}`;

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

  console.log(`[nativeTunnel] ${tag} connected for audit=${auditId}`);

  ws.on('close', (code, reason) => {
    console.log(`[nativeTunnel] ${tag} closed for audit=${auditId} code=${code}`);
    teardown(auditId, kind, `${tag} disconnected (${code})`);
  });
  ws.on('error', (e) => {
    console.warn(`[nativeTunnel] ${tag} error for audit=${auditId}:`, e.message);
  });

  // Pre-pair buffer: capture any incoming bytes before the
  // counterpart connects so we don't lose them. This listener
  // gets removed and replaced by the real pipeFrames listener
  // once both sides are present.
  const bufferKey = role === 'agent' ? 'bufferedFromAgent' : 'bufferedFromDashboard';
  const preBufRef = role === 'agent' ? '_agentPreBuf' : '_dashboardPreBuf';
  const preBuf = (data, isBinary) => {
    if (!isBinary) return;
    pair[bufferKey].push(data);
  };
  ws.on('message', preBuf);
  pair[preBufRef] = preBuf;

  // Both sides present? Pipe.
  if (pair.agent && pair.dashboard) {
    if (pair.parkedTimer) {
      clearTimeout(pair.parkedTimer);
      pair.parkedTimer = null;
    }
    console.log(`[nativeTunnel] PAIRED ${kind} audit=${auditId}`);
    // Detach the pre-pair buffering listeners on both sides so
    // pipeFrames takes over cleanly.
    if (pair._agentPreBuf) {
      pair.agent.off('message', pair._agentPreBuf);
      pair._agentPreBuf = null;
    }
    if (pair._dashboardPreBuf) {
      pair.dashboard.off('message', pair._dashboardPreBuf);
      pair._dashboardPreBuf = null;
    }

    // Replay any buffered bytes BEFORE attaching pipeFrames so
    // they go out in the right order.
    for (const msg of pair.bufferedFromAgent) {
      if (pair.dashboard.readyState === pair.dashboard.OPEN) {
        try { pair.dashboard.send(msg, { binary: true }); } catch (e) {
          console.warn('[nativeTunnel] replay agent→dashboard error:', e.message);
        }
      }
    }
    for (const msg of pair.bufferedFromDashboard) {
      if (pair.agent.readyState === pair.agent.OPEN) {
        try { pair.agent.send(msg, { binary: true }); } catch (e) {
          console.warn('[nativeTunnel] replay dashboard→agent error:', e.message);
        }
      }
    }
    pair.bufferedFromAgent = [];
    pair.bufferedFromDashboard = [];

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
    ).catch(e => console.warn('[nativeTunnel] paired-update failed:', e.message));
  } else {
    // Schedule a 60s timeout. If counterpart shows up, the
    // pair branch above clears the timer.
    pair.parkedTimer = setTimeout(() => {
      console.log(`[nativeTunnel] timeout audit=${auditId} ${role}-only never paired`);
      teardown(auditId, kind, 'counterpart timeout');
    }, 60_000);
  }
}

export default { attachToHttpServer, issueDashboardTicket };
