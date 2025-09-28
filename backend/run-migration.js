#!/usr/bin/env node

import { readFileSync } from 'fs';
import { getPool } from './config/database.js';

async function runMigration() {
  try {
    console.log('🚀 Running file association migration...');

    const pool = await getPool();

    // Read the migration file
    const migrationSQL = readFileSync('./migrations/006_service_request_file_associations.sql', 'utf8');

    // Execute the migration
    console.log('📊 Executing SQL migration...');
    await pool.query(migrationSQL);

    console.log('✅ File association migration completed successfully!');

    // Verify changes were made
    console.log('\n🔍 Verifying column addition...');
    const columnCheck = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 't_client_files'
      AND column_name = 'service_request_id'
    `);

    if (columnCheck.rows.length > 0) {
      console.log('✅ service_request_id column added to t_client_files');
    } else {
      console.log('❌ service_request_id column not found');
    }

    // Check functions were created
    console.log('\n🔍 Verifying functions...');
    const functionCheck = await pool.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_name IN (
        'get_service_request_files',
        'associate_file_with_service_request',
        'disassociate_file_from_service_request'
      )
    `);

    console.log('📋 Functions created:');
    functionCheck.rows.forEach(row => {
      console.log(`  ✅ ${row.routine_name}`);
    });

    console.log('\n🎉 Migration completed successfully! Files can now be associated with service requests.');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  } finally {
    await closePool();
  }
}

runMigration();