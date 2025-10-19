#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { query, closePool } from './config/database.js';

async function runMigration(migrationFile) {
  try {
    console.log(`📂 Reading migration file: ${migrationFile}`);
    const sql = await readFile(migrationFile, 'utf-8');

    console.log(`🚀 Executing migration...`);
    console.log(`═══════════════════════════════════════════════════════════════\n`);

    const result = await query(sql);

    console.log(`\n═══════════════════════════════════════════════════════════════`);
    console.log(`✅ Migration completed successfully!`);

    // If there were any RAISE NOTICE messages, they would show in the console
    if (result.rows && result.rows.length > 0) {
      console.log('\nResults:');
      console.table(result.rows);
    }

  } catch (error) {
    console.error(`\n❌ Migration failed:`);
    console.error(error.message);
    if (error.detail) console.error(`Detail: ${error.detail}`);
    if (error.hint) console.error(`Hint: ${error.hint}`);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Get migration file from command line args
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.error('Usage: node run-migration.js <path-to-migration-file.sql>');
  process.exit(1);
}

runMigration(migrationFile);
