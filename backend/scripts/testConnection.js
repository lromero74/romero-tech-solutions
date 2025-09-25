import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function testConnection() {
  const config = {
    host: '34.228.181.68', // Using IP
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'postgres', // Connect to default postgres database
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: {
      rejectUnauthorized: false
    },
    connectionTimeoutMillis: 10000,
  };

  console.log('🔍 Connection config:', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password ? `${config.password.substring(0, 3)}***` : 'undefined',
    ssl: config.ssl
  });

  const client = new Client(config);

  try {
    console.log('🔍 Attempting connection...');
    await client.connect();
    console.log('✅ Connected successfully!');

    const result = await client.query('SELECT version()');
    console.log('📊 PostgreSQL version:', result.rows[0].version);

    const dbList = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
    console.log('📋 Available databases:');
    dbList.rows.forEach(row => console.log(`  - ${row.datname}`));

  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
    console.log('🔌 Connection closed');
  }
}

testConnection();