import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function createDatabase() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });

  try {
    console.log('🔍 Connecting to PostgreSQL server...');
    await client.connect();
    console.log('✅ Connected to PostgreSQL server');

    // Check existing databases
    console.log('🔍 Checking existing databases...');
    const dbList = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
    console.log('📋 Current databases:');
    dbList.rows.forEach(row => console.log(`  - ${row.datname}`));

    // Check if romerotechsolutions database exists
    const dbCheckResult = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      ['romerotechsolutions']
    );

    if (dbCheckResult.rows.length > 0) {
      console.log('✅ Database "romerotechsolutions" already exists');
    } else {
      console.log('📝 Creating database "romerotechsolutions"...');
      await client.query('CREATE DATABASE romerotechsolutions');
      console.log('✅ Database "romerotechsolutions" created successfully');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Disconnected from PostgreSQL server');
  }
}

// Run the script
createDatabase().then(() => {
  console.log('🎉 Database setup completed');
  process.exit(0);
});