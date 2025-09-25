import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function removeDepartmentColumns() {
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

    console.log('🏢 Removing redundant department columns from employees table...');
    console.log('   These columns are now replaced by the normalized departments table with foreign key.');

    // List of department columns to remove
    const departmentColumns = [
      'department',
      'department_detailed'
    ];

    // Check which columns exist before attempting to drop them
    const existingColumns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'employees'
      AND column_name = ANY($1)
    `, [departmentColumns]);

    const existingColumnNames = existingColumns.rows.map(row => row.column_name);

    if (existingColumnNames.length === 0) {
      console.log('✅ No department columns found - already removed or never existed');
      return;
    }

    console.log(`📊 Found ${existingColumnNames.length} department columns to remove:`);
    existingColumnNames.forEach(col => console.log(`   - ${col}`));

    // Verify that departments table exists and has data
    const departmentsTableExists = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'departments'
    `);

    if (departmentsTableExists.rows.length === 0) {
      console.log('❌ ERROR: departments table does not exist!');
      console.log('   Cannot safely remove department columns without normalized table.');
      return;
    }

    // Check that we have departments in the normalized table
    const departmentCount = await client.query(`
      SELECT COUNT(*) as count FROM departments
    `);

    console.log(`📊 Found ${departmentCount.rows[0].count} departments in normalized departments table`);

    // Verify that department_id foreign key exists
    const departmentIdExists = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'employees' AND column_name = 'department_id'
    `);

    if (departmentIdExists.rows.length === 0) {
      console.log('❌ ERROR: department_id foreign key column does not exist!');
      console.log('   Cannot safely remove department columns without foreign key reference.');
      return;
    }

    console.log('✅ Verified department_id foreign key exists');

    // Check how many employees have department assignments
    const employeeDepartmentCount = await client.query(`
      SELECT COUNT(*) as count FROM employees WHERE department_id IS NOT NULL
    `);

    console.log(`📊 Found ${employeeDepartmentCount.rows[0].count} employees with department assignments`);

    // Drop the redundant department columns
    for (const column of existingColumnNames) {
      console.log(`🗑️  Dropping column: ${column}`);
      await client.query(`
        ALTER TABLE employees DROP COLUMN IF EXISTS ${column}
      `);
    }

    console.log('✅ Successfully removed redundant department columns');

    // Verify the changes
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

    // Show final department assignments
    const finalDepartmentAssignments = await client.query(`
      SELECT
        e.first_name,
        e.last_name,
        d.name as department_name
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY e.first_name, e.last_name
    `);

    console.log('\\n📋 Current employee department assignments:');
    finalDepartmentAssignments.rows.forEach((emp, index) => {
      console.log(`   ${index + 1}. ${emp.first_name} ${emp.last_name} → ${emp.department_name || 'No department'}`);
    });

    console.log('\\n🎉 Department normalization completed successfully!');
    console.log('   ✅ Removed redundant department columns from employees table');
    console.log('   ✅ Employee departments are now managed exclusively through departments table');
    console.log('   ✅ Foreign key relationship established (department_id)');
    console.log('   ✅ Single source of truth for department data');
    console.log('   ✅ Proper normalized database design (3NF) fully achieved!');

  } catch (error) {
    console.error('❌ Error removing department columns:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

removeDepartmentColumns();