#!/usr/bin/env node

/**
 * Create Permissions System
 *
 * This script creates the comprehensive role-based permission system for Romero Tech Solutions.
 * It creates tables, seeds permissions, and assigns default permissions to roles.
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   node backend/scripts/create_permissions_system.js
 */

import { query } from '../config/database.js';

async function createPermissionsSystem() {
  console.log('🔐 Creating Role-Based Permission System...\n');

  try {
    // ===== PHASE 1: Create Tables =====
    console.log('📊 Phase 1: Creating tables...');

    // Create permissions table
    await query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        permission_key VARCHAR(255) UNIQUE NOT NULL,
        resource_type VARCHAR(100) NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✅ Created permissions table');

    // Create role_permissions junction table
    await query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        is_granted BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(role_id, permission_id)
      )
    `);
    console.log('  ✅ Created role_permissions table');

    // Create permission_audit_log table
    await query(`
      CREATE TABLE IF NOT EXISTS permission_audit_log (
        log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        employee_id UUID NOT NULL REFERENCES employees(id),
        permission_key VARCHAR(255) NOT NULL,
        result VARCHAR(20) NOT NULL,
        role_used UUID REFERENCES roles(id),
        action_details JSONB,
        resource_type VARCHAR(100),
        resource_id UUID,
        ip_address INET,
        user_agent TEXT
      )
    `);
    console.log('  ✅ Created permission_audit_log table');

    // Create indexes for performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_permission_audit_log_employee
        ON permission_audit_log(employee_id);
      CREATE INDEX IF NOT EXISTS idx_permission_audit_log_timestamp
        ON permission_audit_log(action_timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_permission_audit_log_result
        ON permission_audit_log(result);
      CREATE INDEX IF NOT EXISTS idx_role_permissions_role
        ON role_permissions(role_id);
    `);
    console.log('  ✅ Created indexes');

    // ===== PHASE 2: Seed Permissions =====
    console.log('\n📝 Phase 2: Seeding permissions...');

    const permissionsData = [
      // Business permissions
      { key: 'add.businesses.enable', resource: 'businesses', action: 'add', desc: 'Create new businesses' },
      { key: 'modify.businesses.enable', resource: 'businesses', action: 'modify', desc: 'Edit existing businesses' },
      { key: 'softDelete.businesses.enable', resource: 'businesses', action: 'softDelete', desc: 'Soft delete/deactivate businesses' },
      { key: 'hardDelete.businesses.enable', resource: 'businesses', action: 'hardDelete', desc: 'Permanently delete businesses' },

      // Service Location permissions
      { key: 'add.service_locations.enable', resource: 'service_locations', action: 'add', desc: 'Create new service locations' },
      { key: 'modify.service_locations.enable', resource: 'service_locations', action: 'modify', desc: 'Edit existing service locations' },
      { key: 'softDelete.service_locations.enable', resource: 'service_locations', action: 'softDelete', desc: 'Soft delete/deactivate service locations' },
      { key: 'hardDelete.service_locations.enable', resource: 'service_locations', action: 'hardDelete', desc: 'Permanently delete service locations (including last record)' },

      // Client/User permissions
      { key: 'add.users.enable', resource: 'users', action: 'add', desc: 'Create new client accounts' },
      { key: 'modify.users.enable', resource: 'users', action: 'modify', desc: 'Edit client account information' },
      { key: 'modify.users.photo.enable', resource: 'users', action: 'modify', desc: 'Edit client profile photos (others)' },
      { key: 'softDelete.users.enable', resource: 'users', action: 'softDelete', desc: 'Soft delete/deactivate client accounts' },
      { key: 'hardDelete.users.enable', resource: 'users', action: 'hardDelete', desc: 'Permanently delete client accounts (including last record)' },

      // Permission matrix management
      { key: 'modify.role_permissions.enable', resource: 'role_permissions', action: 'modify', desc: 'Modify permission matrices for roles' },
      { key: 'view.permission_audit_log.enable', resource: 'permission_audit_log', action: 'view', desc: 'View permission audit logs' },
    ];

    for (const perm of permissionsData) {
      await query(`
        INSERT INTO permissions (permission_key, resource_type, action_type, description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (permission_key) DO UPDATE SET
          resource_type = EXCLUDED.resource_type,
          action_type = EXCLUDED.action_type,
          description = EXCLUDED.description,
          updated_at = CURRENT_TIMESTAMP
      `, [perm.key, perm.resource, perm.action, perm.desc]);
    }
    console.log(`  ✅ Seeded ${permissionsData.length} permissions`);

    // ===== PHASE 3: Get Role IDs =====
    console.log('\n🎭 Phase 3: Fetching role IDs...');

    const rolesResult = await query(`
      SELECT id, name FROM roles WHERE name IN ('executive', 'admin', 'sales', 'technician')
    `);

    const roles = {};
    rolesResult.rows.forEach(row => {
      roles[row.name] = row.id;
    });

    console.log(`  ✅ Found ${Object.keys(roles).length} roles: ${Object.keys(roles).join(', ')}`);

    // ===== PHASE 4: Assign Permissions to Roles (with Inheritance Model) =====
    console.log('\n🔗 Phase 4: Assigning BASE permissions to roles (inheritance handled in code)...');
    console.log('📚 Role Hierarchy: Executive > Admin > Technician | Sales (independent branch)\n');

    // Helper function to assign permission to role
    async function assignPermission(roleName, permissionKey) {
      const roleId = roles[roleName];
      if (!roleId) {
        console.log(`  ⚠️  Role ${roleName} not found, skipping...`);
        return;
      }

      const permResult = await query(`
        SELECT id FROM permissions WHERE permission_key = $1
      `, [permissionKey]);

      if (permResult.rows.length === 0) {
        console.log(`  ⚠️  Permission ${permissionKey} not found, skipping...`);
        return;
      }

      const permissionId = permResult.rows[0].id;

      await query(`
        INSERT INTO role_permissions (role_id, permission_id, is_granted)
        VALUES ($1, $2, true)
        ON CONFLICT (role_id, permission_id) DO UPDATE SET
          is_granted = true,
          updated_at = CURRENT_TIMESTAMP
      `, [roleId, permissionId]);
    }

    // Technician (BASE LEVEL): Edit service locations, edit users (self-editing enforced in code)
    console.log('  📋 Assigning Technician permissions (BASE LEVEL)...');
    const technicianPermissions = [
      'modify.service_locations.enable',
      'modify.users.enable',
    ];
    for (const permKey of technicianPermissions) {
      await assignPermission('technician', permKey);
    }
    console.log(`     ✅ Technician: ${technicianPermissions.length} base permissions`);

    // Admin (INHERITS Technician): Adds soft delete, add operations, photo management
    // NOTE: Does NOT include modify.service_locations.enable and modify.users.enable (inherited from Technician)
    console.log('  📋 Assigning Admin permissions (INHERITS Technician)...');
    const adminExclusivePermissions = [
      'modify.businesses.enable',
      'softDelete.businesses.enable',
      'add.service_locations.enable',
      'softDelete.service_locations.enable',
      'add.users.enable',
      'modify.users.photo.enable',
      'softDelete.users.enable',
    ];
    for (const permKey of adminExclusivePermissions) {
      await assignPermission('admin', permKey);
    }
    console.log(`     ✅ Admin: ${adminExclusivePermissions.length} exclusive permissions + ${technicianPermissions.length} inherited from Technician = ${adminExclusivePermissions.length + technicianPermissions.length} total`);

    // Sales (INDEPENDENT BRANCH): Add/modify businesses, add service locations, add clients
    console.log('  📋 Assigning Sales permissions (INDEPENDENT BRANCH)...');
    const salesPermissions = [
      'add.businesses.enable',
      'modify.businesses.enable',
      'add.service_locations.enable',
      'add.users.enable',
    ];
    for (const permKey of salesPermissions) {
      await assignPermission('sales', permKey);
    }
    console.log(`     ✅ Sales: ${salesPermissions.length} permissions (no inheritance)`);

    // Executive (INHERITS ALL): Assign all permissions directly (simpler than inheritance calculation)
    console.log('  📋 Assigning Executive permissions (ALL PERMISSIONS)...');
    const allPermissions = permissionsData.map(p => p.key);
    for (const permKey of allPermissions) {
      await assignPermission('executive', permKey);
    }
    console.log(`     ✅ Executive: ${allPermissions.length} permissions (inherits from all roles, assigned directly for simplicity)`);

    // ===== PHASE 5: Summary =====
    console.log('\n📊 Summary:');

    const permCount = await query('SELECT COUNT(*) as count FROM permissions');
    console.log(`  • Permissions: ${permCount.rows[0].count}`);

    const rolePerm = await query(`
      SELECT r.name, COUNT(rp.id) as perm_count
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id AND rp.is_granted = true
      WHERE r.name IN ('executive', 'admin', 'sales', 'technician')
      GROUP BY r.name
      ORDER BY r.name
    `);

    console.log('  • Role Permissions:');
    rolePerm.rows.forEach(row => {
      console.log(`    - ${row.name}: ${row.perm_count} permissions`);
    });

    console.log('\n✅ Permission system created successfully!\n');

  } catch (error) {
    console.error('❌ Error creating permissions system:', error);
    throw error;
  }
}

// Run the script
createPermissionsSystem()
  .then(() => {
    console.log('🎉 Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  });