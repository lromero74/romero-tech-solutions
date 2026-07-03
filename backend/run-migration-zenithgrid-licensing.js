#!/usr/bin/env node
// One-off runner for 20260703_zenithgrid_licensing.sql, matching the
// existing run-migration-*.js convention (e.g. run-migration-stripe.js).

import { getPool, closePool } from './config/database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log('🚀 Running ZenithGrid licensing schema migration...');
    const pool = await getPool();
    const sql = await fs.readFile(
      path.join(__dirname, 'migrations', '20260703_zenithgrid_licensing.sql'), 'utf-8'
    );
    await pool.query(sql);
    console.log('✅ Migration completed.');

    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('zenithgrid_licenses', 'zenithgrid_license_activations')
      ORDER BY table_name
    `);
    console.log('\n🔍 Verified tables:');
    tables.rows.forEach(r => console.log(`   ${r.table_name}`));

    const index = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE indexname = 'one_active_activation_per_license'
    `);
    console.log('\n🔍 Verified partial unique index:');
    index.rows.forEach(r => console.log(`   ${r.indexname}`));
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await closePool();
  }
}

runMigration();
