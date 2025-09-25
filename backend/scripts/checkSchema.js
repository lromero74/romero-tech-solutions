import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function checkSchema() {
  const client = new Client({
    host: '34.228.181.68',
    port: 5432,
    database: 'romerotechsolutions',
    user: 'postgres',
    password: 'ao1VKrmlD?e.(cg$<e-C2B*#]Uyg',
    ssl: false,
    connectionTimeoutMillis: 10000,
  });

  try {
    console.log('🔍 Connecting to romerotechsolutions database...');
    await client.connect();
    console.log('✅ Connected successfully!');

    // Check businesses table structure
    console.log('📋 Businesses table columns:');
    const businessesResult = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'businesses'
      ORDER BY ordinal_position
    `);

    businessesResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    // Check users table structure if it exists
    const usersCheck = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_name = 'users'
    `);

    if (parseInt(usersCheck.rows[0].count) > 0) {
      console.log('\n📋 Users table columns:');
      const usersResult = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'users'
        ORDER BY ordinal_position
      `);

      usersResult.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });
    } else {
      console.log('\n❌ Users table does not exist');
    }

    // Check service_addresses table
    console.log('\n📋 Service_addresses table columns:');
    const addressesResult = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'service_addresses'
      ORDER BY ordinal_position
    `);

    addressesResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

  } catch (error) {
    console.error('❌ Error checking schema:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Disconnected from database');
  }
}

// Run the script
checkSchema().then(() => {
  console.log('🎉 Schema check completed!');
  process.exit(0);
});