/**
 * Migration: Update payment_status CHECK constraint
 *
 * Adds 'pending' and 'failed' payment statuses to support Stripe payment flow
 *
 * Payment status flow:
 * - 'due' - Invoice created, awaiting payment
 * - 'pending' - Payment intent created, in progress (optional intermediate state)
 * - 'paid' - Payment succeeded
 * - 'failed' - Payment attempt failed
 * - 'overdue' - Invoice past due date
 * - 'comped' - Manually marked as complimentary
 */

export async function up(pool) {
  console.log('🔄 Updating payment_status CHECK constraint...');

  // Drop the old constraint
  await pool.query(`
    ALTER TABLE invoices
    DROP CONSTRAINT IF EXISTS check_payment_status;
  `);

  // Add new constraint with 'pending' and 'failed' statuses
  await pool.query(`
    ALTER TABLE invoices
    ADD CONSTRAINT check_payment_status
    CHECK (payment_status IN ('due', 'pending', 'paid', 'failed', 'overdue', 'comped'));
  `);

  console.log('✅ Payment status constraint updated successfully');
  console.log('   Allowed statuses: due, pending, paid, failed, overdue, comped');
}

export async function down(pool) {
  console.log('🔄 Reverting payment_status CHECK constraint...');

  // Revert any 'pending' or 'failed' statuses to 'due' before reverting constraint
  await pool.query(`
    UPDATE invoices
    SET payment_status = 'due'
    WHERE payment_status IN ('pending', 'failed');
  `);

  // Drop the new constraint
  await pool.query(`
    ALTER TABLE invoices
    DROP CONSTRAINT IF EXISTS check_payment_status;
  `);

  // Restore original constraint
  await pool.query(`
    ALTER TABLE invoices
    ADD CONSTRAINT check_payment_status
    CHECK (payment_status IN ('due', 'overdue', 'paid', 'comped'));
  `);

  console.log('✅ Payment status constraint reverted to original');
}
