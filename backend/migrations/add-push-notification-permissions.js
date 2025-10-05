/**
 * Migration: Add Push Notification Permissions
 *
 * This migration creates RBAC permissions for push notification functionality
 * and grants them to appropriate roles.
 *
 * Permissions created:
 * - push_notifications.send_test - Send test push notifications
 * - push_notifications.manage_subscriptions - Manage push notification subscriptions
 * - push_notifications.view_preferences - View push notification preferences
 * - push_notifications.update_preferences - Update push notification preferences
 *
 * Default role assignments:
 * - Executive: All push notification permissions
 * - Admin: All push notification permissions
 * - Manager: Send test notifications, view preferences
 * - Sales: View preferences only
 * - Technician: View preferences only
 */

import { query } from '../config/database.js';

async function up() {
  const client = await query('SELECT NOW()');

  try {
    console.log('🚀 Starting push notification permissions migration...');

    // Begin transaction
    await query('BEGIN');

    // Step 1: Create the permissions
    console.log('📝 Creating push notification permissions...');

    const permissions = [
      {
        key: 'push_notifications.send_test',
        resource: 'push_notifications',
        action: 'send_test',
        description: 'Send test push notifications to verify system functionality'
      },
      {
        key: 'push_notifications.manage_subscriptions',
        resource: 'push_notifications',
        action: 'manage_subscriptions',
        description: 'Manage push notification subscriptions for users and employees'
      },
      {
        key: 'push_notifications.view_preferences',
        resource: 'push_notifications',
        action: 'view_preferences',
        description: 'View push notification preferences'
      },
      {
        key: 'push_notifications.update_preferences',
        resource: 'push_notifications',
        action: 'update_preferences',
        description: 'Update push notification preferences'
      }
    ];

    for (const perm of permissions) {
      await query(
        `INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (permission_key) DO NOTHING`,
        [perm.key, perm.resource, perm.action, perm.description]
      );
      console.log(`  ✅ Created permission: ${perm.key}`);
    }

    // Step 2: Grant permissions to roles
    console.log('🔐 Granting permissions to roles...');

    // Grant all push notification permissions to Executive and Admin
    const fullAccessRoles = ['executive', 'admin'];
    for (const roleName of fullAccessRoles) {
      for (const perm of permissions) {
        await query(
          `INSERT INTO role_permissions (role_id, permission_id, is_granted)
           SELECT r.id, p.id, true
           FROM roles r
           CROSS JOIN permissions p
           WHERE r.name = $1 AND p.permission_key = $2
           ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true`,
          [roleName, perm.key]
        );
      }
      console.log(`  ✅ Granted all push notification permissions to ${roleName}`);
    }

    // Grant limited permissions to Manager
    const managerPermissions = ['push_notifications.send_test', 'push_notifications.view_preferences'];
    for (const permKey of managerPermissions) {
      await query(
        `INSERT INTO role_permissions (role_id, permission_id, is_granted)
         SELECT r.id, p.id, true
         FROM roles r
         CROSS JOIN permissions p
         WHERE r.name = 'manager' AND p.permission_key = $1
         ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true`,
        [permKey]
      );
    }
    console.log(`  ✅ Granted limited push notification permissions to manager`);

    // Grant view-only permissions to Sales and Technician
    const viewOnlyRoles = ['sales', 'technician'];
    for (const roleName of viewOnlyRoles) {
      await query(
        `INSERT INTO role_permissions (role_id, permission_id, is_granted)
         SELECT r.id, p.id, true
         FROM roles r
         CROSS JOIN permissions p
         WHERE r.name = $1 AND p.permission_key = 'push_notifications.view_preferences'
         ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true`,
        [roleName]
      );
      console.log(`  ✅ Granted view-only push notification permissions to ${roleName}`);
    }

    // Step 3: Verify the permissions were created and granted
    console.log('🔍 Verifying permissions...');

    const verificationResult = await query(`
      SELECT r.name as role_name, p.permission_key
      FROM roles r
      JOIN role_permissions rp ON r.id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE p.permission_key LIKE 'push_notifications%' AND rp.is_granted = true
      ORDER BY r.name, p.permission_key
    `);

    console.log('📊 Permission grants created:');
    for (const row of verificationResult.rows) {
      console.log(`    ${row.role_name}: ${row.permission_key}`);
    }

    // Commit transaction
    await query('COMMIT');
    console.log('✅ Push notification permissions migration completed successfully!');

  } catch (error) {
    // Rollback on error
    await query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function down() {
  try {
    console.log('🔄 Rolling back push notification permissions migration...');

    await query('BEGIN');

    // Remove role_permissions entries
    await query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions
        WHERE permission_key LIKE 'push_notifications%'
      )
    `);

    // Remove permissions
    await query(`
      DELETE FROM permissions
      WHERE permission_key LIKE 'push_notifications%'
    `);

    await query('COMMIT');
    console.log('✅ Rollback completed successfully');

  } catch (error) {
    await query('ROLLBACK');
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

// Run the migration
const args = process.argv.slice(2);
if (args.includes('--down')) {
  down().then(() => process.exit(0)).catch(() => process.exit(1));
} else {
  up().then(() => process.exit(0)).catch(() => process.exit(1));
}