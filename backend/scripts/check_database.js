import { query, closePool } from '../config/database.js';

async function showTables() {
  try {
    console.log('📋 Checking database tables and data...\n');

    // Show all tables
    const tables = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('🗃️  Available tables:');
    tables.rows.forEach(row => console.log('  -', row.table_name));
    console.log();

    // Show users table structure and data
    const usersStructure = await query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);

    console.log('👥 Users table structure:');
    usersStructure.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? '(required)' : '(optional)'}`);
    });
    console.log();

    // Show current users
    const users = await query('SELECT id, email, role, first_name, last_name, created_at FROM users ORDER BY created_at DESC');
    console.log('👥 Current users:');
    users.rows.forEach(user => {
      console.log(`  ${user.email} (${user.role}) - ${user.first_name} ${user.last_name}`);
    });
    console.log();

    // Show businesses table if it exists
    try {
      const businesses = await query('SELECT id, business_name, contact_email FROM businesses ORDER BY created_at DESC LIMIT 5');
      console.log('🏢 Current businesses:');
      businesses.rows.forEach(business => {
        console.log(`  ${business.business_name} - ${business.contact_email}`);
      });
    } catch (e) {
      console.log('🏢 Businesses table not found or empty');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await closePool();
  }
}

showTables();