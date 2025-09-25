import { getPool } from './config/database.js';

async function verifyDataIntegrity() {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    console.log('🔍 Verifying data integrity and relationships...\n');

    // Test 1: Verify foreign key relationships
    console.log('📋 1. Foreign Key Relationships:');

    const orphanCounties = await client.query(`
      SELECT county_name FROM t_counties
      WHERE state_id NOT IN (SELECT id FROM t_states)
    `);
    console.log(`   Orphaned counties: ${orphanCounties.rows.length}`);

    const orphanCities = await client.query(`
      SELECT city_name FROM t_cities
      WHERE county_id NOT IN (SELECT id FROM t_counties)
    `);
    console.log(`   Orphaned cities: ${orphanCities.rows.length}`);

    const orphanZipcodes = await client.query(`
      SELECT zipcode FROM t_zipcodes
      WHERE city_id NOT IN (SELECT id FROM t_cities)
    `);
    console.log(`   Orphaned ZIP codes: ${orphanZipcodes.rows.length}`);

    const orphanAreaCodes = await client.query(`
      SELECT area_code FROM t_area_codes
      WHERE county_id NOT IN (SELECT id FROM t_counties)
    `);
    console.log(`   Orphaned area codes: ${orphanAreaCodes.rows.length}`);

    // Test 2: Verify data completeness
    console.log('\n📊 2. Data Completeness:');

    const cityZipCount = await client.query(`
      SELECT c.city_name, COUNT(z.id) as zip_count
      FROM t_cities c
      LEFT JOIN t_zipcodes z ON c.id = z.city_id
      GROUP BY c.city_name, c.id
      ORDER BY zip_count DESC, c.city_name
    `);

    console.log('   ZIP codes per city:');
    cityZipCount.rows.slice(0, 10).forEach(row => {
      console.log(`     ${row.city_name}: ${row.zip_count} ZIP codes`);
    });

    // Test 3: Sample data queries
    console.log('\n🔗 3. Sample Relationship Queries:');

    const sampleQuery = await client.query(`
      SELECT
        s.state_name,
        co.county_name,
        ci.city_name,
        z.zipcode,
        ac.area_code
      FROM t_states s
      JOIN t_counties co ON s.id = co.state_id
      JOIN t_cities ci ON co.id = ci.county_id
      JOIN t_zipcodes z ON ci.id = z.city_id
      JOIN t_area_codes ac ON co.id = ac.county_id
      WHERE s.state_code = 'CA' AND co.county_name = 'San Diego'
      LIMIT 5
    `);

    console.log('   Sample joined data:');
    sampleQuery.rows.forEach(row => {
      console.log(`     ${row.state_name} > ${row.county_name} > ${row.city_name} (${row.zipcode}) - Area Code: ${row.area_code}`);
    });

    // Test 4: Unique constraints
    console.log('\n🔒 4. Constraint Verification:');

    const duplicateStates = await client.query('SELECT state_code, COUNT(*) as count FROM t_states GROUP BY state_code HAVING COUNT(*) > 1');
    console.log(`   Duplicate state codes: ${duplicateStates.rows.length}`);

    const duplicateZipcodes = await client.query('SELECT zipcode, COUNT(*) as count FROM t_zipcodes GROUP BY zipcode HAVING COUNT(*) > 1');
    console.log(`   Duplicate ZIP codes: ${duplicateZipcodes.rows.length}`);

    console.log('\n✅ Data integrity verification completed!');

  } catch (error) {
    console.error('❌ Error verifying data integrity:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

verifyDataIntegrity().catch(console.error);