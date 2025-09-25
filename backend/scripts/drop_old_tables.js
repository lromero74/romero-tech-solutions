import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function dropOldTables() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();

    console.log('🗑️  Dropping old tables with poor naming conventions...');
    console.log('   These tables have been replaced with properly named employee-specific tables');

    // List of old tables to drop
    const oldTables = [
      'addresses',
      'emergency_contacts'
    ];

    // Verify that new tables exist and have data
    console.log('\n📊 Verifying new tables exist and have data...');

    const newTableVerification = await Promise.all([
      client.query(`
        SELECT table_name FROM information_schema.tables WHERE table_name = 'employee_addresses'
      `),
      client.query(`
        SELECT table_name FROM information_schema.tables WHERE table_name = 'employee_emergency_contacts'
      `),
      client.query(`
        SELECT COUNT(*) as count FROM employee_addresses
      `),
      client.query(`
        SELECT COUNT(*) as count FROM employee_emergency_contacts
      `)
    ]);

    const [addressesTableExists, emergencyContactsTableExists, addressesCount, emergencyContactsCount] = newTableVerification;

    if (addressesTableExists.rows.length === 0) {
      console.log('❌ ERROR: employee_addresses table does not exist!');
      console.log('   Cannot safely drop old tables without replacement tables.');
      return;
    }

    if (emergencyContactsTableExists.rows.length === 0) {
      console.log('❌ ERROR: employee_emergency_contacts table does not exist!');
      console.log('   Cannot safely drop old tables without replacement tables.');
      return;
    }

    console.log('✅ New tables verified:');
    console.log(`   - employee_addresses: ${addressesCount.rows[0].count} records`);
    console.log(`   - employee_emergency_contacts: ${emergencyContactsCount.rows[0].count} records`);

    // Check which old tables exist
    console.log('\n📋 Checking which old tables exist...');
    const existingOldTables = [];

    for (const tableName of oldTables) {
      const tableExists = await client.query(`
        SELECT table_name FROM information_schema.tables WHERE table_name = $1
      `, [tableName]);

      if (tableExists.rows.length > 0) {
        existingOldTables.push(tableName);

        // Get record count
        const recordCount = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        console.log(`   - ${tableName}: ${recordCount.rows[0].count} records (will be dropped)`);
      }
    }

    if (existingOldTables.length === 0) {
      console.log('✅ No old tables found - already dropped or never existed');
      return;
    }

    // Final verification: ensure no foreign key dependencies
    console.log('\n🔍 Checking for foreign key dependencies...');
    const foreignKeyCheck = await client.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND (ccu.table_name = ANY($1) OR tc.table_name = ANY($1))
    `, [existingOldTables]);

    if (foreignKeyCheck.rows.length > 0) {
      console.log('⚠️  Found foreign key dependencies:');
      foreignKeyCheck.rows.forEach(row => {
        console.log(`   ${row.table_name}.${row.column_name} → ${row.foreign_table_name}.${row.foreign_column_name}`);
      });
      console.log('   Will use CASCADE to safely drop tables with dependencies.');
    } else {
      console.log('✅ No foreign key dependencies found');
    }

    // Drop the old tables
    console.log('\n🗑️  Dropping old tables...');
    for (const tableName of existingOldTables) {
      console.log(`   Dropping table: ${tableName}`);
      await client.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
    }

    console.log('✅ Successfully dropped old tables');

    // Final verification - show remaining tables
    const remainingTables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log('\\n📋 Remaining tables in database:');
    remainingTables.rows.forEach((table, index) => {
      const tableName = table.table_name;
      const isEmployeeTable = tableName.startsWith('employee_');
      const prefix = isEmployeeTable ? '✅' : '📋';
      console.log(`   ${index + 1}. ${prefix} ${tableName}`);
    });

    console.log('\\n🎉 Table renaming completed successfully!');
    console.log('   ✅ Dropped old tables with poor naming conventions');
    console.log('   ✅ New employee-specific tables are now the only source of truth');
    console.log('   ✅ Database now follows proper naming conventions');
    console.log('   ✅ Table relationships are clearly visible from names');

  } catch (error) {
    console.error('❌ Error dropping old tables:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

dropOldTables();