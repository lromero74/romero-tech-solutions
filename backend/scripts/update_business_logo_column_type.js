import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function updateBusinessLogoColumnType() {
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

    console.log('🔍 Updating logo_url column type in businesses table...');

    // Change logo_url column from VARCHAR(500) to TEXT
    // Use USING clause to handle the conversion
    await client.query(`
      ALTER TABLE businesses
      ALTER COLUMN logo_url TYPE TEXT USING logo_url::TEXT
    `);
    console.log('✅ Changed logo_url column type to TEXT');

    console.log('\n📊 Database schema updated successfully!');
    console.log('   - businesses.logo_url (TEXT) - can now store large image data');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

updateBusinessLogoColumnType();