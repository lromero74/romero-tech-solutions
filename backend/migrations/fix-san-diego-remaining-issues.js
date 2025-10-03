/**
 * Migration: Fix remaining San Diego County issues
 *
 * This script:
 * 1. Fixes Bonita and La Presa to be marked as unincorporated
 * 2. Adds missing ZIP codes for incorporated cities
 * 3. Adds remaining missing ZIP codes
 */

import { getPool } from '../config/database.js';

async function fixSanDiegoRemainingIssues() {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Fixing remaining San Diego County issues...');

    const sanDiegoCountyId = 1;

    // Step 1: Fix Bonita and La Presa to be unincorporated
    console.log('\nStep 1: Fixing city incorporation status...');

    await client.query(
      `UPDATE t_cities
       SET is_incorporated = false, city_type = 'Unincorporated', updated_at = NOW()
       WHERE city_name IN ('Bonita', 'La Presa') AND county_id = $1`,
      [sanDiegoCountyId]
    );
    console.log('  ✓ Updated Bonita and La Presa to unincorporated status');

    // Get city IDs
    const getCityId = async (cityName) => {
      const result = await client.query(
        'SELECT id FROM t_cities WHERE city_name = $1 AND county_id = $2',
        [cityName, sanDiegoCountyId]
      );
      return result.rows[0]?.id;
    };

    const cityIdMap = {};
    const cityNames = [
      'Bonita', 'Carlsbad', 'Chula Vista', 'Coronado', 'Del Mar', 'El Cajon',
      'Encinitas', 'Escondido', 'Imperial Beach', 'La Mesa', 'La Presa',
      'Lemon Grove', 'National City', 'Oceanside', 'Poway', 'San Diego',
      'San Marcos', 'Santee', 'Solana Beach', 'Vista'
    ];

    for (const cityName of cityNames) {
      const id = await getCityId(cityName);
      if (id) {
        cityIdMap[cityName] = id;
      }
    }

    // Step 2: Add missing ZIP codes
    console.log('\nStep 2: Adding remaining missing ZIP codes...');

    const additionalZipCodes = [
      // Bonita (unincorporated)
      { zip: '91902', city: 'Bonita', type: 'Standard', primary: true },

      // Chula Vista (already has many, but check for completeness)
      { zip: '91921', city: 'Chula Vista', type: 'Standard', primary: false },
      { zip: '91931', city: 'Chula Vista', type: 'PO Box', primary: false },

      // Coronado (missing)
      { zip: '92118', city: 'Coronado', type: 'Standard', primary: true },
      { zip: '92178', city: 'Coronado', type: 'Standard', primary: false },

      // Del Mar
      { zip: '92014', city: 'Del Mar', type: 'Standard', primary: true },

      // La Presa (unincorporated)
      { zip: '91977', city: 'La Presa', type: 'Standard', primary: false },

      // Additional incorporated cities ZIP codes
      { zip: '92130', city: 'San Diego', type: 'Standard', primary: false }, // Actually Carmel Valley area

      // Missing PO Box and unique ZIP codes for San Diego
      { zip: '92176', city: 'San Diego', type: 'Unique', primary: false },
      { zip: '92194', city: 'San Diego', type: 'Unique', primary: false },
      { zip: '92198', city: 'San Diego', type: 'Unique', primary: false }
    ];

    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const zipData of additionalZipCodes) {
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
          updatedCount++;
        } else {
          console.log(`  - ZIP already exists correctly: ${zipData.zip} → ${zipData.city}`);
          skippedCount++;
        }
      }
    }

    await client.query('COMMIT');

    console.log('\n✅ Migration completed successfully!');
    console.log(`   Added: ${addedCount} ZIP codes`);
    console.log(`   Updated: ${updatedCount} ZIP codes`);
    console.log(`   Skipped (already correct): ${skippedCount} ZIP codes`);

    // Show final counts
    const citiesCount = await client.query(
      'SELECT COUNT(*) as total, COUNT(CASE WHEN is_incorporated = true THEN 1 END) as incorporated, COUNT(CASE WHEN is_incorporated = false THEN 1 END) as unincorporated FROM t_cities WHERE county_id = $1',
      [sanDiegoCountyId]
    );
    const zipsCount = await client.query(
      'SELECT COUNT(*) FROM t_zipcodes z JOIN t_cities c ON z.city_id = c.id WHERE c.county_id = $1',
      [sanDiegoCountyId]
    );

    console.log(`\n📊 Final San Diego County totals:`);
    console.log(`   Total Cities: ${citiesCount.rows[0].total}`);
    console.log(`   Incorporated: ${citiesCount.rows[0].incorporated}`);
    console.log(`   Unincorporated: ${citiesCount.rows[0].unincorporated}`);
    console.log(`   ZIP codes: ${zipsCount.rows[0].count}`);

    // Show cities with 0 ZIP codes
    const citiesWithoutZips = await client.query(
      `SELECT c.city_name, c.is_incorporated
       FROM t_cities c
       LEFT JOIN t_zipcodes z ON z.city_id = c.id
       WHERE c.county_id = $1
       GROUP BY c.id, c.city_name, c.is_incorporated
       HAVING COUNT(z.id) = 0
       ORDER BY c.city_name`,
      [sanDiegoCountyId]
    );

    if (citiesWithoutZips.rows.length > 0) {
      console.log(`\n⚠️  Cities without ZIP codes (${citiesWithoutZips.rows.length}):`);
      citiesWithoutZips.rows.forEach(city => {
        console.log(`   - ${city.city_name} (${city.is_incorporated ? 'Incorporated' : 'Unincorporated'})`);
      });
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Run the migration
fixSanDiegoRemainingIssues()
  .then(() => {
    console.log('\n✅ All done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });

export { fixSanDiegoRemainingIssues };
