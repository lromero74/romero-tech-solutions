import { getPool } from './config/database.js';

/**
 * Comprehensive migration to replace all hardcoded role checks with RBAC permissions
 * This script creates all necessary permissions and assigns them to appropriate roles
 */

async function migrateToRBAC() {
  const pool = await getPool();

  try {
    console.log('🔄 Starting RBAC migration...\n');

    // Define all permissions needed to replace hardcoded role checks
    const permissions = [
      // Authentication & Access
      {
        key: 'access.admin_dashboard.enable',
        resource: 'admin_dashboard',
        action: 'access',
        description: 'Access the admin dashboard',
        roles: ['admin', 'executive', 'manager']
      },
      {
        key: 'require.mfa.enable',
        resource: 'mfa',
        action: 'require',
        description: 'MFA is required for this role',
        roles: ['admin', 'technician', 'sales', 'executive', 'manager']
      },

      // Service Request Workflow
      {
        key: 'start.service_request_work.enable',
        resource: 'service_request_work',
        action: 'start',
        description: 'Start work on service requests',
        roles: ['executive', 'admin', 'technician', 'manager']
      },
      {
        key: 'stop.service_request_work.enable',
        resource: 'service_request_work',
        action: 'stop',
        description: 'Stop work on service requests',
        roles: ['executive', 'admin', 'technician', 'manager']
      },
      {
        key: 'view.service_request_time_entries.enable',
        resource: 'service_request_time_entries',
        action: 'view',
        description: 'View time entries for service requests',
        roles: ['executive', 'admin', 'technician', 'manager']
      },
      {
        key: 'delete.service_request_time_entries.enable',
        resource: 'service_request_time_entries',
        action: 'delete',
        description: 'Delete time entries from service requests',
        roles: ['executive', 'admin', 'technician', 'manager']
      },

      // System Settings
      {
        key: 'modify.system_settings.enable',
        resource: 'system_settings',
        action: 'modify',
        description: 'Modify system settings',
        roles: ['executive']
      },

      // Service Hour Rates
      {
        key: 'modify.service_hour_rates.enable',
        resource: 'service_hour_rates',
        action: 'modify',
        description: 'Create, update, and delete service hour rates',
        roles: ['executive']
      },

      // Hourly Rate Categories
      {
        key: 'modify.hourly_rate_categories.enable',
        resource: 'hourly_rate_categories',
        action: 'modify',
        description: 'Create, update, and delete hourly rate categories',
        roles: ['executive', 'admin']
      },

      // Workflow Configuration
      {
        key: 'modify.workflow_configuration.enable',
        resource: 'workflow_configuration',
        action: 'modify',
        description: 'Modify workflow configuration settings',
        roles: ['executive', 'admin']
      },

      // Service Types
      {
        key: 'modify.service_types.enable',
        resource: 'service_types',
        action: 'modify',
        description: 'Create, update, and manage service types',
        roles: ['executive', 'admin', 'manager']
      },
      {
        key: 'reorder.service_types.enable',
        resource: 'service_types',
        action: 'reorder',
        description: 'Reorder service types',
        roles: ['executive']
      },

      // Admin Routes (General)
      {
        key: 'access.admin_routes.enable',
        resource: 'admin_routes',
        action: 'access',
        description: 'Access general admin routes and functionality',
        roles: ['admin', 'executive', 'manager', 'technician', 'employee']
      },

      // Security & Sessions
      {
        key: 'manage.security_sessions.enable',
        resource: 'security_sessions',
        action: 'manage',
        description: 'Manage user sessions and security settings',
        roles: ['admin', 'executive', 'manager']
      }
    ];

    console.log('📝 Creating permissions...');

    // Get all existing roles
    const rolesResult = await pool.query('SELECT id, name FROM roles');
    const roleMap = rolesResult.rows.reduce((acc, row) => {
      acc[row.name.toLowerCase()] = row.id;
      return acc;
    }, {});

    const createdPermissions = {};

    // Create each permission
    for (const perm of permissions) {
      const existingPerm = await pool.query(
        'SELECT id FROM permissions WHERE permission_key = $1',
        [perm.key]
      );

      let permId;
      if (existingPerm.rows.length > 0) {
        permId = existingPerm.rows[0].id;
        console.log(`  ✓ Permission exists: ${perm.key}`);
      } else {
        const result = await pool.query(`
          INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id
        `, [perm.key, perm.resource, perm.action, perm.description]);

        permId = result.rows[0].id;
        console.log(`  ✓ Created: ${perm.key}`);
      }

      createdPermissions[perm.key] = { id: permId, roles: perm.roles };
    }

    console.log('\n📋 Assigning permissions to roles...');

    // Grant permissions to roles
    let grantCount = 0;
    let updateCount = 0;

    for (const [permKey, permData] of Object.entries(createdPermissions)) {
      for (const roleName of permData.roles) {
        const roleId = roleMap[roleName.toLowerCase()];

        if (!roleId) {
          console.log(`  ⚠️  Role not found: ${roleName}`);
          continue;
        }

        const existing = await pool.query(
          'SELECT id, is_granted FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
          [roleId, permData.id]
        );

        if (existing.rows.length > 0) {
          if (!existing.rows[0].is_granted) {
            await pool.query(
              'UPDATE role_permissions SET is_granted = true, updated_at = CURRENT_TIMESTAMP WHERE role_id = $1 AND permission_id = $2',
              [roleId, permData.id]
            );
            updateCount++;
            console.log(`  ✓ Updated: ${roleName} -> ${permKey}`);
          }
        } else {
          await pool.query(
            'INSERT INTO role_permissions (role_id, permission_id, is_granted, created_at, updated_at) VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
            [roleId, permData.id]
          );
          grantCount++;
          console.log(`  ✓ Granted: ${roleName} -> ${permKey}`);
        }
      }
    }

    console.log('\n📊 Summary:');
    console.log(`  • Permissions created/verified: ${permissions.length}`);
    console.log(`  • New role grants: ${grantCount}`);
    console.log(`  • Updated role grants: ${updateCount}`);
    console.log('\n✅ RBAC migration completed successfully!');

  } catch (error) {
    console.error('❌ Error during RBAC migration:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrateToRBAC();
