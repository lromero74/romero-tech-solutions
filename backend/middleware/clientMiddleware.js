import { getPool } from '../config/database.js';

/**
 * Client-specific middleware that enriches authentication context with business data
 * This middleware should be used after authMiddleware for client routes
 */
export const clientContextMiddleware = async (req, res, next) => {
  try {
    if (!req.user || !req.user.email) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
        code: 'NO_USER_CONTEXT'
      });
    }

    // Get client business information from database
    const pool = await getPool();
    const clientQuery = `
      SELECT
        u.id as client_id,
        u.business_id,
        u.business_id as service_location_id,
        'business' as access_level,
        true as is_active,
        'Business Client' as business_name,
        'Business Location' as location_name,
        true as is_headquarters
      FROM users u
      WHERE u.id = $1
    `;

    const result = await pool.query(clientQuery, [req.user.id]);

    if (result.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Client access not found or inactive',
        code: 'CLIENT_NOT_FOUND'
      });
    }

    const clientData = result.rows[0];

    // Enrich user context with client business information
    req.user = {
      ...req.user,
      clientId: clientData.client_id,
      businessId: clientData.business_id,
      serviceLocationId: clientData.service_location_id,
      accessLevel: clientData.access_level,
      businessName: clientData.business_name,
      locationName: clientData.location_name,
      isHeadquarters: clientData.is_headquarters,
      isActive: clientData.is_active
    };

    console.log(`🏢 Client context loaded for ${req.user.email}: ${clientData.business_name} (${clientData.access_level})`);

    next();

  } catch (error) {
    console.error('❌ Client context middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load client context',
      code: 'CLIENT_CONTEXT_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Middleware to validate client access level
 * @param {string|Array} requiredLevels - Required access level(s): 'business', 'location', or array of both
 */
export const requireClientAccess = (requiredLevels) => {
  return (req, res, next) => {
    if (!req.user || !req.user.accessLevel) {
      return res.status(403).json({
        success: false,
        message: 'Client access level not determined',
        code: 'NO_ACCESS_LEVEL'
      });
    }

    const userLevel = req.user.accessLevel;
    const allowedLevels = Array.isArray(requiredLevels) ? requiredLevels : [requiredLevels];

    if (!allowedLevels.includes(userLevel)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required level: ${allowedLevels.join(' or ')}. Your level: ${userLevel}`,
        code: 'INSUFFICIENT_ACCESS_LEVEL'
      });
    }

    console.log(`✅ Client access validated: ${req.user.email} has ${userLevel} access`);
    next();
  };
};

/**
 * Middleware to ensure business-level clients can access all locations
 * Location-level clients are restricted to their specific location
 */
export const enforceLocationAccess = (req, res, next) => {
  const requestedLocationId = req.body.serviceLocationId || req.query.serviceLocationId || req.params.serviceLocationId;

  // Business-level access can access any location in their business
  if (req.user.accessLevel === 'business') {
    console.log(`🏢 Business-level access granted for ${req.user.email}`);
    return next();
  }

  // Location-level access is restricted to their specific location
  if (req.user.accessLevel === 'location') {
    if (requestedLocationId && requestedLocationId !== req.user.serviceLocationId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only access your assigned location.',
        code: 'LOCATION_ACCESS_DENIED'
      });
    }

    console.log(`📍 Location-level access validated for ${req.user.email}`);
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Unknown access level',
    code: 'UNKNOWN_ACCESS_LEVEL'
  });
};

export default {
  clientContextMiddleware,
  requireClientAccess,
  enforceLocationAccess
};