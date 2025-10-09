import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupSchema() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });

  try {
    console.log('🔍 Connecting to romerotechsolutions database...');
    await client.connect();
    console.log('✅ Connected successfully!');

    // Define the schema files in order
    const schemaFiles = [
      '01_businesses_table.sql',
      '02_service_addresses_table.sql',
      '03_update_users_table.sql',
      '04_client_registration_procedures.sql'
    ];

    const schemaDir = path.join(__dirname, '../../database/schema');

    for (const filename of schemaFiles) {
      const filePath = path.join(schemaDir, filename);

      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Warning: Schema file not found: ${filePath}`);
        continue;
      }

      console.log(`📝 Executing schema file: ${filename}`);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        await client.query(sql);
        console.log(`✅ Successfully executed: ${filename}`);
      } catch (error) {
        console.error(`❌ Error executing ${filename}:`, error.message);
        // Continue with other files even if one fails
      }
    }

    // Verify tables were created
    console.log('🔍 Checking created tables...');
    const tablesResult = await client.query(`
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('📋 Database tables:');
    if (tablesResult.rows.length === 0) {
      console.log('  (No tables found)');
    } else {
      tablesResult.rows.forEach(row => {
        console.log(`  - ${row.table_name} (${row.table_type})`);
      });
    }

    // Check functions/procedures
    const functionsResult = await client.query(`
      SELECT routine_name, routine_type
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      ORDER BY routine_name
    `);

    console.log('📋 Database functions/procedures:');
    if (functionsResult.rows.length === 0) {
      console.log('  (No functions found)');
    } else {
      functionsResult.rows.forEach(row => {
        console.log(`  - ${row.routine_name} (${row.routine_type})`);
      });
    }

  } catch (error) {
    console.error('❌ Schema setup failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log('🔌 Disconnected from database');
  }
}

// Run the schema setup
setupSchema().then(() => {
  console.log('🎉 Database schema setup completed!');
  process.exit(0);
});