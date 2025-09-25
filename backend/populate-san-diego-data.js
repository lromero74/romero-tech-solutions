import { getPool } from './config/database.js';

async function populateSanDiegoData() {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    console.log('🏛️ Inserting California state data...');
    await client.query(
      'INSERT INTO t_states (state_code, state_name) VALUES ($1, $2) ON CONFLICT (state_code) DO NOTHING',
      ['CA', 'California']
    );

    console.log('🏞️ Inserting San Diego County data...');
    // First get the state_id for California
    const stateResult = await client.query('SELECT id FROM t_states WHERE state_code = $1', ['CA']);
    const stateId = stateResult.rows[0]?.id;

    if (!stateId) {
      throw new Error('California state not found in database');
    }

    await client.query(
      'INSERT INTO t_counties (county_name, state_id, fips_code) VALUES ($1, $2, $3) ON CONFLICT (fips_code) DO NOTHING',
      ['San Diego', stateId, '06073']
    );

    console.log('🏙️ Inserting San Diego County cities...');
    // Get the county_id for San Diego County
    const countyResult = await client.query('SELECT id FROM t_counties WHERE fips_code = $1', ['06073']);
    const countyId = countyResult.rows[0]?.id;

    if (!countyId) {
      throw new Error('San Diego County not found in database');
    }

    const cities = [
      'San Diego', 'Chula Vista', 'Oceanside', 'Escondido', 'Carlsbad',
      'El Cajon', 'Vista', 'San Marcos', 'Encinitas', 'National City',
      'La Mesa', 'Santee', 'Poway', 'Coronado', 'Imperial Beach',
      'Lemon Grove', 'La Presa', 'Solana Beach', 'Del Mar', 'Bonita'
    ];

    for (const city of cities) {
      await client.query(
        'INSERT INTO t_cities (city_name, county_id, is_incorporated) VALUES ($1, $2, $3) ON CONFLICT (city_name, county_id) DO NOTHING',
        [city, countyId, true]
      );
    }

    console.log('📮 Inserting San Diego County ZIP codes...');
    const zipCodes = [
      // San Diego proper
      '92101', '92102', '92103', '92104', '92105', '92106', '92107', '92108', '92109', '92110',
      '92111', '92112', '92113', '92114', '92115', '92116', '92117', '92118', '92119', '92120',
      '92121', '92122', '92123', '92124', '92126', '92127', '92128', '92129', '92130', '92131',
      '92132', '92134', '92135', '92136', '92137', '92138', '92139', '92140', '92142', '92145',
      '92147', '92149', '92150', '92152', '92153', '92154', '92155', '92158', '92159', '92160',
      '92161', '92162', '92163', '92165', '92166', '92167', '92168', '92169', '92170', '92171',
      '92172', '92173', '92174', '92175', '92176', '92177', '92179', '92182', '92186', '92187',
      '92190', '92191', '92192', '92193', '92195', '92196', '92197', '92198', '92199',

      // Other major cities
      '91902', '91910', '91911', '91913', '91914', '91915', '91916', '91917', '91921', '91931', // Chula Vista area
      '92008', '92009', '92010', '92011', '92013', '92014', '92018', '92019', '92020', '92021', // Carlsbad/Oceanside area
      '92024', '92025', '92026', '92027', '92028', '92029', '92030', '92033', '92036', '92037', // Escondido/Encinitas area
      '92040', '92041', '92056', '92057', '92058', '92059', '92064', '92065', '92066', '92067', // El Cajon/Vista area
      '92069', '92070', '92071', '92075', '92078', '92079', '92081', '92082', '92083', '92084', // San Marcos/Poway area
      '92085', '92086', '92091', '92092', '92093', '92096'
    ];

    for (const zip of zipCodes) {
      // Find appropriate city for this ZIP code (simplified mapping)
      let cityName = 'San Diego'; // Default to San Diego

      if (zip.startsWith('919')) cityName = 'Chula Vista';
      else if (['92008', '92009', '92010', '92011'].includes(zip)) cityName = 'Carlsbad';
      else if (['92054', '92056', '92057', '92058'].includes(zip)) cityName = 'Oceanside';
      else if (['92025', '92026', '92027', '92029', '92033'].includes(zip)) cityName = 'Escondido';
      else if (['92024', '92130'].includes(zip)) cityName = 'Encinitas';
      else if (['92019', '92020', '92021'].includes(zip)) cityName = 'El Cajon';
      else if (['92081', '92083', '92084'].includes(zip)) cityName = 'Vista';
      else if (['92069', '92078', '92096'].includes(zip)) cityName = 'San Marcos';

      // Find the city_id for this ZIP code
      const cityResult = await client.query('SELECT id FROM t_cities WHERE city_name = $1 AND county_id = $2', [cityName, countyId]);
      const cityId = cityResult.rows[0]?.id;

      if (cityId) {
        await client.query(
          'INSERT INTO t_zipcodes (zipcode, city_id, zipcode_type, primary_city) VALUES ($1, $2, $3, $4) ON CONFLICT (zipcode) DO NOTHING',
          [zip, cityId, 'Standard', true]
        );
      }
    }

    console.log('📞 Inserting San Diego County area codes...');
    const areaCodes = [
      { code: '619', is_overlay: false },
      { code: '858', is_overlay: true },
      { code: '760', is_overlay: true }
    ];

    for (const areaCode of areaCodes) {
      await client.query(
        'INSERT INTO t_area_codes (area_code, county_id, is_overlay) VALUES ($1, $2, $3) ON CONFLICT (area_code, county_id) DO NOTHING',
        [areaCode.code, countyId, areaCode.is_overlay]
      );
    }

    console.log('✅ Successfully populated San Diego County data!');

    // Verify the data
    const stateCount = await client.query('SELECT COUNT(*) FROM t_states WHERE state_code = $1', ['CA']);
    const countyCount = await client.query('SELECT COUNT(*) FROM t_counties WHERE state_id = $1', [stateId]);
    const cityCount = await client.query('SELECT COUNT(*) FROM t_cities WHERE county_id = $1', [countyId]);
    const zipCount = await client.query('SELECT COUNT(*) FROM t_zipcodes WHERE city_id IN (SELECT id FROM t_cities WHERE county_id = $1)', [countyId]);
    const areaCodeCount = await client.query('SELECT COUNT(*) FROM t_area_codes WHERE county_id = $1', [countyId]);

    console.log('📊 Data Summary:');
    console.log(`   States: ${stateCount.rows[0].count}`);
    console.log(`   Counties: ${countyCount.rows[0].count}`);
    console.log(`   Cities: ${cityCount.rows[0].count}`);
    console.log(`   ZIP Codes: ${zipCount.rows[0].count}`);
    console.log(`   Area Codes: ${areaCodeCount.rows[0].count}`);

  } catch (error) {
    console.error('❌ Error populating San Diego data:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

populateSanDiegoData().catch(console.error);