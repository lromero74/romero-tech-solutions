/**
 * Unified Authentication Middleware
 * Handles both traditional session tokens and AWS Amplify JWT tokens
 */

import { sessionService } from '../services/sessionService.js';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import dotenv from 'dotenv';
import { getPool } from '../config/database.js';

dotenv.config();

// Create Cognito JWT verifier (lazy-loaded)
let jwtVerifier = null;

const getJwtVerifier = () => {
  if (!jwtVerifier && process.env.AWS_USER_POOL_ID) {
    try {
      jwtVerifier = CognitoJwtVerifier.create({
        userPoolId: process.env.AWS_USER_POOL_ID,
        tokenUse: 'id',
        clientId: process.env.AWS_USER_POOL_CLIENT_ID,
      });
      console.log('✅ Cognito JWT verifier created successfully');
    } catch (error) {
      console.error('❌ Failed to create JWT verifier:', error);
    }
  }
  return jwtVerifier;
};

/**
 * Unified auth middleware that handles both authentication types
 */
export const unifiedAuthMiddleware = async (req, res, next) => {
  try {
    // Extract token from cookie or Authorization header
    const token = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');

    console.log(`🔍 [unifiedAuthMiddleware] Token received for ${req.path}:`, token ? `${token.substring(0, 20)}...` : 'None');

    if (!token) {
      console.warn(`⚠️ [unifiedAuthMiddleware] No token found for ${req.path}`);
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }

    // Check if it's a JWT token (AWS Amplify)
    if (token.includes('.')) {
      console.log('🔑 Detected JWT token format, attempting AWS Amplify verification...');
      // This looks like a JWT token
      try {
        const verifier = getJwtVerifier();
        if (!verifier) {
          console.error('❌ JWT verifier not configured, falling back to traditional auth');
          throw new Error('Cognito JWT verifier not configured');
        }

        // Verify the JWT token
        const payload = await verifier.verify(token);

        console.log(`🔐 AWS Amplify authenticated request from: ${payload.email || payload.sub}`);

        // Look up the employee by email
        const pool = await getPool();
        const result = await pool.query(
          'SELECT id, email, first_name, last_name FROM employees WHERE email = $1 AND is_active = true',
          [payload.email]
        );

        if (result.rows.length === 0) {
          return res.status(401).json({
            success: false,
            message: 'Employee not found',
            code: 'EMPLOYEE_NOT_FOUND'
          });
        }

        const employee = result.rows[0];

        // Get employee's role from employee_roles table
        const roleResult = await pool.query(`
          SELECT r.name as role_name
          FROM employee_roles er
          JOIN roles r ON er.role_id = r.id
          WHERE er.employee_id = $1
          LIMIT 1
        `, [employee.id]);

        const role = roleResult.rows.length > 0 ? roleResult.rows[0].role_name : null;

        // Add authenticated user info to request
        req.authUser = {
          id: employee.id,
          email: employee.email,
          firstName: employee.first_name,
          lastName: employee.last_name,
          role: role,
          authType: 'amplify'
        };

        req.sessionType = 'employee';
        req.session = {
          userId: employee.id,
          userEmail: employee.email
        };

        next();
      } catch (jwtError) {
        console.error('JWT verification failed:', jwtError);
        // Not a valid JWT, try traditional session
        await handleTraditionalSession(req, res, next, token);
      }
    } else {
      // Traditional session token
      await handleTraditionalSession(req, res, next, token);
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Handle traditional session token authentication
 */
async function handleTraditionalSession(req, res, next, sessionToken) {
  // Validate and automatically extend the session
  const session = await sessionService.validateSession(sessionToken);

  if (!session) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session',
      code: 'INVALID_SESSION'
    });
  }

  console.log(`🔐 Traditional session authenticated request from: ${session.userEmail}`);

  // Determine if this is an employee or client session
  const pool = await getPool();
  let authUser = null;
  let sessionType = null;

  // Try employee first
  const employeeResult = await pool.query(
    'SELECT id, email, first_name, last_name FROM employees WHERE id = $1',
    [session.userId]
  );

  if (employeeResult.rows.length > 0) {
    const employee = employeeResult.rows[0];

    // Get employee's role from employee_roles table
    const roleResult = await pool.query(`
      SELECT r.name as role_name
      FROM employee_roles er
      JOIN roles r ON er.role_id = r.id
      WHERE er.employee_id = $1
      LIMIT 1
    `, [employee.id]);

    const role = roleResult.rows.length > 0 ? roleResult.rows[0].role_name : null;

    authUser = {
      id: employee.id,
      email: employee.email,
      firstName: employee.first_name,
      lastName: employee.last_name,
      role: role,
      authType: 'traditional'
    };
    sessionType = 'employee';
  } else {
    // Try client
    const clientResult = await pool.query(
      'SELECT id, email, first_name, last_name, business_id FROM users WHERE id = $1',
      [session.userId]
    );

    if (clientResult.rows.length > 0) {
      const client = clientResult.rows[0];
      authUser = {
        id: client.id,
        email: client.email,
        firstName: client.first_name,
        lastName: client.last_name,
        business_id: client.business_id,
        role: 'client',
        authType: 'traditional'
      };
      sessionType = 'client';
    }
  }

  if (!authUser) {
    return res.status(401).json({
      success: false,
      message: 'User not found',
      code: 'USER_NOT_FOUND'
    });
  }

  // Add session info to request
  req.session = {
    sessionId: session.sessionId,
    userId: session.userId,
    userEmail: session.userEmail,
    expiresAt: session.expiresAt,
    lastActivity: session.lastActivity
  };

  req.authUser = authUser;
  req.sessionType = sessionType;

  next();
}

// Export the old name for backward compatibility
export const authMiddleware = unifiedAuthMiddleware;