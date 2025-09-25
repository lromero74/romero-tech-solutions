import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function addPhotoPositioningColumns() {
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

    console.log('🔍 Adding photo positioning columns to users table...');

    // Add photo positioning columns to users table
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS photo_position_x INTEGER DEFAULT 50,
      ADD COLUMN IF NOT EXISTS photo_position_y INTEGER DEFAULT 50,
      ADD COLUMN IF NOT EXISTS photo_scale INTEGER DEFAULT 100
    `);
    console.log('✅ Added photo positioning columns to users table');

    // Update existing users to have default values
    await client.query(`
      UPDATE users
      SET photo_position_x = 50
      WHERE photo_position_x IS NULL
    `);

    await client.query(`
      UPDATE users
      SET photo_position_y = 50
      WHERE photo_position_y IS NULL
    `);

    await client.query(`
      UPDATE users
      SET photo_scale = 100
      WHERE photo_scale IS NULL
    `);

    console.log('✅ Updated existing users with default photo positioning values');

    console.log('\n📊 Database schema updated successfully!');
    console.log('   - users.photo_position_x (INTEGER, DEFAULT 50)');
    console.log('   - users.photo_position_y (INTEGER, DEFAULT 50)');
    console.log('   - users.photo_scale (INTEGER, DEFAULT 100)');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

addPhotoPositioningColumns();