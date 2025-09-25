import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function addBusinessLogoPositioningColumns() {
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

    console.log('🔍 Adding logo positioning columns to businesses table...');

    // Add logo positioning columns to businesses table
    await client.query(`
      ALTER TABLE businesses
      ADD COLUMN IF NOT EXISTS logo_position_x INTEGER DEFAULT 50,
      ADD COLUMN IF NOT EXISTS logo_position_y INTEGER DEFAULT 50,
      ADD COLUMN IF NOT EXISTS logo_scale INTEGER DEFAULT 100
    `);
    console.log('✅ Added logo positioning columns to businesses table');

    // Update existing businesses to have default values
    await client.query(`
      UPDATE businesses
      SET logo_position_x = 50
      WHERE logo_position_x IS NULL
    `);

    await client.query(`
      UPDATE businesses
      SET logo_position_y = 50
      WHERE logo_position_y IS NULL
    `);

    await client.query(`
      UPDATE businesses
      SET logo_scale = 100
      WHERE logo_scale IS NULL
    `);

    console.log('✅ Updated existing businesses with default logo positioning values');

    console.log('\n📊 Database schema updated successfully!');
    console.log('   - businesses.logo_position_x (INTEGER, DEFAULT 50)');
    console.log('   - businesses.logo_position_y (INTEGER, DEFAULT 50)');
    console.log('   - businesses.logo_scale (INTEGER, DEFAULT 100)');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

addBusinessLogoPositioningColumns();