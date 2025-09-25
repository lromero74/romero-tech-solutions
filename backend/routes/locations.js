import express from 'express';
import { getPool } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all location data for service area management
router.get('/all', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();

    // Get all location data with hierarchical structure
    const result = await pool.query(`
      SELECT
        'state' as location_type,
        s.id,
        s.state_code as code,
        s.state_name as name,
        null as parent_id,
        null as parent_name
      FROM t_states s

      UNION ALL

      SELECT
        'county' as location_type,
        c.id,
        c.fips_code as code,
        c.county_name as name,
        c.state_id as parent_id,
        s.state_name as parent_name
      FROM t_counties c
      JOIN t_states s ON c.state_id = s.id

      UNION ALL

      SELECT
        'city' as location_type,
        ci.id,
        null as code,
        ci.city_name as name,
        ci.county_id as parent_id,
        co.county_name as parent_name
      FROM t_cities ci
      JOIN t_counties co ON ci.county_id = co.id

      UNION ALL

      SELECT
        'zipcode' as location_type,
        z.id,
        z.zipcode as code,
        z.zipcode as name,
        z.city_id as parent_id,
        c.city_name as parent_name
      FROM t_zipcodes z
      JOIN t_cities c ON z.city_id = c.id

      UNION ALL

      SELECT
        'area_code' as location_type,
        ac.id,
        ac.area_code as code,
        ac.area_code as name,
        ac.county_id as parent_id,
        co.county_name as parent_name
      FROM t_area_codes ac
      JOIN t_counties co ON ac.county_id = co.id

      ORDER BY location_type, name
    `);

    res.json({ locations: result.rows });
  } catch (error) {
    console.error('Error fetching location data:', error);
    res.status(500).json({ error: 'Failed to fetch location data' });
  }
});

// Get current service areas (what we serve)
router.get('/served', authenticateToken, async (req, res) => {
  try {
    const pool = await getPool();

    const result = await pool.query(`
      SELECT * FROM v_we_serve_locations
      WHERE is_active = true
      ORDER BY state_code, location_type, location_name
    `);

    res.json({ servedLocations: result.rows });
  } catch (error) {
    console.error('Error fetching served locations:', error);
    res.status(500).json({ error: 'Failed to fetch served locations' });
  }
});

// Update service areas
router.post('/served', authenticateToken, async (req, res) => {
  try {
    const { selections } = req.body;
    const pool = await getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Clear existing service areas
      await client.query('DELETE FROM t_we_serve WHERE is_active = true');

      // Insert new selections
      for (const selection of selections) {
        await client.query(`
          INSERT INTO t_we_serve (location_type, location_id, is_active, notes)
          VALUES ($1, $2, true, $3)
        `, [selection.location_type, selection.location_id, selection.notes || null]);
      }

      await client.query('COMMIT');

      // Return updated served locations
      const result = await client.query(`
        SELECT * FROM v_we_serve_locations
        WHERE is_active = true
        ORDER BY state_code, location_type, location_name
      `);

      res.json({
        success: true,
        servedLocations: result.rows,
        message: `Updated service areas with ${selections.length} selections`
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error updating served locations:', error);
    res.status(500).json({ error: 'Failed to update served locations' });
  }
});

// Get hierarchical data for specific location type and parent
router.get('/children/:locationType/:parentId', authenticateToken, async (req, res) => {
  try {
    const { locationType, parentId } = req.params;
    const pool = await getPool();
    let query = '';
    let params = [parentId];

    switch (locationType) {
      case 'counties':
        query = `
          SELECT id, county_name as name, fips_code as code
          FROM t_counties
          WHERE state_id = $1
          ORDER BY county_name
        `;
        break;
      case 'cities':
        query = `
          SELECT id, city_name as name
          FROM t_cities
          WHERE county_id = $1
          ORDER BY city_name
        `;
        break;
      case 'zipcodes':
        query = `
          SELECT id, zipcode as name, zipcode as code
          FROM t_zipcodes
          WHERE city_id = $1
          ORDER BY zipcode
        `;
        break;
      case 'area_codes':
        query = `
          SELECT id, area_code as name, area_code as code
          FROM t_area_codes
          WHERE county_id = $1
          ORDER BY area_code
        `;
        break;
      default:
        return res.status(400).json({ error: 'Invalid location type' });
    }

    const result = await pool.query(query, params);
    res.json({ children: result.rows });

  } catch (error) {
    console.error('Error fetching child locations:', error);
    res.status(500).json({ error: 'Failed to fetch child locations' });
  }
});

export default router;