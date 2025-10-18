#!/usr/bin/env node

/**
 * Phase 1 Migration Runner
 * Runs all Phase 1 migrations in order
 */

import { query } from './config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrations = [
  '041_asset_management_system.sql',
  '042_alert_ticket_integration.sql',
  '043_policy_based_automation.sql',
  '044_software_deployment.sql'
];

async function runMigration(filename) {
  const filepath = path.join(__dirname, 'migrations', filename);
  const sql = fs.readFileSync(filepath, 'utf8');

  console.log(`\n📝 Running migration: ${filename}`);
  console.log(`   File: ${filepath}`);
  console.log(`   Size: ${(sql.length / 1024).toFixed(2)} KB`);

  try {
    await query(sql);
    console.log(`✅ Successfully completed: ${filename}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed: ${filename}`);
    console.error(`   Error: ${error.message}`);
    if (error.position) {
      console.error(`   Position: ${error.position}`);
    }
    return false;
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('Phase 1 RMM Migrations - Database Schema Setup');
  console.log('='.repeat(70));

  let successCount = 0;
  let failCount = 0;

  for (const migration of migrations) {
    const success = await runMigration(migration);
    if (success) {
      successCount++;
    } else {
      failCount++;
      console.log(`\n⚠️  Stopping migrations due to error in ${migration}`);
      break;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Migration Results: ${successCount} successful, ${failCount} failed`);
  console.log('='.repeat(70));

  if (failCount === 0) {
    console.log('\n✅ All Phase 1 migrations completed successfully!');
    console.log('\nVerify installation with:');
    console.log('  ./scripts/table --sql "\\dt asset_*"');
    console.log('  ./scripts/table --sql "\\dt automation_*"');
    console.log('  ./scripts/table --sql "\\dt software_*"');
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
