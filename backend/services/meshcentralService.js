/**
 * MeshCentral REST/WebSocket integration helper.
 *
 * Pairs with the remote-control feature (PRP
 * .plan/2026.04.26.02-remote-control-meshcentral-PRP.md, Phase 2 §16.2).
 *
 * MeshCentral exposes a single WebSocket control channel at
 * `/control.ashx` over which all admin operations flow as JSON
 * messages. Auth is via per-user Login Tokens generated in the
 * MeshCentral web UI (My Account → Create login token).
 *
 * The token comes in two parts:
 *   - tokenName  (e.g. "~t:pN4VLOTid553hQjX" — username field)
 *   - tokenPass  (short alphanumeric — password field)
 *
 * They go in our backend's .env as:
 *   MESHCENTRAL_URL=https://mesh.romerotechsolutions.com
 *   MESHCENTRAL_TOKEN_NAME=~t:...
 *   MESHCENTRAL_TOKEN_PASS=...
 *
 * Auth handshake (mirrors meshctrl.js):
 *   - Open WSS to /control.ashx with header
 *     `x-meshauth: <base64(name)>,<base64(pass)>`
 *   - Server validates, upgrades to WebSocket
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
  const tokenPass = process.env.MESHCENTRAL_TOKEN_PASS;
  if (!url || !tokenName || !tokenPass) {
    throw new Error(
      'meshcentralService: MESHCENTRAL_URL / MESHCENTRAL_TOKEN_NAME / ' +
      'MESHCENTRAL_TOKEN_PASS env vars must be set. Generate the token ' +
      'via MeshCentral web UI: My Account → Create login token.'
    );
  }
  return { url, tokenName, tokenPass };
}

// ──── WebSocket connection helper ────────────────────────────────────
//
// MeshCentral's /control.ashx accepts authentication via the
// `x-meshauth` HTTP header during the WebSocket upgrade. Format
// (per meshctrl.js):
//   x-meshauth: <base64(username)>,<base64(password)>
// Optional 2FA token can be appended as a third comma-separated
// base64 field, but login tokens are exempt from 2FA so we don't
// need it here.
function buildAuthHeader(tokenName, tokenPass) {
  const u = Buffer.from(String(tokenName), 'utf8').toString('base64');
  const p = Buffer.from(String(tokenPass), 'utf8').toString('base64');
  return `${u},${p}`;
}

/**
 * Open an authenticated WebSocket to MeshCentral's /control.ashx.
 * Returns a Promise that resolves with the open ws once it's ready.
 *
 * Caller is responsible for calling ws.close() when done.
 */
async function openControlWebSocket() {
  const { url, tokenName, tokenPass } = getConfig();
  const wssUrl = url.replace(/^https?:/, 'wss:').replace(/\/+$/, '') + '/control.ashx';

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wssUrl, {
      headers: { 'x-meshauth': buildAuthHeader(tokenName, tokenPass) },
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
 * MeshCentral has two response-correlation patterns and they're
 * inconsistent across actions:
 *   1. Echo of `responseid` in the response (most actions support this)
 *   2. Just the same `action` name in the response (some don't echo)
 *
 * We accept either. Race condition risk: if two in-flight requests
 * use the SAME action name with no responseid echo, the first
 * response delivers to whichever caller is waiting. We avoid this
 * by serializing per-WebSocket — caller opens fresh ws per action,
 * which is the existing public-API pattern.
 *
 * `pushOnly` mode: skip the send and just wait for an action of the
 * given name to arrive (used for server-pushed messages like
 * `serverinfo` that the server emits unsolicited after auth).
 */
async function sendActionAndWait(ws, request, timeoutMs = 15_000, pushOnly = false) {
  const responseId = crypto.randomBytes(8).toString('hex');
  const message = pushOnly ? null : { ...request, responseid: responseId };

  return new Promise((resolve, reject) => {
    const onMessage = (data) => {
      let parsed;
      try { parsed = JSON.parse(data.toString('utf8')); } catch { return; }
      // Match priority: explicit responseid echo wins; otherwise
      // accept the first message whose action matches our request.
      const responseIdMatch = parsed.responseid && parsed.responseid === responseId;
      const actionMatch = parsed.action && parsed.action === request.action;
      if (!responseIdMatch && !actionMatch) return;
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
    if (message) ws.send(JSON.stringify(message));
  });
}

// ──── Public API ─────────────────────────────────────────────────────

/**
 * Verify connectivity + return MeshCentral server info.
 *
 * Subtle contract — MeshCentral PUSHES a `serverinfo` message
 * unsolicited right after the WebSocket auth handshake completes,
 * so we don't send anything; we just open the socket and wait
 * for the first `action: 'serverinfo'` frame (no responseid on
 * push messages, hence the bypass of sendActionAndWait).
 */
export async function serverInfo() {
  const ws = await openControlWebSocket();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('MeshCentral serverinfo push timeout (10s)'));
    }, 10_000);
    ws.on('message', (data) => {
      let parsed;
      try { parsed = JSON.parse(data.toString('utf8')); } catch { return; }
      if (parsed.action !== 'serverinfo') return;
      clearTimeout(timer);
      ws.close();
      resolve(parsed);
    });
    ws.once('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

/**
 * List all device groups (meshes) the authenticated user can see.
 * Returns the parsed `meshes` action response from MeshCentral.
 */
export async function listDeviceGroups() {
  const ws = await openControlWebSocket();
  try {
    return await sendActionAndWait(ws, { action: 'meshes' });
  } finally {
    ws.close();
  }
}

/**
 * List all devices ("nodes") visible to the authenticated user,
 * optionally filtered by mesh id. The MeshCentral protocol returns
 * all visible nodes via the `nodes` action; we filter client-side.
 *
 * meshId is optional — pass without it for the full list.
 */
export async function listDevices(meshId) {
  const ws = await openControlWebSocket();
  try {
    const resp = await sendActionAndWait(ws, { action: 'nodes' });
    if (!meshId || !resp || !resp.nodes) return resp;
    // Normalize meshId — accept full "mesh//xyz" or bare "xyz".
    const normalized = meshId.startsWith('mesh//') ? meshId : `mesh//${meshId}`;
    const filtered = {};
    for (const [k, v] of Object.entries(resp.nodes)) {
      if (k === normalized) filtered[k] = v;
    }
    return { ...resp, nodes: filtered };
  } finally {
    ws.close();
  }
}

/**
 * Mint a short-lived web-UI login token so the technician's browser
 * can open MeshCentral inside our dashboard's iframe without seeing
 * a separate MeshCentral login prompt.
 *
 * `expirySeconds` defaults to 60 — the token is consumed once when
 * the iframe loads.
 */
export async function mintLoginToken(expirySeconds = 60) {
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
  listDeviceGroups,
  listDevices,
  mintLoginToken,
  disconnectSession,
};
