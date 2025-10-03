/**
 * Migration: Add view stats permissions for service locations and users (clients)
 *
 * Creates permissions to control who can view statistics sections:
 * - view.service_location_stats.enable (exec/admin/sales only)
 * - view.user_stats.enable (exec/admin/sales only)
 *
 * Technicians will not have these permissions and won't see stats sections.
 *
 * Created: 2025-01-03
 */

/**
 * @param {import('pg').Pool} pool
 */
export async function up(pool) {
  console.log('🔄 Starting migration: Add view stats permissions for locations and users...');

  try {
    // Start transaction
    await pool.query('BEGIN');

    // 1. Create view.service_location_stats.enable permission
    const locationStatsResult = await pool.query(`
      INSERT INTO permissions (permission_key, resource_type, action_type, description)
      VALUES (
        'view.service_location_stats.enable',
        'service_locations',
        'view_stats',
        'Permission to view service location statistics (Executive, Admin, Sales only)'
      )
      ON CONFLICT (permission_key) DO NOTHING
      RETURNING id;
    `);

    const locationStatsPermissionId = locationStatsResult.rows[0]?.id;
    if (locationStatsPermissionId) {
      console.log('✅ Created permission: view.service_location_stats.enable');

      // Grant to executive, admin, sales
      await pool.query(`
        INSERT INTO role_permissions (role_id, permission_id, is_granted)
        SELECT r.id, $1, true
        FROM roles r
        WHERE r.name IN ('executive', 'admin', 'sales')
        ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;
      `, [locationStatsPermissionId]);
      console.log('✅ Granted view.service_location_stats.enable to executive, admin, sales');
    } else {
      console.log('ℹ️  Permission view.service_location_stats.enable already exists');
    }

    // 2. Create view.user_stats.enable permission
    const userStatsResult = await pool.query(`
      INSERT INTO permissions (permission_key, resource_type, action_type, description)
      VALUES (
        'view.user_stats.enable',
        'users',
        'view_stats',
        'Permission to view client/user statistics (Executive, Admin, Sales only)'
      )
      ON CONFLICT (permission_key) DO NOTHING
      RETURNING id;
    `);

    const userStatsPermissionId = userStatsResult.rows[0]?.id;
    if (userStatsPermissionId) {
      console.log('✅ Created permission: view.user_stats.enable');

      // Grant to executive, admin, sales
      await pool.query(`
        INSERT INTO role_permissions (role_id, permission_id, is_granted)
        SELECT r.id, $1, true
        FROM roles r
        WHERE r.name IN ('executive', 'admin', 'sales')
        ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;
      `, [userStatsPermissionId]);
      console.log('✅ Granted view.user_stats.enable to executive, admin, sales');
    } else {
      console.log('ℹ️  Permission view.user_stats.enable already exists');
    }

    // Commit transaction
    await pool.query('COMMIT');
    console.log('✅ Migration completed successfully: View stats permissions added');

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
  console.log('🔄 Starting rollback: Remove view stats permissions...');

  try {
    await pool.query('BEGIN');

    // Remove view.service_location_stats.enable permission
    await pool.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions WHERE permission_key = 'view.service_location_stats.enable'
      );
    `);

    await pool.query(`
      DELETE FROM permissions WHERE permission_key = 'view.service_location_stats.enable';
    `);
    console.log('✅ Removed permission: view.service_location_stats.enable');

    // Remove view.user_stats.enable permission
    await pool.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions WHERE permission_key = 'view.user_stats.enable'
      );
    `);

    await pool.query(`
      DELETE FROM permissions WHERE permission_key = 'view.user_stats.enable';
    `);
    console.log('✅ Removed permission: view.user_stats.enable');

    await pool.query('COMMIT');
    console.log('✅ Rollback completed successfully');

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}
