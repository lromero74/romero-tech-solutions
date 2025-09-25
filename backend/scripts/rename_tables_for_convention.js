import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function renameTablesForConvention() {
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

    console.log('🏷️  Starting table renaming for better naming conventions...');
    console.log('   Renaming tables to clearly show their relationship to employees');

    // Step 1: Create new employee_addresses table
    console.log('\n📋 Step 1: Creating new employee_addresses table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_addresses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        address_type VARCHAR(20) NOT NULL DEFAULT 'primary',
        street VARCHAR(255),
        street_2 VARCHAR(255),
        city VARCHAR(100),
        state VARCHAR(50),
        zip_code VARCHAR(20),
        country VARCHAR(50) DEFAULT 'USA',
        is_primary BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for the new table
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employee_addresses_employee_id ON employee_addresses(employee_id);
      CREATE INDEX IF NOT EXISTS idx_employee_addresses_type ON employee_addresses(address_type);
      CREATE INDEX IF NOT EXISTS idx_employee_addresses_primary ON employee_addresses(is_primary) WHERE is_primary = true;
    `);

    console.log('✅ Created employee_addresses table with indexes');

    // Step 2: Create new employee_emergency_contacts table
    console.log('\n📋 Step 2: Creating new employee_emergency_contacts table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS employee_emergency_contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        relationship VARCHAR(100),
        phone VARCHAR(20),
        email VARCHAR(255),
        is_primary BOOLEAN DEFAULT true,
        priority_order INTEGER DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for the new table
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employee_emergency_contacts_employee_id ON employee_emergency_contacts(employee_id);
      CREATE INDEX IF NOT EXISTS idx_employee_emergency_contacts_primary ON employee_emergency_contacts(is_primary) WHERE is_primary = true;
      CREATE INDEX IF NOT EXISTS idx_employee_emergency_contacts_priority ON employee_emergency_contacts(priority_order);
    `);

    console.log('✅ Created employee_emergency_contacts table with indexes');

    // Step 3: Check if old tables exist and copy data
    console.log('\n📊 Step 3: Checking for existing data to migrate...');

    // Check addresses table
    const addressesTableExists = await client.query(`
      SELECT table_name FROM information_schema.tables WHERE table_name = 'addresses'
    `);

    if (addressesTableExists.rows.length > 0) {
      const addressCount = await client.query('SELECT COUNT(*) as count FROM addresses');
      console.log(`📋 Found ${addressCount.rows[0].count} records in addresses table`);

      if (parseInt(addressCount.rows[0].count) > 0) {
        console.log('🔄 Migrating data from addresses to employee_addresses...');
        const addressMigration = await client.query(`
          INSERT INTO employee_addresses (
            id, employee_id, address_type, street, street_2, city, state, zip_code, country, is_primary, created_at, updated_at
          )
          SELECT
            id, employee_id, address_type, street, street_2, city, state, zip_code, country, is_primary, created_at, updated_at
          FROM addresses
          ON CONFLICT (id) DO NOTHING
        `);
        console.log(`✅ Migrated ${addressMigration.rowCount} address records`);
      }
    } else {
      console.log('ℹ️  No addresses table found to migrate');
    }

    // Check emergency_contacts table
    const emergencyContactsTableExists = await client.query(`
      SELECT table_name FROM information_schema.tables WHERE table_name = 'emergency_contacts'
    `);

    if (emergencyContactsTableExists.rows.length > 0) {
      const emergencyContactCount = await client.query('SELECT COUNT(*) as count FROM emergency_contacts');
      console.log(`📋 Found ${emergencyContactCount.rows[0].count} records in emergency_contacts table`);

      if (parseInt(emergencyContactCount.rows[0].count) > 0) {
        console.log('🔄 Migrating data from emergency_contacts to employee_emergency_contacts...');
        const emergencyContactMigration = await client.query(`
          INSERT INTO employee_emergency_contacts (
            id, employee_id, first_name, last_name, relationship, phone, email, is_primary, priority_order, created_at, updated_at
          )
          SELECT
            id, employee_id, first_name, last_name, relationship, phone, email, is_primary, priority_order, created_at, updated_at
          FROM emergency_contacts
          ON CONFLICT (id) DO NOTHING
        `);
        console.log(`✅ Migrated ${emergencyContactMigration.rowCount} emergency contact records`);
      }
    } else {
      console.log('ℹ️  No emergency_contacts table found to migrate');
    }

    // Step 4: Verification
    console.log('\n🔍 Step 4: Verifying migration...');

    const newAddressCount = await client.query('SELECT COUNT(*) as count FROM employee_addresses');
    const newEmergencyContactCount = await client.query('SELECT COUNT(*) as count FROM employee_emergency_contacts');

    console.log(`📊 New table counts:`);
    console.log(`   - employee_addresses: ${newAddressCount.rows[0].count} records`);
    console.log(`   - employee_emergency_contacts: ${newEmergencyContactCount.rows[0].count} records`);

    // Show sample data
    const sampleAddresses = await client.query(`
      SELECT
        e.first_name,
        e.last_name,
        ea.street,
        ea.city,
        ea.state
      FROM employees e
      JOIN employee_addresses ea ON e.id = ea.employee_id
      LIMIT 5
    `);

    const sampleEmergencyContacts = await client.query(`
      SELECT
        e.first_name as employee_first_name,
        e.last_name as employee_last_name,
        ec.first_name as emergency_first_name,
        ec.last_name as emergency_last_name,
        ec.relationship
      FROM employees e
      JOIN employee_emergency_contacts ec ON e.id = ec.employee_id
      LIMIT 5
    `);

    console.log('\n📋 Sample migrated data:');
    console.log('Addresses:');
    sampleAddresses.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.first_name} ${row.last_name}: ${row.street}, ${row.city}, ${row.state}`);
    });

    console.log('Emergency Contacts:');
    sampleEmergencyContacts.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.employee_first_name} ${row.employee_last_name} → ${row.emergency_first_name} ${row.emergency_last_name} (${row.relationship})`);
    });

    console.log('\n🎉 Table creation and migration completed successfully!');
    console.log('   ✅ Created employee_addresses table');
    console.log('   ✅ Created employee_emergency_contacts table');
    console.log('   ✅ Migrated all existing data');
    console.log('   ✅ Created proper indexes and constraints');
    console.log('\n🚨 IMPORTANT: Backend code must be updated before dropping old tables!');
    console.log('   Tables ready for backend update: employee_addresses, employee_emergency_contacts');

  } catch (error) {
    console.error('❌ Error during table renaming:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

renameTablesForConvention();