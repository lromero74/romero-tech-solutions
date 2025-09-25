import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function removeRedundantRolesColumn() {
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

    console.log('🔍 Removing redundant JSONB roles column from employees table...');
    console.log('   This column was duplicating data from the normalized employee_roles table.');

    // Check if roles column exists before attempting to drop it
    const columnExists = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'employees' AND column_name = 'roles'
    `);

    if (columnExists.rows.length === 0) {
      console.log('✅ Roles column does not exist - already removed or never existed');
      return;
    }

    // Verify that employee_roles table exists and has data
    const employeeRolesExists = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'employee_roles'
    `);

    if (employeeRolesExists.rows.length === 0) {
      console.log('❌ ERROR: employee_roles table does not exist!');
      console.log('   Cannot safely remove roles column without normalized table.');
      return;
    }

    // Check that we have role assignments in the normalized table
    const roleAssignments = await client.query(`
      SELECT COUNT(*) as count FROM employee_roles
    `);

    console.log(`📊 Found ${roleAssignments.rows[0].count} role assignments in employee_roles table`);

    if (roleAssignments.rows[0].count === 0) {
      console.log('⚠️  WARNING: No role assignments found in employee_roles table!');
      console.log('   You may want to migrate data before removing the roles column.');
      console.log('   Proceeding anyway as this script assumes migration is complete.');
    }

    // Drop the redundant roles column
    await client.query(`
      ALTER TABLE employees DROP COLUMN IF EXISTS roles
    `);

    console.log('✅ Successfully removed redundant roles JSONB column');

    // Verify the change
    const remainingColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'employees'
      ORDER BY ordinal_position
    `);

    console.log('\\n📋 Remaining columns in employees table:');
    remainingColumns.rows.forEach(row => {
      console.log(`   - ${row.column_name} (${row.data_type})`);
    });

    console.log('\\n🎉 Migration completed successfully!');
    console.log('   ✅ Removed redundant JSONB roles column');
    console.log('   ✅ Employee roles are now managed exclusively through employee_roles table');
    console.log('   ✅ Single source of truth for role assignments');
    console.log('   ✅ Proper normalized database design restored');

  } catch (error) {
    console.error('❌ Error removing roles column:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

removeRedundantRolesColumn();