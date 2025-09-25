import { query, closePool } from '../config/database.js';

async function addUserStatusColumns() {
  try {
    console.log('🔧 Adding user status columns...\n');

    // Add is_on_vacation column
    console.log('Adding is_on_vacation column...');
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_on_vacation BOOLEAN DEFAULT false
    `);
    console.log('✅ is_on_vacation column added successfully');

    // Add is_out_sick column
    console.log('Adding is_out_sick column...');
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_out_sick BOOLEAN DEFAULT false
    `);
    console.log('✅ is_out_sick column added successfully');

    // Check the updated table structure
    console.log('\n📋 Updated users table structure:');
    const columns = await query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);

    columns.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? '(required)' : '(optional)'} ${row.column_default ? `default: ${row.column_default}` : ''}`);
    });

    console.log('\n🎉 User status columns added successfully!');

  } catch (error) {
    console.error('❌ Error adding user status columns:', error.message);
  } finally {
    await closePool();
  }
}

addUserStatusColumns();