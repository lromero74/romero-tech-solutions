/**
 * Migration: Stage 1 — Health-Check RBAC Permissions
 *
 * Seeds the 9 RBAC permission keys for the Stage 1 health-check collectors
 * (pending-reboot, time-drift, crashdumps, top-processes, listening-ports,
 * update-history, domain-status, mapped-drives) plus the client-side
 * transparency-report permission, and grants them to roles.
 *
 * Schema for the agent_check_results / agent_check_history tables is created
 * by the companion .sql migration 20260428_agent_check_results.sql — run that
 * first.
 *
 * Default role assignments:
 * - Executive: ALL Stage 1 permissions (executive role gets everything implicitly
 *   in getUserPermissions() but _checkPermissionInDatabase() does NOT — fine-grained
 *   backend checks still go through role_permissions, so we grant explicitly).
 * - Admin: ALL Stage 1 permissions
 * - Manager: All view permissions; NOT manage.processes (kill is dangerous)
 * - Technician: All view permissions; NOT manage.processes (audit-trail risk)
 * - Sales: View health-checks summary only (so account managers can speak to it)
 *
 * Per CLAUDE.md, manage.processes.enable is opt-in only — start with
 * executive + admin; grant to technician case-by-case, never via this migration.
 *
 * See docs/PRPs/STAGE1_HEALTH_CHECKS.md.
 *
 * Run with: node backend/migrations/20260428_stage1_health_check_permissions.js
 */

import { query } from '../config/database.js';

const STAGE1_PERMISSIONS = [
  {
    key: 'view.agent_health_checks.enable',
    resource: 'agent_health_checks',
    action: 'view',
    description: 'View latest health-check results for agent devices'
  },
  {
    key: 'view.agent_top_processes.enable',
    resource: 'agent_top_processes',
    action: 'view',
    description: 'View Top-N processes by CPU/RAM per agent'
  },
  {
    key: 'manage.processes.enable',
    resource: 'processes',
    action: 'manage',
    description: 'Kill processes on agent devices (audit-logged action)'
  },
  {
    key: 'view.agent_listening_ports.enable',
    resource: 'agent_listening_ports',
    action: 'view',
    description: 'View listening-ports snapshot per agent'
  },
  {
    key: 'view.agent_update_history.enable',
    resource: 'agent_update_history',
    action: 'view',
    description: 'View OS update install/failure history per agent'
  },
  {
    key: 'view.agent_domain_status.enable',
    resource: 'agent_domain_status',
    action: 'view',
    description: 'View domain-join / hostname audit per agent'
  },
  {
    key: 'view.agent_mapped_drives.enable',
    resource: 'agent_mapped_drives',
    action: 'view',
    description: 'View Windows mapped-drive audit per agent'
  },
  {
    key: 'view.agent_time_drift.enable',
    resource: 'agent_time_drift',
    action: 'view',
    description: 'View NTP time-drift status per agent'
  },
  {
    key: 'view.agent_transparency_report.enable',
    resource: 'agent_transparency_report',
    action: 'view',
    description: 'Client-side: view transparency report for own-business agents'
  }
];

const VIEW_KEYS = STAGE1_PERMISSIONS
  .filter(p => p.action === 'view' && p.key !== 'view.agent_transparency_report.enable')
  .map(p => p.key);

async function up() {
  console.log('🚀 Stage 1 health-check permissions migration starting...');
  await query('BEGIN');
  try {
    // Step 1 — create permissions
    for (const perm of STAGE1_PERMISSIONS) {
      await query(
        `INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (permission_key) DO NOTHING`,
        [perm.key, perm.resource, perm.action, perm.description]
      );
      console.log(`  ✅ permission: ${perm.key}`);
    }

    // Step 2 — grant ALL Stage 1 permissions to executive + admin
    for (const roleName of ['executive', 'admin']) {
      for (const perm of STAGE1_PERMISSIONS) {
        await query(
          `INSERT INTO role_permissions (role_id, permission_id, is_granted)
           SELECT r.id, p.id, true
             FROM roles r CROSS JOIN permissions p
            WHERE r.name = $1 AND p.permission_key = $2
           ON CONFLICT (role_id, permission_id)
             DO UPDATE SET is_granted = true`,
          [roleName, perm.key]
        );
      }
      console.log(`  ✅ all Stage 1 permissions granted to ${roleName}`);
    }

    // Step 3 — grant view-only Stage 1 permissions to manager + technician
    // (NOT manage.processes — that one is opt-in by IT-lead approval only.)
    for (const roleName of ['manager', 'technician']) {
      for (const key of VIEW_KEYS) {
        await query(
          `INSERT INTO role_permissions (role_id, permission_id, is_granted)
           SELECT r.id, p.id, true
             FROM roles r CROSS JOIN permissions p
            WHERE r.name = $1 AND p.permission_key = $2
           ON CONFLICT (role_id, permission_id)
             DO UPDATE SET is_granted = true`,
          [roleName, key]
        );
      }
      console.log(`  ✅ view-only Stage 1 permissions granted to ${roleName}`);
    }

    // Step 4 — grant top-level summary visibility to sales
    await query(
      `INSERT INTO role_permissions (role_id, permission_id, is_granted)
       SELECT r.id, p.id, true
         FROM roles r CROSS JOIN permissions p
        WHERE r.name = 'sales' AND p.permission_key = 'view.agent_health_checks.enable'
       ON CONFLICT (role_id, permission_id)
         DO UPDATE SET is_granted = true`
    );
    console.log('  ✅ summary view granted to sales');

    // Step 5 — verify
    const verify = await query(`
      SELECT r.name AS role_name, p.permission_key
        FROM roles r
        JOIN role_permissions rp ON rp.role_id = r.id AND rp.is_granted = true
        JOIN permissions p ON p.id = rp.permission_id
       WHERE p.permission_key = ANY ($1)
       ORDER BY r.name, p.permission_key
    `, [STAGE1_PERMISSIONS.map(p => p.key)]);
    console.log('📊 Stage 1 grants:');
    for (const row of verify.rows) {
      console.log(`    ${row.role_name}: ${row.permission_key}`);
    }

    await query('COMMIT');
    console.log('✅ Stage 1 health-check permissions migration complete.');
  } catch (err) {
    await query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  }
}

async function down() {
  console.log('🔄 Rolling back Stage 1 health-check permissions...');
  await query('BEGIN');
  try {
    const keys = STAGE1_PERMISSIONS.map(p => p.key);
    await query(
      `DELETE FROM role_permissions
        WHERE permission_id IN (SELECT id FROM permissions WHERE permission_key = ANY ($1))`,
      [keys]
    );
    await query(
      `DELETE FROM permissions WHERE permission_key = ANY ($1)`,
      [keys]
    );
    await query('COMMIT');
    console.log('✅ Stage 1 permissions rolled back.');
  } catch (err) {
    await query('ROLLBACK');
    console.error('❌ Rollback failed:', err);
    throw err;
  }
}

// CLI dispatch
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
