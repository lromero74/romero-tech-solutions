import { query, closePool } from '../config/database.js';

async function addPronounsToEmployees() {
  try {
    console.log('🔄 Adding preferred pronouns column to employees table...');

    // Add pronouns column to employees table
    await query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS pronouns VARCHAR(50)
    `);

    console.log('✅ Successfully added pronouns column to employees table');

    // Set default pronouns for existing employees (can be updated later)
    await query(`
      UPDATE employees
      SET pronouns = 'they/them'
      WHERE pronouns IS NULL
    `);

    console.log('✅ Set default pronouns for existing employees');
    console.log('');
    console.log('📋 Available pronoun options:');
    console.log('   - he/him');
    console.log('   - she/her');
    console.log('   - they/them');
    console.log('   - ze/zir');
    console.log('   - xe/xem');
    console.log('   - ey/em');
    console.log('   - fae/faer');
    console.log('   - any pronouns');
    console.log('   - ask me');
    console.log('');
    console.log('🎉 Pronouns support added successfully!');

  } catch (error) {
    console.error('❌ Error adding pronouns support:', error);
  } finally {
    await closePool();
  }
}

addPronounsToEmployees();