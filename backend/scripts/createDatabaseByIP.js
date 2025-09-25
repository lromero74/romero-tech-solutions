import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function createDatabase() {
  // Connect using IP address directly
  const client = new Client({
    host: '34.228.181.68', // Using IP instead of hostname
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'postgres', // Connect to default database first
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? {
      rejectUnauthorized: false
    } : false,
  });

  try {
    console.log('🔍 Connecting to PostgreSQL server via IP...');
    await client.connect();
    console.log('✅ Connected to PostgreSQL server');

    // Check if database exists
    console.log('🔍 Checking if database exists...');
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