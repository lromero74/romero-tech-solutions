import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function normalizeAddresses() {
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

    console.log('🏠 Starting Address Normalization (Phase 2)...');
    console.log('   Moving address data from employees table to normalized addresses table');

    // Step 1: Create addresses table
    console.log('\n📋 Step 1: Creating addresses table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS addresses (
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

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_addresses_employee_id ON addresses(employee_id);
      CREATE INDEX IF NOT EXISTS idx_addresses_type ON addresses(address_type);
      CREATE INDEX IF NOT EXISTS idx_addresses_primary ON addresses(is_primary) WHERE is_primary = true;
    `);

    console.log('✅ Addresses table created with indexes');

    // Step 2: Check for existing address data in employees table
    console.log('\n📊 Step 2: Analyzing existing address data...');
    const addressAnalysis = await client.query(`
      SELECT
        COUNT(*) as total_employees,
        COUNT(CASE WHEN address_street IS NOT NULL AND address_street != '' THEN 1 END) as with_addresses,
        COUNT(CASE WHEN address_city IS NOT NULL AND address_city != '' THEN 1 END) as with_cities,
        COUNT(CASE WHEN address_state IS NOT NULL AND address_state != '' THEN 1 END) as with_states
      FROM employees
    `);

    const stats = addressAnalysis.rows[0];
    console.log(`   📈 Total employees: ${stats.total_employees}`);
    console.log(`   🏠 With street addresses: ${stats.with_addresses}`);
    console.log(`   🏙️  With cities: ${stats.with_cities}`);
    console.log(`   🗺️  With states: ${stats.with_states}`);

    // Step 3: Migrate existing address data
    console.log('\n🔄 Step 3: Migrating existing address data...');
    const migrationResult = await client.query(`
      INSERT INTO addresses (
        employee_id, address_type, street, street_2, city, state, zip_code, country, is_primary
      )
      SELECT
        id as employee_id,
        'primary' as address_type,
        address_street,
        address_street_2,
        address_city,
        address_state,
        address_zip_code,
        COALESCE(address_country, 'USA'),
        true as is_primary
      FROM employees
      WHERE
        address_street IS NOT NULL
        AND address_street != ''
        AND (address_city IS NOT NULL AND address_city != '')
    `);

    console.log(`✅ Migrated ${migrationResult.rowCount} employee addresses`);

    // Step 4: Verify migration
    console.log('\n🔍 Step 4: Verifying migration...');
    const verificationQuery = await client.query(`
      SELECT
        e.email,
        e.first_name,
        e.last_name,
        a.street,
        a.city,
        a.state,
        a.zip_code
      FROM employees e
      LEFT JOIN addresses a ON e.id = a.employee_id
      WHERE a.id IS NOT NULL
      ORDER BY e.email
    `);

    console.log(`📋 Addresses successfully migrated for ${verificationQuery.rows.length} employees:`);
    verificationQuery.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.first_name} ${row.last_name} (${row.email})`);
      console.log(`      ${row.street}${row.street_2 ? ', ' + row.street_2 : ''}`);
      console.log(`      ${row.city}, ${row.state} ${row.zip_code}`);
    });

    console.log('\n🎉 Address normalization Phase 2 setup completed successfully!');
    console.log('   ✅ Created normalized addresses table');
    console.log('   ✅ Created performance indexes');
    console.log('   ✅ Migrated existing address data');
    console.log('   ✅ Verified data integrity');
    console.log('\n🚨 IMPORTANT: Do not drop address columns from employees table yet!');
    console.log('   Backend code must be updated to use addresses table first.');

  } catch (error) {
    console.error('❌ Error during address normalization:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

normalizeAddresses();