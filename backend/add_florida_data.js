#!/usr/bin/env node

import { getPool } from './config/database.js';

const floridaData = {
  state: {
    state_code: 'FL',
    state_name: 'Florida'
  },
  counties: [
    { county_name: 'Miami-Dade', fips_code: '12086' },
    { county_name: 'Broward', fips_code: '12011' },
    { county_name: 'Palm Beach', fips_code: '12099' },
    { county_name: 'Hillsborough', fips_code: '12057' },
    { county_name: 'Orange', fips_code: '12095' },
    { county_name: 'Pinellas', fips_code: '12103' },
    { county_name: 'Duval', fips_code: '12031' },
    { county_name: 'Lee', fips_code: '12071' },
    { county_name: 'Polk', fips_code: '12105' },
    { county_name: 'Volusia', fips_code: '12127' },
    { county_name: 'Brevard', fips_code: '12009' },
    { county_name: 'Seminole', fips_code: '12117' },
    { county_name: 'Sarasota', fips_code: '12115' },
    { county_name: 'Pasco', fips_code: '12101' },
    { county_name: 'Manatee', fips_code: '12081' }
  ],
  cities: {
    'Miami-Dade': [
      'Miami', 'Hialeah', 'Miami Beach', 'Homestead', 'Coral Gables',
      'Aventura', 'Doral', 'Key Biscayne', 'Palmetto Bay', 'Pinecrest'
    ],
    'Broward': [
      'Fort Lauderdale', 'Hollywood', 'Pembroke Pines', 'Coral Springs', 'Miramar',
      'Davie', 'Plantation', 'Sunrise', 'Pompano Beach', 'Lauderhill'
    ],
    'Palm Beach': [
      'West Palm Beach', 'Boca Raton', 'Delray Beach', 'Boynton Beach', 'Lake Worth',
      'Palm Beach Gardens', 'Wellington', 'Jupiter', 'Royal Palm Beach', 'Greenacres'
    ],
    'Hillsborough': [
      'Tampa', 'Brandon', 'Riverview', 'Carrollwood', 'Town n Country',
      'Valrico', 'Seffner', 'Plant City', 'Temple Terrace', 'Bloomingdale'
    ],
    'Orange': [
      'Orlando', 'Winter Park', 'Apopka', 'Ocoee', 'Winter Garden',
      'Windermere', 'Maitland', 'Eatonville', 'Belle Isle', 'Edgewood'
    ],
    'Pinellas': [
      'St. Petersburg', 'Clearwater', 'Largo', 'Pinellas Park', 'Dunedin',
      'Safety Harbor', 'Seminole', 'Kenneth City', 'Indian Shores', 'Madeira Beach'
    ],
    'Duval': [
      'Jacksonville', 'Atlantic Beach', 'Jacksonville Beach', 'Neptune Beach', 'Baldwin',
      'Fernandina Beach'
    ],
    'Lee': [
      'Fort Myers', 'Cape Coral', 'Bonita Springs', 'Estero', 'Sanibel',
      'Fort Myers Beach', 'Lehigh Acres'
    ],
    'Polk': [
      'Lakeland', 'Winter Haven', 'Bartow', 'Auburndale', 'Haines City',
      'Lake Wales', 'Mulberry', 'Eagle Lake', 'Fort Meade', 'Davenport'
    ],
    'Volusia': [
      'Daytona Beach', 'Deltona', 'Ormond Beach', 'DeLand', 'New Smyrna Beach',
      'Port Orange', 'Holly Hill', 'Edgewater', 'Oak Hill', 'Ponce Inlet'
    ],
    'Brevard': [
      'Melbourne', 'Palm Bay', 'Titusville', 'Cocoa', 'Rockledge',
      'Satellite Beach', 'Cocoa Beach', 'Merritt Island', 'Viera', 'West Melbourne'
    ],
    'Seminole': [
      'Sanford', 'Altamonte Springs', 'Casselberry', 'Longwood', 'Lake Mary',
      'Winter Springs', 'Oviedo'
    ],
    'Sarasota': [
      'Sarasota', 'Venice', 'North Port', 'Osprey', 'Nokomis',
      'Englewood', 'Laurel'
    ],
    'Pasco': [
      'New Port Richey', 'Port Richey', 'Zephyrhills', 'Dade City', 'Holiday',
      'Hudson', 'Land O Lakes', 'Wesley Chapel'
    ],
    'Manatee': [
      'Bradenton', 'Palmetto', 'Anna Maria', 'Holmes Beach', 'Bradenton Beach',
      'Longboat Key', 'Ellenton'
    ]
  },
  areaCodes: {
    'Miami-Dade': ['305', '786'],
    'Broward': ['954', '754'],
    'Palm Beach': ['561'],
    'Hillsborough': ['813'],
    'Orange': ['407', '321'],
    'Pinellas': ['727'],
    'Duval': ['904'],
    'Lee': ['239'],
    'Polk': ['863'],
    'Volusia': ['386'],
    'Brevard': ['321'],
    'Seminole': ['407'],
    'Sarasota': ['941'],
    'Pasco': ['727'],
    'Manatee': ['941']
  },
  sampleZipCodes: {
    'Miami': ['33101', '33102', '33109', '33111', '33116', '33125', '33126', '33127', '33128', '33129'],
    'Fort Lauderdale': ['33301', '33302', '33303', '33304', '33305', '33306', '33307', '33308', '33309', '33311'],
    'Tampa': ['33601', '33602', '33603', '33604', '33605', '33606', '33607', '33608', '33609', '33610'],
    'Orlando': ['32801', '32802', '32803', '32804', '32805', '32806', '32807', '32808', '32809', '32810'],
    'Jacksonville': ['32201', '32202', '32203', '32204', '32205', '32206', '32207', '32208', '32209', '32210'],
    'St. Petersburg': ['33701', '33702', '33703', '33704', '33705', '33706', '33707', '33708', '33709', '33710'],
    'Hialeah': ['33010', '33012', '33013', '33014', '33015', '33016', '33017', '33018'],
    'West Palm Beach': ['33401', '33402', '33403', '33404', '33405', '33406', '33407', '33408', '33409', '33410'],
    'Fort Myers': ['33901', '33902', '33903', '33904', '33905', '33906', '33907', '33908', '33912', '33913'],
    'Cape Coral': ['33904', '33909', '33914', '33915', '33990', '33991', '33993']
  }
};

async function addFloridaData() {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    console.log('🏖️ Starting Florida data import...');
    await client.query('BEGIN');

    // 1. Add Florida state
    console.log('📍 Adding Florida state...');
    const stateResult = await client.query(
      `INSERT INTO t_states (state_code, state_name)
       VALUES ($1, $2)
       ON CONFLICT (state_code) DO UPDATE SET state_name = EXCLUDED.state_name
       RETURNING id`,
      [floridaData.state.state_code, floridaData.state.state_name]
    );
    const stateId = stateResult.rows[0].id;
    console.log(`✅ Florida state added with ID: ${stateId}`);

    // 2. Add counties
    console.log('🏘️ Adding counties...');
    const countyMap = new Map();
    for (const county of floridaData.counties) {
      const countyResult = await client.query(
        `INSERT INTO t_counties (state_id, county_name, fips_code)
         VALUES ($1, $2, $3)
         ON CONFLICT (fips_code) DO UPDATE SET county_name = EXCLUDED.county_name
         RETURNING id`,
        [stateId, county.county_name, county.fips_code]
      );
      countyMap.set(county.county_name, countyResult.rows[0].id);
      console.log(`  ✅ ${county.county_name} County added`);
    }

    // 3. Add cities
    console.log('🏙️ Adding cities...');
    const cityMap = new Map();
    for (const [countyName, cities] of Object.entries(floridaData.cities)) {
      const countyId = countyMap.get(countyName);
      if (countyId) {
        for (const cityName of cities) {
          try {
            const cityResult = await client.query(
              `INSERT INTO t_cities (county_id, city_name)
               VALUES ($1, $2)
               ON CONFLICT (county_id, city_name) DO UPDATE SET city_name = EXCLUDED.city_name
               RETURNING id`,
              [countyId, cityName]
            );
            cityMap.set(cityName, cityResult.rows[0].id);
            console.log(`    ✅ ${cityName} added to ${countyName} County`);
          } catch (error) {
            console.log(`    ⚠️ ${cityName} already exists in ${countyName} County`);
          }
        }
      }
    }

    // 4. Add ZIP codes
    console.log('📮 Adding ZIP codes...');
    for (const [cityName, zipCodes] of Object.entries(floridaData.sampleZipCodes)) {
      const cityId = cityMap.get(cityName);
      if (cityId) {
        for (const zipCode of zipCodes) {
          try {
            await client.query(
              `INSERT INTO t_zipcodes (city_id, zipcode)
               VALUES ($1, $2)
               ON CONFLICT (zipcode) DO NOTHING`,
              [cityId, zipCode]
            );
            console.log(`      ✅ ZIP ${zipCode} added to ${cityName}`);
          } catch (error) {
            console.log(`      ⚠️ ZIP ${zipCode} already exists`);
          }
        }
      }
    }

    // 5. Add area codes
    console.log('☎️ Adding area codes...');
    for (const [countyName, areaCodes] of Object.entries(floridaData.areaCodes)) {
      const countyId = countyMap.get(countyName);
      if (countyId) {
        for (const areaCode of areaCodes) {
          try {
            await client.query(
              `INSERT INTO t_area_codes (county_id, area_code)
               VALUES ($1, $2)
               ON CONFLICT (area_code, county_id) DO NOTHING`,
              [countyId, areaCode]
            );
            console.log(`      ✅ Area code ${areaCode} added to ${countyName} County`);
          } catch (error) {
            console.log(`      ⚠️ Area code ${areaCode} already exists in ${countyName} County`);
          }
        }
      }
    }

    await client.query('COMMIT');
    console.log('🎉 Florida data import completed successfully!');

    // Summary
    console.log('\n📊 Summary:');
    console.log(`State: ${floridaData.state.state_name} (${floridaData.state.state_code})`);
    console.log(`Counties: ${floridaData.counties.length}`);
    console.log(`Cities: ${Object.values(floridaData.cities).flat().length}`);
    console.log(`Sample ZIP codes: ${Object.values(floridaData.sampleZipCodes).flat().length}`);
    console.log(`Area codes: ${Object.values(floridaData.areaCodes).flat().length}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error importing Florida data:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the import
addFloridaData().then(() => {
  console.log('✅ Florida data import process completed');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Florida data import failed:', error);
  process.exit(1);
});