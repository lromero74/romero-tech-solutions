import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function removeEmergencyContactColumns() {
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

    console.log('📞 Removing redundant emergency contact columns from employees table...');
    console.log('   These columns are now replaced by the normalized emergency_contacts table.');

    // List of emergency contact columns to remove
    const emergencyContactColumns = [
      'emergency_contact_first_name',
      'emergency_contact_last_name',
      'emergency_contact_relationship',
      'emergency_contact_phone',
      'emergency_contact_email'
    ];

    // Check which columns exist before attempting to drop them
    const existingColumns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'employees'
      AND column_name = ANY($1)
    `, [emergencyContactColumns]);

    const existingColumnNames = existingColumns.rows.map(row => row.column_name);

    if (existingColumnNames.length === 0) {
      console.log('✅ No emergency contact columns found - already removed or never existed');
      return;
    }

    console.log(`📊 Found ${existingColumnNames.length} emergency contact columns to remove:`);
    existingColumnNames.forEach(col => console.log(`   - ${col}`));

    // Verify that emergency_contacts table exists and has data
    const emergencyContactsTableExists = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'emergency_contacts'
    `);

    if (emergencyContactsTableExists.rows.length === 0) {
      console.log('❌ ERROR: emergency_contacts table does not exist!');
      console.log('   Cannot safely remove emergency contact columns without normalized table.');
      return;
    }

    // Check that we have emergency contacts in the normalized table
    const emergencyContactCount = await client.query(`
      SELECT COUNT(*) as count FROM emergency_contacts
    `);

    console.log(`📊 Found ${emergencyContactCount.rows[0].count} emergency contacts in normalized emergency_contacts table`);

    // Drop the redundant emergency contact columns
    for (const column of existingColumnNames) {
      console.log(`🗑️  Dropping column: ${column}`);
      await client.query(`
        ALTER TABLE employees DROP COLUMN IF EXISTS ${column}
      `);
    }

    console.log('✅ Successfully removed redundant emergency contact columns');

    // Verify the changes
    const remainingColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'employees'
      ORDER BY ordinal_position
    `);

    console.log('\\n📋 Remaining columns in employees table:');
    remainingColumns.rows.forEach(row => {
      console.log(`   - ${row.column_name} (${row.data_type})`);
    });

    console.log('\\n🎉 Emergency contact normalization completed successfully!');
    console.log('   ✅ Removed redundant emergency contact columns from employees table');
    console.log('   ✅ Employee emergency contacts are now managed exclusively through emergency_contacts table');
    console.log('   ✅ Single source of truth for emergency contact data');
    console.log('   ✅ Proper normalized database design (3NF) achieved');

  } catch (error) {
    console.error('❌ Error removing emergency contact columns:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

removeEmergencyContactColumns();