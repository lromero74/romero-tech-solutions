import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function addImageColumns() {
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

    console.log('🔍 Adding image columns to database...');

    // Add company logo column to businesses table
    await client.query(`
      ALTER TABLE businesses
      ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS logo_filename VARCHAR(255)
    `);
    console.log('✅ Added logo columns to businesses table');

    // Add user photo column to users table
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS profile_photo_url VARCHAR(500),
      ADD COLUMN IF NOT EXISTS profile_photo_filename VARCHAR(255)
    `);
    console.log('✅ Added profile photo columns to users table');

    console.log('\n📊 Database schema updated successfully!');
    console.log('   - businesses.logo_url (VARCHAR 500)');
    console.log('   - businesses.logo_filename (VARCHAR 255)');
    console.log('   - users.profile_photo_url (VARCHAR 500)');
    console.log('   - users.profile_photo_filename (VARCHAR 255)');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

addImageColumns();