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

      // TODO: Add role checking logic here when roles are implemented
      // For now, we'll assume the user has the required role if they're authenticated
      console.log(`🔐 Role check passed for user: ${req.user.email}`);
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
export const requireAdmin = requireRole(['admin']);

export default authMiddleware;