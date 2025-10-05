import { getPool } from '../../backend/config/database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const pool = await getPool();

  try {
    console.log('📦 Reading migration file...');
    const migrationPath = path.join(__dirname, 'add_timezone_to_service_requests.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf-8');

    console.log('🚀 Running migration...');
    await pool.query(migrationSQL);

    console.log('✅ Migration completed successfully!');

    // Run verification queries
    console.log('\n📊 Verification Results:');
    const result1 = await pool.query(`
      SELECT requested_date::text, requested_time_start::text, requested_datetime::text
      FROM service_requests
      WHERE requested_datetime IS NOT NULL
      LIMIT 3
    `);
    console.log('\nRequested DateTime Migration:');
    console.table(result1.rows);

    const result2 = await pool.query(`
      SELECT created_at::text, updated_at::text
      FROM service_requests
      LIMIT 3
    `);
    console.log('\nTimestamp Columns:');
    console.table(result2.rows);

    const result3 = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'service_requests'
      AND column_name IN ('created_at', 'updated_at', 'requested_datetime', 'scheduled_datetime', 'requested_duration_minutes')
      ORDER BY column_name
    `);
    console.log('\nColumn Types:');
    console.table(result3.rows);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
