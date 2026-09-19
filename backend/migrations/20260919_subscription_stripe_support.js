/**
 * Migration: Subscription Stripe support
 * Date: 2026-09-19
 * Description: Stores Stripe customer/subscription ids on users and tracks
 *   hosted-checkout sessions so the subscription webhook can activate the
 *   right tier exactly once (idempotent on stripe_session_id).
 */

/**
 * @param {import('pg').Pool} pool
 */
export async function up(pool) {
  console.log('🔄 Starting migration: Subscription Stripe support...');

  await pool.query('BEGIN');
  try {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);
    `);
    console.log('✅ Added Stripe id columns to users table');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS subscription_checkouts (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        stripe_session_id VARCHAR(255) NOT NULL UNIQUE,
        target_tier VARCHAR(50) NOT NULL,
        devices_allowed INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'usd',
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Created subscription_checkouts table');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_subscription_checkouts_user
      ON subscription_checkouts(user_id);
    `);

    await pool.query('COMMIT');
    console.log('✅ Migration complete: Subscription Stripe support');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}
