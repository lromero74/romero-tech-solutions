import { query, closePool } from '../config/database.js';

async function addComprehensiveEmployeeFields() {
  try {
    console.log('🔧 Adding comprehensive employee fields to database...\n');

    // Add the missing employee fields to the employees table
    console.log('🏗️  Adding new columns to employees table...');
    await query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS middle_initial VARCHAR(10),
      ADD COLUMN IF NOT EXISTS preferred_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS employee_number VARCHAR(50),
      ADD COLUMN IF NOT EXISTS department_detailed VARCHAR(100),
      ADD COLUMN IF NOT EXISTS job_title VARCHAR(100),
      ADD COLUMN IF NOT EXISTS employee_status VARCHAR(50) DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS address_street VARCHAR(255),
      ADD COLUMN IF NOT EXISTS address_city VARCHAR(100),
      ADD COLUMN IF NOT EXISTS address_state VARCHAR(50),
      ADD COLUMN IF NOT EXISTS address_zip_code VARCHAR(20),
      ADD COLUMN IF NOT EXISTS address_country VARCHAR(50) DEFAULT 'USA',
      ADD COLUMN IF NOT EXISTS emergency_contact_first_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS emergency_contact_last_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(100),
      ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20),
      ADD COLUMN IF NOT EXISTS emergency_contact_email VARCHAR(255)
    `);
    console.log('✅ New employee fields added successfully');

    // Create indexes for better performance
    console.log('📋 Creating indexes for new fields...');
    await query(`
      CREATE INDEX IF NOT EXISTS idx_employees_preferred_name ON employees(preferred_name);
      CREATE INDEX IF NOT EXISTS idx_employees_employee_number ON employees(employee_number);
      CREATE INDEX IF NOT EXISTS idx_employees_job_title ON employees(job_title);
      CREATE INDEX IF NOT EXISTS idx_employees_employee_status ON employees(employee_status);
    `);
    console.log('✅ Indexes created successfully');

    // Show the updated table structure
    console.log('\n📊 Updated employees table structure:');
    const columnsResult = await query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'employees'
      ORDER BY ordinal_position
    `);

    console.log('📋 Employees table columns:');
    columnsResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    console.log('\n🎉 Comprehensive employee fields added successfully!');
    console.log('📝 New fields added:');
    console.log('   - middle_initial (VARCHAR 10)');
    console.log('   - preferred_name (VARCHAR 100)');
    console.log('   - employee_number (VARCHAR 50)');
    console.log('   - department_detailed (VARCHAR 100)');
    console.log('   - job_title (VARCHAR 100)');
    console.log('   - employee_status (VARCHAR 50)');
    console.log('   - address_street (VARCHAR 255)');
    console.log('   - address_city (VARCHAR 100)');
    console.log('   - address_state (VARCHAR 50)');
    console.log('   - address_zip_code (VARCHAR 20)');
    console.log('   - address_country (VARCHAR 50)');
    console.log('   - emergency_contact_first_name (VARCHAR 100)');
    console.log('   - emergency_contact_last_name (VARCHAR 100)');
    console.log('   - emergency_contact_relationship (VARCHAR 100)');
    console.log('   - emergency_contact_phone (VARCHAR 20)');
    console.log('   - emergency_contact_email (VARCHAR 255)');

  } catch (error) {
    console.error('❌ Error adding comprehensive employee fields:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await closePool();
  }
}

addComprehensiveEmployeeFields();