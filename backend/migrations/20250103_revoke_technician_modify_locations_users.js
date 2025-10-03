/**
 * Migration: Revoke modify permissions from technician for service locations and users
 *
 * Technicians should only be able to VIEW service locations and clients, not modify them.
 * This migration removes modify.service_locations.enable and modify.users.enable from technician role.
 *
 * Created: 2025-01-03
 */

/**
 * @param {import('pg').Pool} pool
 */
export async function up(pool) {
  console.log('🔄 Starting migration: Revoke technician modify permissions for locations and users...');

  try {
    // Start transaction
    await pool.query('BEGIN');

    // 1. Revoke modify.service_locations.enable from technician
    const revokeLocationResult = await pool.query(`
      UPDATE role_permissions
      SET is_granted = false
      WHERE role_id IN (SELECT id FROM roles WHERE name = 'technician')
      AND permission_id IN (SELECT id FROM permissions WHERE permission_key = 'modify.service_locations.enable')
      RETURNING *;
    `);

    if (revokeLocationResult.rowCount > 0) {
      console.log('✅ Revoked modify.service_locations.enable from technician');
    } else {
      console.log('ℹ️  modify.service_locations.enable was not granted to technician');
    }

    // 2. Revoke modify.users.enable from technician
    const revokeUsersResult = await pool.query(`
      UPDATE role_permissions
      SET is_granted = false
      WHERE role_id IN (SELECT id FROM roles WHERE name = 'technician')
      AND permission_id IN (SELECT id FROM permissions WHERE permission_key = 'modify.users.enable')
      RETURNING *;
    `);

    if (revokeUsersResult.rowCount > 0) {
      console.log('✅ Revoked modify.users.enable from technician');
    } else {
      console.log('ℹ️  modify.users.enable was not granted to technician');
    }

    // Commit transaction
    await pool.query('COMMIT');
    console.log('✅ Migration completed successfully: Technician modify permissions revoked');

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * @param {import('pg').Pool} pool
 */
export async function down(pool) {
  console.log('🔄 Starting rollback: Re-grant technician modify permissions...');

  try {
    await pool.query('BEGIN');

    // Re-grant modify.service_locations.enable to technician
    await pool.query(`
      UPDATE role_permissions
      SET is_granted = true
      WHERE role_id IN (SELECT id FROM roles WHERE name = 'technician')
      AND permission_id IN (SELECT id FROM permissions WHERE permission_key = 'modify.service_locations.enable');
    `);
    console.log('✅ Re-granted modify.service_locations.enable to technician');

    // Re-grant modify.users.enable to technician
    await pool.query(`
      UPDATE role_permissions
      SET is_granted = true
      WHERE role_id IN (SELECT id FROM roles WHERE name = 'technician')
      AND permission_id IN (SELECT id FROM permissions WHERE permission_key = 'modify.users.enable');
    `);
    console.log('✅ Re-granted modify.users.enable to technician');

    await pool.query('COMMIT');
    console.log('✅ Rollback completed successfully');

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}
