import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function normalizeEmployeeStatuses() {
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

    console.log('📊 Starting Employee Statuses Normalization (Phase 5B)...');
    console.log('   Moving employee status data to normalized employee_statuses table');

    // Step 1: Create employee_statuses table
    console.log('\n📋 Step 1: Creating employee_statuses table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_statuses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status_name VARCHAR(50) NOT NULL UNIQUE,
        display_name VARCHAR(100) NOT NULL,
        description VARCHAR(255),
        is_active_status BOOLEAN DEFAULT true,
        allows_login BOOLEAN DEFAULT true,
        allows_timesheet BOOLEAN DEFAULT true,
        allows_scheduling BOOLEAN DEFAULT true,
        requires_termination_date BOOLEAN DEFAULT false,
        workflow_order INTEGER DEFAULT 0,
        badge_color VARCHAR(20) DEFAULT 'blue',
        is_system_status BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employee_statuses_name ON employee_statuses(status_name);
      CREATE INDEX IF NOT EXISTS idx_employee_statuses_active ON employee_statuses(is_active_status) WHERE is_active_status = true;
      CREATE INDEX IF NOT EXISTS idx_employee_statuses_workflow ON employee_statuses(workflow_order);
      CREATE INDEX IF NOT EXISTS idx_employee_statuses_allows_login ON employee_statuses(allows_login) WHERE allows_login = true;
    `);

    console.log('✅ Employee statuses table created with indexes');

    // Step 2: Analyze existing employee status data
    console.log('\n📊 Step 2: Analyzing existing employee status data...');
    const statusAnalysis = await client.query(`
      SELECT
        COUNT(*) as total_employees,
        COUNT(CASE WHEN employee_status IS NOT NULL AND employee_status != '' THEN 1 END) as with_status,
        COUNT(DISTINCT employee_status) as unique_statuses
      FROM employees
    `);

    const stats = statusAnalysis.rows[0];
    console.log(`   📈 Total employees: ${stats.total_employees}`);
    console.log(`   📊 With status: ${stats.with_status}`);
    console.log(`   🔢 Unique statuses: ${stats.unique_statuses}`);

    // Get unique status values
    const uniqueStatuses = await client.query(`
      SELECT DISTINCT
        employee_status,
        COUNT(*) as employee_count
      FROM employees
      WHERE employee_status IS NOT NULL AND employee_status != ''
      GROUP BY employee_status
      ORDER BY employee_count DESC
    `);

    console.log('\n📋 Found statuses to create:');
    uniqueStatuses.rows.forEach((status, index) => {
      console.log(`   ${index + 1}. ${status.employee_status} (${status.employee_count} employees)`);
    });

    // Step 3: Create predefined status records with comprehensive workflow
    console.log('\n🔄 Step 3: Creating comprehensive employee status records...');

    const statusDefinitions = [
      // Current statuses from data
      {
        name: 'active',
        display: 'Active',
        description: 'Employee is actively working',
        isActive: true,
        allowsLogin: true,
        allowsTimesheet: true,
        allowsScheduling: true,
        requiresTermination: false,
        order: 1,
        color: 'green',
        isSystem: true
      },
      // Additional comprehensive statuses
      {
        name: 'pending_start',
        display: 'Pending Start',
        description: 'Employee hired but not yet started',
        isActive: false,
        allowsLogin: false,
        allowsTimesheet: false,
        allowsScheduling: false,
        requiresTermination: false,
        order: 0,
        color: 'blue',
        isSystem: false
      },
      {
        name: 'probationary',
        display: 'Probationary',
        description: 'Employee in probationary period',
        isActive: true,
        allowsLogin: true,
        allowsTimesheet: true,
        allowsScheduling: true,
        requiresTermination: false,
        order: 2,
        color: 'yellow',
        isSystem: false
      },
      {
        name: 'on_leave',
        display: 'On Leave',
        description: 'Employee on temporary leave',
        isActive: false,
        allowsLogin: true,
        allowsTimesheet: false,
        allowsScheduling: false,
        requiresTermination: false,
        order: 3,
        color: 'orange',
        isSystem: false
      },
      {
        name: 'suspended',
        display: 'Suspended',
        description: 'Employee temporarily suspended',
        isActive: false,
        allowsLogin: false,
        allowsTimesheet: false,
        allowsScheduling: false,
        requiresTermination: false,
        order: 4,
        color: 'red',
        isSystem: false
      },
      {
        name: 'terminated',
        display: 'Terminated',
        description: 'Employee no longer with company',
        isActive: false,
        allowsLogin: false,
        allowsTimesheet: false,
        allowsScheduling: false,
        requiresTermination: true,
        order: 5,
        color: 'gray',
        isSystem: true
      },
      {
        name: 'retired',
        display: 'Retired',
        description: 'Employee retired from company',
        isActive: false,
        allowsLogin: false,
        allowsTimesheet: false,
        allowsScheduling: false,
        requiresTermination: true,
        order: 6,
        color: 'purple',
        isSystem: false
      }
    ];

    let statusCount = 0;
    const statusMap = new Map();

    for (const statusDef of statusDefinitions) {
      // Insert status
      const insertResult = await client.query(`
        INSERT INTO employee_statuses (
          status_name, display_name, description, is_active_status,
          allows_login, allows_timesheet, allows_scheduling, requires_termination_date,
          workflow_order, badge_color, is_system_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (status_name) DO UPDATE SET
          updated_at = CURRENT_TIMESTAMP,
          display_name = EXCLUDED.display_name,
          description = EXCLUDED.description,
          is_active_status = EXCLUDED.is_active_status,
          allows_login = EXCLUDED.allows_login,
          allows_timesheet = EXCLUDED.allows_timesheet,
          allows_scheduling = EXCLUDED.allows_scheduling
        RETURNING id, status_name
      `, [
        statusDef.name,
        statusDef.display,
        statusDef.description,
        statusDef.isActive,
        statusDef.allowsLogin,
        statusDef.allowsTimesheet,
        statusDef.allowsScheduling,
        statusDef.requiresTermination,
        statusDef.order,
        statusDef.color,
        statusDef.isSystem
      ]);

      statusMap.set(statusDef.name, insertResult.rows[0].id);
      console.log(`   ✅ Created/Updated status: ${statusDef.display} (${statusDef.name})`);
      statusCount++;
    }

    console.log(`✅ Created/Updated ${statusCount} employee statuses`);

    // Step 4: Add employee_status_id column to employees table
    console.log('\n🔧 Step 4: Adding employee_status_id column to employees table...');
    await client.query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS employee_status_id UUID REFERENCES employee_statuses(id)
    `);

    // Create index for the foreign key
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employees_employee_status_id ON employees(employee_status_id);
    `);

    console.log('✅ Added employee_status_id column with foreign key constraint');

    // Step 5: Migrate existing employee status data
    console.log('\n🔄 Step 5: Migrating existing employee status references...');
    const migrationResult = await client.query(`
      UPDATE employees
      SET employee_status_id = es.id
      FROM employee_statuses es
      WHERE es.status_name = employees.employee_status
      AND employees.employee_status IS NOT NULL
      AND employees.employee_status != ''
    `);

    console.log(`✅ Migrated ${migrationResult.rowCount} employee status references`);

    // Handle employees without status (set to active)
    const defaultStatusResult = await client.query(`
      UPDATE employees
      SET employee_status_id = es.id
      FROM employee_statuses es
      WHERE es.status_name = 'active'
      AND employees.employee_status_id IS NULL
    `);

    console.log(`✅ Set default 'active' status for ${defaultStatusResult.rowCount} employees`);

    // Step 6: Verify migration
    console.log('\n🔍 Step 6: Verifying migration...');
    const verificationQuery = await client.query(`
      SELECT
        e.first_name,
        e.last_name,
        e.employee_status as old_status,
        es.status_name as new_status,
        es.display_name,
        es.allows_login,
        es.allows_timesheet,
        es.badge_color
      FROM employees e
      LEFT JOIN employee_statuses es ON e.employee_status_id = es.id
      ORDER BY e.first_name, e.last_name
    `);

    console.log(`📋 Employee status migration results for ${verificationQuery.rows.length} employees:`);
    verificationQuery.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.first_name} ${row.last_name}`);
      console.log(`      Old: ${row.old_status || 'null'}`);
      console.log(`      New: ${row.display_name || 'No status assigned'} (${row.new_status || 'N/A'})`);
      console.log(`      Permissions: Login=${row.allows_login}, Timesheet=${row.allows_timesheet}`);
    });

    // Step 7: Show created statuses
    const finalStatuses = await client.query(`
      SELECT
        es.status_name,
        es.display_name,
        es.description,
        es.is_active_status,
        es.allows_login,
        es.allows_timesheet,
        es.badge_color,
        COUNT(e.id) as employee_count
      FROM employee_statuses es
      LEFT JOIN employees e ON es.id = e.employee_status_id
      GROUP BY es.id, es.status_name, es.display_name, es.description, es.is_active_status, es.allows_login, es.allows_timesheet, es.badge_color
      ORDER BY es.workflow_order
    `);

    console.log('\n📋 Final employee statuses created:');
    finalStatuses.rows.forEach((status, index) => {
      console.log(`   ${index + 1}. ${status.display_name} (${status.status_name}) - ${status.employee_count} employees`);
      console.log(`      Active: ${status.is_active_status}, Login: ${status.allows_login}, Timesheet: ${status.allows_timesheet}`);
      console.log(`      Color: ${status.badge_color}, Description: ${status.description}`);
    });

    console.log('\n🎉 Employee statuses normalization completed successfully!');
    console.log('   ✅ Created normalized employee_statuses table');
    console.log('   ✅ Created comprehensive status workflow');
    console.log('   ✅ Added employee_status_id foreign key to employees table');
    console.log('   ✅ Migrated existing status data');
    console.log('   ✅ Added permission and workflow controls');
    console.log('\n🚨 IMPORTANT: Do not drop employee_status column from employees table yet!');
    console.log('   Backend code must be updated to use employee_statuses table first.');

  } catch (error) {
    console.error('❌ Error during employee statuses normalization:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

normalizeEmployeeStatuses();