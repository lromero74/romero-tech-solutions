/**
 * Permission Service
 *
 * Centralized authorization service for role-based permission checking.
 * Handles permission lookups, role validation, last-record protection, and audit logging.
 *
 * Key Features:
 * - Executive role ALWAYS has all permissions (enforced in code)
 * - Permission caching for performance (5-minute TTL)
 * - Audit logging for all permission checks
 * - Last-record protection logic for destructive operations
 * - Self-permission bypass for user editing their own profile
 *
 * Usage:
 *   import { permissionService } from '../services/permissionService.js';
 *   const hasPermission = await permissionService.checkPermission(employeeId, 'add.businesses.enable');
 */

import { query } from '../config/database.js';

class PermissionService {
  constructor() {
    // In-memory cache for user permissions (TTL: 5 minutes)
    this.permissionCache = new Map();
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    // Role privilege levels (for reference only - no inheritance)
    // Executive role always has all permissions (enforced separately)
    this.roleLevels = {
      'executive': 5,
      'admin': 4,
      'manager': 3,
      'sales': 2,
      'technician': 1
    };
  }

  /**
   * Check if an employee has a specific permission
   * @param {string} employeeId - Employee UUID
   * @param {string} permissionKey - Permission key (e.g., 'add.businesses.enable')
   * @param {object} options - Optional parameters { resourceId, skipAuditLog }
   * @returns {Promise<boolean>} - True if permission granted
   */
  async checkPermission(employeeId, permissionKey, options = {}) {
    const { resourceId = null, skipAuditLog = false } = options;

    try {
      console.log(`🔐 Checking permission: ${permissionKey} for employee ${employeeId}`);

      // Get employee roles
      const roles = await this.getUserRoles(employeeId);

      if (roles.length === 0) {
        console.log(`⚠️  Employee ${employeeId} has no roles assigned`);
        if (!skipAuditLog) {
          await this.logPermissionAttempt(employeeId, permissionKey, 'denied', {
            reason: 'No roles assigned',
            resourceId
          });
        }
        return false;
      }

      // Check if user has executive role (always has all permissions)
      const hasExecutiveRole = await this.hasRole(employeeId, 'executive');
      if (hasExecutiveRole) {
        console.log(`✅ Executive role detected - permission granted`);
        if (!skipAuditLog) {
          await this.logPermissionAttempt(employeeId, permissionKey, 'granted', {
            reason: 'Executive role',
            roles: roles.map(r => r.name),
            resourceId
          });
        }
        return true;
      }

      // Check permission in database
      const hasPermission = await this._checkPermissionInDatabase(employeeId, permissionKey);

      if (hasPermission) {
        console.log(`✅ Permission granted: ${permissionKey}`);
      } else {
        console.log(`❌ Permission denied: ${permissionKey}`);
      }

      if (!skipAuditLog) {
        await this.logPermissionAttempt(employeeId, permissionKey, hasPermission ? 'granted' : 'denied', {
          roles: roles.map(r => r.name),
          resourceId
        });
      }

      return hasPermission;

    } catch (error) {
      console.error('❌ Error checking permission:', error);
      // Fail-safe: Deny permission on error (security over convenience)
      if (!skipAuditLog) {
        await this.logPermissionAttempt(employeeId, permissionKey, 'denied', {
          reason: 'Error during permission check',
          error: error.message,
          resourceId
        });
      }
      return false;
    }
  }

  /**
   * Check permission in database (with caching and role inheritance)
   * @private
   */
  async _checkPermissionInDatabase(employeeId, permissionKey) {
    // Check cache first
    const cacheKey = `${employeeId}:${permissionKey}`;
    const cached = this.permissionCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`📦 Cache hit for ${permissionKey}`);
      return cached.hasPermission;
    }

    // Get employee's role(s) - should only be one role per employee
    const userRoles = await this.getUserRoles(employeeId);
    if (userRoles.length === 0) {
      return false;
    }

    // Get all roles to check (explicit permissions only, no inheritance)
    const rolesToCheck = userRoles.map(r => r.name);

    console.log(`🔍 Checking permission ${permissionKey} for roles: ${rolesToCheck.join(', ')}`);

    // Query database for explicitly granted permissions
    const result = await query(`
      SELECT COUNT(*) as count
      FROM roles r
      JOIN role_permissions rp ON r.id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE r.name = ANY($1::text[])
        AND p.permission_key = $2
        AND rp.is_granted = true
        AND p.is_active = true
    `, [rolesToCheck, permissionKey]);

    const hasPermission = parseInt(result.rows[0].count) > 0;

    // Cache the result
    this.permissionCache.set(cacheKey, {
      hasPermission,
      timestamp: Date.now()
    });

    return hasPermission;
  }

  /**
   * Get all permissions for an employee (explicit permissions only)
   * @param {string} employeeId - Employee UUID
   * @returns {Promise<string[]>} - Array of permission keys
   */
  async getUserPermissions(employeeId) {
    try {
      // Check if executive (has all permissions)
      const hasExecutiveRole = await this.hasRole(employeeId, 'executive');
      if (hasExecutiveRole) {
        // Return all active permissions
        const result = await query(`
          SELECT permission_key FROM permissions WHERE is_active = true ORDER BY permission_key
        `);
        return result.rows.map(row => row.permission_key);
      }

      // Get employee's role(s) - should only be one
      const userRoles = await this.getUserRoles(employeeId);
      if (userRoles.length === 0) {
        return [];
      }

      // Get all roles to check (explicit permissions only, no inheritance)
      const rolesToCheck = userRoles.map(r => r.name);

      console.log(`📋 Fetching permissions for roles: ${rolesToCheck.join(', ')}`);

      // Query employee's explicitly granted permissions
      const result = await query(`
        SELECT DISTINCT p.permission_key
        FROM roles r
        JOIN role_permissions rp ON r.id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE r.name = ANY($1::text[])
          AND rp.is_granted = true
          AND p.is_active = true
        ORDER BY p.permission_key
      `, [rolesToCheck]);

      return result.rows.map(row => row.permission_key);

    } catch (error) {
      console.error('Error fetching user permissions:', error);
      return [];
    }
  }

  /**
   * Get all roles for an employee
   * @param {string} employeeId - Employee UUID
   * @returns {Promise<object[]>} - Array of role objects { id, name, display_name }
   */
  async getUserRoles(employeeId) {
    try {
      const result = await query(`
        SELECT r.id, r.name, r.display_name
        FROM employee_roles er
        JOIN roles r ON er.role_id = r.id
        WHERE er.employee_id = $1
          AND r.is_active = true
        ORDER BY r.sort_order
      `, [employeeId]);

      return result.rows;

    } catch (error) {
      console.error('Error fetching user roles:', error);
      return [];
    }
  }

  /**
   * Check if employee has a specific role
   * @param {string} employeeId - Employee UUID
   * @param {string} roleName - Role name (e.g., 'executive', 'admin')
   * @returns {Promise<boolean>}
   */
  async hasRole(employeeId, roleName) {
    try {
      const result = await query(`
        SELECT COUNT(*) as count
        FROM employee_roles er
        JOIN roles r ON er.role_id = r.id
        WHERE er.employee_id = $1
          AND r.name = $2
          AND r.is_active = true
      `, [employeeId, roleName]);

      return parseInt(result.rows[0].count) > 0;

    } catch (error) {
      console.error('Error checking role:', error);
      return false;
    }
  }

  /**
   * Check "last record protection" for destructive operations
   * Prevents deletion of last service location or last client without executive role
   *
   * @param {string} resourceType - 'service_locations' or 'users'
   * @param {string} businessId - Business UUID
   * @param {string} employeeId - Employee UUID performing the operation
   * @returns {Promise<{ allowed: boolean, message?: string, count?: number }>}
   */
  async checkLastRecordProtection(resourceType, businessId, employeeId) {
    try {
      let count = 0;

      // Count active, non-deleted records
      if (resourceType === 'service_locations') {
        const result = await query(`
          SELECT COUNT(*) as count
          FROM service_locations
          WHERE business_id = $1
            AND is_active = true
            AND soft_delete = false
            AND is_headquarters = false
        `, [businessId]);
        count = parseInt(result.rows[0].count);
      } else if (resourceType === 'users') {
        const result = await query(`
          SELECT COUNT(*) as count
          FROM users
          WHERE business_id = $1
            AND is_active = true
            AND soft_delete = false
        `, [businessId]);
        count = parseInt(result.rows[0].count);
      } else {
        return {
          allowed: false,
          message: `Invalid resource type: ${resourceType}`
        };
      }

      // If more than 1 record, deletion is allowed
      if (count > 1) {
        return { allowed: true, count };
      }

      // If exactly 1 record left, check if user has executive role
      const hasExecutiveRole = await this.hasRole(employeeId, 'executive');

      if (hasExecutiveRole) {
        return { allowed: true, count };
      }

      // Deny deletion of last record
      const resourceName = resourceType === 'service_locations' ? 'service location' : 'client';
      return {
        allowed: false,
        count,
        message: `Cannot delete the last ${resourceName} for this business. Executive role required.`
      };

    } catch (error) {
      console.error('Error checking last record protection:', error);
      return {
        allowed: false,
        message: 'Error checking deletion eligibility'
      };
    }
  }

  /**
   * Log permission attempt to audit log
   * @param {string} employeeId - Employee UUID
   * @param {string} permissionKey - Permission key attempted
   * @param {string} result - 'granted' or 'denied'
   * @param {object} details - Additional details (reason, roles, resourceId, etc.)
   * @param {object} req - Express request object (optional, for IP and user agent)
   */
  async logPermissionAttempt(employeeId, permissionKey, result, details = {}, req = null) {
    try {
      // Get primary role used for decision
      const roles = await this.getUserRoles(employeeId);
      const primaryRoleId = roles.length > 0 ? roles[0].id : null;

      const ipAddress = req ? req.ip || req.connection?.remoteAddress || null : null;
      const userAgent = req ? req.headers['user-agent'] || null : null;

      await query(`
        INSERT INTO permission_audit_log (
          employee_id,
          permission_key,
          result,
          role_used,
          action_details,
          resource_type,
          resource_id,
          ip_address,
          user_agent
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        employeeId,
        permissionKey,
        result,
        primaryRoleId,
        JSON.stringify(details),
        details.resourceType || null,
        details.resourceId || null,
        ipAddress,
        userAgent
      ]);

    } catch (error) {
      // Don't throw error on audit log failure (non-critical)
      console.error('⚠️  Failed to log permission attempt:', error);
    }
  }

  /**
   * Clear permission cache for a specific employee or all employees
   * @param {string} employeeId - Employee UUID (optional, clears all if not provided)
   */
  clearCache(employeeId = null) {
    if (employeeId) {
      // Clear all cached permissions for this employee
      for (const key of this.permissionCache.keys()) {
        if (key.startsWith(employeeId + ':')) {
          this.permissionCache.delete(key);
        }
      }
      console.log(`🗑️  Cleared permission cache for employee ${employeeId}`);
    } else {
      // Clear entire cache
      this.permissionCache.clear();
      console.log('🗑️  Cleared entire permission cache');
    }
  }

  /**
   * Check if user can perform action on their own resource (self-permission bypass)
   * @param {string} employeeId - Employee performing the action
   * @param {string} targetUserId - User being acted upon
   * @returns {boolean} - True if acting on self
   */
  isSelfAction(employeeId, targetUserId) {
    return employeeId === targetUserId;
  }
}

// Export singleton instance
export const permissionService = new PermissionService();
export default permissionService;