import express from 'express';
import { sanitizeInputMiddleware } from '../utils/inputValidation.js';
import { getPool } from '../config/database.js';

const router = express.Router();

// Apply middleware
router.use(sanitizeInputMiddleware);

/**
 * POST /api/service-areas/validate-zip
 * Validate if a ZIP code is in our service area
 */
router.post('/validate-zip', async (req, res) => {
  try {
    const { zipCode } = req.body;

    if (!zipCode) {
      return res.status(400).json({
        success: false,
        message: 'ZIP code is required'
      });
    }

    // Validate ZIP code format
    const zipCodeStr = zipCode.toString().trim();
    if (!/^\d{5}$/.test(zipCodeStr)) {
      return res.status(400).json({
        success: false,
        message: 'ZIP code must be a 5-digit number'
      });
    }

    const pool = await getPool();

    // Check if ZIP code is in our service areas (v_we_serve_locations view)
    const serviceAreaQuery = `
      SELECT wsl.location_name, wsl.location_type, wsl.state_code
      FROM v_we_serve_locations wsl
      WHERE wsl.location_type = 'zipcode'
        AND wsl.location_name = $1
        AND wsl.is_active = true
    `;

    const serviceAreaResult = await pool.query(serviceAreaQuery, [zipCodeStr]);

    if (serviceAreaResult.rows.length > 0) {
      const location = serviceAreaResult.rows[0];

      // Get the corresponding city for this ZIP code from t_zipcodes and t_cities
      const cityQuery = `
        SELECT c.city_name, s.state_code
        FROM t_zipcodes z
        JOIN t_cities c ON z.city_id = c.id
        JOIN t_counties co ON c.county_id = co.id
        JOIN t_states s ON co.state_id = s.id
        WHERE z.zipcode = $1
        LIMIT 1
      `;

      const cityResult = await pool.query(cityQuery, [zipCodeStr]);
      const cityName = cityResult.rows.length > 0 ? cityResult.rows[0].city_name : location.state_code;
      const stateCode = cityResult.rows.length > 0 ? cityResult.rows[0].state_code : location.state_code;

      return res.json({
        success: true,
        data: {
          isServiced: true,
          zipCode: zipCodeStr,
          city: cityName,
          state: stateCode,
          serviceType: 'full'
        }
      });
    }

    // ZIP code not in our service area
    res.json({
      success: true,
      data: {
        isServiced: false,
        zipCode: zipCodeStr,
        message: 'We do not currently provide service in this area. Please contact us directly to discuss your needs.'
      }
    });

  } catch (error) {
    console.error('❌ Error validating ZIP code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate ZIP code'
    });
  }
});

/**
 * GET /api/service-areas
 * Get all service areas (for admin use)
 */
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();

    const query = `
      SELECT
        location_name,
        location_type,
        state_code,
        is_active,
        notes
      FROM v_we_serve_locations
      WHERE is_active = true
      ORDER BY state_code, location_name
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      data: {
        serviceAreas: result.rows.map(row => ({
          name: row.location_name,
          type: row.location_type,
          state: row.state_code,
          isActive: row.is_active,
          notes: row.notes
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error fetching service areas:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service areas'
    });
  }
});

/**
 * GET /api/service-areas/zip-lookup/:zipCode
 * Get city/state information for a ZIP code (using external service or database)
 */
router.get('/zip-lookup/:zipCode', async (req, res) => {
  try {
    const { zipCode } = req.params;

    if (!/^\d{5}$/.test(zipCode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ZIP code format'
      });
    }

    // Simplified ZIP code lookup - in production, use a proper ZIP code database
    const zipCodeData = {
      '92101': { city: 'San Diego', state: 'CA', county: 'San Diego' },
      '92102': { city: 'San Diego', state: 'CA', county: 'San Diego' },
      '92103': { city: 'San Diego', state: 'CA', county: 'San Diego' },
      '92104': { city: 'San Diego', state: 'CA', county: 'San Diego' },
      '92105': { city: 'San Diego', state: 'CA', county: 'San Diego' },
      '92115': { city: 'San Diego', state: 'CA', county: 'San Diego' },
      '92116': { city: 'San Diego', state: 'CA', county: 'San Diego' },
      '92117': { city: 'San Diego', state: 'CA', county: 'San Diego' },
      '92120': { city: 'San Diego', state: 'CA', county: 'San Diego' },
      '92121': { city: 'San Diego', state: 'CA', county: 'San Diego' }
    };

    const locationData = zipCodeData[zipCode];

    if (locationData) {
      res.json({
        success: true,
        data: {
          zipCode,
          ...locationData
        }
      });
    } else {
      // For unknown ZIP codes, you might want to use an external service
      res.json({
        success: false,
        message: 'ZIP code not found in our database'
      });
    }

  } catch (error) {
    console.error('❌ Error looking up ZIP code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to lookup ZIP code'
    });
  }
});

export default router;