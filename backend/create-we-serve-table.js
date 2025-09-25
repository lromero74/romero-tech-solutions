import { getPool } from './config/database.js';

async function createWeServeTable() {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    console.log('🏗️ Creating t_we_serve table for service area management...');

    // Create the table to store our service areas
    await client.query(`
      CREATE TABLE IF NOT EXISTS t_we_serve (
        id SERIAL PRIMARY KEY,
        location_type VARCHAR(20) NOT NULL CHECK (location_type IN ('state', 'county', 'city', 'zipcode', 'area_code')),
        location_id INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT true,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

        -- Ensure we don't duplicate location entries
        UNIQUE(location_type, location_id)
      );
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_we_serve_type_id ON t_we_serve(location_type, location_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_we_serve_active ON t_we_serve(is_active) WHERE is_active = true;
    `);

    // Create a view for easy querying of served locations with names
    await client.query(`
      CREATE OR REPLACE VIEW v_we_serve_locations AS
      WITH served_locations AS (
        SELECT
          ws.id,
          ws.location_type,
          ws.location_id,
          ws.is_active,
          ws.notes,
          ws.created_at,
          ws.updated_at,
          CASE ws.location_type
            WHEN 'state' THEN s.state_name
            WHEN 'county' THEN co.county_name
            WHEN 'city' THEN ci.city_name
            WHEN 'zipcode' THEN z.zipcode
            WHEN 'area_code' THEN ac.area_code
          END as location_name,
          CASE ws.location_type
            WHEN 'state' THEN s.state_code
            WHEN 'county' THEN st.state_code
            WHEN 'city' THEN st2.state_code
            WHEN 'zipcode' THEN st3.state_code
            WHEN 'area_code' THEN st4.state_code
          END as state_code
        FROM t_we_serve ws
        LEFT JOIN t_states s ON ws.location_type = 'state' AND ws.location_id = s.id
        LEFT JOIN t_counties co ON ws.location_type = 'county' AND ws.location_id = co.id
        LEFT JOIN t_states st ON ws.location_type = 'county' AND co.state_id = st.id
        LEFT JOIN t_cities ci ON ws.location_type = 'city' AND ws.location_id = ci.id
        LEFT JOIN t_counties co2 ON ws.location_type = 'city' AND ci.county_id = co2.id
        LEFT JOIN t_states st2 ON co2.state_id = st2.id
        LEFT JOIN t_zipcodes z ON ws.location_type = 'zipcode' AND ws.location_id = z.id
        LEFT JOIN t_cities ci2 ON z.city_id = ci2.id
        LEFT JOIN t_counties co3 ON ci2.county_id = co3.id
        LEFT JOIN t_states st3 ON co3.state_id = st3.id
        LEFT JOIN t_area_codes ac ON ws.location_type = 'area_code' AND ws.location_id = ac.id
        LEFT JOIN t_counties co4 ON ac.county_id = co4.id
        LEFT JOIN t_states st4 ON co4.state_id = st4.id
      )
      SELECT * FROM served_locations
      ORDER BY
        state_code,
        CASE location_type
          WHEN 'state' THEN 1
          WHEN 'county' THEN 2
          WHEN 'city' THEN 3
          WHEN 'zipcode' THEN 4
          WHEN 'area_code' THEN 5
        END,
        location_name;
    `);

    console.log('✅ Successfully created t_we_serve table and view!');

    // Show table structure
    const tableInfo = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 't_we_serve'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Table structure:');
    tableInfo.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})${row.is_nullable === 'NO' ? ' NOT NULL' : ''}`);
    });

  } catch (error) {
    console.error('❌ Error creating t_we_serve table:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createWeServeTable().catch(console.error);