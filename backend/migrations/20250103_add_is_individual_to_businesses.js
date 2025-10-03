/**
 * Migration: Add is_individual field to businesses table
 * Date: 2025-01-03
 * Description: Adds a boolean field to indicate whether the business entry represents an individual rather than a company
 */

/**
 * @param {import('pg').Pool} pool
 */
export async function up(pool) {
  console.log('🔄 Starting migration: Add is_individual to businesses table...');

  try {
    await pool.query('BEGIN');

    // Add is_individual column
    await pool.query(`
      ALTER TABLE businesses
      ADD COLUMN IF NOT EXISTS is_individual BOOLEAN DEFAULT false;
    `);
    console.log('✅ Added is_individual column to businesses table (default: false)');

    // Add comment for documentation
    await pool.query(`
      COMMENT ON COLUMN businesses.is_individual IS 'Indicates whether this business entry represents an individual person rather than a company';
    `);
    console.log('✅ Added column comment for documentation');

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
  console.log('🔄 Starting rollback: Remove is_individual from businesses table...');

  try {
    await pool.query('BEGIN');

    // Remove is_individual column
    await pool.query(`
      ALTER TABLE businesses
      DROP COLUMN IF EXISTS is_individual;
    `);
    console.log('✅ Removed is_individual column from businesses table');

    await pool.query('COMMIT');
    console.log('✅ Rollback completed successfully!');

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}
