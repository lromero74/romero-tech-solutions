/**
 * Migration: Grant manager role all admin permissions
 *
 * This migration copies all permissions from the admin role to the manager role,
 * giving managers the same access level as administrators.
 *
 * Created: 2025-01-03
 */

/**
 * @param {import('pg').Pool} pool
 */
export async function up(pool) {
  console.log('🔄 Starting migration: Grant manager role all admin permissions...');

  try {
    // Start transaction
    await pool.query('BEGIN');

    // Get admin and manager role IDs
    const rolesResult = await pool.query(`
      SELECT id, name FROM roles WHERE name IN ('admin', 'manager');
    `);

    const adminRole = rolesResult.rows.find(r => r.name === 'admin');
    const managerRole = rolesResult.rows.find(r => r.name === 'manager');

    if (!adminRole) {
      throw new Error('Admin role not found');
    }

    if (!managerRole) {
      throw new Error('Manager role not found');
    }

    console.log(`✅ Found admin role: ${adminRole.id}`);
    console.log(`✅ Found manager role: ${managerRole.id}`);

    // Copy all permissions from admin to manager
    const copyResult = await pool.query(`
      INSERT INTO role_permissions (role_id, permission_id, is_granted)
      SELECT
        $1 as role_id,
        permission_id,
        is_granted
      FROM role_permissions
      WHERE role_id = $2
      ON CONFLICT (role_id, permission_id)
      DO UPDATE SET is_granted = EXCLUDED.is_granted;
    `, [managerRole.id, adminRole.id]);

    console.log(`✅ Copied ${copyResult.rowCount} permissions from admin to manager`);

    // Verify the copy
    const countResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM role_permissions WHERE role_id = $1) as admin_count,
        (SELECT COUNT(*) FROM role_permissions WHERE role_id = $2) as manager_count;
    `, [adminRole.id, managerRole.id]);

    console.log(`✅ Admin has ${countResult.rows[0].admin_count} permissions`);
    console.log(`✅ Manager now has ${countResult.rows[0].manager_count} permissions`);

    // Commit transaction
    await pool.query('COMMIT');
    console.log('✅ Migration completed successfully: Manager role now has all admin permissions');

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
  console.log('🔄 Starting rollback: Remove all permissions from manager role...');

  try {
    await pool.query('BEGIN');

    // Get manager role ID
    const managerResult = await pool.query(`
      SELECT id FROM roles WHERE name = 'manager';
    `);

    if (managerResult.rows.length === 0) {
      console.log('ℹ️  Manager role not found, nothing to rollback');
      await pool.query('COMMIT');
      return;
    }

    const managerRoleId = managerResult.rows[0].id;

    // Remove all permissions from manager role
    const deleteResult = await pool.query(`
      DELETE FROM role_permissions WHERE role_id = $1;
    `, [managerRoleId]);

    console.log(`✅ Removed ${deleteResult.rowCount} permissions from manager role`);

    await pool.query('COMMIT');
    console.log('✅ Rollback completed successfully');

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}
