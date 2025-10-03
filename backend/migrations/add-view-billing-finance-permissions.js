/**
 * Migration: Add View Permissions for Billing & Finance Components
 *
 * Creates view permissions for:
 * - Invoices
 * - Service Hour Rates
 * - Pricing Settings
 *
 * Assigns permissions to executive, admin, and sales roles
 */

import { query } from '../config/database.js';

export async function up() {
  console.log('🔐 Adding view permissions for Billing & Finance components...');

  try {
    // Define permissions to create
    const permissions = [
      {
        key: 'view.invoices.enable',
        resource: 'invoices',
        action: 'view',
        description: 'View invoices section'
      },
      {
        key: 'view.service_hour_rates.enable',
        resource: 'service_hour_rates',
        action: 'view',
        description: 'View service hour rates section'
      },
      {
        key: 'view.pricing_settings.enable',
        resource: 'pricing_settings',
        action: 'view',
        description: 'View pricing settings section'
      }
    ];

    // Create permissions
    for (const perm of permissions) {
      const result = await query(`
        INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (permission_key) DO NOTHING
        RETURNING id
      `, [perm.key, perm.resource, perm.action, perm.description]);

      if (result.rows.length > 0) {
        console.log(`✅ Created permission: ${perm.key}`);
      } else {
        console.log(`ℹ️  Permission already exists: ${perm.key}`);
      }
    }

    // Get role IDs for executive, admin, and sales
    const rolesResult = await query(`
      SELECT id, name FROM roles WHERE name IN ('executive', 'admin', 'sales')
    `);

    const roles = {};
    for (const row of rolesResult.rows) {
      roles[row.name] = row.id;
    }

    // Get permission IDs
    const permissionsResult = await query(`
      SELECT id, permission_key FROM permissions
      WHERE permission_key IN ('view.invoices.enable', 'view.service_hour_rates.enable', 'view.pricing_settings.enable')
    `);

    const permissionIds = {};
    for (const row of permissionsResult.rows) {
      permissionIds[row.permission_key] = row.id;
    }

    // Assign permissions to roles
    for (const roleName of ['executive', 'admin', 'sales']) {
      const roleId = roles[roleName];

      for (const permKey of Object.keys(permissionIds)) {
        const permId = permissionIds[permKey];

        await query(`
          INSERT INTO role_permissions (role_id, permission_id, is_granted)
          VALUES ($1, $2, true)
          ON CONFLICT (role_id, permission_id)
          DO UPDATE SET is_granted = true
        `, [roleId, permId]);

        console.log(`✅ Granted ${permKey} to ${roleName}`);
      }
    }

    console.log('✅ Successfully added Billing & Finance view permissions');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

export async function down() {
  console.log('🔄 Rolling back Billing & Finance view permissions...');

  try {
    // Remove role permissions
    await query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions
        WHERE permission_key IN (
          'view.invoices.enable',
          'view.service_hour_rates.enable',
          'view.pricing_settings.enable'
        )
      )
    `);

    // Remove permissions
    await query(`
      DELETE FROM permissions
      WHERE permission_key IN (
        'view.invoices.enable',
        'view.service_hour_rates.enable',
        'view.pricing_settings.enable'
      )
    `);

    console.log('✅ Rollback completed');

  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}
