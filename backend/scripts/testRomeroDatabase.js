import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function testRomeroDatabase() {
  const client = new Client({
    host: '34.228.181.68',
    port: 5432,
    database: 'romerotechsolutions', // Test the specific database
    user: 'postgres',
    password: 'ao1VKrmlD?e.(cg$<e-C2B*#]Uyg',
    ssl: false,
    connectionTimeoutMillis: 10000,
  });

  try {
    console.log('🔍 Connecting to romerotechsolutions database...');
    await client.connect();
    console.log('✅ Connected to romerotechsolutions database successfully!');

    const result = await client.query('SELECT version()');
    console.log('📊 PostgreSQL version:', result.rows[0].version);

    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);
    console.log('📋 Tables in romerotechsolutions database:');
    if (tableCheck.rows.length === 0) {
      console.log('  (No tables yet - database is empty)');
    } else {
      tableCheck.rows.forEach(row => console.log(`  - ${row.table_name}`));
    }

  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  } finally {
    await client.end();
    console.log('🔌 Connection closed');
  }
}

testRomeroDatabase();