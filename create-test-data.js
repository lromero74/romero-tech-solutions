#!/usr/bin/env node

// Change to backend directory for proper database connection
process.chdir('./backend');

import { query } from './config/database.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables from current directory (.env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config();

/**
 * Test Data Generation Script
 * Creates comprehensive test data for business deletion testing:
 * - 1 test business (Test Mega Corp)
 * - 10 service locations across different states
 * - 200 test users/contacts (20 per location)
 * - All properly linked relationships
 */

// Realistic US addresses for service locations
const serviceLocations = [
  {
    address_label: "Los Angeles Office",
    street: "1234 Sunset Boulevard",
    city: "Los Angeles",
    state: "CA",
    zip_code: "90028",
    location_type: "office"
  },
  {
    address_label: "New York Branch",
    street: "567 Broadway Avenue",
    city: "New York",
    state: "NY",
    zip_code: "10012",
    location_type: "branch"
  },
  {
    address_label: "Chicago Regional Center",
    street: "890 Michigan Avenue",
    city: "Chicago",
    state: "IL",
    zip_code: "60611",
    location_type: "regional_center"
  },
  {
    address_label: "Houston Service Hub",
    street: "432 Texas Street",
    city: "Houston",
    state: "TX",
    zip_code: "77002",
    location_type: "service_hub"
  },
  {
    address_label: "Phoenix Operations",
    street: "765 Desert Way",
    city: "Phoenix",
    state: "AZ",
    zip_code: "85004",
    location_type: "operations"
  },
  {
    address_label: "Miami Support Center",
    street: "321 Ocean Drive",
    city: "Miami",
    state: "FL",
    zip_code: "33139",
    location_type: "support_center"
  },
  {
    address_label: "Seattle Technology Hub",
    street: "987 Pine Street",
    city: "Seattle",
    state: "WA",
    zip_code: "98101",
    location_type: "tech_hub"
  },
  {
    address_label: "Denver Field Office",
    street: "654 Mountain View Drive",
    city: "Denver",
    state: "CO",
    zip_code: "80202",
    location_type: "field_office"
  },
  {
    address_label: "Atlanta Distribution Center",
    street: "246 Peachtree Street",
    city: "Atlanta",
    state: "GA",
    zip_code: "30309",
    location_type: "distribution"
  },
  {
    address_label: "Portland Innovation Lab",
    street: "135 Burnside Avenue",
    city: "Portland",
    state: "OR",
    zip_code: "97209",
    location_type: "innovation_lab"
  }
];

// Common first and last names for realistic test contacts
const firstNames = [
  "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda",
  "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
  "Thomas", "Sarah", "Christopher", "Karen", "Charles", "Nancy", "Daniel", "Lisa",
  "Matthew", "Betty", "Anthony", "Helen", "Mark", "Sandra", "Donald", "Donna",
  "Steven", "Carol", "Paul", "Ruth", "Andrew", "Sharon", "Joshua", "Michelle",
  "Kenneth", "Laura", "Kevin", "Sarah", "Brian", "Kimberly", "George", "Deborah",
  "Edward", "Dorothy", "Ronald", "Amy"
];

const lastNames = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
  "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White",
  "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young",
  "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
  "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
  "Carter", "Roberts"
];

function generateRandomName() {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  return { firstName, lastName };
}

function generatePhoneNumber() {
  const area = Math.floor(Math.random() * 900) + 100;
  const exchange = Math.floor(Math.random() * 900) + 100;
  const number = Math.floor(Math.random() * 9000) + 1000;
  return `(${area}) ${exchange}-${number}`;
}

async function createTestData() {
  try {
    console.log('🚀 Starting test data creation...');
    console.log('');

    // Start transaction
    await query('BEGIN');

    // 1. Create Test Mega Corp business
    console.log('📊 Creating Test Mega Corp business...');
    const businessResult = await query(`
      INSERT INTO businesses (
        business_name,
        is_active,
        logo_position_x,
        logo_position_y,
        logo_scale
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, business_name, created_at
    `, [
      'Test Mega Corp',
      true,
      50,
      50,
      100
    ]);

    const business = businessResult.rows[0];
    console.log(`✅ Business created: ${business.business_name} (ID: ${business.id})`);

    // 2. Create authorized domain for the business
    await query(`
      INSERT INTO business_authorized_domains (business_id, domain, description, is_active)
      VALUES ($1, $2, $3, $4)
    `, [business.id, 'testmegacorp.com', 'Test domain for Test Mega Corp', true]);

    // 3. Create service locations
    console.log('🏢 Creating 10 service locations...');
    const createdLocations = [];

    for (let i = 0; i < serviceLocations.length; i++) {
      const location = serviceLocations[i];
      const locationResult = await query(`
        INSERT INTO service_locations (
          business_id,
          address_label,
          location_name,
          location_type,
          street,
          city,
          state,
          zip_code,
          country,
          is_headquarters,
          is_active,
          soft_delete
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, address_label, city, state
      `, [
        business.id,
        location.address_label,
        `${business.business_name} - ${location.address_label}`,
        location.location_type,
        location.street,
        location.city,
        location.state,
        location.zip_code,
        'USA',
        i === 0, // First location is headquarters
        true,
        false
      ]);

      const createdLocation = locationResult.rows[0];
      createdLocations.push(createdLocation);
      console.log(`  ✅ ${createdLocation.address_label} (${createdLocation.city}, ${createdLocation.state})`);
    }

    // 4. Create 200 test users (20 per location)
    console.log('👥 Creating 200 test users/contacts...');
    let userCount = 0;
    const createdUsers = [];

    for (let locationIndex = 0; locationIndex < createdLocations.length; locationIndex++) {
      const location = createdLocations[locationIndex];
      console.log(`  Creating 20 contacts for ${location.address_label}...`);

      for (let userIndex = 0; userIndex < 20; userIndex++) {
        userCount++;
        const { firstName, lastName } = generateRandomName();
        const email = `testcontact${String(userCount).padStart(3, '0')}@testmegacorp.com`;
        const phone = generatePhoneNumber();

        // Create user
        const userResult = await query(`
          INSERT INTO users (
            email,
            email_verified,
            role,
            first_name,
            last_name,
            phone,
            business_id,
            is_active,
            soft_delete,
            password_changed_at,
            photo_position_x,
            photo_position_y,
            photo_scale,
            force_password_change
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING id, email, first_name, last_name
        `, [
          email,
          false,
          'client',
          firstName,
          lastName,
          phone,
          business.id,
          true,
          false,
          new Date(),
          50.00,
          50.00,
          100.00,
          false
        ]);

        const user = userResult.rows[0];
        createdUsers.push({ user, location });

        // Create location contact link
        await query(`
          INSERT INTO location_contacts (
            service_location_id,
            user_id,
            contact_role,
            is_primary_contact
          )
          VALUES ($1, $2, $3, $4)
        `, [
          location.id,
          user.id,
          'contact',
          userIndex === 0 // First contact per location is primary
        ]);
      }

      console.log(`    ✅ 20 contacts created for ${location.address_label}`);
    }

    // Commit transaction
    await query('COMMIT');

    console.log('');
    console.log('🎉 Test data creation completed successfully!');
    console.log('');
    console.log('📋 SUMMARY:');
    console.log(`  • Business: ${business.business_name} (ID: ${business.id})`);
    console.log(`  • Service Locations: ${createdLocations.length}`);
    console.log(`  • Test Users/Contacts: ${createdUsers.length}`);
    console.log(`  • Location-Contact Links: ${createdUsers.length}`);
    console.log('');
    console.log('🔍 VERIFICATION QUERIES:');
    console.log('  Businesses: SELECT * FROM businesses WHERE business_name = \'Test Mega Corp\';');
    console.log('  Locations: SELECT * FROM service_locations WHERE business_id = \'' + business.id + '\';');
    console.log('  Users: SELECT * FROM users WHERE business_id = \'' + business.id + '\' LIMIT 10;');
    console.log('  Contacts: SELECT * FROM location_contacts lc JOIN users u ON lc.user_id = u.id WHERE u.business_id = \'' + business.id + '\' LIMIT 10;');
    console.log('');
    console.log('✅ All test data is ready for business deletion testing!');

  } catch (error) {
    // Rollback transaction on error
    await query('ROLLBACK');
    console.error('❌ Error creating test data:', error);
    throw error;
  } finally {
    // Close database connection
    process.exit(0);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  createTestData().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

export { createTestData };