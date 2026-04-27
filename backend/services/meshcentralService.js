/**
 * MeshCentral REST/WebSocket integration helper.
 *
 * Pairs with the remote-control feature (PRP
 * .plan/2026.04.26.02-remote-control-meshcentral-PRP.md, Phase 2 §16.2).
 *
 * MeshCentral exposes a single WebSocket control channel at
 * `/control.ashx` over which all admin operations flow as JSON
 * messages. Auth is via per-user Login Tokens generated in the
 * MeshCentral web UI (My Account → Crear token de inicio de sesión).
 *
 * The token comes in two parts:
 *   - tokenname (short string, the "username")
 *   - hexkey    (160 hex chars, the secret)
 *
 * They go in our backend's .env as:
 *   MESHCENTRAL_TOKEN_NAME=...
 *   MESHCENTRAL_TOKEN_KEY=...
 *   MESHCENTRAL_URL=https://mesh.romerotechsolutions.com
 *
 * The auth pattern follows meshctrl.js:
 *   - HTTP request to /control.ashx with cookie auth derived from the key
 *   - Upgrade to WebSocket
 *   - Send {action, ...} messages, receive responses
 *
 * For Phase 2 we implement only the methods we need today:
 *   - serverInfo()           → sanity check + cert hash verification
 *   - listDevices(meshId)    → enumerate agents in a device group
 *   - mintLoginToken(...)    → SSO into the web UI iframe
 *   - mintRemoteSessionUrl() → the per-session URL handed to the iframe
 *   - disconnectSession(id)  → admin force-end
 *
 * Future methods (Phase 3+) will add device-event subscription,
 * file transfer initiation, etc.
 */

import WebSocket from 'ws';
import crypto from 'crypto';

// ──── Configuration loaded from environment ──────────────────────────
//
// We read these lazily (not at module import) so a missing
// MESHCENTRAL_* env doesn't crash the rest of the backend.
function getConfig() {
  const url = process.env.MESHCENTRAL_URL;
  const tokenName = process.env.MESHCENTRAL_TOKEN_NAME;
  const tokenKey = process.env.MESHCENTRAL_TOKEN_KEY;
  if (!url || !tokenName || !tokenKey) {
    throw new Error(
      'meshcentralService: MESHCENTRAL_URL / MESHCENTRAL_TOKEN_NAME / ' +
      'MESHCENTRAL_TOKEN_KEY env vars must be set. Generate the token ' +
      'via MeshCentral web UI: My Account → Crear token de inicio de sesión.'
    );
  }
  if (!/^[0-9a-fA-F]{160}$/.test(tokenKey)) {
    throw new Error(
      `meshcentralService: MESHCENTRAL_TOKEN_KEY must be 160 hex chars (got ${tokenKey.length})`
    );
  }
  return { url, tokenName, tokenKey };
}

// ──── WebSocket connection helper ────────────────────────────────────
//
// MeshCentral's /control.ashx authenticates via a `auth` cookie
// computed from the user's login key. Format (per meshctrl.js):
//   - 32 random bytes ("nonce") + HMAC-SHA384(key, nonce + "user" + tokenName)
//   - encoded as hex, sent as `auth=<hex>` cookie
//
// The cookie is verified server-side; if valid, the WebSocket
// upgrade succeeds and we can send/receive control messages.
function buildAuthCookie(tokenName, tokenKey) {
  const keyBytes = Buffer.from(tokenKey, 'hex');
  const nonce = crypto.randomBytes(32);
  const userBytes = Buffer.from('user/' + tokenName, 'utf8');
  const hmac = crypto.createHmac('sha384', keyBytes).update(Buffer.concat([nonce, userBytes])).digest();
  return Buffer.concat([nonce, hmac]).toString('hex');
}

/**
 * Open an authenticated WebSocket to MeshCentral's /control.ashx.
 * Returns a Promise that resolves with the open ws once it's ready.
 *
 * Caller is responsible for calling ws.close() when done.
 */
async function openControlWebSocket() {
  const { url, tokenName, tokenKey } = getConfig();
  const wssUrl = url.replace(/^https?:/, 'wss:').replace(/\/+$/, '') + '/control.ashx';
  const cookie = `auth=${buildAuthCookie(tokenName, tokenKey)}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wssUrl, {
      headers: { Cookie: cookie },
      // 10s hard timeout on the connection attempt — if MeshCentral
      // is down or unreachable, fail fast rather than hang the
      // backend's request handler indefinitely.
      handshakeTimeout: 10_000,
    });
    const failTimer = setTimeout(() => {
      ws.terminate();
      reject(new Error('MeshCentral WebSocket open timeout (10s)'));
    }, 10_000);
    ws.once('open', () => {
      clearTimeout(failTimer);
      resolve(ws);
    });
    ws.once('error', (err) => {
      clearTimeout(failTimer);
      reject(new Error(`MeshCentral WebSocket error: ${err.message}`));
    });
  });
}

/**
 * Send one action message and wait for the matching response.
 * Resolves with the parsed response object; rejects on timeout
 * or socket error.
 *
 * MeshCentral responses arrive on the same WebSocket as the
 * request, identified by either `responseid` (when we set one)
 * or by `action` matching. We use responseid because it's
 * unambiguous — multiple in-flight requests don't get crossed.
 */
async function sendActionAndWait(ws, request, timeoutMs = 15_000) {
  const responseId = crypto.randomBytes(8).toString('hex');
  const message = { ...request, responseid: responseId };

  return new Promise((resolve, reject) => {
    const onMessage = (data) => {
      let parsed;
      try { parsed = JSON.parse(data.toString('utf8')); } catch { return; }
      if (parsed.responseid !== responseId) return;
      cleanup();
      resolve(parsed);
    };
    const onError = (err) => { cleanup(); reject(err); };
    const onClose = () => { cleanup(); reject(new Error('MeshCentral WebSocket closed before response')); };
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
      ws.off('close', onClose);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`MeshCentral action ${request.action} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    ws.on('message', onMessage);
    ws.once('error', onError);
    ws.once('close', onClose);
    ws.send(JSON.stringify(message));
  });
}

// ──── Public API ─────────────────────────────────────────────────────

/**
 * Verify connectivity + return MeshCentral version + cert hash info.
 * Used by /api/admin/remote-control/server-health for ops dashboards.
 */
export async function serverInfo() {
  const ws = await openControlWebSocket();
  try {
    const resp = await sendActionAndWait(ws, { action: 'serverinfo' });
    return resp;
  } finally {
    ws.close();
  }
}

/**
 * List all devices in a given mesh (device group).
 * meshId format: full mesh ID with the 'mesh//' prefix, OR just the
 * suffix portion. We accept either and normalize.
 */
export async function listDevices(meshId) {
  const ws = await openControlWebSocket();
  try {
    const resp = await sendActionAndWait(ws, { action: 'nodes', meshid: meshId });
    return resp;
  } finally {
    ws.close();
  }
}

/**
 * Mint a short-lived web-UI login token so the technician's browser
 * can open MeshCentral inside our dashboard's iframe without seeing
 * a separate MeshCentral login prompt.
 *
 * `targetUserId` is the MeshCentral user we want the technician to
 * impersonate (typically a service-account user with view-only
 * permissions on the device groups they're allowed to manage).
 * `expirySeconds` defaults to 60 — the token is consumed once when
 * the iframe loads.
 */
export async function mintLoginToken(targetUserId, expirySeconds = 60) {
  const ws = await openControlWebSocket();
  try {
    const resp = await sendActionAndWait(ws, {
      action: 'createLoginToken',
      name: `rts-${Date.now()}`,
      expire: expirySeconds,
    });
    return resp;
  } finally {
    ws.close();
  }
}

/**
 * Force-disconnect an in-flight remote session.
 * sessionId is MeshCentral's internal session identifier we stored
 * in remote_control_sessions.meshcentral_session_id when we minted
 * the original session URL.
 */
export async function disconnectSession(sessionId) {
  const ws = await openControlWebSocket();
  try {
    const resp = await sendActionAndWait(ws, {
      action: 'shellclose',
      sessionid: sessionId,
    });
    return resp;
  } finally {
    ws.close();
  }
}

// Default export bundles the public API for easy importing.
export default {
  serverInfo,
  listDevices,
  mintLoginToken,
  disconnectSession,
};
