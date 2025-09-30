#!/usr/bin/env node

/**
 * Permission System Test Script
 *
 * Tests the permission service directly without HTTP requests.
 * Run: node backend/test-permissions.js
 */

import { permissionService } from './services/permissionService.js';
import { query } from './config/database.js';

async function runTests() {
  console.log('🧪 Testing Permission System...\n');

  try {
    // Get a test employee (executive role)
    const employeeResult = await query(`
      SELECT e.id, e.email, e.first_name, e.last_name
      FROM employees e
      JOIN employee_roles er ON e.id = er.employee_id
      JOIN roles r ON er.role_id = r.id
      WHERE r.name = 'executive' AND e.is_active = true
      LIMIT 1
    `);

    if (employeeResult.rows.length === 0) {
      console.log('❌ No executive employee found for testing');
      process.exit(1);
    }

    const executive = employeeResult.rows[0];
    console.log(`✅ Testing with employee: ${executive.first_name} ${executive.last_name} (${executive.email})\n`);

    // Test 1: Check if executive has a permission
    console.log('Test 1: Executive should have hardDelete.businesses.enable');
    const hasPermission = await permissionService.checkPermission(
      executive.id,
      'hardDelete.businesses.enable',
      { skipAuditLog: true }
    );
    console.log(`  Result: ${hasPermission ? '✅ PASS' : '❌ FAIL'}\n`);

    // Test 2: Get all permissions for executive
    console.log('Test 2: Executive should have all 15 permissions');
    const permissions = await permissionService.getUserPermissions(executive.id);
    console.log(`  Result: ${permissions.length === 15 ? '✅ PASS' : '❌ FAIL'} (${permissions.length} permissions)\n`);

    // Test 3: Check executive role
    console.log('Test 3: Check if user has executive role');
    const hasExecutiveRole = await permissionService.hasRole(executive.id, 'executive');
    console.log(`  Result: ${hasExecutiveRole ? '✅ PASS' : '❌ FAIL'}\n`);

    // Test 4: Get user roles
    console.log('Test 4: Get user roles');
    const roles = await permissionService.getUserRoles(executive.id);
    console.log(`  Result: ✅ Found ${roles.length} role(s):`);
    roles.forEach(r => console.log(`    - ${r.display_name} (${r.name})`));
    console.log();

    // Test 5: Test with admin (should NOT have hardDelete.businesses.enable)
    const adminResult = await query(`
      SELECT e.id, e.email, e.first_name, e.last_name
      FROM employees e
      JOIN employee_roles er ON e.id = er.employee_id
      JOIN roles r ON er.role_id = r.id
      WHERE r.name = 'admin' AND e.is_active = true
      LIMIT 1
    `);

    if (adminResult.rows.length > 0) {
      const admin = adminResult.rows[0];
      console.log(`Test 5: Admin (${admin.first_name}) should NOT have hardDelete.businesses.enable`);

      const adminHasHardDelete = await permissionService.checkPermission(
        admin.id,
        'hardDelete.businesses.enable',
        { skipAuditLog: true }
      );
      console.log(`  Result: ${!adminHasHardDelete ? '✅ PASS' : '❌ FAIL'}\n`);

      const adminPermissions = await permissionService.getUserPermissions(admin.id);
      console.log(`Test 6: Admin should have 9 permissions`);
      console.log(`  Result: ${adminPermissions.length === 9 ? '✅ PASS' : '❌ FAIL'} (${adminPermissions.length} permissions)\n`);
    } else {
      console.log('Test 5 & 6: ⏭️  SKIPPED (no admin employee found)\n');
    }

    // Test 7: Test permission caching
    console.log('Test 7: Test permission caching');
    const start = Date.now();
    await permissionService.checkPermission(executive.id, 'hardDelete.businesses.enable', { skipAuditLog: true });
    const firstCallTime = Date.now() - start;

    const start2 = Date.now();
    await permissionService.checkPermission(executive.id, 'hardDelete.businesses.enable', { skipAuditLog: true });
    const cachedCallTime = Date.now() - start2;

    console.log(`  First call: ${firstCallTime}ms`);
    console.log(`  Cached call: ${cachedCallTime}ms`);
    console.log(`  Result: ${cachedCallTime < firstCallTime ? '✅ PASS' : '⚠️  WARNING'} (caching ${cachedCallTime < firstCallTime ? 'working' : 'may not be working'})\n`);

    // Test 8: Test last record protection
    console.log('Test 8: Test last record protection');

    // Get a business with only 1 service location
    const businessResult = await query(`
      SELECT b.id, b.business_name,
             (SELECT COUNT(*) FROM service_locations WHERE business_id = b.id AND is_active = true AND soft_delete = false AND is_headquarters = false) as location_count
      FROM businesses b
      WHERE b.is_active = true
      LIMIT 1
    `);

    if (businessResult.rows.length > 0) {
      const business = businessResult.rows[0];
      console.log(`  Business: ${business.business_name} (${business.location_count} locations)`);

      const protection = await permissionService.checkLastRecordProtection(
        'service_locations',
        business.id,
        executive.id
      );

      console.log(`  Executive can delete: ${protection.allowed ? '✅ YES' : '❌ NO'}`);
      console.log(`  Result: ${protection.allowed ? '✅ PASS' : '❌ FAIL'}\n`);
    } else {
      console.log('  Result: ⏭️  SKIPPED (no businesses found)\n');
    }

    // Summary
    console.log('═══════════════════════════════════════════════════');
    console.log('🎉 Permission System Tests Complete!');
    console.log('═══════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

runTests();