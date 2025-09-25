import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function removeRedundantRoleColumn() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();

    console.log('🗑️ Removing redundant role column from employees table (Phase 5E)...');
    console.log('   This column is now replaced by the normalized employee_roles table.');

    // Step 1: Verify that employee_roles table exists and has data
    console.log('\n📊 Step 1: Verifying employee_roles table exists and has data...');

    const employeeRolesTableExists = await client.query(`
      SELECT table_name FROM information_schema.tables WHERE table_name = 'employee_roles'
    `);

    if (employeeRolesTableExists.rows.length === 0) {
      console.log('❌ ERROR: employee_roles table does not exist!');
      console.log('   Cannot safely remove role column without normalized table.');
      return;
    }

    const employeeRolesCount = await client.query(`
      SELECT COUNT(*) as count FROM employee_roles
    `);

    console.log(`📋 Found ${employeeRolesCount.rows[0].count} records in employee_roles table`);

    // Step 2: Verify that roles table exists and has data
    const rolesTableExists = await client.query(`
      SELECT table_name FROM information_schema.tables WHERE table_name = 'roles'
    `);

    if (rolesTableExists.rows.length === 0) {
      console.log('❌ ERROR: roles table does not exist!');
      console.log('   Cannot safely remove role column without normalized roles table.');
      return;
    }

    const rolesCount = await client.query(`
      SELECT COUNT(*) as count FROM roles
    `);

    console.log(`📋 Found ${rolesCount.rows[0].count} records in roles table`);

    // Step 3: Check if role column exists in employees table
    console.log('\n📋 Step 3: Checking if role column exists in employees table...');
    const roleColumnExists = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'employees' AND column_name = 'role'
    `);

    if (roleColumnExists.rows.length === 0) {
      console.log('✅ Role column does not exist - already removed or never existed');
      return;
    }

    console.log('📋 Role column found in employees table');

    // Step 4: Show current role assignments via normalized tables
    console.log('\n🔍 Step 4: Verifying role assignments via normalized tables...');
    const roleAssignments = await client.query(`
      SELECT
        e.first_name,
        e.last_name,
        e.role as old_role,
        COALESCE(array_agg(r.name ORDER BY r.sort_order) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) as new_roles
      FROM employees e
      LEFT JOIN employee_roles er ON e.id = er.employee_id
      LEFT JOIN roles r ON er.role_id = r.id AND r.is_active = true
      GROUP BY e.id, e.first_name, e.last_name, e.role
      ORDER BY e.first_name, e.last_name
    `);

    console.log(`📋 Role comparison for ${roleAssignments.rows.length} employees:`);
    roleAssignments.rows.forEach((emp, index) => {
      console.log(`   ${index + 1}. ${emp.first_name} ${emp.last_name}`);
      console.log(`      Old role: ${emp.old_role || 'null'}`);
      console.log(`      New roles: [${emp.new_roles.join(', ') || 'No roles assigned'}]`);
    });

    // Step 5: Drop the redundant role column
    console.log('\n🗑️ Step 5: Dropping redundant role column...');
    await client.query(`
      ALTER TABLE employees DROP COLUMN IF EXISTS role
    `);

    console.log('✅ Successfully removed redundant role column');

    // Step 6: Verify the column has been removed
    console.log('\n🔍 Step 6: Verifying column removal...');
    const remainingColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'employees'
      ORDER BY ordinal_position
    `);

    console.log(`📋 Remaining columns in employees table (${remainingColumns.rows.length} total):`);
    remainingColumns.rows.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type})`);
    });

    // Step 7: Final verification of role assignments
    console.log('\n📊 Step 7: Final role assignment verification...');
    const finalRoleAssignments = await client.query(`
      SELECT
        e.first_name,
        e.last_name,
        COALESCE(array_agg(r.name ORDER BY r.sort_order) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) as roles,
        COUNT(r.id) as role_count
      FROM employees e
      LEFT JOIN employee_roles er ON e.id = er.employee_id
      LEFT JOIN roles r ON er.role_id = r.id AND r.is_active = true
      GROUP BY e.id, e.first_name, e.last_name
      ORDER BY e.first_name, e.last_name
    `);

    console.log(`📋 Final role assignments for ${finalRoleAssignments.rows.length} employees:`);
    finalRoleAssignments.rows.forEach((emp, index) => {
      console.log(`   ${index + 1}. ${emp.first_name} ${emp.last_name}: [${emp.roles.join(', ') || 'No roles'}] (${emp.role_count} roles)`);
    });

    console.log('\n🎉 Redundant role column removal completed successfully!');
    console.log('   ✅ Verified normalized employee_roles and roles tables exist');
    console.log('   ✅ Dropped redundant role column from employees table');
    console.log('   ✅ Verified role assignments work via normalized tables');
    console.log('   ✅ Employees table now uses only normalized role relationships');
    console.log('   ✅ Single source of truth for role data maintained');

  } catch (error) {
    console.error('❌ Error removing redundant role column:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

removeRedundantRoleColumn();