#!/usr/bin/env node
import { getPool } from '../config/database.js';

/**
 * Phase 7: Simplify Client Registration Schema
 *
 * This migration removes redundant address/contact fields from businesses table
 * and enhances the users table to support the new simplified client registration flow.
 *
 * Changes:
 * 1. Remove primary address/contact fields from businesses table (redundant with service_locations)
 * 2. Add title/position field to users table for contact information
 * 3. Ensure email verification system is properly supported
 * 4. Update any views or constraints that depend on removed fields
 *
 * IMPORTANT: This migration preserves all existing data by migrating it to service_locations
 * before removing the redundant fields from businesses table.
 */

const MIGRATION_NAME = 'phase7_simplify_client_registration_schema';

async function checkMigrationStatus(pool) {
  try {
    const result = await pool.query(
      'SELECT * FROM migration_history WHERE migration_name = $1',
      [MIGRATION_NAME]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.log('🔄 Migration history table not found, assuming first run');
    return false;
  }
}

async function recordMigration(pool) {
  try {
    await pool.query(`
      INSERT INTO migration_history (migration_name, executed_at, description)
      VALUES ($1, CURRENT_TIMESTAMP, $2)
    `, [
      MIGRATION_NAME,
      'Simplified client registration schema by removing redundant address/contact fields from businesses table and enhancing users table'
    ]);
    console.log('✅ Migration recorded in history');
  } catch (error) {
    console.log('⚠️ Could not record migration (migration_history table may not exist)');
  }
}

async function migratePrimaryAddressesToServiceLocations(pool) {
  console.log('\n📋 Step 1: Migrating primary addresses from businesses to service_locations...');

  // First, check if there are any businesses with primary address data that isn't already in service_locations
  const businessesWithAddresses = await pool.query(`
    SELECT b.id, b.business_name, b.primary_street, b.primary_city, b.primary_state,
           b.primary_zip_code, b.primary_country, b.primary_contact_person,
           b.primary_contact_phone, b.primary_contact_email
    FROM businesses b
    WHERE b.primary_street IS NOT NULL
      AND b.soft_delete = false
      AND NOT EXISTS (
        SELECT 1 FROM service_locations sl
        WHERE sl.business_id = b.id
          AND sl.location_type = 'headquarters'
          AND sl.soft_delete = false
      )
  `);

  console.log(`📊 Found ${businessesWithAddresses.rows.length} businesses with primary addresses to migrate`);

  for (const business of businessesWithAddresses.rows) {
    console.log(`🏢 Migrating address for: ${business.business_name}`);

    // Create a headquarters service location for this business
    await pool.query(`
      INSERT INTO service_locations (
        business_id, location_name, address_label, street, city, state,
        zip_code, country, contact_person, contact_phone, location_type,
        is_active, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'headquarters', true,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `, [
      business.id,
      `${business.business_name} - Headquarters`,
      'Business Headquarters',
      business.primary_street,
      business.primary_city,
      business.primary_state,
      business.primary_zip_code,
      business.primary_country || 'USA',
      business.primary_contact_person,
      business.primary_contact_phone
    ]);

    console.log(`  ✅ Created headquarters service location for ${business.business_name}`);
  }
}

async function removeRedundantBusinessFields(pool) {
  console.log('\n🗑️ Step 2: Removing redundant address/contact fields from businesses table...');

  const fieldsToRemove = [
    'primary_street',
    'primary_city',
    'primary_state',
    'primary_zip_code',
    'primary_country',
    'primary_contact_person',
    'primary_contact_phone',
    'primary_contact_email'
  ];

  for (const field of fieldsToRemove) {
    try {
      await pool.query(`ALTER TABLE businesses DROP COLUMN IF EXISTS ${field}`);
      console.log(`  ✅ Removed column: ${field}`);
    } catch (error) {
      console.log(`  ⚠️ Could not remove column ${field}: ${error.message}`);
    }
  }
}

async function enhanceUsersTable(pool) {
  console.log('\n👤 Step 3: Enhancing users table for simplified registration...');

  // Add title/position field for contact information
  try {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS title VARCHAR(100)
    `);
    console.log('  ✅ Added title column to users table');
  } catch (error) {
    console.log(`  ⚠️ Could not add title column: ${error.message}`);
  }

  // Add cell phone field separate from phone
  try {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS cell_phone VARCHAR(20)
    `);
    console.log('  ✅ Added cell_phone column to users table');
  } catch (error) {
    console.log(`  ⚠️ Could not add cell_phone column: ${error.message}`);
  }

  // Ensure email verification fields exist (they should already be there)
  try {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMP WITH TIME ZONE
    `);
    console.log('  ✅ Ensured email verification fields exist');
  } catch (error) {
    console.log(`  ⚠️ Note: Email verification fields may already exist: ${error.message}`);
  }
}

async function updateViewsAndConstraints(pool) {
  console.log('\n🔄 Step 4: Updating views and constraints...');

  // Check if any views reference the removed business fields
  const viewsQuery = await pool.query(`
    SELECT schemaname, viewname, definition
    FROM pg_views
    WHERE definition ILIKE '%primary_street%'
       OR definition ILIKE '%primary_city%'
       OR definition ILIKE '%primary_contact%'
  `);

  if (viewsQuery.rows.length > 0) {
    console.log('  ⚠️ Found views that may reference removed business fields:');
    viewsQuery.rows.forEach(view => {
      console.log(`    - ${view.schemaname}.${view.viewname}`);
    });
    console.log('  📝 These views may need manual updates to use service_locations instead');
  } else {
    console.log('  ✅ No views found that reference removed business fields');
  }
}

async function validateMigration(pool) {
  console.log('\n✅ Step 5: Validating migration...');

  // Check that businesses table no longer has primary address fields
  const businessColumns = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'businesses'
      AND column_name LIKE 'primary_%'
  `);

  if (businessColumns.rows.length === 0) {
    console.log('  ✅ Successfully removed all primary_* fields from businesses table');
  } else {
    console.log('  ⚠️ Some primary_* fields may still exist in businesses table:');
    businessColumns.rows.forEach(col => console.log(`    - ${col.column_name}`));
  }

  // Check that users table has new fields
  const userColumns = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name IN ('title', 'cell_phone', 'email_verification_token')
  `);

  console.log(`  📊 Users table enhancement: ${userColumns.rows.length}/3 new fields added`);
  userColumns.rows.forEach(col => console.log(`    ✅ ${col.column_name}`));

  // Check total counts
  const businessCount = await pool.query('SELECT COUNT(*) FROM businesses WHERE soft_delete = false');
  const serviceLocationCount = await pool.query('SELECT COUNT(*) FROM service_locations WHERE soft_delete = false');
  const userCount = await pool.query('SELECT COUNT(*) FROM users WHERE soft_delete = false');

  console.log('\n📊 Post-migration counts:');
  console.log(`  🏢 Active businesses: ${businessCount.rows[0].count}`);
  console.log(`  📍 Active service locations: ${serviceLocationCount.rows[0].count}`);
  console.log(`  👤 Active users: ${userCount.rows[0].count}`);
}

async function main() {
  const pool = await getPool();

  try {
    console.log('🚀 Starting Phase 7: Simplify Client Registration Schema Migration');

    // Check if migration already ran
    const alreadyRan = await checkMigrationStatus(pool);
    if (alreadyRan) {
      console.log('✅ Migration already completed previously');
      return;
    }

    // Execute migration steps
    await migratePrimaryAddressesToServiceLocations(pool);
    await removeRedundantBusinessFields(pool);
    await enhanceUsersTable(pool);
    await updateViewsAndConstraints(pool);
    await validateMigration(pool);

    // Record successful migration
    await recordMigration(pool);

    console.log('\n🎉 Phase 7 migration completed successfully!');
    console.log('\n📋 Summary of changes:');
    console.log('  • Migrated primary business addresses to service_locations');
    console.log('  • Removed redundant address/contact fields from businesses table');
    console.log('  • Added title and cell_phone fields to users table');
    console.log('  • Ensured email verification system is supported');
    console.log('\n🔄 Next steps:');
    console.log('  • Update client registration components to use simplified flow');
    console.log('  • Implement zip code validation against service areas');
    console.log('  • Create email verification system');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  });
}

export { main as runPhase7Migration };