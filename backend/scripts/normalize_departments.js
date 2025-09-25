import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function normalizeDepartments() {
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

    console.log('🏢 Starting Department Normalization (Phase 4)...');
    console.log('   Moving department data from employees table to normalized departments table');

    // Step 1: Create departments table
    console.log('\n📋 Step 1: Creating departments table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        description VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
      CREATE INDEX IF NOT EXISTS idx_departments_active ON departments(is_active) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_departments_sort_order ON departments(sort_order);
    `);

    console.log('✅ Departments table created with indexes');

    // Step 2: Check for existing department data in employees table
    console.log('\n📊 Step 2: Analyzing existing department data...');
    const departmentAnalysis = await client.query(`
      SELECT
        COUNT(*) as total_employees,
        COUNT(CASE WHEN department IS NOT NULL AND department != '' THEN 1 END) as with_department,
        COUNT(CASE WHEN department_detailed IS NOT NULL AND department_detailed != '' THEN 1 END) as with_department_detailed,
        COUNT(DISTINCT department) as unique_departments,
        COUNT(DISTINCT department_detailed) as unique_detailed_departments
      FROM employees
    `);

    const stats = departmentAnalysis.rows[0];
    console.log(`   📈 Total employees: ${stats.total_employees}`);
    console.log(`   🏢 With department: ${stats.with_department}`);
    console.log(`   📝 With detailed department: ${stats.with_department_detailed}`);
    console.log(`   🔢 Unique departments: ${stats.unique_departments}`);
    console.log(`   🔢 Unique detailed departments: ${stats.unique_detailed_departments}`);

    // Get unique department values
    const uniqueDepartments = await client.query(`
      SELECT DISTINCT
        COALESCE(department_detailed, department, 'Unknown') as dept_name,
        COUNT(*) as employee_count
      FROM employees
      WHERE department IS NOT NULL OR department_detailed IS NOT NULL
      GROUP BY COALESCE(department_detailed, department, 'Unknown')
      ORDER BY employee_count DESC
    `);

    console.log('\n📋 Found departments to create:');
    uniqueDepartments.rows.forEach((dept, index) => {
      console.log(`   ${index + 1}. ${dept.dept_name} (${dept.employee_count} employees)`);
    });

    // Step 3: Create department records
    console.log('\n🔄 Step 3: Creating department records...');
    let departmentCount = 0;
    const departmentMap = new Map();

    for (const dept of uniqueDepartments.rows) {
      const departmentName = dept.dept_name;

      // Insert department
      const insertResult = await client.query(`
        INSERT INTO departments (name, description, is_active, sort_order)
        VALUES ($1, $2, true, $3)
        ON CONFLICT (name) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        RETURNING id, name
      `, [
        departmentName,
        `${departmentName} department`,
        departmentCount
      ]);

      departmentMap.set(departmentName, insertResult.rows[0].id);
      console.log(`   ✅ Created/Updated department: ${departmentName}`);
      departmentCount++;
    }

    console.log(`✅ Created/Updated ${departmentCount} departments`);

    // Step 4: Add department_id column to employees table
    console.log('\n🔧 Step 4: Adding department_id column to employees table...');
    await client.query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id)
    `);

    // Create index for the foreign key
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id);
    `);

    console.log('✅ Added department_id column with foreign key constraint');

    // Step 5: Migrate existing department data
    console.log('\n🔄 Step 5: Migrating existing department references...');
    const migrationResult = await client.query(`
      UPDATE employees
      SET department_id = d.id
      FROM departments d
      WHERE d.name = COALESCE(employees.department_detailed, employees.department, 'Unknown')
      AND (employees.department IS NOT NULL OR employees.department_detailed IS NOT NULL)
    `);

    console.log(`✅ Migrated ${migrationResult.rowCount} employee department references`);

    // Step 6: Verify migration
    console.log('\n🔍 Step 6: Verifying migration...');
    const verificationQuery = await client.query(`
      SELECT
        e.email,
        e.first_name,
        e.last_name,
        e.department as old_department,
        e.department_detailed as old_department_detailed,
        d.name as new_department
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY e.email
    `);

    console.log(`📋 Department migration results for ${verificationQuery.rows.length} employees:`);
    verificationQuery.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.first_name} ${row.last_name} (${row.email})`);
      console.log(`      Old: ${row.old_department || 'null'} / ${row.old_department_detailed || 'null'}`);
      console.log(`      New: ${row.new_department || 'No department assigned'}`);
    });

    // Step 7: Show created departments
    const finalDepartments = await client.query(`
      SELECT
        d.name,
        d.description,
        COUNT(e.id) as employee_count
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id
      GROUP BY d.id, d.name, d.description
      ORDER BY d.sort_order, d.name
    `);

    console.log('\n📋 Final departments created:');
    finalDepartments.rows.forEach((dept, index) => {
      console.log(`   ${index + 1}. ${dept.name} - ${dept.employee_count} employees`);
      console.log(`      Description: ${dept.description}`);
    });

    console.log('\n🎉 Department normalization Phase 4 setup completed successfully!');
    console.log('   ✅ Created normalized departments table');
    console.log('   ✅ Created performance indexes');
    console.log('   ✅ Added department_id foreign key to employees table');
    console.log('   ✅ Migrated existing department data');
    console.log('   ✅ Verified data integrity');
    console.log('\n🚨 IMPORTANT: Do not drop department columns from employees table yet!');
    console.log('   Backend code must be updated to use departments table first.');

  } catch (error) {
    console.error('❌ Error during department normalization:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

normalizeDepartments();