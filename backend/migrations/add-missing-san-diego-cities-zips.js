/**
 * Migration: Add missing San Diego County cities and ZIP codes
 *
 * This script:
 * 1. Adds missing unincorporated communities as cities
 * 2. Adds missing ZIP codes for San Diego County
 * 3. Fixes misclassified ZIP codes
 */

import { getPool } from '../config/database.js';

async function addMissingSanDiegoCitiesAndZips() {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Starting San Diego County cities and ZIP codes migration...');

    const sanDiegoCountyId = 1; // San Diego County ID

    // Step 1: Add missing unincorporated communities (as cities in database for ZIP code mapping)
    const newCities = [
      { name: 'Alpine', type: 'Unincorporated', is_incorporated: false },
      { name: 'Boulevard', type: 'Unincorporated', is_incorporated: false },
      { name: 'Campo', type: 'Unincorporated', is_incorporated: false },
      { name: 'Descanso', type: 'Unincorporated', is_incorporated: false },
      { name: 'Dulzura', type: 'Unincorporated', is_incorporated: false },
      { name: 'Jamul', type: 'Unincorporated', is_incorporated: false },
      { name: 'Pine Valley', type: 'Unincorporated', is_incorporated: false },
      { name: 'Potrero', type: 'Unincorporated', is_incorporated: false },
      { name: 'Spring Valley', type: 'Unincorporated', is_incorporated: false },
      { name: 'Tecate', type: 'Unincorporated', is_incorporated: false },
      { name: 'Bonsall', type: 'Unincorporated', is_incorporated: false },
      { name: 'Borrego Springs', type: 'Unincorporated', is_incorporated: false },
      { name: 'Cardiff By The Sea', type: 'Unincorporated', is_incorporated: false },
      { name: 'Fallbrook', type: 'Unincorporated', is_incorporated: false },
      { name: 'Julian', type: 'Unincorporated', is_incorporated: false },
      { name: 'La Jolla', type: 'Unincorporated', is_incorporated: false },
      { name: 'Lakeside', type: 'Unincorporated', is_incorporated: false },
      { name: 'Pala', type: 'Unincorporated', is_incorporated: false },
      { name: 'Pauma Valley', type: 'Unincorporated', is_incorporated: false },
      { name: 'Ramona', type: 'Unincorporated', is_incorporated: false },
      { name: 'Santa Ysabel', type: 'Unincorporated', is_incorporated: false },
      { name: 'Valley Center', type: 'Unincorporated', is_incorporated: false }
    ];

    console.log(`Adding ${newCities.length} missing unincorporated communities...`);

    const cityIdMap = {};

    for (const city of newCities) {
      // Check if city already exists
      const existingCity = await client.query(
        'SELECT id FROM t_cities WHERE city_name = $1 AND county_id = $2',
        [city.name, sanDiegoCountyId]
      );

      if (existingCity.rows.length === 0) {
        const result = await client.query(
          `INSERT INTO t_cities (county_id, city_name, city_type, is_incorporated, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           RETURNING id`,
          [sanDiegoCountyId, city.name, city.type, city.is_incorporated]
        );
        cityIdMap[city.name] = result.rows[0].id;
        console.log(`  ✓ Added city: ${city.name} (ID: ${result.rows[0].id})`);
      } else {
        cityIdMap[city.name] = existingCity.rows[0].id;
        console.log(`  - City already exists: ${city.name} (ID: ${existingCity.rows[0].id})`);
      }
    }

    // Get existing city IDs for incorporated cities
    const getExistingCityId = async (cityName) => {
      const result = await client.query(
        'SELECT id FROM t_cities WHERE city_name = $1 AND county_id = $2',
        [cityName, sanDiegoCountyId]
      );
      return result.rows[0]?.id;
    };

    // Build complete city ID map
    const incorporatedCities = [
      'Carlsbad', 'Chula Vista', 'Coronado', 'Del Mar', 'El Cajon',
      'Encinitas', 'Escondido', 'Imperial Beach', 'La Mesa', 'Lemon Grove',
      'National City', 'Oceanside', 'Poway', 'San Diego', 'San Marcos',
      'Santee', 'Solana Beach', 'Vista', 'Bonita'
    ];

    for (const cityName of incorporatedCities) {
      const id = await getExistingCityId(cityName);
      if (id) {
        cityIdMap[cityName] = id;
      }
    }

    console.log('\nAdding missing ZIP codes...');

    // Step 2: Add missing ZIP codes with correct city mappings
    const newZipCodes = [
      // Alpine
      { zip: '91901', city: 'Alpine', type: 'Standard', primary: true },
      { zip: '91903', city: 'Alpine', type: 'PO Box', primary: false },

      // Boulevard
      { zip: '91905', city: 'Boulevard', type: 'Standard', primary: true },

      // Campo
      { zip: '91906', city: 'Campo', type: 'Standard', primary: true },

      // Descanso
      { zip: '91916', city: 'Descanso', type: 'Standard', primary: true },

      // Dulzura
      { zip: '91917', city: 'Dulzura', type: 'Standard', primary: true },

      // Imperial Beach (already exists as city)
      { zip: '91932', city: 'Imperial Beach', type: 'Standard', primary: true },

      // Jacumba (part of Boulevard area - use Boulevard)
      { zip: '91934', city: 'Boulevard', type: 'Standard', primary: false },

      // Jamul
      { zip: '91935', city: 'Jamul', type: 'Standard', primary: true },

      // La Mesa (already exists as city)
      { zip: '91941', city: 'La Mesa', type: 'Standard', primary: true },
      { zip: '91942', city: 'La Mesa', type: 'Standard', primary: true },

      // Lemon Grove (already exists as city)
      { zip: '91945', city: 'Lemon Grove', type: 'Standard', primary: true },

      // National City (already exists as city)
      { zip: '91950', city: 'National City', type: 'Standard', primary: true },

      // Pine Valley
      { zip: '91962', city: 'Pine Valley', type: 'Standard', primary: true },

      // Potrero
      { zip: '91963', city: 'Potrero', type: 'Standard', primary: true },

      // Spring Valley
      { zip: '91977', city: 'Spring Valley', type: 'Standard', primary: true },
      { zip: '91978', city: 'Spring Valley', type: 'Standard', primary: true },

      // Tecate
      { zip: '91980', city: 'Tecate', type: 'Standard', primary: true },

      // Bonsall
      { zip: '92003', city: 'Bonsall', type: 'Standard', primary: true },

      // Borrego Springs
      { zip: '92004', city: 'Borrego Springs', type: 'Standard', primary: true },

      // Cardiff By The Sea
      { zip: '92007', city: 'Cardiff By The Sea', type: 'Standard', primary: true },

      // Fallbrook
      { zip: '92028', city: 'Fallbrook', type: 'Standard', primary: true },

      // Julian
      { zip: '92036', city: 'Julian', type: 'Standard', primary: true },

      // La Jolla
      { zip: '92037', city: 'La Jolla', type: 'Standard', primary: true },

      // Lakeside
      { zip: '92040', city: 'Lakeside', type: 'Standard', primary: true },

      // Oceanside (additional ZIP)
      { zip: '92054', city: 'Oceanside', type: 'Standard', primary: true },

      // Pala
      { zip: '92059', city: 'Pala', type: 'Standard', primary: true },

      // Pauma Valley
      { zip: '92061', city: 'Pauma Valley', type: 'Standard', primary: true },

      // Poway (additional ZIP that might be missing)
      { zip: '92064', city: 'Poway', type: 'Standard', primary: true },

      // Ramona
      { zip: '92065', city: 'Ramona', type: 'Standard', primary: true },

      // Santa Ysabel
      { zip: '92070', city: 'Santa Ysabel', type: 'Standard', primary: true },

      // Santee (already exists as city)
      { zip: '92071', city: 'Santee', type: 'Standard', primary: true },

      // Solana Beach (already exists as city)
      { zip: '92075', city: 'Solana Beach', type: 'Standard', primary: true },

      // Valley Center
      { zip: '92082', city: 'Valley Center', type: 'Standard', primary: true },

      // Additional Vista ZIPs
      { zip: '92084', city: 'Vista', type: 'Standard', primary: true },

      // Additional San Marcos ZIPs
      { zip: '92096', city: 'San Marcos', type: 'Standard', primary: true }
    ];

    let addedCount = 0;
    let skippedCount = 0;

    for (const zipData of newZipCodes) {
      const cityId = cityIdMap[zipData.city];

      if (!cityId) {
        console.log(`  ⚠ Warning: City not found: ${zipData.city} for ZIP ${zipData.zip}`);
        continue;
      }

      // Check if ZIP code already exists
      const existingZip = await client.query(
        'SELECT id, city_id FROM t_zipcodes WHERE zipcode = $1',
        [zipData.zip]
      );

      if (existingZip.rows.length === 0) {
        await client.query(
          `INSERT INTO t_zipcodes (zipcode, city_id, zipcode_type, primary_city, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [zipData.zip, cityId, zipData.type, zipData.primary]
        );
        console.log(`  ✓ Added ZIP: ${zipData.zip} → ${zipData.city}`);
        addedCount++;
      } else {
        // Check if it needs updating (wrong city)
        const currentCityId = existingZip.rows[0].city_id;
        if (currentCityId !== cityId) {
          await client.query(
            'UPDATE t_zipcodes SET city_id = $1, updated_at = NOW() WHERE zipcode = $2',
            [cityId, zipData.zip]
          );
          console.log(`  ✓ Updated ZIP: ${zipData.zip} → ${zipData.city} (was city_id: ${currentCityId})`);
          addedCount++;
        } else {
          console.log(`  - ZIP already exists correctly: ${zipData.zip} → ${zipData.city}`);
          skippedCount++;
        }
      }
    }

    await client.query('COMMIT');

    console.log('\n✅ Migration completed successfully!');
    console.log(`   Added/Updated: ${addedCount} ZIP codes`);
    console.log(`   Skipped (already correct): ${skippedCount} ZIP codes`);
    console.log(`   Added: ${newCities.length} cities (unincorporated communities)`);

    // Show final counts
    const citiesCount = await client.query(
      'SELECT COUNT(*) FROM t_cities WHERE county_id = $1',
      [sanDiegoCountyId]
    );
    const zipsCount = await client.query(
      'SELECT COUNT(*) FROM t_zipcodes z JOIN t_cities c ON z.city_id = c.id WHERE c.county_id = $1',
      [sanDiegoCountyId]
    );

    console.log(`\n📊 Final San Diego County totals:`);
    console.log(`   Cities: ${citiesCount.rows[0].count}`);
    console.log(`   ZIP codes: ${zipsCount.rows[0].count}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Run the migration
addMissingSanDiegoCitiesAndZips()
  .then(() => {
    console.log('\n✅ All done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });

export { addMissingSanDiegoCitiesAndZips };
