/**
 * Migration: Add View Permission for Service Requests
 *
 * Creates view permission for service requests and assigns to technician role
 */

import { query } from '../config/database.js';

export async function up() {
  console.log('🔐 Adding view permission for service requests...');

  try {
    // Create permission
    const permResult = await query(`
      INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
      VALUES ('view.service_requests.enable', 'service_requests', 'view', 'View service requests section', true)
      ON CONFLICT (permission_key) DO NOTHING
      RETURNING id
    `);

    if (permResult.rows.length > 0) {
      console.log(`✅ Created permission: view.service_requests.enable`);
    } else {
      console.log(`ℹ️  Permission already exists: view.service_requests.enable`);
    }

    // Get role IDs
    const rolesResult = await query(`
      SELECT id, name FROM roles WHERE name IN ('executive', 'admin', 'sales', 'technician')
    `);

    const roles = {};
    for (const row of rolesResult.rows) {
      roles[row.name] = row.id;
    }

    // Get permission ID
    const permissionsResult = await query(`
      SELECT id FROM permissions WHERE permission_key = 'view.service_requests.enable'
    `);

    const permId = permissionsResult.rows[0].id;

    // Assign to all roles that work with service requests
    for (const roleName of ['executive', 'admin', 'sales', 'technician']) {
      const roleId = roles[roleName];

      await query(`
        INSERT INTO role_permissions (role_id, permission_id, is_granted)
        VALUES ($1, $2, true)
        ON CONFLICT (role_id, permission_id)
        DO UPDATE SET is_granted = true
      `, [roleId, permId]);

      console.log(`✅ Granted view.service_requests.enable to ${roleName}`);
    }

    console.log('✅ Successfully added service requests view permission');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

export async function down() {
  console.log('🔄 Rolling back service requests view permission...');

  try {
    // Remove role permissions
    await query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions
        WHERE permission_key = 'view.service_requests.enable'
      )
    `);

    // Remove permission
    await query(`
      DELETE FROM permissions
      WHERE permission_key = 'view.service_requests.enable'
    `);

    console.log('✅ Rollback completed');

  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}
