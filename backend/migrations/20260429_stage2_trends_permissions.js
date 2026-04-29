/**
 * Migration: Stage 2 — Trend / forecast / anomaly RBAC permissions
 *
 * Schema for the four time-series tables is created by the companion
 * .sql migration 20260429_stage2_trends_schema.sql — run that first.
 *
 * Default role assignments:
 * - Executive + Admin: ALL Stage 2 permissions, including manage.agent_baselines
 * - Manager + Technician: view.agent_trends + view.agent_disk_forecast
 * - Sales: view.agent_trends only (account-conversation summary)
 *
 * See docs/PRPs/STAGE2_TRENDS.md.
 *
 * Run with: node backend/migrations/20260429_stage2_trends_permissions.js up
 */

import { query } from '../config/database.js';

const STAGE2_PERMISSIONS = [
  {
    key: 'view.agent_trends.enable',
    resource: 'agent_trends',
    action: 'view',
    description: 'View trend dashboards (forecast, baselines, anomalies, WAN IP) for agent devices'
  },
  {
    key: 'view.agent_disk_forecast.enable',
    resource: 'agent_disk_forecast',
    action: 'view',
    description: 'View per-device disk-space forecast (linear regression on 30-day usage history)'
  },
  {
    key: 'manage.agent_baselines.enable',
    resource: 'agent_baselines',
    action: 'manage',
    description: 'Override or recompute per-device performance baselines (mean ± stddev)'
  }
];

const VIEW_KEYS = STAGE2_PERMISSIONS
  .filter(p => p.action === 'view')
  .map(p => p.key);

async function up() {
  console.log('🚀 Stage 2 trend / forecast permissions migration starting...');
  await query('BEGIN');
  try {
    for (const perm of STAGE2_PERMISSIONS) {
      await query(
        `INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (permission_key) DO NOTHING`,
        [perm.key, perm.resource, perm.action, perm.description]
      );
      console.log(`  ✅ permission: ${perm.key}`);
    }

    for (const roleName of ['executive', 'admin']) {
      for (const perm of STAGE2_PERMISSIONS) {
        await query(
          `INSERT INTO role_permissions (role_id, permission_id, is_granted)
           SELECT r.id, p.id, true
             FROM roles r CROSS JOIN permissions p
            WHERE r.name = $1 AND p.permission_key = $2
           ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true`,
          [roleName, perm.key]
        );
      }
      console.log(`  ✅ all Stage 2 permissions granted to ${roleName}`);
    }

    for (const roleName of ['manager', 'technician']) {
      for (const key of VIEW_KEYS) {
        await query(
          `INSERT INTO role_permissions (role_id, permission_id, is_granted)
           SELECT r.id, p.id, true
             FROM roles r CROSS JOIN permissions p
            WHERE r.name = $1 AND p.permission_key = $2
           ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true`,
          [roleName, key]
        );
      }
      console.log(`  ✅ view-only Stage 2 permissions granted to ${roleName}`);
    }

    await query(
      `INSERT INTO role_permissions (role_id, permission_id, is_granted)
       SELECT r.id, p.id, true
         FROM roles r CROSS JOIN permissions p
        WHERE r.name = 'sales' AND p.permission_key = 'view.agent_trends.enable'
       ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true`
    );
    console.log('  ✅ summary view granted to sales');

    const verify = await query(`
      SELECT r.name AS role_name, p.permission_key
        FROM roles r
        JOIN role_permissions rp ON rp.role_id = r.id AND rp.is_granted = true
        JOIN permissions p ON p.id = rp.permission_id
       WHERE p.permission_key = ANY ($1)
       ORDER BY r.name, p.permission_key
    `, [STAGE2_PERMISSIONS.map(p => p.key)]);
    console.log('📊 Stage 2 grants:');
    for (const row of verify.rows) {
      console.log(`    ${row.role_name}: ${row.permission_key}`);
    }

    await query('COMMIT');
    console.log('✅ Stage 2 permissions migration complete.');
  } catch (err) {
    await query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  }
}

async function down() {
  console.log('🔄 Rolling back Stage 2 permissions...');
  await query('BEGIN');
  try {
    const keys = STAGE2_PERMISSIONS.map(p => p.key);
    await query(
      `DELETE FROM role_permissions
        WHERE permission_id IN (SELECT id FROM permissions WHERE permission_key = ANY ($1))`,
      [keys]
    );
    await query(`DELETE FROM permissions WHERE permission_key = ANY ($1)`, [keys]);
    await query('COMMIT');
    console.log('✅ Stage 2 permissions rolled back.');
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
