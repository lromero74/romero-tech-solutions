#!/usr/bin/env node

import { getPool, closePool } from './config/database.js';
import { up } from './migrations/20250103_add_is_individual_to_businesses.js';

async function runMigration() {
  try {
    console.log('🚀 Running is_individual migration...');

    const pool = await getPool();

    // Run the migration
    await up(pool);

    // Verify the column was added
    console.log('\n🔍 Verifying column addition...');
    const columnCheck = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'businesses'
      AND column_name = 'is_individual'
    `);

    if (columnCheck.rows.length > 0) {
      const col = columnCheck.rows[0];
      console.log('✅ is_individual column verified:');
      console.log(`   Type: ${col.data_type}`);
      console.log(`   Default: ${col.column_default}`);
      console.log(`   Nullable: ${col.is_nullable}`);
    } else {
      console.log('❌ is_individual column not found');
    }

    console.log('\n🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await closePool();
  }
}

runMigration();
