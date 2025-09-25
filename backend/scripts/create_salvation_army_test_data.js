#!/usr/bin/env node

/**
 * Create test data for The Salvation Army - San Diego
 * - 10 Service locations
 * - 12 Clients per location (120 total)
 */

import { query, closePool } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

const BUSINESS_ID = '3d77a0fc-8a6e-4cc5-95c4-bb26aab0c15d'; // The Salvation Army - San Diego

// San Diego area data
const serviceLocationData = [
  {
    name: 'Salvation Army Adult Rehabilitation Center',
    address: '1335 Main St',
    city: 'San Diego',
    state: 'CA',
    zipCode: '92113',
    phone: '(619) 234-6000',
    type: 'Adult Rehab Center'
  },
  {
    name: 'Salvation Army Harbor Light Center',
    address: '1150 7th Ave',
    city: 'San Diego',
    state: 'CA',
    zipCode: '92101',
    phone: '(619) 234-4900',
    type: 'Homeless Services'
  },
  {
    name: 'Salvation Army Red Shield Youth Center',
    address: '2102 Market St',
    city: 'San Diego',
    state: 'CA',
    zipCode: '92102',
    phone: '(619) 234-7821',
    type: 'Youth Center'
  },
  {
    name: 'Salvation Army Family Services',
    address: '4170 Balboa Ave',
    city: 'San Diego',
    state: 'CA',
    zipCode: '92117',
    phone: '(858) 483-8900',
    type: 'Family Services'
  },
  {
    name: 'Salvation Army East County Corps',
    address: '365 N 2nd Ave',
    city: 'El Cajon',
    state: 'CA',
    zipCode: '92021',
    phone: '(619) 440-4412',
    type: 'Community Center'
  },
  {
    name: 'Salvation Army North County Corps',
    address: '360 Vista Way',
    city: 'Oceanside',
    state: 'CA',
    zipCode: '92054',
    phone: '(760) 967-1336',
    type: 'Community Center'
  },
  {
    name: 'Salvation Army South Bay Corps',
    address: '336 3rd Ave',
    city: 'Chula Vista',
    state: 'CA',
    zipCode: '91910',
    phone: '(619) 420-1100',
    type: 'Community Center'
  },
  {
    name: 'Salvation Army Emergency Disaster Services',
    address: '825 15th St',
    city: 'San Diego',
    state: 'CA',
    zipCode: '92101',
    phone: '(619) 234-6000',
    type: 'Emergency Services'
  },
  {
    name: 'Salvation Army Food Distribution Center',
    address: '4891 Pacific Hwy',
    city: 'San Diego',
    state: 'CA',
    zipCode: '92110',
    phone: '(619) 291-3131',
    type: 'Food Services'
  },
  {
    name: 'Salvation Army Transitional Living Center',
    address: '3170 Armstrong St',
    city: 'San Diego',
    state: 'CA',
    zipCode: '92111',
    phone: '(858) 637-4297',
    type: 'Transitional Housing'
  }
];

// Common first names and last names for generating clients
const firstNames = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
  'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Christopher', 'Karen', 'Charles', 'Nancy', 'Daniel', 'Lisa',
  'Matthew', 'Betty', 'Anthony', 'Helen', 'Mark', 'Sandra', 'Donald', 'Donna',
  'Steven', 'Carol', 'Paul', 'Ruth', 'Andrew', 'Sharon', 'Joshua', 'Michelle'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
  'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young',
  'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores'
];

function generateEmail(firstName, lastName) {
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;
}

function generatePhone() {
  const areaCode = Math.random() < 0.7 ? '619' : '858'; // San Diego area codes
  const exchange = Math.floor(Math.random() * 900) + 100;
  const number = Math.floor(Math.random() * 9000) + 1000;
  return `(${areaCode}) ${exchange}-${number}`;
}

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

async function createServiceLocations() {
  console.log('🏢 Creating 10 service locations...');

  const createdLocations = [];

  for (const location of serviceLocationData) {
    const locationId = uuidv4();

    try {
      await query(`
        INSERT INTO service_locations (
          id, business_id, address_label, location_name, street, city, state, zip_code,
          contact_phone, location_type, is_active, is_headquarters, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        locationId,
        BUSINESS_ID,
        location.name, // address_label
        location.name, // location_name
        location.address,
        location.city,
        location.state,
        location.zipCode,
        location.phone,
        location.type,
        true, // is_active
        false, // is_headquarters
        new Date(),
        new Date()
      ]);

      createdLocations.push({
        id: locationId,
        name: location.name,
        type: location.type
      });

      console.log(`   ✅ Created: ${location.name}`);

    } catch (error) {
      console.error(`   ❌ Failed to create ${location.name}:`, error.message);
    }
  }

  return createdLocations;
}

async function createClientsForLocation(locationId, locationName, clientCount = 12) {
  console.log(`\n👥 Creating ${clientCount} clients for ${locationName}...`);

  const createdClients = [];

  for (let i = 0; i < clientCount; i++) {
    const firstName = getRandomElement(firstNames);
    const lastName = getRandomElement(lastNames);
    const email = generateEmail(firstName, lastName);
    const phone = generatePhone();
    const userId = uuidv4();

    try {
      // Create user record
      await query(`
        INSERT INTO users (
          id, business_id, email, first_name, last_name, phone,
          role, is_active, is_primary_contact, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        userId,
        BUSINESS_ID,
        email,
        firstName,
        lastName,
        phone,
        'client',
        true, // is_active
        false, // is_primary_contact
        new Date(),
        new Date()
      ]);

      // Create location contact record to associate client with location
      await query(`
        INSERT INTO location_contacts (
          id, service_location_id, user_id, is_primary_contact,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        uuidv4(),
        locationId,
        userId,
        false, // is_primary_contact
        new Date(),
        new Date()
      ]);

      createdClients.push({
        id: userId,
        name: `${firstName} ${lastName}`,
        email: email
      });

      console.log(`   ✅ Created client: ${firstName} ${lastName} (${email})`);

    } catch (error) {
      console.error(`   ❌ Failed to create client ${firstName} ${lastName}:`, error.message);
    }
  }

  return createdClients;
}

async function main() {
  try {
    console.log('🚀 Starting test data creation for The Salvation Army - San Diego');
    console.log(`📋 Business ID: ${BUSINESS_ID}\n`);

    // Create service locations
    const locations = await createServiceLocations();

    if (locations.length === 0) {
      console.log('❌ No locations were created. Exiting...');
      return;
    }

    console.log(`\n🎉 Successfully created ${locations.length} service locations!`);

    // Create clients for each location
    let totalClients = 0;

    for (const location of locations) {
      const clients = await createClientsForLocation(location.id, location.name, 12);
      totalClients += clients.length;
    }

    console.log('\n📊 Summary:');
    console.log(`   🏢 Service Locations: ${locations.length}`);
    console.log(`   👥 Total Clients: ${totalClients}`);
    console.log(`   📍 Average Clients per Location: ${(totalClients / locations.length).toFixed(1)}`);

    console.log('\n✅ Test data creation completed successfully!');
    console.log('\n🔍 You can now test the interface with:');
    console.log('   - 10 diverse Salvation Army service locations across San Diego');
    console.log('   - 120 total clients (12 per location)');
    console.log('   - Realistic names, emails, and phone numbers');
    console.log('   - Proper location-client associations');

  } catch (error) {
    console.error('❌ Error during test data creation:', error);
  } finally {
    await closePool();
  }
}

// Run the script
main();