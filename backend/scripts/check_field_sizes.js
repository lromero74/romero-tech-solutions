import { query, closePool } from '../config/database.js';

async function checkFieldSizes() {
  try {
    console.log('🔍 Checking field sizes in employees table...\n');

    const result = await query(`
      SELECT column_name, data_type, character_maximum_length, character_octet_length
      FROM information_schema.columns
      WHERE table_name = 'employees'
      AND character_maximum_length IS NOT NULL
      ORDER BY character_maximum_length ASC
    `);

    console.log('📋 Fields with character limits:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}(${row.character_maximum_length})`);
    });

    // Specifically check for 500 character limit
    const limit500 = result.rows.filter(row => row.character_maximum_length === 500);
    if (limit500.length > 0) {
      console.log('\n⚠️  Fields with 500 character limit:');
      limit500.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type}(${row.character_maximum_length})`);
      });
    }

  } catch (error) {
    console.error('❌ Error checking field sizes:', error);
  } finally {
    await closePool();
  }
}

checkFieldSizes();