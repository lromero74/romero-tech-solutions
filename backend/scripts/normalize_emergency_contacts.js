import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function normalizeEmergencyContacts() {
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

    console.log('📞 Starting Emergency Contact Normalization (Phase 3)...');
    console.log('   Moving emergency contact data from employees table to normalized emergency_contacts table');

    // Step 1: Create emergency_contacts table
    console.log('\n📋 Step 1: Creating emergency_contacts table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS emergency_contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        relationship VARCHAR(100),
        phone VARCHAR(20),
        email VARCHAR(255),
        is_primary BOOLEAN DEFAULT true,
        priority_order INTEGER DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_emergency_contacts_employee_id ON emergency_contacts(employee_id);
      CREATE INDEX IF NOT EXISTS idx_emergency_contacts_primary ON emergency_contacts(is_primary) WHERE is_primary = true;
      CREATE INDEX IF NOT EXISTS idx_emergency_contacts_priority ON emergency_contacts(priority_order);
    `);

    console.log('✅ Emergency contacts table created with indexes');

    // Step 2: Check for existing emergency contact data in employees table
    console.log('\n📊 Step 2: Analyzing existing emergency contact data...');
    const emergencyContactAnalysis = await client.query(`
      SELECT
        COUNT(*) as total_employees,
        COUNT(CASE WHEN emergency_contact_first_name IS NOT NULL AND emergency_contact_first_name != '' THEN 1 END) as with_first_name,
        COUNT(CASE WHEN emergency_contact_last_name IS NOT NULL AND emergency_contact_last_name != '' THEN 1 END) as with_last_name,
        COUNT(CASE WHEN emergency_contact_phone IS NOT NULL AND emergency_contact_phone != '' THEN 1 END) as with_phone,
        COUNT(CASE WHEN emergency_contact_email IS NOT NULL AND emergency_contact_email != '' THEN 1 END) as with_email,
        COUNT(CASE WHEN emergency_contact_relationship IS NOT NULL AND emergency_contact_relationship != '' THEN 1 END) as with_relationship
      FROM employees
    `);

    const stats = emergencyContactAnalysis.rows[0];
    console.log(`   📈 Total employees: ${stats.total_employees}`);
    console.log(`   👤 With emergency contact first names: ${stats.with_first_name}`);
    console.log(`   👤 With emergency contact last names: ${stats.with_last_name}`);
    console.log(`   📱 With emergency contact phones: ${stats.with_phone}`);
    console.log(`   📧 With emergency contact emails: ${stats.with_email}`);
    console.log(`   👥 With emergency contact relationships: ${stats.with_relationship}`);

    // Step 3: Migrate existing emergency contact data
    console.log('\n🔄 Step 3: Migrating existing emergency contact data...');
    const migrationResult = await client.query(`
      INSERT INTO emergency_contacts (
        employee_id, first_name, last_name, relationship, phone, email, is_primary, priority_order
      )
      SELECT
        id as employee_id,
        emergency_contact_first_name,
        emergency_contact_last_name,
        emergency_contact_relationship,
        emergency_contact_phone,
        emergency_contact_email,
        true as is_primary,
        1 as priority_order
      FROM employees
      WHERE
        (emergency_contact_first_name IS NOT NULL AND emergency_contact_first_name != '')
        OR (emergency_contact_last_name IS NOT NULL AND emergency_contact_last_name != '')
        OR (emergency_contact_phone IS NOT NULL AND emergency_contact_phone != '')
        OR (emergency_contact_email IS NOT NULL AND emergency_contact_email != '')
    `);

    console.log(`✅ Migrated ${migrationResult.rowCount} employee emergency contacts`);

    // Step 4: Verify migration
    console.log('\n🔍 Step 4: Verifying migration...');
    const verificationQuery = await client.query(`
      SELECT
        e.email,
        e.first_name,
        e.last_name,
        ec.first_name as emergency_first_name,
        ec.last_name as emergency_last_name,
        ec.relationship,
        ec.phone as emergency_phone,
        ec.email as emergency_email
      FROM employees e
      LEFT JOIN emergency_contacts ec ON e.id = ec.employee_id
      WHERE ec.id IS NOT NULL
      ORDER BY e.email
    `);

    console.log(`📋 Emergency contacts successfully migrated for ${verificationQuery.rows.length} employees:`);
    verificationQuery.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. Employee: ${row.first_name} ${row.last_name} (${row.email})`);
      console.log(`      Emergency Contact: ${row.emergency_first_name} ${row.emergency_last_name}`);
      console.log(`      Relationship: ${row.relationship || 'Not specified'}`);
      console.log(`      Phone: ${row.emergency_phone || 'Not provided'}`);
      console.log(`      Email: ${row.emergency_email || 'Not provided'}`);
    });

    console.log('\n🎉 Emergency contact normalization Phase 3 setup completed successfully!');
    console.log('   ✅ Created normalized emergency_contacts table');
    console.log('   ✅ Created performance indexes');
    console.log('   ✅ Migrated existing emergency contact data');
    console.log('   ✅ Verified data integrity');
    console.log('\n🚨 IMPORTANT: Do not drop emergency contact columns from employees table yet!');
    console.log('   Backend code must be updated to use emergency_contacts table first.');

  } catch (error) {
    console.error('❌ Error during emergency contact normalization:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

normalizeEmergencyContacts();