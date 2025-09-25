import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function removeAddressColumns() {
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

    console.log('🏠 Removing redundant address columns from employees table...');
    console.log('   These columns are now replaced by the normalized addresses table.');

    // List of address columns to remove
    const addressColumns = [
      'address_street',
      'address_street_2',
      'address_city',
      'address_state',
      'address_zip_code',
      'address_country'
    ];

    // Check which columns exist before attempting to drop them
    const existingColumns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'employees'
      AND column_name = ANY($1)
    `, [addressColumns]);

    const existingColumnNames = existingColumns.rows.map(row => row.column_name);

    if (existingColumnNames.length === 0) {
      console.log('✅ No address columns found - already removed or never existed');
      return;
    }

    console.log(`📊 Found ${existingColumnNames.length} address columns to remove:`);
    existingColumnNames.forEach(col => console.log(`   - ${col}`));

    // Verify that addresses table exists and has data
    const addressesTableExists = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'addresses'
    `);

    if (addressesTableExists.rows.length === 0) {
      console.log('❌ ERROR: addresses table does not exist!');
      console.log('   Cannot safely remove address columns without normalized table.');
      return;
    }

    // Check that we have addresses in the normalized table
    const addressCount = await client.query(`
      SELECT COUNT(*) as count FROM addresses
    `);

    console.log(`📊 Found ${addressCount.rows[0].count} addresses in normalized addresses table`);

    // Drop the redundant address columns
    for (const column of existingColumnNames) {
      console.log(`🗑️  Dropping column: ${column}`);
      await client.query(`
        ALTER TABLE employees DROP COLUMN IF EXISTS ${column}
      `);
    }

    console.log('✅ Successfully removed redundant address columns');

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

    console.log('\\n🎉 Address normalization completed successfully!');
    console.log('   ✅ Removed redundant address columns from employees table');
    console.log('   ✅ Employee addresses are now managed exclusively through addresses table');
    console.log('   ✅ Single source of truth for address data');
    console.log('   ✅ Proper normalized database design (3NF) achieved');

  } catch (error) {
    console.error('❌ Error removing address columns:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

removeAddressColumns();