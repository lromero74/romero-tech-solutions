#!/usr/bin/env node

import { query, closePool } from '../config/database.js';

async function listTables() {
  try {
    console.log('📊 Listing all tables in the database...\n');

    // Get all tables
    const tablesResult = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('📋 Tables found:');
    tablesResult.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.table_name}`);
    });

    console.log(`\n📊 Total tables: ${tablesResult.rows.length}`);

  } catch (error) {
    console.error('❌ Error listing tables:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await closePool();
  }
}

listTables();