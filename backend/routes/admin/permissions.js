/**
 * Permission Management Routes
 *
 * API endpoints for managing permissions, roles, and permission assignments.
 * Includes WebSocket broadcasting for real-time updates.
 *
 * All routes require authentication via authMiddleware.
 * Most routes require executive role or specific permissions.
 */

import express from 'express';
import { query } from '../../config/database.js';
import { requirePermission } from '../../middleware/permissionMiddleware.js';
import { permissionService } from '../../services/permissionService.js';
import { websocketService } from '../../services/websocketService.js';

const router = express.Router();

// ============================================
// PERMISSION ENDPOINTS
// ============================================

/**
 * GET /permissions - Get all permissions
 * Returns all active permissions in the system
 */
router.get('/permissions', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        id,
        permission_key,
        resource_type,
        action_type,
        description,
        is_active,
        created_at,
        updated_at
      FROM permissions
      WHERE is_active = true
      ORDER BY resource_type, action_type
    `);

    res.status(200).json({
      success: true,
      data: {
        permissions: result.rows,
        count: result.rows.length
      }
    });

  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch permissions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /permissions/by-role - Get all roles with their permission counts
 * Returns summary of each role and how many permissions they have
 */
router.get('/permissions/by-role', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        r.id,
        r.name,
        r.display_name,
        r.description,
        COUNT(rp.id) as permission_count
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id AND rp.is_granted = true
      WHERE r.is_active = true
      GROUP BY r.id, r.name, r.display_name, r.description
      ORDER BY r.sort_order
    `);

    res.status(200).json({
      success: true,
      data: {
        roles: result.rows.map(row => ({
          ...row,
          permission_count: parseInt(row.permission_count)
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching roles with permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch roles',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /roles-with-permissions - Get all roles with their full permission details
 * Returns all roles with complete list of permissions and granted status
 * Used by AdminPermissionManager component
 */
router.get('/roles-with-permissions', async (req, res) => {
  try {
    // Get all roles
    const rolesResult = await query(`
      SELECT
        id,
        name,
        display_name,
        description,
        is_active,
        sort_order,
        created_at,
        updated_at
      FROM roles
      WHERE is_active = true
      ORDER BY sort_order
    `);

    // Get all permissions for each role
    const roles = [];
    for (const role of rolesResult.rows) {
      const permissionsResult = await query(`
        SELECT
          p.id,
          p.permission_key,
          p.resource_type,
          p.action_type,
          p.description,
          COALESCE(rp.is_granted, false) as is_granted
        FROM permissions p
        LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.role_id = $1
        WHERE p.is_active = true
        ORDER BY p.resource_type, p.action_type
      `, [role.id]);

      roles.push({
        id: role.id,
        name: role.name,
        displayName: role.display_name,
        description: role.description,
        isActive: role.is_active,
        sortOrder: role.sort_order,
        permissions: permissionsResult.rows,
        permissionCount: permissionsResult.rows.filter(p => p.is_granted).length,
        createdAt: role.created_at,
        updatedAt: role.updated_at
      });
    }

    res.status(200).json({
      success: true,
      data: {
        roles,
        totalRoles: roles.length
      }
    });

  } catch (error) {
    console.error('Error fetching roles with permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch roles with permissions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /permissions/user-permissions - Get current user's permissions
 * Returns all permissions for the authenticated user
 */
router.get('/permissions/user-permissions', async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const employeeId = req.session.userId;

    // Get user's roles
    const roles = await permissionService.getUserRoles(employeeId);

    // Get user's permissions
    const permissions = await permissionService.getUserPermissions(employeeId);

    // Check if user is executive (has all permissions)
    const isExecutive = await permissionService.hasRole(employeeId, 'executive');

    res.status(200).json({
      success: true,
      data: {
        employeeId,
        roles: roles.map(r => ({
          id: r.id,
          name: r.name,
          displayName: r.display_name
        })),
        permissions,
        isExecutive,
        permissionCount: permissions.length
      }
    });

  } catch (error) {
    console.error('Error fetching user permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user permissions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// ROLE PERMISSION MANAGEMENT
// ============================================

/**
 * GET /role-permissions/:roleId - Get permissions for a specific role
 * Returns all permissions with granted status for the role
 */
router.get('/role-permissions/:roleId', async (req, res) => {
  try {
    const { roleId } = req.params;

    // Get role info
    const roleResult = await query(`
      SELECT id, name, display_name, description
      FROM roles
      WHERE id = $1
    `, [roleId]);

    if (roleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    const role = roleResult.rows[0];

    // Get all permissions with granted status for this role
    const permissionsResult = await query(`
      SELECT
        p.id,
        p.permission_key,
        p.resource_type,
        p.action_type,
        p.description,
        COALESCE(rp.is_granted, false) as is_granted,
        rp.id as role_permission_id
      FROM permissions p
      LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.role_id = $1
      WHERE p.is_active = true
      ORDER BY p.resource_type, p.action_type
    `, [roleId]);

    res.status(200).json({
      success: true,
      data: {
        role: {
          id: role.id,
          name: role.name,
          displayName: role.display_name,
          description: role.description
        },
        permissions: permissionsResult.rows,
        grantedCount: permissionsResult.rows.filter(p => p.is_granted).length,
        totalCount: permissionsResult.rows.length
      }
    });

  } catch (error) {
    console.error('Error fetching role permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch role permissions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * PUT /role-permissions/:roleId - Update permissions for a role
 * Updates which permissions are granted to a role
 * Requires modify.role_permissions.enable permission (executive only)
 */
router.put('/role-permissions/:roleId',
  requirePermission('modify.role_permissions.enable'),
  async (req, res) => {
  try {
    const { roleId } = req.params;
    const { permissions } = req.body; // Array of { permissionId, isGranted }

    if (!Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: 'Permissions must be an array'
      });
    }

    // Get role info
    const roleResult = await query(`
      SELECT id, name, display_name
      FROM roles
      WHERE id = $1
    `, [roleId]);

    if (roleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    const role = roleResult.rows[0];

    // Special check: Cannot modify executive role permissions
    // (Executive should always have all permissions enforced in code)
    if (role.name === 'executive') {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify executive role permissions. Executive role always has all permissions.',
        code: 'EXECUTIVE_IMMUTABLE'
      });
    }

    // Begin transaction
    await query('BEGIN');

    try {
      // Update each permission
      for (const perm of permissions) {
        const { permissionId, isGranted } = perm;

        if (isGranted) {
          // Grant permission (insert or update)
          await query(`
            INSERT INTO role_permissions (role_id, permission_id, is_granted)
            VALUES ($1, $2, true)
            ON CONFLICT (role_id, permission_id)
            DO UPDATE SET is_granted = true, updated_at = CURRENT_TIMESTAMP
          `, [roleId, permissionId]);
        } else {
          // Revoke permission (delete or set to false)
          await query(`
            DELETE FROM role_permissions
            WHERE role_id = $1 AND permission_id = $2
          `, [roleId, permissionId]);
        }
      }

      // Commit transaction
      await query('COMMIT');

      // Clear permission cache for all users with this role
      permissionService.clearCache();

      // Get updated permission count
      const countResult = await query(`
        SELECT COUNT(*) as count
        FROM role_permissions
        WHERE role_id = $1 AND is_granted = true
      `, [roleId]);

      const permissionCount = parseInt(countResult.rows[0].count);

      // Broadcast permission update via WebSocket
      websocketService.broadcastToAdmins({
        type: 'rolePermissionsUpdated',
        data: {
          roleId,
          roleName: role.name,
          roleDisplayName: role.display_name,
          permissionCount,
          updatedBy: req.session.userId,
          updatedAt: new Date().toISOString()
        }
      });

      res.status(200).json({
        success: true,
        message: 'Role permissions updated successfully',
        data: {
          roleId,
          roleName: role.name,
          permissionCount,
          updatedCount: permissions.length
        }
      });

    } catch (error) {
      // Rollback transaction on error
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error updating role permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update role permissions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// AUDIT LOG ENDPOINTS
// ============================================

/**
 * GET /permission-audit-log - Get permission audit log entries
 * Returns paginated audit log with filters
 * Requires view.permission_audit_log.enable permission (executive only)
 */
router.get('/permission-audit-log',
  requirePermission('view.permission_audit_log.enable'),
  async (req, res) => {
  try {
    const {
      employeeId,
      result: resultFilter,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    // Build WHERE clause
    const conditions = [];
    const params = [];
    let paramCount = 0;

    if (employeeId) {
      paramCount++;
      conditions.push(`pal.employee_id = $${paramCount}`);
      params.push(employeeId);
    }

    if (resultFilter) {
      paramCount++;
      conditions.push(`pal.result = $${paramCount}`);
      params.push(resultFilter);
    }

    if (startDate) {
      paramCount++;
      conditions.push(`pal.action_timestamp >= $${paramCount}`);
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      conditions.push(`pal.action_timestamp <= $${paramCount}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM permission_audit_log pal
      ${whereClause}
    `, params);

    const total = parseInt(countResult.rows[0].total);

    // Calculate pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    paramCount++;
    params.push(parseInt(limit));
    paramCount++;
    params.push(offset);

    // Get paginated results
    const logsResult = await query(`
      SELECT
        pal.log_id,
        pal.action_timestamp,
        pal.employee_id,
        pal.permission_key,
        pal.result,
        pal.role_used,
        pal.action_details,
        pal.resource_type,
        pal.resource_id,
        pal.ip_address,
        pal.user_agent,
        e.first_name,
        e.last_name,
        e.email,
        r.name as role_name,
        r.display_name as role_display_name
      FROM permission_audit_log pal
      LEFT JOIN employees e ON pal.employee_id = e.id
      LEFT JOIN roles r ON pal.role_used = r.id
      ${whereClause}
      ORDER BY pal.action_timestamp DESC
      LIMIT $${paramCount - 1} OFFSET $${paramCount}
    `, params);

    res.status(200).json({
      success: true,
      data: {
        logs: logsResult.rows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Error fetching permission audit log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit log',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /permission-audit-log/stats - Get audit log statistics
 * Returns summary statistics about permission usage
 * Requires view.permission_audit_log.enable permission (executive only)
 */
router.get('/permission-audit-log/stats',
  requirePermission('view.permission_audit_log.enable'),
  async (req, res) => {
  try {
    // Get total counts by result
    const resultStats = await query(`
      SELECT
        result,
        COUNT(*) as count
      FROM permission_audit_log
      GROUP BY result
    `);

    // Get most used permissions
    const topPermissions = await query(`
      SELECT
        permission_key,
        result,
        COUNT(*) as count
      FROM permission_audit_log
      GROUP BY permission_key, result
      ORDER BY count DESC
      LIMIT 10
    `);

    // Get most active users
    const topUsers = await query(`
      SELECT
        e.id,
        e.first_name,
        e.last_name,
        e.email,
        COUNT(*) as attempt_count
      FROM permission_audit_log pal
      JOIN employees e ON pal.employee_id = e.id
      GROUP BY e.id, e.first_name, e.last_name, e.email
      ORDER BY attempt_count DESC
      LIMIT 10
    `);

    // Get recent denied attempts
    const recentDenied = await query(`
      SELECT
        pal.action_timestamp,
        pal.permission_key,
        pal.action_details,
        e.first_name,
        e.last_name,
        e.email
      FROM permission_audit_log pal
      LEFT JOIN employees e ON pal.employee_id = e.id
      WHERE pal.result = 'denied'
      ORDER BY pal.action_timestamp DESC
      LIMIT 20
    `);

    res.status(200).json({
      success: true,
      data: {
        resultStats: resultStats.rows,
        topPermissions: topPermissions.rows,
        topUsers: topUsers.rows,
        recentDenied: recentDenied.rows
      }
    });

  } catch (error) {
    console.error('Error fetching audit log stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit log statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;