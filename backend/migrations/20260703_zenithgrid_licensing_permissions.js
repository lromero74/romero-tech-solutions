/**
 * Migration: ZenithGrid Licensing — RBAC Permission
 *
 * Seeds the manage.zenithgrid_licenses.enable permission key (issue/revoke/
 * list ZenithGrid software licenses) and grants it to admin + executive.
 *
 * Schema for zenithgrid_licenses / zenithgrid_license_activations is
 * created by the companion .sql migration
 * 20260703_zenithgrid_licensing.sql — run that first.
 *
 * See zenith-grid repo's docs/PRPs/executable-licensing.md (Phase 3).
 *
 * Run with: node backend/migrations/20260703_zenithgrid_licensing_permissions.js
 */

import { query } from '../config/database.js';

const PERMISSION_KEY = 'manage.zenithgrid_licenses.enable';

async function up() {
  console.log('🚀 ZenithGrid licensing permission migration starting...');
  await query('BEGIN');
  try {
    await query(
      `INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
       VALUES ($1, 'zenithgrid_licenses', 'manage', 'Issue, revoke, and list ZenithGrid software licenses', true)
       ON CONFLICT (permission_key) DO NOTHING`,
      [PERMISSION_KEY]
    );
    console.log(`  ✅ permission: ${PERMISSION_KEY}`);

    for (const roleName of ['executive', 'admin']) {
      await query(
        `INSERT INTO role_permissions (role_id, permission_id, is_granted)
         SELECT r.id, p.id, true
           FROM roles r CROSS JOIN permissions p
          WHERE r.name = $1 AND p.permission_key = $2
         ON CONFLICT (role_id, permission_id)
           DO UPDATE SET is_granted = true`,
        [roleName, PERMISSION_KEY]
      );
      console.log(`  ✅ granted to ${roleName}`);
    }

    const verify = await query(
      `SELECT r.name AS role_name, p.permission_key
         FROM roles r
         JOIN role_permissions rp ON rp.role_id = r.id AND rp.is_granted = true
         JOIN permissions p ON p.id = rp.permission_id
        WHERE p.permission_key = $1
        ORDER BY r.name`,
      [PERMISSION_KEY]
    );
    console.log('📊 Grants:');
    for (const row of verify.rows) {
      console.log(`    ${row.role_name}: ${row.permission_key}`);
    }

    await query('COMMIT');
    console.log('✅ ZenithGrid licensing permission migration complete.');
  } catch (err) {
    await query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  }
}

async function down() {
  console.log('🔄 Rolling back ZenithGrid licensing permission...');
  await query('BEGIN');
  try {
    await query(
      `DELETE FROM role_permissions
        WHERE permission_id IN (SELECT id FROM permissions WHERE permission_key = $1)`,
      [PERMISSION_KEY]
    );
    await query(`DELETE FROM permissions WHERE permission_key = $1`, [PERMISSION_KEY]);
    await query('COMMIT');
    console.log('✅ Rolled back.');
  } catch (err) {
    await query('ROLLBACK');
    console.error('❌ Rollback failed:', err);
    throw err;
  }
}

const command = process.argv[2] || 'up';
if (command === 'up') {
  up().then(() => process.exit(0)).catch(() => process.exit(1));
} else if (command === 'down') {
  down().then(() => process.exit(0)).catch(() => process.exit(1));
} else {
  console.error(`Unknown command: ${command}. Use "up" or "down".`);
  process.exit(1);
}

export { up, down };
