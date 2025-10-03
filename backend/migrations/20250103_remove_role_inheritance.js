/**
 * Migration: Remove role inheritance by explicitly granting inherited permissions
 *
 * This migration converts the role inheritance system to a purely granular permission model.
 * Before removing inheritance logic, we explicitly grant all permissions that were previously
 * inherited to ensure no functionality breaks.
 *
 * Inheritance that will be removed:
 * - executive inherits from: admin, manager, sales, technician
 * - admin inherits from: technician
 * - manager inherits from: technician
 * - sales inherits from: (none)
 * - technician inherits from: (none)
 *
 * Created: 2025-01-03
 */

/**
 * @param {import('pg').Pool} pool
 */
export async function up(pool) {
  console.log('🔄 Starting migration: Remove role inheritance by explicitly granting inherited permissions...');

  try {
    await pool.query('BEGIN');

    // Get role IDs
    const rolesResult = await pool.query(`
      SELECT id, name FROM roles WHERE name IN ('executive', 'admin', 'manager', 'sales', 'technician');
    `);

    const roles = {};
    rolesResult.rows.forEach(r => {
      roles[r.name] = r.id;
    });

    console.log('✅ Found roles:', Object.keys(roles).join(', '));

    // Define inheritance relationships (what we're removing)
    const inheritanceMap = {
      admin: ['technician'],
      manager: ['technician'],
      // Note: executive already has all permissions, and sales/technician don't inherit
    };

    let totalGranted = 0;

    // For each role that has inheritance
    for (const [roleName, inheritFromRoles] of Object.entries(inheritanceMap)) {
      const roleId = roles[roleName];
      if (!roleId) {
        console.warn(`⚠️  Role ${roleName} not found, skipping`);
        continue;
      }

      console.log(`\n📋 Processing ${roleName}...`);

      // For each role it inherits from
      for (const inheritFromRole of inheritFromRoles) {
        const inheritFromRoleId = roles[inheritFromRole];
        if (!inheritFromRoleId) {
          console.warn(`⚠️  Role ${inheritFromRole} not found, skipping`);
          continue;
        }

        // Copy all permissions from inherited role to current role
        const copyResult = await pool.query(`
          INSERT INTO role_permissions (role_id, permission_id, is_granted)
          SELECT
            $1 as role_id,
            permission_id,
            is_granted
          FROM role_permissions
          WHERE role_id = $2 AND is_granted = true
          ON CONFLICT (role_id, permission_id)
          DO UPDATE SET is_granted = EXCLUDED.is_granted;
        `, [roleId, inheritFromRoleId]);

        console.log(`   ✅ Granted ${copyResult.rowCount} permissions from ${inheritFromRole} to ${roleName}`);
        totalGranted += copyResult.rowCount;
      }
    }

    // Verify final permission counts
    const countsResult = await pool.query(`
      SELECT
        r.name,
        COUNT(rp.permission_id) as permission_count
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id AND rp.is_granted = true
      WHERE r.name IN ('executive', 'admin', 'manager', 'sales', 'technician')
      GROUP BY r.name, r.id
      ORDER BY r.name;
    `);

    console.log('\n📊 Final permission counts:');
    countsResult.rows.forEach(row => {
      console.log(`   ${row.name}: ${row.permission_count} permissions`);
    });

    await pool.query('COMMIT');
    console.log(`\n✅ Migration completed successfully! Explicitly granted ${totalGranted} inherited permissions.`);
    console.log('ℹ️  Role inheritance logic can now be safely removed from the code.');

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
  console.log('🔄 Starting rollback: This migration cannot be automatically reversed.');
  console.log('ℹ️  The permissions have been explicitly granted and removing them would require');
  console.log('ℹ️  knowing which permissions were originally inherited vs. directly assigned.');
  console.log('ℹ️  If you need to restore the previous state, restore from a database backup.');
}
