#!/usr/bin/env node

import { query, closePool } from '../config/database.js';

async function listTablesAndViews() {
  try {
    console.log('📊 Listing all tables and views in the database...\n');

    // Get all tables
    const tablesResult = await query(`
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_type, table_name
    `);

    console.log('📋 Database Objects Found:');
    console.log('========================\n');

    const tables = tablesResult.rows.filter(row => row.table_type === 'BASE TABLE');
    const views = tablesResult.rows.filter(row => row.table_type === 'VIEW');

    if (tables.length > 0) {
      console.log('📁 TABLES:');
      tables.forEach((row, index) => {
        console.log(`   ${index + 1}. ${row.table_name}`);
      });
      console.log(`\n📊 Total tables: ${tables.length}`);
    }

    if (views.length > 0) {
      console.log('\n👁️  VIEWS:');
      views.forEach((row, index) => {
        console.log(`   ${index + 1}. ${row.table_name}`);
      });
      console.log(`\n📊 Total views: ${views.length}`);
    }

    console.log(`\n📊 Total database objects: ${tablesResult.rows.length}`);

  } catch (error) {
    console.error('❌ Error listing tables and views:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await closePool();
  }
}

listTablesAndViews();