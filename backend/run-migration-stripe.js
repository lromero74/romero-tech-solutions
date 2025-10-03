#!/usr/bin/env node

import { getPool, closePool } from './config/database.js';
import { up } from './migrations/20251003_add_stripe_fields_to_invoices.js';

async function runMigration() {
  try {
    console.log('🚀 Running Stripe fields migration...');

    const pool = await getPool();

    // Run the migration
    await up(pool);

    // Verify the columns were added
    console.log('\n🔍 Verifying columns addition...');
    const columnCheck = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'invoices'
      AND column_name IN (
        'stripe_payment_intent_id',
        'stripe_charge_id',
        'stripe_customer_id',
        'payment_method',
        'stripe_payment_method_id'
      )
      ORDER BY column_name
    `);

    if (columnCheck.rows.length > 0) {
      console.log('✅ Stripe columns verified:');
      columnCheck.rows.forEach(col => {
        console.log(`   ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
    } else {
      console.log('❌ Stripe columns not found');
    }

    // Verify indexes were created
    console.log('\n🔍 Verifying indexes...');
    const indexCheck = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'invoices'
      AND indexname LIKE 'idx_invoices_stripe%'
      ORDER BY indexname
    `);

    if (indexCheck.rows.length > 0) {
      console.log('✅ Stripe indexes verified:');
      indexCheck.rows.forEach(idx => {
        console.log(`   ${idx.indexname}`);
      });
    } else {
      console.log('❌ Stripe indexes not found');
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
