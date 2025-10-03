#!/usr/bin/env node

import { getPool, closePool } from './config/database.js';
import { up } from './migrations/20251003_update_payment_status_constraint.js';

async function runMigration() {
  try {
    console.log('🚀 Running payment status constraint migration...');

    const pool = await getPool();

    // Run the migration
    await up(pool);

    // Verify the constraint was updated
    console.log('\n🔍 Verifying constraint update...');
    const constraintCheck = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conname = 'check_payment_status'
      AND conrelid = 'invoices'::regclass
    `);

    if (constraintCheck.rows.length > 0) {
      console.log('✅ Payment status constraint verified:');
      console.log(`   ${constraintCheck.rows[0].conname}`);
      console.log(`   ${constraintCheck.rows[0].definition}`);
    } else {
      console.log('❌ Payment status constraint not found');
    }

    console.log('\n🎉 Migration completed successfully!');
    console.log('   Allowed payment statuses: due, pending, paid, failed, overdue, comped');

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
