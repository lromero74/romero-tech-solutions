import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

/**
 * Agent Authentication Middleware
 *
 * Validates JWT tokens for MSP agent devices
 * Agents authenticate using a permanent JWT token issued during registration
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

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      console.warn(`⚠️  [agentAuth] Invalid JWT token: ${jwtError.message}`);
      return res.status(401).json({
        success: false,
        message: 'Invalid agent token',
        code: 'INVALID_AGENT_TOKEN'
      });
    }

    // Verify this is an agent token (not a user session token)
    if (decoded.type !== 'agent') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type - expected agent token',
        code: 'WRONG_TOKEN_TYPE'
      });
    }

    // Verify agent exists and is active
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
      [decoded.agent_id, token]
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

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return next(new Error('Invalid agent token'));
    }

    // Verify this is an agent token
    if (decoded.type !== 'agent') {
      return next(new Error('Wrong token type - expected agent token'));
    }

    // Verify agent exists and is active
    const agentResult = await query(
      `SELECT
        id,
        business_id,
        service_location_id,
        device_name,
        is_active,
        soft_delete
      FROM agent_devices
      WHERE id = $1 AND agent_token = $2`,
      [decoded.agent_id, token]
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
