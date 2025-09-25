import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function viewStoredProcedure() {
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

    // Get the stored procedure definition
    const result = await client.query(`
      SELECT pg_get_functiondef(oid) as definition
      FROM pg_proc
      WHERE proname = 'confirm_client_email'
    `);

    if (result.rows.length > 0) {
      console.log('📄 Current stored procedure definition:');
      console.log('=====================================');
      console.log(result.rows[0].definition);
      console.log('=====================================');
    } else {
      console.log('❌ Stored procedure not found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

viewStoredProcedure();