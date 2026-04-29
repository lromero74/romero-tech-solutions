import { query } from '../config/database.js';
import { recordObservation as recordWanIpObservation } from '../services/wanIpService.js';

/**
 * Agent Authentication Middleware
 *
 * Validates agent device tokens against the agent_devices.agent_token
 * column via literal equality. The token is an opaque random string
 * (48 random bytes, base64url-encoded; ~64 chars). Tokens are issued
 * at registration time and stored verbatim in the DB; matching the
 * Authorization header against that column is sufficient — there is
 * no signing key, no expiration check, and no JWT decode.
 *
 * Why DB equality instead of JWT-with-signature:
 *
 *   1. Revocability — clearing or rotating a single agent's token in
 *      the DB invalidates that one device immediately, with no need
 *      to rotate a global signing key (which would invalidate every
 *      agent simultaneously).
 *   2. Decoupling — global JWT_SECRET rotation no longer breaks
 *      agents. Their stored token is the source of truth; rotating
 *      JWT_SECRET only affects user sessions and short-lived magic
 *      links, both of which tolerate it.
 *   3. Simplicity — no expiration semantics to reason about. An
 *      agent's token is valid until the row says otherwise.
 *
 * Pre-2026-04-29 the middleware also required a successful jwt.verify
 * with JWT_SECRET. That check was redundant on top of the DB equality
 * (forging a token still required the literal stored value, which
 * the JWT signature didn't help with), and made global rotation a
 * breaking change. Legacy JWT-format tokens already in the DB
 * continue to work transparently — the column stores them verbatim
 * and the equality check is content-agnostic.
 */
export const authenticateAgent = async (req, res, next) => {
  try {
    // Check for Bearer token in Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Agent authentication required',
        code: 'NO_AGENT_TOKEN'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Pull agent_id from the URL — every route that uses this
    // middleware is mounted under /api/agents/:agent_id/... so the
    // param is always present.
    const agentId = req.params.agent_id;

    if (!agentId) {
      return res.status(401).json({
        success: false,
        message: 'Missing agent_id in route',
        code: 'NO_AGENT_ID'
      });
    }

    // Verify agent exists, is active, and the supplied token matches
    // the stored row. Token equality is the security check; the id
    // is defense-in-depth (rules out cross-agent token reuse on the
    // off-chance two rows ever shared a token).
    const agentResult = await query(
      `SELECT
        id,
        business_id,
        service_location_id,
        device_name,
        device_type,
        os_type,
        status,
        monitoring_enabled,
        is_active,
        soft_delete
      FROM agent_devices
      WHERE id = $1 AND agent_token = $2`,
      [agentId, token]
    );

    if (agentResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Agent device not found or token mismatch',
        code: 'AGENT_NOT_FOUND'
      });
    }

    const agent = agentResult.rows[0];

    // Check if agent is active and not soft-deleted
    if (!agent.is_active || agent.soft_delete) {
      return res.status(403).json({
        success: false,
        message: 'Agent device is disabled',
        code: 'AGENT_DISABLED'
      });
    }

    // Attach agent info to request for use in route handlers
    req.agent = {
      id: agent.id,
      business_id: agent.business_id,
      service_location_id: agent.service_location_id,
      device_name: agent.device_name,
      device_type: agent.device_type,
      os_type: agent.os_type,
      status: agent.status,
      monitoring_enabled: agent.monitoring_enabled
    };

    console.log(`🤖 Agent authenticated: ${agent.device_name} (${agent.id})`);

    // Stage 2.7 WAN IP change tracking — fire-and-forget so a slow DB
    // write here can't slow down the auth path (or fail it).
    // req.ip is the express-resolved remote IP (honors trust proxy).
    recordWanIpObservation(agent.id, agent.business_id, req.ip).catch(err => {
      console.error(`⚠️ wan-ip record failed for agent ${agent.id}:`, err);
    });

    // Continue to the protected route
    next();

  } catch (error) {
    console.error('Agent authentication middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Agent authentication failed',
      code: 'AGENT_AUTH_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Verify agent matches the agent_id parameter in the route
 * Use after authenticateAgent middleware
 */
export const requireAgentMatch = (req, res, next) => {
  const routeAgentId = req.params.agent_id;

  if (!req.agent) {
    return res.status(401).json({
      success: false,
      message: 'Agent authentication required',
      code: 'NO_AGENT'
    });
  }

  if (req.agent.id !== routeAgentId) {
    console.warn(`⚠️  [agentAuth] Agent ID mismatch: token=${req.agent.id}, route=${routeAgentId}`);
    return res.status(403).json({
      success: false,
      message: 'Agent ID mismatch - you can only access your own resources',
      code: 'AGENT_ID_MISMATCH'
    });
  }

  next();
};

/**
 * WebSocket authentication for agents
 * Used by Socket.IO middleware to authenticate agent connections
 */
export const authenticateAgentWebSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      return next(new Error('Agent authentication token required'));
    }

    // Look up by token alone. The 384 bits of entropy in an opaque
    // agent token make collision astronomically unlikely; a query
    // returning != 1 row is treated as authentication failure
    // regardless. Legacy JWT-format tokens still work because the
    // column stores them verbatim.
    const agentResult = await query(
      `SELECT
        id,
        business_id,
        service_location_id,
        device_name,
        is_active,
        soft_delete
      FROM agent_devices
      WHERE agent_token = $1`,
      [token]
    );

    if (agentResult.rows.length === 0) {
      return next(new Error('Agent device not found'));
    }

    const agent = agentResult.rows[0];

    if (!agent.is_active || agent.soft_delete) {
      return next(new Error('Agent device is disabled'));
    }

    // Attach agent info to socket for use in event handlers
    socket.agentId = agent.id;
    socket.businessId = agent.business_id;
    socket.serviceLocationId = agent.service_location_id;
    socket.deviceName = agent.device_name;

    console.log(`🤖 Agent WebSocket authenticated: ${agent.device_name} (${agent.id})`);

    next();

  } catch (error) {
    console.error('Agent WebSocket authentication error:', error);
    next(new Error('Agent authentication failed'));
  }
};

export default {
  authenticateAgent,
  requireAgentMatch,
  authenticateAgentWebSocket
};
