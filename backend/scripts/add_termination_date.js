#!/usr/bin/env node

import { query, pool } from '../config/database.js';

async function addTerminationDate() {
  const client = await pool.connect();

  try {
    console.log('🚀 Adding termination_date field to employees table...');

    // Start transaction
    await client.query('BEGIN');

    // 1. Add termination_date column
    console.log('📋 Adding termination_date column...');
    await client.query(`
      ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS termination_date TIMESTAMP WITH TIME ZONE
    `);

    // 2. Create index for performance
    console.log('📊 Creating index for termination_date...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employees_termination_date
      ON employees(termination_date)
    `);

    // 3. Update the update_employee endpoint to handle termination_date
    console.log('💡 Termination date field added. Now employees can be terminated properly.');

    // Commit transaction
    await client.query('COMMIT');

    console.log('✅ Termination date field added successfully!');
    console.log('📊 Summary:');
    console.log('   - Added termination_date TIMESTAMP WITH TIME ZONE column');
    console.log('   - Created performance index');
    console.log('   - Ready for employee termination functionality');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  addTerminationDate()
    .then(() => {
      console.log('🎉 Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration failed:', error);
      process.exit(1);
    });
}

export default addTerminationDate;