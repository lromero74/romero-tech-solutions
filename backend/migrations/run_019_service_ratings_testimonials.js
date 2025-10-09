import { getPool } from '../config/database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const pool = await getPool();

  try {
    console.log('📦 Reading migration file...');
    const migrationPath = path.join(__dirname, '019_service_ratings_testimonials.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf-8');

    console.log('🚀 Running migration: Service Ratings and Testimonials System...');
    await pool.query(migrationSQL);

    console.log('✅ Migration completed successfully!');

    // Run verification queries
    console.log('\n📊 Verification Results:');

    // Check if tables were created
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('service_ratings', 'service_testimonials')
      ORDER BY table_name
    `);
    console.log('\nCreated Tables:');
    console.table(tablesResult.rows);

    // Check service_ratings columns
    const ratingsColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'service_ratings'
      ORDER BY ordinal_position
    `);
    console.log('\nService Ratings Table Structure:');
    console.table(ratingsColumns.rows);

    // Check service_testimonials columns
    const testimonialsColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'service_testimonials'
      ORDER BY ordinal_position
    `);
    console.log('\nService Testimonials Table Structure:');
    console.table(testimonialsColumns.rows);

    // Check indexes
    const indexesResult = await pool.query(`
      SELECT
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('service_ratings', 'service_testimonials')
      ORDER BY tablename, indexname
    `);
    console.log('\nCreated Indexes:');
    console.table(indexesResult.rows);

    console.log('\n✨ Migration verification complete!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
