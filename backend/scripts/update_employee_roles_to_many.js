#!/usr/bin/env node

import { query, pool } from '../config/database.js';

async function updateEmployeeRoles() {
  const client = await pool.connect();

  try {
    console.log('🚀 Starting employee roles migration to one-to-many relationship...');

    // Start transaction
    await client.query('BEGIN');

    // 1. Create employee_roles table for one-to-many relationship
    console.log('📋 Creating employee_roles table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL,
        role VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        UNIQUE(employee_id, role)
      )
    `);

    // 2. Migrate existing single role data to employee_roles table
    console.log('🔄 Migrating existing role data...');
    const existingEmployees = await client.query(`
      SELECT id, role FROM employees WHERE role IS NOT NULL
    `);

    console.log(`Found ${existingEmployees.rows.length} employees with roles to migrate`);

    for (const employee of existingEmployees.rows) {
      await client.query(`
        INSERT INTO employee_roles (employee_id, role)
        VALUES ($1, $2)
        ON CONFLICT (employee_id, role) DO NOTHING
      `, [employee.id, employee.role]);
    }

    // 3. Add roles column as JSONB for easier querying (optional, keeps backward compatibility)
    console.log('📋 Adding roles JSONB column to employees table...');
    await client.query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS roles JSONB DEFAULT '[]'
    `);

    // 4. Update the roles JSONB column with current role data
    console.log('🔄 Updating roles JSONB column...');
    await client.query(`
      UPDATE employees
      SET roles = COALESCE(
        (
          SELECT json_agg(er.role)
          FROM employee_roles er
          WHERE er.employee_id = employees.id
        ),
        '[]'
      )
    `);

    // 5. Create indexes for performance
    console.log('📊 Creating indexes...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employee_roles_employee_id
      ON employee_roles(employee_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employee_roles_role
      ON employee_roles(role)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employees_roles_gin
      ON employees USING gin(roles)
    `);

    // Commit transaction
    await client.query('COMMIT');

    console.log('✅ Employee roles migration completed successfully!');
    console.log('📊 Summary:');
    console.log('   - Created employee_roles table for one-to-many relationship');
    console.log('   - Migrated existing role data to new table');
    console.log('   - Added roles JSONB column for efficient querying');
    console.log('   - Created performance indexes');
    console.log('   - Maintained backward compatibility with role column');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateEmployeeRoles()
    .then(() => {
      console.log('🎉 Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

export default updateEmployeeRoles;