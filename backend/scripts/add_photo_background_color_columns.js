import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function addPhotoBackgroundColorColumns() {
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

    console.log('🔍 Adding photo background color columns...\n');

    // Add background color column to businesses table for logos
    console.log('Adding logo_background_color to businesses table...');
    await client.query(`
      ALTER TABLE businesses
      ADD COLUMN IF NOT EXISTS logo_background_color VARCHAR(7)
    `);
    console.log('✅ Added logo_background_color column to businesses table');

    // Add background color column to users table for client photos
    console.log('\nAdding photo_background_color to users table...');
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS photo_background_color VARCHAR(7)
    `);
    console.log('✅ Added photo_background_color column to users table');

    // Show current structure
    console.log('\n📊 Database schema updated successfully!');
    console.log('New columns added:');
    console.log('   - businesses.logo_background_color (VARCHAR(7), NULL) - stores hex color like #FFFFFF');
    console.log('   - users.photo_background_color (VARCHAR(7), NULL) - stores hex color like #FFFFFF');
    console.log('\nNULL values indicate transparent background (no background color)');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await client.end();
  }
}

addPhotoBackgroundColorColumns();