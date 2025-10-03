/**
 * Migration: Grant view.employees.enable to Technician Role
 *
 * Allows technicians to see the Employees section in the sidebar.
 * Actual restrictions on what technicians can do/see are enforced in AdminEmployees.tsx
 */

import { query } from '../config/database.js';

export async function up() {
  console.log('🔐 Granting view.employees.enable to technician role...');

  try {
    // Get technician role ID
    const roleResult = await query(`
      SELECT id, name FROM roles WHERE name = 'technician'
    `);

    if (roleResult.rows.length === 0) {
      console.log('⚠️  Technician role not found');
      return;
    }

    const technicianRoleId = roleResult.rows[0].id;

    // Get view.employees.enable permission ID
    const permResult = await query(`
      SELECT id, permission_key FROM permissions WHERE permission_key = 'view.employees.enable'
    `);

    if (permResult.rows.length === 0) {
      console.log('⚠️  view.employees.enable permission not found');
      return;
    }

    const permissionId = permResult.rows[0].id;

    // Grant permission to technician role
    await query(`
      INSERT INTO role_permissions (role_id, permission_id, is_granted)
      VALUES ($1, $2, true)
      ON CONFLICT (role_id, permission_id)
      DO UPDATE SET is_granted = true
    `, [technicianRoleId, permissionId]);

    console.log('✅ Granted view.employees.enable to technician role');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

export async function down() {
  console.log('🔄 Revoking view.employees.enable from technician role...');

  try {
    // Get technician role ID
    const roleResult = await query(`
      SELECT id FROM roles WHERE name = 'technician'
    `);

    if (roleResult.rows.length === 0) {
      console.log('⚠️  Technician role not found');
      return;
    }

    const technicianRoleId = roleResult.rows[0].id;

    // Get permission ID
    const permResult = await query(`
      SELECT id FROM permissions WHERE permission_key = 'view.employees.enable'
    `);

    if (permResult.rows.length === 0) {
      console.log('⚠️  view.employees.enable permission not found');
      return;
    }

    const permissionId = permResult.rows[0].id;

    // Revoke permission
    await query(`
      DELETE FROM role_permissions
      WHERE role_id = $1 AND permission_id = $2
    `, [technicianRoleId, permissionId]);

    console.log('✅ Revoked view.employees.enable from technician role');

  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}
