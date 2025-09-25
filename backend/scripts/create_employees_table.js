import { query, closePool } from '../config/database.js';

async function restructureDatabase() {
  try {
    console.log('🔧 Restructuring database: Creating employees table and migrating data...\n');

    // First, let's see what users we currently have
    console.log('📋 Current users in database:');
    const currentUsers = await query('SELECT id, email, role, first_name, last_name FROM users ORDER BY role, email');
    currentUsers.rows.forEach(user => {
      console.log(`  ${user.email} (${user.role}) - ${user.first_name} ${user.last_name}`);
    });
    console.log();

    // Create employees table
    console.log('🏗️  Creating employees table...');
    await query(`
      CREATE TABLE IF NOT EXISTS employees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cognito_user_id VARCHAR(255),
        email VARCHAR(255) NOT NULL UNIQUE,
        email_verified BOOLEAN DEFAULT false,
        role VARCHAR(50) NOT NULL DEFAULT 'technician',
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        phone VARCHAR(20),
        employee_id VARCHAR(50) UNIQUE,
        department VARCHAR(100),
        hire_date DATE,
        is_active BOOLEAN DEFAULT true,
        is_on_vacation BOOLEAN DEFAULT false,
        is_out_sick BOOLEAN DEFAULT false,
        salary DECIMAL(10,2),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP WITH TIME ZONE,
        profile_photo_url VARCHAR(500),
        profile_photo_filename VARCHAR(255),
        password_hash VARCHAR(255),
        CONSTRAINT employees_role_check CHECK (role IN ('admin', 'sales', 'technician'))
      )
    `);
    console.log('✅ Employees table created successfully');

    // Migrate non-client users to employees table
    console.log('📦 Migrating admin, sales, and technician users to employees table...');

    const nonClientUsers = await query(`
      SELECT * FROM users
      WHERE role IN ('admin', 'sales', 'technician')
    `);

    console.log(`Found ${nonClientUsers.rows.length} employees to migrate:`);

    for (const user of nonClientUsers.rows) {
      console.log(`  Migrating: ${user.email} (${user.role})`);

      // Insert into employees table
      await query(`
        INSERT INTO employees (
          id, cognito_user_id, email, email_verified, role, first_name, last_name,
          phone, is_active, is_on_vacation, is_out_sick, created_at, updated_at,
          last_login, profile_photo_url, profile_photo_filename, password_hash
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
        )
      `, [
        user.id, user.cognito_user_id, user.email, user.email_verified, user.role,
        user.first_name, user.last_name, user.phone, user.is_active,
        user.is_on_vacation, user.is_out_sick, user.created_at, user.updated_at,
        user.last_login, user.profile_photo_url, user.profile_photo_filename, user.password_hash
      ]);
    }

    // Remove non-client users from users table
    console.log('🗑️  Removing migrated users from users table...');
    const deleteResult = await query(`
      DELETE FROM users
      WHERE role IN ('admin', 'sales', 'technician')
    `);
    console.log(`✅ Removed ${deleteResult.rowCount} users from users table`);

    // Update users table to only allow client role
    console.log('🔒 Updating users table constraints...');
    await query(`
      ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_role_check
    `);
    await query(`
      ALTER TABLE users
      ADD CONSTRAINT users_role_check CHECK (role = 'client')
    `);

    // Remove vacation/sick columns from users table (clients don't need these)
    console.log('🧹 Cleaning up users table (removing employee-specific columns)...');
    await query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS is_on_vacation,
      DROP COLUMN IF EXISTS is_out_sick
    `);

    // Update default role for users table
    await query(`
      ALTER TABLE users
      ALTER COLUMN role SET DEFAULT 'client'
    `);

    console.log('✅ Users table updated successfully');

    // Show final state
    console.log('\n📊 Final database state:');

    console.log('\n👥 Employees table:');
    const employees = await query('SELECT id, email, role, first_name, last_name FROM employees ORDER BY role, email');
    employees.rows.forEach(emp => {
      console.log(`  ${emp.email} (${emp.role}) - ${emp.first_name} ${emp.last_name}`);
    });

    console.log('\n👤 Users table (clients only):');
    const clients = await query('SELECT id, email, role, first_name, last_name FROM users ORDER BY email');
    clients.rows.forEach(client => {
      console.log(`  ${client.email} (${client.role}) - ${client.first_name} ${client.last_name}`);
    });

    console.log('\n🎉 Database restructuring completed successfully!');
    console.log('📝 Summary:');
    console.log(`   - Created employees table with ${employees.rows.length} employees`);
    console.log(`   - Users table now contains ${clients.rows.length} clients only`);
    console.log('   - Employees have vacation/sick tracking, clients do not');

  } catch (error) {
    console.error('❌ Error restructuring database:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await closePool();
  }
}

restructureDatabase();