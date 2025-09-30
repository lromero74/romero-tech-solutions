#!/usr/bin/env node

/**
 * Create Test Employees for Permission Testing
 *
 * Creates 3 test employees with specific single roles:
 * - admin-test@romerotechsolutions.com (Admin role only)
 * - sales-test@romerotechsolutions.com (Sales role only)
 * - tech-test@romerotechsolutions.com (Technician role only)
 *
 * Password for all: Test123!@#
 *
 * Run: node backend/scripts/create_test_employees.js
 */

import { query } from '../config/database.js';
import bcrypt from 'bcryptjs';

async function createTestEmployees() {
  console.log('🧪 Creating test employees for permission testing...\n');

  try {
    // Password hash for "Test123!@#"
    const passwordHash = await bcrypt.hash('Test123!@#', 10);

    // Get role IDs
    const rolesResult = await query(`
      SELECT id, name FROM roles WHERE name IN ('admin', 'sales', 'technician')
    `);

    const roles = {};
    rolesResult.rows.forEach(row => {
      roles[row.name] = row.id;
    });

    console.log('✅ Found roles:', Object.keys(roles).join(', '), '\n');

    // Test employee data
    const testEmployees = [
      {
        email: 'admin-test@romerotechsolutions.com',
        firstName: 'Admin',
        lastName: 'Tester',
        role: 'admin',
        roleId: roles.admin
      },
      {
        email: 'sales-test@romerotechsolutions.com',
        firstName: 'Sales',
        lastName: 'Tester',
        role: 'sales',
        roleId: roles.sales
      },
      {
        email: 'tech-test@romerotechsolutions.com',
        firstName: 'Tech',
        lastName: 'Tester',
        role: 'technician',
        roleId: roles.technician
      }
    ];

    for (const emp of testEmployees) {
      console.log(`Creating ${emp.role} test employee: ${emp.email}`);

      // Check if employee already exists
      const existingResult = await query(
        'SELECT id FROM employees WHERE email = $1',
        [emp.email]
      );

      let employeeId;

      if (existingResult.rows.length > 0) {
        console.log('  ⚠️  Employee already exists, skipping creation');
        employeeId = existingResult.rows[0].id;
      } else {
        // Create employee
        const employeeResult = await query(`
          INSERT INTO employees (
            email,
            password_hash,
            first_name,
            last_name,
            is_active,
            employee_number,
            hire_date
          ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)
          RETURNING id
        `, [
          emp.email,
          passwordHash,
          emp.firstName,
          emp.lastName,
          true,
          `TEST-${emp.role.toUpperCase()}-001`
        ]);

        employeeId = employeeResult.rows[0].id;
        console.log(`  ✅ Created employee: ${employeeId}`);
      }

      // Check if role assignment already exists
      const existingRoleResult = await query(`
        SELECT id FROM employee_roles
        WHERE employee_id = $1 AND role_id = $2
      `, [employeeId, emp.roleId]);

      if (existingRoleResult.rows.length > 0) {
        console.log(`  ⚠️  Role already assigned`);
      } else {
        // Assign role
        await query(`
          INSERT INTO employee_roles (employee_id, role_id)
          VALUES ($1, $2)
        `, [employeeId, emp.roleId]);

        console.log(`  ✅ Assigned ${emp.role} role`);
      }

      console.log();
    }

    console.log('═══════════════════════════════════════════════════');
    console.log('🎉 Test employees created successfully!');
    console.log('═══════════════════════════════════════════════════');
    console.log('\nLogin credentials:');
    console.log('  • admin-test@romerotechsolutions.com / Test123!@#');
    console.log('  • sales-test@romerotechsolutions.com / Test123!@#');
    console.log('  • tech-test@romerotechsolutions.com / Test123!@#');
    console.log('\nUse these accounts to test permission restrictions!');

  } catch (error) {
    console.error('❌ Error creating test employees:', error);
    process.exit(1);
  }

  process.exit(0);
}

createTestEmployees();