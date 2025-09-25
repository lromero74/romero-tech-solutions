import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function testStoredProcedure() {
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

    const token = 'ff066a82ff6f0a12b6a7dd7b251961deccdb9ed60fb5c7b1389cb632845ecd2a';
    const email = 'louis@romerotechsolutions.com';

    console.log('🔍 Testing stored procedure with:');
    console.log('   Token:', token);
    console.log('   Email:', email);

    const result = await client.query(
      'SELECT * FROM confirm_client_email($1, $2)',
      [token, email]
    );

    console.log('\n📄 Stored procedure result:');
    console.log('   Rows returned:', result.rows.length);
    console.log('   Row data:', JSON.stringify(result.rows, null, 2));

    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log('\n📊 Parsed result:');
      console.log('   Success:', row.success);
      console.log('   Message:', row.message);
      console.log('   User ID:', row.user_id);
      console.log('   Business ID:', row.business_id);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

testStoredProcedure();