import { sessionService } from '../services/sessionService.js';

/**
 * Authentication middleware to protect routes
 * Validates session tokens and automatically extends valid sessions
 */
export const authMiddleware = async (req, res, next) => {
  try {
    // Check for session token in HttpOnly cookie first, then fallback to Authorization header
    const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      console.warn(`⚠️ [authMiddleware] No session token found for ${req.path}`);
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }

    // Validate and automatically extend the session
    const session = await sessionService.validateSession(sessionToken);

    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session',
        code: 'INVALID_SESSION'
      });
    }

    // Add session info to request for use in route handlers
    req.session = {
      sessionId: session.sessionId,
      userId: session.userId,
      userEmail: session.userEmail,
      expiresAt: session.expiresAt,
      lastActivity: session.lastActivity
    };

    // Add user info to request (useful for authorization)
    req.user = {
      id: session.userId,
      email: session.userEmail
    };

    console.log(`🔐 Authenticated request from user: ${session.userEmail}`);

    // Continue to the protected route
    next();

  } catch (error) {
    console.error('Authentication middleware error:', error);

    return res.status(500).json({
      success: false,
      message: 'Authentication failed',
      code: 'AUTH_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Optional middleware that validates session but doesn't require it
 * Useful for routes that work for both authenticated and anonymous users
 */
export const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const sessionToken = req.headers.authorization?.replace('Bearer ', '');

    if (sessionToken) {
      // Try to validate session, but don't fail if it's invalid
      const session = await sessionService.validateSession(sessionToken);

      if (session) {
        req.session = {
          sessionId: session.sessionId,
          userId: session.userId,
          userEmail: session.userEmail,
          expiresAt: session.expiresAt,
          lastActivity: session.lastActivity
        };

        req.user = {
          id: session.userId,
          email: session.userEmail
        };

        console.log(`🔐 Optional auth - authenticated user: ${session.userEmail}`);
      } else {
        console.log('🔐 Optional auth - invalid session, proceeding anonymously');
      }
    } else {
      console.log('🔐 Optional auth - no token, proceeding anonymously');
    }

    // Always continue, regardless of authentication status
    next();

  } catch (error) {
    console.error('Optional authentication middleware error:', error);
    // Don't fail the request, just proceed without authentication
    next();
  }
};

/**
 * Role-based authorization middleware factory
 * Use after authMiddleware to check user roles
 */
export const requireRole = (requiredRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required for role check',
          code: 'NO_AUTH'
        });
      }

      const pool = (await import('../config/database.js')).default;

      // First try to find user in employees table
      const employeeResult = await pool.query(
        `SELECT r.name as role
         FROM employees e
         JOIN employee_roles er ON e.id = er.employee_id
         JOIN roles r ON er.role_id = r.id
         WHERE e.id = $1 AND e.is_active = true`,
        [req.user.id]
      );

      let userRole;

      if (employeeResult.rows.length > 0) {
        // Found in employees table
        userRole = employeeResult.rows[0].role;
      } else {
        // Fall back to users table for clients
        const userResult = await pool.query(
          'SELECT role FROM users WHERE id = $1',
          [req.user.id]
        );

        if (userResult.rows.length === 0) {
          return res.status(403).json({
            success: false,
            message: 'User not found',
            code: 'USER_NOT_FOUND'
          });
        }

        userRole = userResult.rows[0].role;
      }

      // Check if user has one of the required roles
      if (!requiredRoles.includes(userRole)) {
        console.warn(`🚫 Role check failed for user ${req.user.email}: has ${userRole}, needs one of [${requiredRoles.join(', ')}]`);
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
          required: requiredRoles,
          actual: userRole
        });
      }

      // Attach role to request for future use
      req.user.role = userRole;
      console.log(`🔐 Role check passed for user: ${req.user.email} (${userRole})`);
      next();

    } catch (error) {
      console.error('Role authorization error:', error);
      return res.status(403).json({
        success: false,
        message: 'Authorization failed',
        code: 'ROLE_ERROR',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};

/**
 * Admin role requirement middleware
 */
export const requireAdmin = requireRole(['admin', 'manager', 'executive']);

/**
 * Executive role requirement middleware
 */
export const requireExecutive = requireRole(['executive']);

/**
 * Admin or Executive role requirement middleware
 */
export const requireAdminOrExecutive = requireRole(['admin', 'manager', 'executive']);

/**
 * Employee role requirement middleware (any employee role)
 */
export const requireEmployee = requireRole(['admin', 'executive', 'manager', 'technician', 'employee']);

export default authMiddleware;