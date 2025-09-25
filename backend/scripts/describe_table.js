#!/usr/bin/env node

import { query, closePool } from '../config/database.js';

async function describeTable(tableName) {
  try {
    if (!tableName) {
      console.log('❌ Usage: node describe_table.js <table_name>');
      console.log('📝 Example: node describe_table.js employees');
      return;
    }

    console.log(`🔍 Describing table: ${tableName}\n`);

    // Get table structure
    const columnsResult = await query(`
      SELECT
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default,
        ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);

    if (columnsResult.rows.length === 0) {
      console.log(`❌ Table '${tableName}' not found in the database.`);
      console.log('\n💡 Use list_tables_and_views.js to see available tables.');
      return;
    }

    console.log('📋 COLUMNS:');
    console.log('===========');
    console.log('Pos | Column Name              | Data Type           | Nullable | Default');
    console.log('----|--------------------------|---------------------|----------|--------');

    columnsResult.rows.forEach(col => {
      const pos = String(col.ordinal_position).padStart(3);
      const name = col.column_name.padEnd(24);
      const dataType = col.character_maximum_length
        ? `${col.data_type}(${col.character_maximum_length})`.padEnd(19)
        : col.data_type.padEnd(19);
      const nullable = col.is_nullable === 'YES' ? 'YES     ' : 'NO      ';
      const defaultVal = col.column_default ? col.column_default.substring(0, 20) : '';

      console.log(`${pos} | ${name} | ${dataType} | ${nullable} | ${defaultVal}`);
    });

    // Get primary keys
    const primaryKeysResult = await query(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
      ORDER BY kcu.ordinal_position
    `, [tableName]);

    if (primaryKeysResult.rows.length > 0) {
      console.log('\n🔑 PRIMARY KEYS:');
      console.log('================');
      primaryKeysResult.rows.forEach((pk, index) => {
        console.log(`   ${index + 1}. ${pk.column_name}`);
      });
    }

    // Get foreign keys
    const foreignKeysResult = await query(`
      SELECT
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
    `, [tableName]);

    if (foreignKeysResult.rows.length > 0) {
      console.log('\n🔗 FOREIGN KEYS:');
      console.log('================');
      foreignKeysResult.rows.forEach((fk, index) => {
        console.log(`   ${index + 1}. ${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
        console.log(`      Constraint: ${fk.constraint_name}`);
      });
    }

    // Get indexes
    const indexesResult = await query(`
      SELECT
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = $1
      ORDER BY indexname
    `, [tableName]);

    if (indexesResult.rows.length > 0) {
      console.log('\n📚 INDEXES:');
      console.log('===========');
      indexesResult.rows.forEach((idx, index) => {
        console.log(`   ${index + 1}. ${idx.indexname}`);
        console.log(`      ${idx.indexdef}`);
        console.log('');
      });
    }

    // Get row count
    const countResult = await query(`SELECT COUNT(*) as row_count FROM "${tableName}"`);
    console.log(`📊 Total rows: ${countResult.rows[0].row_count}`);

  } catch (error) {
    console.error('❌ Error describing table:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await closePool();
  }
}

// Get table name from command line arguments
const tableName = process.argv[2];
describeTable(tableName);