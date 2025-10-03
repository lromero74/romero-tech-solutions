/**
 * Migration: Add Stripe payment fields to invoices table
 * Date: 2025-10-03
 * Description: Adds fields for tracking Stripe payment processing (PaymentIntent, Charge, Customer, PaymentMethod)
 */

/**
 * @param {import('pg').Pool} pool
 */
export async function up(pool) {
  console.log('🔄 Starting migration: Add Stripe fields to invoices table...');

  try {
    await pool.query('BEGIN');

    // Add Stripe-related columns
    await pool.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS stripe_charge_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
      ADD COLUMN IF NOT EXISTS stripe_payment_method_id VARCHAR(255);
    `);
    console.log('✅ Added Stripe payment tracking columns to invoices table');

    // Add comments for documentation
    await pool.query(`
      COMMENT ON COLUMN invoices.stripe_payment_intent_id IS 'Stripe PaymentIntent ID for tracking payment lifecycle';
      COMMENT ON COLUMN invoices.stripe_charge_id IS 'Stripe Charge ID once payment is successfully captured';
      COMMENT ON COLUMN invoices.stripe_customer_id IS 'Stripe Customer ID for recurring customer tracking';
      COMMENT ON COLUMN invoices.payment_method IS 'Payment method type (e.g., card, us_bank_account, etc.)';
      COMMENT ON COLUMN invoices.stripe_payment_method_id IS 'Stripe PaymentMethod ID used for the transaction';
    `);
    console.log('✅ Added column comments for documentation');

    // Create index on stripe_payment_intent_id for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_stripe_payment_intent_id
      ON invoices(stripe_payment_intent_id);
    `);
    console.log('✅ Created index on stripe_payment_intent_id');

    // Create index on stripe_customer_id for customer history queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_stripe_customer_id
      ON invoices(stripe_customer_id);
    `);
    console.log('✅ Created index on stripe_customer_id');

    await pool.query('COMMIT');
    console.log('✅ Migration completed successfully!');

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * @param {import('pg').Pool} pool
 */
export async function down(pool) {
  console.log('🔄 Starting rollback: Remove Stripe fields from invoices table...');

  try {
    await pool.query('BEGIN');

    // Remove indexes
    await pool.query(`
      DROP INDEX IF EXISTS idx_invoices_stripe_payment_intent_id;
      DROP INDEX IF EXISTS idx_invoices_stripe_customer_id;
    `);
    console.log('✅ Removed Stripe-related indexes');

    // Remove Stripe columns
    await pool.query(`
      ALTER TABLE invoices
      DROP COLUMN IF EXISTS stripe_payment_intent_id,
      DROP COLUMN IF EXISTS stripe_charge_id,
      DROP COLUMN IF EXISTS stripe_customer_id,
      DROP COLUMN IF EXISTS payment_method,
      DROP COLUMN IF EXISTS stripe_payment_method_id;
    `);
    console.log('✅ Removed Stripe columns from invoices table');

    await pool.query('COMMIT');
    console.log('✅ Rollback completed successfully!');

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}
