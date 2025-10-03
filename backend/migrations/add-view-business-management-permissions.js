/**
 * Migration: Add View Permissions for Business Management Components
 *
 * Creates view permissions for businesses, service locations, and clients
 * Grants to executive, admin, and sales roles (NOT technician)
 */

import { query } from '../config/database.js';

export async function up() {
  console.log('🔐 Adding view permissions for Business Management components...');

  try {
    // Create permissions
    const permissions = [
      {
        key: 'view.businesses.enable',
        resource: 'businesses',
        action: 'view',
        description: 'View businesses section'
      },
      {
        key: 'view.service_locations.enable',
        resource: 'service_locations',
        action: 'view',
        description: 'View service locations section'
      },
      {
        key: 'view.clients.enable',
        resource: 'clients',
        action: 'view',
        description: 'View clients section'
      }
    ];

    for (const perm of permissions) {
      const permResult = await query(`
        INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (permission_key) DO NOTHING
        RETURNING id
      `, [perm.key, perm.resource, perm.action, perm.description]);

      if (permResult.rows.length > 0) {
        console.log(`✅ Created permission: ${perm.key}`);
      } else {
        console.log(`ℹ️  Permission already exists: ${perm.key}`);
      }
    }

    // Get role IDs (executive, admin, sales - NOT technician)
    const rolesResult = await query(`
      SELECT id, name FROM roles WHERE name IN ('executive', 'admin', 'sales')
    `);

    const roles = {};
    for (const row of rolesResult.rows) {
      roles[row.name] = row.id;
    }

    // Get permission IDs
    const permissionsResult = await query(`
      SELECT id, permission_key FROM permissions
      WHERE permission_key IN ('view.businesses.enable', 'view.service_locations.enable', 'view.clients.enable')
    `);

    const permissionMap = {};
    for (const row of permissionsResult.rows) {
      permissionMap[row.permission_key] = row.id;
    }

    // Assign permissions to executive, admin, and sales roles
    for (const roleName of ['executive', 'admin', 'sales']) {
      const roleId = roles[roleName];

      for (const permKey of Object.keys(permissionMap)) {
        const permId = permissionMap[permKey];

        await query(`
          INSERT INTO role_permissions (role_id, permission_id, is_granted)
          VALUES ($1, $2, true)
          ON CONFLICT (role_id, permission_id)
          DO UPDATE SET is_granted = true
        `, [roleId, permId]);

        console.log(`✅ Granted ${permKey} to ${roleName}`);
      }
    }

    console.log('✅ Successfully added Business Management view permissions');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

export async function down() {
  console.log('🔄 Rolling back Business Management view permissions...');

  try {
    // Remove role permissions
    await query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions
        WHERE permission_key IN ('view.businesses.enable', 'view.service_locations.enable', 'view.clients.enable')
      )
    `);

    // Remove permissions
    await query(`
      DELETE FROM permissions
      WHERE permission_key IN ('view.businesses.enable', 'view.service_locations.enable', 'view.clients.enable')
    `);

    console.log('✅ Rollback completed');

  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}
