import express from 'express';
import { query } from '../../config/database.js';

const router = express.Router();

// GET /api/admin/service-areas - Get all active service areas
router.get('/service-areas', async (req, res) => {
  try {
    console.log('🌍 Fetching service areas for validation...');

    const queryText = `
      SELECT
        id,
        location_type,
        location_id,
        is_active,
        location_name,
        state_code
      FROM v_we_serve_locations
      WHERE is_active = true
      ORDER BY state_code, location_type, location_name
    `;

    const result = await query(queryText);

    console.log(`🌍 Found ${result.rows.length} active service areas`);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error fetching service areas:', error);
    res.status(500).json({
      message: 'Failed to fetch service areas',
      error: error.message
    });
  }
});

// POST /api/admin/service-areas/validate - Validate a specific address
router.post('/service-areas/validate', async (req, res) => {
  try {
    console.log('🌍 Service area validation endpoint called with body:', req.body);
    const { city, state, zipCode, country } = req.body;

    console.log('🔍 Validating address:', { city, state, zipCode, country });

    // Only service USA currently
    if (country && country.toUpperCase() !== 'USA') {
      return res.json({
        isValid: false,
        reason: 'We currently only provide services within the United States.',
        suggestedAreas: []
      });
    }

    // Normalize inputs
    const normalizedCity = city?.trim().toLowerCase();
    const normalizedState = state?.trim().toUpperCase();
    const normalizedZip = zipCode?.trim();

    console.log('🔍 Normalized inputs:', { normalizedCity, normalizedState, normalizedZip });

    if (!normalizedCity || !normalizedState || !normalizedZip) {
      console.log('❌ Missing required fields for validation');
      return res.status(400).json({
        message: 'City, state, and ZIP code are required for validation'
      });
    }

    // Check service areas
    const queryText = `
      SELECT
        location_type,
        location_name,
        state_code
      FROM v_we_serve_locations
      WHERE is_active = true
        AND (
          (location_type = 'zipcode' AND location_name = $1)
          OR
          (location_type = 'city' AND LOWER(location_name) = $2 AND state_code = $3)
        )
    `;

    console.log('🔍 Running query with params:', [normalizedZip, normalizedCity, normalizedState]);
    const result = await query(queryText, [normalizedZip, normalizedCity, normalizedState]);
    console.log('🔍 Query result:', { rowCount: result.rows.length, rows: result.rows });

    if (result.rows.length > 0) {
      console.log('✅ Address is within service area - returning isValid: true');
      return res.json({ isValid: true });
    }

    // Get suggested areas for this state
    const suggestionsQuery = `
      SELECT DISTINCT
        location_name,
        state_code,
        location_type
      FROM v_we_serve_locations
      WHERE is_active = true
        AND state_code = $1
        AND location_type = 'city'
      ORDER BY location_name
      LIMIT 5
    `;

    const suggestions = await query(suggestionsQuery, [normalizedState]);
    const suggestedAreas = suggestions.rows.map(row => `${row.location_name}, ${row.state_code}`);

    // If no areas in this state, show any areas we service
    if (suggestedAreas.length === 0) {
      const statesQuery = `
        SELECT DISTINCT state_code
        FROM v_we_serve_locations
        WHERE is_active = true
        ORDER BY state_code
        LIMIT 5
      `;
      const states = await query(statesQuery);
      suggestedAreas.push(...states.rows.map(row => `Areas in ${row.state_code}`));
    }

    console.log('❌ Address is outside service area - returning isValid: false');
    console.log('🔍 Suggested areas:', suggestedAreas);
    res.json({
      isValid: false,
      reason: `We don't currently service ${city}, ${state} ${zipCode}. Please select a location within our service area or contact us to discuss expanding services to your area.`,
      suggestedAreas
    });

  } catch (error) {
    console.error('❌ Error validating service area:', error);
    res.status(500).json({
      message: 'Failed to validate service area',
      error: error.message
    });
  }
});

// GET /api/admin/service-areas/lookup-zip/:zipCode - Lookup city and state by ZIP code
router.get('/service-areas/lookup-zip/:zipCode', async (req, res) => {
  try {
    const { zipCode } = req.params;
    console.log('🔍 Looking up ZIP code:', zipCode);

    if (!zipCode || zipCode.length < 5) {
      return res.status(400).json({
        message: 'Valid ZIP code required (minimum 5 digits)'
      });
    }

    // Look for ZIP code in our service areas and get the actual city it belongs to
    const queryText = `
      SELECT DISTINCT
        z.zipcode as zip_code,
        c.city_name as city,
        s.state_code as state
      FROM t_zipcodes z
      JOIN t_cities c ON z.city_id = c.id
      JOIN t_counties co ON c.county_id = co.id
      JOIN t_states s ON co.state_id = s.id
      WHERE z.zipcode = $1
        AND z.primary_city = true
    `;

    const result = await query(queryText, [zipCode]);
    console.log('🔍 ZIP lookup result:', { zipCode, rowCount: result.rows.length, rows: result.rows });

    if (result.rows.length === 0) {
      return res.json({
        found: false,
        message: `ZIP code ${zipCode} is not in our service areas`
      });
    }

    const zipData = result.rows[0];

    console.log('✅ ZIP code lookup successful:', zipData);
    res.json({
      found: true,
      data: {
        zipCode: zipData.zip_code,
        city: zipData.city,
        state: zipData.state,
        country: 'USA'
      }
    });

  } catch (error) {
    console.error('❌ Error looking up ZIP code:', error);
    res.status(500).json({
      message: 'Failed to lookup ZIP code',
      error: error.message
    });
  }
});

export default router;