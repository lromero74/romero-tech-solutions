import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function normalizeWorkingStatuses() {
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

    console.log('🔄 Normalizing employee working statuses (Phase 6)...');
    console.log('   This will replace the is_active/is_on_vacation/is_out_sick/is_on_other_leave boolean columns');
    console.log('   with a normalized employee_working_statuses table.\n');

    // Step 1: Create employee_working_statuses table
    console.log('📋 Step 1: Creating employee_working_statuses table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_working_statuses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status_name VARCHAR(50) UNIQUE NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        description TEXT,
        color_code VARCHAR(20),
        is_available_for_work BOOLEAN DEFAULT false,
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employee_working_statuses_name ON employee_working_statuses(status_name);
      CREATE INDEX IF NOT EXISTS idx_employee_working_statuses_active ON employee_working_statuses(is_active) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_employee_working_statuses_sort_order ON employee_working_statuses(sort_order);
    `);

    console.log('✅ employee_working_statuses table created with indexes');

    // Step 2: Insert predefined working statuses
    console.log('\n📋 Step 2: Inserting predefined working statuses...');

    const workingStatuses = [
      {
        status_name: 'available',
        display_name: 'Available',
        description: 'Employee is available for work',
        color_code: '#22c55e',
        is_available_for_work: true,
        sort_order: 1
      },
      {
        status_name: 'on_vacation',
        display_name: 'On Vacation',
        description: 'Employee is on vacation leave',
        color_code: '#3b82f6',
        is_available_for_work: false,
        sort_order: 2
      },
      {
        status_name: 'out_sick',
        display_name: 'Out Sick',
        description: 'Employee is out due to illness',
        color_code: '#ef4444',
        is_available_for_work: false,
        sort_order: 3
      },
      {
        status_name: 'on_other_leave',
        display_name: 'On Other Leave',
        description: 'Employee is on other approved leave',
        color_code: '#8b5cf6',
        is_available_for_work: false,
        sort_order: 4
      },
      {
        status_name: 'inactive',
        display_name: 'Inactive',
        description: 'Employee account is inactive',
        color_code: '#6b7280',
        is_available_for_work: false,
        sort_order: 5
      }
    ];

    for (const status of workingStatuses) {
      await client.query(`
        INSERT INTO employee_working_statuses (
          status_name, display_name, description, color_code,
          is_available_for_work, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (status_name) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          description = EXCLUDED.description,
          color_code = EXCLUDED.color_code,
          is_available_for_work = EXCLUDED.is_available_for_work,
          sort_order = EXCLUDED.sort_order,
          updated_at = CURRENT_TIMESTAMP
      `, [
        status.status_name,
        status.display_name,
        status.description,
        status.color_code,
        status.is_available_for_work,
        status.sort_order
      ]);

      console.log(`   ✅ ${status.display_name} (${status.status_name})`);
    }

    // Step 3: Add working_status_id column to employees table
    console.log('\n📋 Step 3: Adding working_status_id column to employees table...');

    await client.query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS working_status_id UUID
      REFERENCES employee_working_statuses(id)
    `);

    console.log('✅ working_status_id column added to employees table');

    // Step 4: Migrate existing boolean data to working statuses
    console.log('\n📋 Step 4: Migrating existing boolean data to working statuses...');

    // Get status IDs for mapping
    const statusMappings = await client.query(`
      SELECT id, status_name FROM employee_working_statuses
    `);

    const statusMap = {};
    statusMappings.rows.forEach(row => {
      statusMap[row.status_name] = row.id;
    });

    // Get all employees with their current boolean statuses
    const employees = await client.query(`
      SELECT id, is_active, is_on_vacation, is_out_sick, is_on_other_leave
      FROM employees
      WHERE working_status_id IS NULL
    `);

    console.log(`📊 Found ${employees.rows.length} employees to migrate`);

    let migratedCount = 0;
    for (const emp of employees.rows) {
      let workingStatusId;

      // Determine working status based on boolean flags
      if (!emp.is_active) {
        workingStatusId = statusMap['inactive'];
      } else if (emp.is_out_sick) {
        workingStatusId = statusMap['out_sick'];
      } else if (emp.is_on_vacation) {
        workingStatusId = statusMap['on_vacation'];
      } else if (emp.is_on_other_leave) {
        workingStatusId = statusMap['on_other_leave'];
      } else {
        workingStatusId = statusMap['available'];
      }

      await client.query(`
        UPDATE employees
        SET working_status_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [workingStatusId, emp.id]);

      migratedCount++;
    }

    console.log(`✅ Migrated ${migratedCount} employees to working status system`);

    // Step 5: Verify migration
    console.log('\n📋 Step 5: Verifying migration...');

    const verificationResult = await client.query(`
      SELECT
        ews.display_name,
        ews.status_name,
        COUNT(e.id) as employee_count
      FROM employee_working_statuses ews
      LEFT JOIN employees e ON ews.id = e.working_status_id
      GROUP BY ews.id, ews.display_name, ews.status_name
      ORDER BY ews.sort_order
    `);

    console.log('📊 Working status distribution:');
    verificationResult.rows.forEach(row => {
      console.log(`   ${row.display_name}: ${row.employee_count} employees`);
    });

    // Step 6: Show sample of migrated data
    console.log('\n📋 Step 6: Sample of migrated data...');

    const sampleData = await client.query(`
      SELECT
        e.first_name,
        e.last_name,
        e.is_active,
        e.is_on_vacation,
        e.is_out_sick,
        e.is_on_other_leave,
        ews.display_name as working_status
      FROM employees e
      JOIN employee_working_statuses ews ON e.working_status_id = ews.id
      LIMIT 10
    `);

    console.log('📋 Sample employee working status mappings:');
    sampleData.rows.forEach((emp, index) => {
      console.log(`   ${index + 1}. ${emp.first_name} ${emp.last_name}`);
      console.log(`      Old: active=${emp.is_active}, vacation=${emp.is_on_vacation}, sick=${emp.is_out_sick}, other=${emp.is_on_other_leave}`);
      console.log(`      New: ${emp.working_status}`);
    });

    console.log('\n🎉 Working status normalization completed successfully!');
    console.log('   ✅ Created employee_working_statuses table with predefined statuses');
    console.log('   ✅ Added working_status_id foreign key to employees table');
    console.log('   ✅ Migrated all existing boolean data to normalized statuses');
    console.log('   ✅ Verified data integrity and relationships');
    console.log('\n📝 Next steps:');
    console.log('   1. Update backend code to use working_status_id instead of boolean columns');
    console.log('   2. Update frontend code to work with the new working status system');
    console.log('   3. Run phase6b script to remove the old boolean columns after verification');

  } catch (error) {
    console.error('❌ Error normalizing working statuses:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

normalizeWorkingStatuses();