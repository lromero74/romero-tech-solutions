import { getPool } from '../config/database.js';

/**
 * Migration: Drop legacy time columns with timezone bugs
 *
 * Removes requested_time_start, requested_time_end, requested_date,
 * scheduled_time_start, scheduled_time_end, and scheduled_date columns
 * from service_requests table.
 *
 * These columns had timezone conversion bugs and have been replaced with:
 * - requested_datetime (timestamptz)
 * - requested_duration_minutes (integer)
 * - scheduled_datetime (timestamptz)
 * - scheduled_duration_minutes (integer)
 */

async function up() {
  const pool = await getPool();

  try {
    console.log('🔧 Starting migration: Drop legacy time columns and trigger...');

    // Drop the trigger that syncs datetime to old time fields (causes timezone bugs)
    await pool.query(`
      DROP TRIGGER IF EXISTS trigger_sync_service_request_datetime ON service_requests;
    `);
    console.log('✅ Dropped trigger_sync_service_request_datetime');

    // Drop the trigger function
    await pool.query(`
      DROP FUNCTION IF EXISTS sync_service_request_datetime();
    `);
    console.log('✅ Dropped sync_service_request_datetime() function');

    // Drop view that depends on old columns (not used in code)
    await pool.query(`
      DROP VIEW IF EXISTS v_client_service_requests CASCADE;
    `);
    console.log('✅ Dropped v_client_service_requests view');

    // Drop old requested time columns
    await pool.query(`
      ALTER TABLE service_requests
      DROP COLUMN IF EXISTS requested_date,
      DROP COLUMN IF EXISTS requested_time_start,
      DROP COLUMN IF EXISTS requested_time_end;
    `);
    console.log('✅ Dropped requested_date, requested_time_start, requested_time_end');

    // Drop old scheduled time columns
    await pool.query(`
      ALTER TABLE service_requests
      DROP COLUMN IF EXISTS scheduled_date,
      DROP COLUMN IF EXISTS scheduled_time_start,
      DROP COLUMN IF EXISTS scheduled_time_end;
    `);
    console.log('✅ Dropped scheduled_date, scheduled_time_start, scheduled_time_end');

    console.log('✅ Migration completed successfully');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function down() {
  const pool = await getPool();

  try {
    console.log('🔧 Rolling back migration: Restore legacy time columns...');

    // Restore requested time columns (nullable since we can't recover the buggy data)
    await pool.query(`
      ALTER TABLE service_requests
      ADD COLUMN IF NOT EXISTS requested_date DATE,
      ADD COLUMN IF NOT EXISTS requested_time_start TIME,
      ADD COLUMN IF NOT EXISTS requested_time_end TIME;
    `);
    console.log('✅ Restored requested_date, requested_time_start, requested_time_end');

    // Restore scheduled time columns
    await pool.query(`
      ALTER TABLE service_requests
      ADD COLUMN IF NOT EXISTS scheduled_date DATE,
      ADD COLUMN IF NOT EXISTS scheduled_time_start TIME,
      ADD COLUMN IF NOT EXISTS scheduled_time_end TIME;
    `);
    console.log('✅ Restored scheduled_date, scheduled_time_start, scheduled_time_end');

    console.log('✅ Rollback completed successfully');
    console.log('⚠️  WARNING: Old column data cannot be recovered. These columns are now empty.');

  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  if (command === 'up') {
    await up();
    process.exit(0);
  } else if (command === 'down') {
    await down();
    process.exit(0);
  } else {
    console.error('Usage: node 20251005_drop_legacy_time_columns.js [up|down]');
    process.exit(1);
  }
}

export { up, down };
