/**
 * Permission Middleware
 *
 * Express middleware factory for protecting routes with role-based permissions.
 * Works in conjunction with authMiddleware (which must run first).
 *
 * Usage:
 *   import { requirePermission } from '../middleware/permissionMiddleware.js';
 *   router.post('/businesses', requirePermission('add.businesses.enable'), async (req, res) => { ... });
 *
 * Features:
 * - Requires authMiddleware to run first (sets req.session.userId)
 * - Logs all permission checks to audit log
 * - Returns standardized 403 error responses
 * - Includes permission key and reason in error response
 */

import { permissionService } from '../services/permissionService.js';

/**
 * Middleware factory for requiring a specific permission
 * @param {string} permissionKey - Permission key required (e.g., 'add.businesses.enable')
 * @param {object} options - Optional configuration
 * @param {function} options.getResourceId - Function to extract resource ID from request (req => resourceId)
 * @returns {function} Express middleware function
 */
export const requirePermission = (permissionKey, options = {}) => {
  return async (req, res, next) => {
    try {
      // Ensure user is authenticated (authMiddleware must run first)
      if (!req.session || !req.session.userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
      }

      const employeeId = req.session.userId;

      // Extract resource ID if function provided
      let resourceId = null;
      if (options.getResourceId && typeof options.getResourceId === 'function') {
        resourceId = options.getResourceId(req);
      }

      // Check permission
      const hasPermission = await permissionService.checkPermission(
        employeeId,
        permissionKey,
        { resourceId, skipAuditLog: false }
      );

      if (!hasPermission) {
        // Get user roles for error message
        const roles = await permissionService.getUserRoles(employeeId);
        const roleNames = roles.map(r => r.display_name).join(', ');

        // Log permission attempt with request details
        await permissionService.logPermissionAttempt(
          employeeId,
          permissionKey,
          'denied',
          {
            reason: 'Insufficient permissions',
            roles: roles.map(r => r.name),
            method: req.method,
            path: req.path,
            resourceId
          },
          req
        );

        return res.status(403).json({
          success: false,
          message: 'Permission denied',
          code: 'PERMISSION_DENIED',
          requiredPermission: permissionKey,
          userRoles: roleNames,
          reason: `Your role (${roleNames}) does not have the required permission: ${permissionKey}`
        });
      }

      // Log successful permission check
      const roles = await permissionService.getUserRoles(employeeId);
      await permissionService.logPermissionAttempt(
        employeeId,
        permissionKey,
        'granted',
        {
          roles: roles.map(r => r.name),
          method: req.method,
          path: req.path,
          resourceId
        },
        req
      );

      console.log(`🔐 Permission granted: ${permissionKey} for employee ${employeeId}`);

      // Permission granted, continue to route handler
      next();

    } catch (error) {
      console.error('❌ Error in permission middleware:', error);

      // Log error to audit log
      if (req.session && req.session.userId) {
        await permissionService.logPermissionAttempt(
          req.session.userId,
          permissionKey,
          'denied',
          {
            reason: 'Middleware error',
            error: error.message,
            method: req.method,
            path: req.path
          },
          req
        );
      }

      return res.status(500).json({
        success: false,
        message: 'Error checking permissions',
        code: 'PERMISSION_CHECK_ERROR',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};

/**
 * Middleware for "last record protection" - prevents deletion of last record without executive role
 * Use this BEFORE requirePermission middleware
 *
 * @param {string} resourceType - 'service_locations' or 'users'
 * @param {function} getBusinessId - Function to extract business ID from request (req => businessId)
 * @returns {function} Express middleware function
 */
export const requireLastRecordProtection = (resourceType, getBusinessId) => {
  return async (req, res, next) => {
    try {
      // Ensure user is authenticated
      if (!req.session || !req.session.userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
      }

      const employeeId = req.session.userId;
      const businessId = getBusinessId(req);

      if (!businessId) {
        return res.status(400).json({
          success: false,
          message: 'Business ID is required',
          code: 'MISSING_BUSINESS_ID'
        });
      }

      // Check last record protection
      const protection = await permissionService.checkLastRecordProtection(
        resourceType,
        businessId,
        employeeId
      );

      if (!protection.allowed) {
        const roles = await permissionService.getUserRoles(employeeId);

        // Log denied attempt
        await permissionService.logPermissionAttempt(
          employeeId,
          `delete.${resourceType}.last_record`,
          'denied',
          {
            reason: 'Last record protection',
            message: protection.message,
            count: protection.count,
            businessId,
            roles: roles.map(r => r.name)
          },
          req
        );

        return res.status(403).json({
          success: false,
          message: protection.message,
          code: 'LAST_RECORD_PROTECTION',
          count: protection.count,
          requiredRole: 'executive',
          reason: 'Cannot delete the last record without executive role'
        });
      }

      console.log(`✅ Last record protection passed for ${resourceType}`);

      // Protection check passed, continue
      next();

    } catch (error) {
      console.error('❌ Error in last record protection middleware:', error);

      return res.status(500).json({
        success: false,
        message: 'Error checking deletion eligibility',
        code: 'PROTECTION_CHECK_ERROR',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};

/**
 * Middleware to check if user is acting on their own resource (self-permission bypass)
 * If acting on self, skips permission check and continues. Otherwise, checks permission.
 *
 * @param {string} permissionKey - Permission key required for non-self actions
 * @param {function} getTargetUserId - Function to extract target user ID from request (req => userId)
 * @returns {function} Express middleware function
 */
export const requirePermissionOrSelf = (permissionKey, getTargetUserId) => {
  return async (req, res, next) => {
    try {
      // Ensure user is authenticated
      if (!req.session || !req.session.userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'NOT_AUTHENTICATED'
        });
      }

      const employeeId = req.session.userId;
      const targetUserId = getTargetUserId(req);

      // If acting on self, bypass permission check
      if (permissionService.isSelfAction(employeeId, targetUserId)) {
        console.log(`✅ Self-action detected, bypassing permission check for ${permissionKey}`);
        return next();
      }

      // Not acting on self, require permission
      return requirePermission(permissionKey)(req, res, next);

    } catch (error) {
      console.error('❌ Error in self-permission middleware:', error);

      return res.status(500).json({
        success: false,
        message: 'Error checking permissions',
        code: 'PERMISSION_CHECK_ERROR',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};

export default {
  requirePermission,
  requireLastRecordProtection,
  requirePermissionOrSelf
};