#!/usr/bin/env node

import pkg from 'pg';
import { config } from 'dotenv';
const { Pool } = pkg;

// Load environment variables
config();

const prodConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'romerotechsolutions',
  ssl: process.env.DB_SSL === 'true'
};

const devConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'romerotechsolutions_dev',
  ssl: process.env.DB_SSL === 'true'
};

async function copyDatabaseSchema() {
  const prodPool = new Pool(prodConfig);
  const devPool = new Pool(devConfig);

  try {
    console.log('🔍 Getting production database schema...');

    // Get the schema creation SQL
    const schemaQuery = `
      SELECT
        'CREATE TABLE ' || schemaname||'.'||tablename||' (' ||
        array_to_string(
          array_agg(
            column_name ||' '|| type ||
            case when character_maximum_length is not null then '('||character_maximum_length||')' else '' end ||
            case when is_nullable = 'NO' then ' NOT NULL' else '' end
          ), ', '
        ) || ');' as ddl
      FROM (
        SELECT
          t.table_schema as schemaname,
          t.table_name as tablename,
          c.column_name,
          c.data_type as type,
          c.character_maximum_length,
          c.is_nullable
        FROM information_schema.tables t
        JOIN information_schema.columns c ON c.table_name = t.table_name AND c.table_schema = t.table_schema
        WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name, c.ordinal_position
      ) as table_columns
      GROUP BY schemaname, tablename
      ORDER BY tablename;
    `;

    const result = await prodPool.query(schemaQuery);

    console.log('📋 Creating tables in development database...');

    for (const row of result.rows) {
      try {
        await devPool.query(row.ddl);
        console.log('✅ Created table from DDL');
      } catch (error) {
        console.log('⚠️  Error creating table:', error.message);
      }
    }

    // Get a simpler table list to verify
    const tablesResult = await devPool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\n✅ Development database setup complete!');
    console.log(`📊 Created ${tablesResult.rows.length} tables:`);
    tablesResult.rows.forEach(row => console.log(`   - ${row.table_name}`));

  } catch (error) {
    console.error('❌ Error setting up development database:', error.message);
  } finally {
    await prodPool.end();
    await devPool.end();
  }
}

copyDatabaseSchema();