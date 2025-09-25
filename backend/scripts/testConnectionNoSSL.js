import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function testConnection() {
  const config = {
    host: '34.228.181.68',
    port: 5432,
    // Try without specifying database first
    user: 'postgres',
    password: 'ao1VKrmlD?e.(cg$<e-C2B*#]Uyg',
    ssl: false, // Try without SSL first
    connectionTimeoutMillis: 10000,
  };

  console.log('🔍 Testing connection without SSL and without database...');

  const client = new Client(config);

  try {
    await client.connect();
    console.log('✅ Connected successfully without SSL!');

    const result = await client.query('SELECT version()');
    console.log('📊 PostgreSQL version:', result.rows[0].version);

  } catch (error) {
    console.error('❌ Connection failed without SSL:', error.message);

    // Now try with SSL
    console.log('🔍 Trying with SSL...');
    const clientSSL = new Client({
      ...config,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await clientSSL.connect();
      console.log('✅ Connected successfully with SSL!');

      const result = await clientSSL.query('SELECT version()');
      console.log('📊 PostgreSQL version:', result.rows[0].version);

      await clientSSL.end();
    } catch (sslError) {
      console.error('❌ SSL connection also failed:', sslError.message);
    }
  } finally {
    try {
      await client.end();
    } catch (e) {
      // ignore
    }
  }
}

testConnection();