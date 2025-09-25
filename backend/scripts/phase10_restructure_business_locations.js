import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function restructureBusinessLocations() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    await client.connect();
    console.log('🔄 Restructuring business location tables for proper normalization (Phase 10)...');
    console.log('   Creating: businesses -> service_locations -> location_contacts structure');

    // Begin transaction
    await client.query('BEGIN');

    // Step 1: Backup existing data
    console.log('\n📦 Step 1: Backing up existing data...');

    const existingBusinesses = await client.query(`
      SELECT id, business_name, business_street, business_city, business_state,
             business_zip_code, business_country, logo_url, is_active, created_at, updated_at
      FROM businesses
    `);

    const existingServiceAddresses = await client.query(`
      SELECT * FROM service_addresses
    `);

    const existingUsers = await client.query(`
      SELECT id, business_id, email, first_name, last_name, role
      FROM users
      WHERE business_id IS NOT NULL
    `);

    console.log(`✅ Backed up ${existingBusinesses.rows.length} businesses`);
    console.log(`✅ Backed up ${existingServiceAddresses.rows.length} service addresses`);
    console.log(`✅ Backed up ${existingUsers.rows.length} users with business associations`);

    // Step 2: Enhance service_addresses table to become service_locations
    console.log('\n🏗️  Step 2: Transforming service_addresses to service_locations...');

    // Add new columns to service_addresses
    await client.query(`
      ALTER TABLE service_addresses
      ADD COLUMN IF NOT EXISTS location_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS location_type VARCHAR(50) DEFAULT 'branch',
      ADD COLUMN IF NOT EXISTS is_headquarters BOOLEAN DEFAULT false
    `);

    // Update existing records with better structure
    await client.query(`
      UPDATE service_addresses
      SET
        location_name = COALESCE(address_label, 'Service Location'),
        location_type = CASE
          WHEN address_label ILIKE '%main%' OR address_label ILIKE '%headquarters%' OR address_label ILIKE '%hq%' THEN 'headquarters'
          WHEN address_label ILIKE '%warehouse%' THEN 'warehouse'
          WHEN address_label ILIKE '%home%' THEN 'remote'
          ELSE 'branch'
        END,
        is_headquarters = (address_label ILIKE '%main%' OR address_label ILIKE '%headquarters%' OR address_label ILIKE '%hq%')
    `);

    // Rename the table
    await client.query('ALTER TABLE service_addresses RENAME TO service_locations');

    // Update indexes
    await client.query('DROP INDEX IF EXISTS idx_service_addresses_business_id');
    await client.query('DROP INDEX IF EXISTS idx_service_addresses_active');
    await client.query('DROP INDEX IF EXISTS idx_service_addresses_label');

    await client.query('CREATE INDEX IF NOT EXISTS idx_service_locations_business_id ON service_locations(business_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_service_locations_active ON service_locations(business_id, is_active)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_service_locations_type ON service_locations(business_id, location_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_service_locations_headquarters ON service_locations(business_id, is_headquarters)');

    console.log('✅ Enhanced service_addresses → service_locations');

    // Step 3: Create location_contacts junction table
    console.log('\n🔗 Step 3: Creating location_contacts junction table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS location_contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        service_location_id UUID NOT NULL REFERENCES service_locations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        contact_role VARCHAR(50) DEFAULT 'contact',
        is_primary_contact BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

        -- Ensure unique user per location (but users can be at multiple locations)
        UNIQUE(service_location_id, user_id)
      )
    `);

    // Create indexes for location_contacts
    await client.query('CREATE INDEX IF NOT EXISTS idx_location_contacts_location ON location_contacts(service_location_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_location_contacts_user ON location_contacts(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_location_contacts_primary ON location_contacts(service_location_id, is_primary_contact)');

    console.log('✅ Created location_contacts junction table');

    // Step 4: Migrate business headquarters addresses to service_locations
    console.log('\n🏢 Step 4: Migrating business headquarters addresses...');

    for (const business of existingBusinesses.rows) {
      // Check if business already has a headquarters location
      const existingHQ = await client.query(`
        SELECT id FROM service_locations
        WHERE business_id = $1 AND is_headquarters = true
      `, [business.id]);

      if (existingHQ.rows.length === 0 && business.business_street) {
        // Create headquarters location from business address
        await client.query(`
          INSERT INTO service_locations (
            business_id, location_name, location_type, is_headquarters,
            street, city, state, zip_code, country,
            contact_person, contact_phone, is_active, created_at
          ) VALUES (
            $1, $2, 'headquarters', true,
            $3, $4, $5, $6, $7,
            $8, $9, $10, $11
          )
        `, [
          business.id,
          `${business.business_name} - Headquarters`,
          business.business_street,
          business.business_city,
          business.business_state,
          business.business_zip_code,
          business.business_country || 'USA',
          null, // contact_person
          null, // contact_phone
          business.is_active,
          business.created_at
        ]);

        console.log(`  ✅ Created headquarters for ${business.business_name}`);
      }
    }

    // Step 5: Migrate user associations to location_contacts
    console.log('\n👥 Step 5: Migrating user associations to location_contacts...');

    for (const user of existingUsers.rows) {
      // Find the headquarters location for this business
      const hqLocation = await client.query(`
        SELECT id FROM service_locations
        WHERE business_id = $1 AND is_headquarters = true
        LIMIT 1
      `, [user.business_id]);

      if (hqLocation.rows.length > 0) {
        // Determine contact role based on user role and data
        let contactRole = 'contact';
        let isPrimary = false;

        if (user.role === 'admin') {
          contactRole = 'admin';
          isPrimary = true;
        } else if (user.role === 'client') {
          contactRole = 'client';
        }

        // Insert into location_contacts
        await client.query(`
          INSERT INTO location_contacts (
            service_location_id, user_id, contact_role, is_primary_contact
          ) VALUES ($1, $2, $3, $4)
          ON CONFLICT (service_location_id, user_id) DO NOTHING
        `, [hqLocation.rows[0].id, user.id, contactRole, isPrimary]);

        console.log(`  ✅ Associated ${user.email} with location as ${contactRole}`);
      }
    }

    // Step 6: Update view to remove business address dependencies
    console.log('\n🔧 Step 6: Updating view to remove business address dependencies...');

    // Drop and recreate the view without business address fields
    await client.query('DROP VIEW IF EXISTS v_client_users_with_business CASCADE');

    await client.query(`
      CREATE VIEW v_client_users_with_business AS
      SELECT
        u.id AS user_id,
        u.cognito_user_id,
        u.email,
        u.email_verified,
        u.first_name,
        u.last_name,
        u.phone,
        u.is_primary_contact,
        u.created_at AS user_created_at,
        u.updated_at AS user_updated_at,
        u.last_login,
        u.is_active,
        b.id AS business_id,
        b.business_name,
        b.logo_url,
        b.created_at AS business_created_at,
        b.updated_at AS business_updated_at
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      WHERE u.role = 'client'
    `);

    console.log('✅ Updated v_client_users_with_business view');

    // Step 7: Remove address fields from businesses table
    console.log('\n🧹 Step 7: Cleaning up businesses table...');

    await client.query(`
      ALTER TABLE businesses
      DROP COLUMN IF EXISTS business_street,
      DROP COLUMN IF EXISTS business_city,
      DROP COLUMN IF EXISTS business_state,
      DROP COLUMN IF EXISTS business_zip_code,
      DROP COLUMN IF EXISTS business_country,
      DROP COLUMN IF EXISTS domain_email
    `);

    console.log('✅ Removed address and legacy fields from businesses table');

    // Step 8: Update function and trigger names
    console.log('\n🔧 Step 8: Updating functions and triggers...');

    await client.query(`
      DROP TRIGGER IF EXISTS update_service_addresses_updated_at ON service_locations;
      DROP FUNCTION IF EXISTS update_service_addresses_updated_at();
    `);

    await client.query(`
      CREATE OR REPLACE FUNCTION update_service_locations_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await client.query(`
      CREATE TRIGGER update_service_locations_updated_at
          BEFORE UPDATE ON service_locations
          FOR EACH ROW
          EXECUTE FUNCTION update_service_locations_updated_at();
    `);

    // Create trigger for location_contacts
    await client.query(`
      CREATE OR REPLACE FUNCTION update_location_contacts_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await client.query(`
      CREATE TRIGGER update_location_contacts_updated_at
          BEFORE UPDATE ON location_contacts
          FOR EACH ROW
          EXECUTE FUNCTION update_location_contacts_updated_at();
    `);

    console.log('✅ Updated functions and triggers');

    // Step 9: Create helpful views
    console.log('\n👁️  Step 9: Creating helpful views...');

    await client.query(`
      CREATE OR REPLACE VIEW v_business_locations_summary AS
      SELECT
        b.id as business_id,
        b.business_name,
        COUNT(sl.id) as total_locations,
        COUNT(CASE WHEN sl.is_headquarters = true THEN 1 END) as headquarters_count,
        COUNT(CASE WHEN sl.location_type = 'branch' THEN 1 END) as branch_count,
        COUNT(CASE WHEN sl.location_type = 'warehouse' THEN 1 END) as warehouse_count,
        COUNT(CASE WHEN sl.location_type = 'remote' THEN 1 END) as remote_count
      FROM businesses b
      LEFT JOIN service_locations sl ON b.id = sl.business_id AND sl.is_active = true
      WHERE b.is_active = true
      GROUP BY b.id, b.business_name
      ORDER BY b.business_name
    `);

    await client.query(`
      CREATE OR REPLACE VIEW v_location_contacts_detail AS
      SELECT
        sl.id as location_id,
        sl.location_name,
        sl.location_type,
        sl.is_headquarters,
        b.business_name,
        u.id as user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.role as user_role,
        lc.contact_role,
        lc.is_primary_contact,
        lc.notes as contact_notes
      FROM service_locations sl
      JOIN businesses b ON sl.business_id = b.id
      LEFT JOIN location_contacts lc ON sl.id = lc.service_location_id
      LEFT JOIN users u ON lc.user_id = u.id
      WHERE sl.is_active = true AND b.is_active = true
      ORDER BY b.business_name, sl.location_name, lc.is_primary_contact DESC
    `);

    console.log('✅ Created helpful views');

    // Commit transaction
    await client.query('COMMIT');

    // Step 10: Verify the results
    console.log('\n✅ Step 10: Verifying results...');

    const businessCount = await client.query('SELECT COUNT(*) as count FROM businesses');
    const locationCount = await client.query('SELECT COUNT(*) as count FROM service_locations');
    const contactCount = await client.query('SELECT COUNT(*) as count FROM location_contacts');

    console.log(`📊 Final counts:`);
    console.log(`   • Businesses: ${businessCount.rows[0].count}`);
    console.log(`   • Service Locations: ${locationCount.rows[0].count}`);
    console.log(`   • Location Contacts: ${contactCount.rows[0].count}`);

    // Test the new structure
    const sampleData = await client.query(`
      SELECT * FROM v_business_locations_summary LIMIT 3
    `);

    console.log('\n📋 Sample business locations summary:');
    console.table(sampleData.rows);

    console.log('\n🎉 Phase 10 completed successfully!');
    console.log('📋 Summary of changes:');
    console.log('   ✅ service_addresses → service_locations (enhanced)');
    console.log('   ✅ Created location_contacts junction table');
    console.log('   ✅ Migrated business addresses to headquarters locations');
    console.log('   ✅ Associated users with specific locations');
    console.log('   ✅ Removed duplicate address fields from businesses');
    console.log('   ✅ Created helpful views for querying');
    console.log('   ✅ Proper normalization: Business → Location → Contacts');

  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('❌ Error during Phase 10:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the script
restructureBusinessLocations().catch(console.error);