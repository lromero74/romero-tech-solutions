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

    // Check if ZIP code is in our service areas
    // This is a simplified approach - in production you might want to use a ZIP code database
    // For now, we'll use the existing service locations to determine coverage
    const serviceAreasQuery = `
      SELECT DISTINCT sl.city, sl.state, sl.zip_code
      FROM service_locations sl
      WHERE sl.soft_delete = false
        AND sl.is_active = true
        AND sl.zip_code = $1
    `;

    const serviceAreasResult = await pool.query(serviceAreasQuery, [zipCodeStr]);

    if (serviceAreasResult.rows.length > 0) {
      // Found exact ZIP match in our service locations
      const location = serviceAreasResult.rows[0];
      return res.json({
        success: true,
        data: {
          isServiced: true,
          zipCode: zipCodeStr,
          city: location.city,
          state: location.state,
          serviceType: 'full'
        }
      });
    }

    // If no exact match, check nearby service areas (simplified approach)
    // In production, you'd use a more sophisticated ZIP code distance calculation
    const nearbyAreasQuery = `
      SELECT DISTINCT sl.city, sl.state, sl.zip_code
      FROM service_locations sl
      WHERE sl.soft_delete = false
        AND sl.is_active = true
        AND sl.state = 'CA'
      ORDER BY sl.city
      LIMIT 1
    `;

    const nearbyResult = await pool.query(nearbyAreasQuery);

    // For development purposes, we'll be generous and accept San Diego area ZIP codes
    const sanDiegoZipCodes = [
      '92101', '92102', '92103', '92104', '92105', '92106', '92107', '92108', '92109', '92110',
      '92111', '92112', '92113', '92114', '92115', '92116', '92117', '92119', '92120', '92121',
      '92122', '92123', '92124', '92126', '92127', '92128', '92129', '92130', '92131', '92132',
      '92134', '92135', '92136', '92139', '92140', '92145', '92147', '92149', '92150', '92152',
      '92153', '92154', '92155', '92158', '92159', '92160', '92161', '92162', '92163', '92164',
      '92165', '92166', '92167', '92168', '92169', '92170', '92171', '92172', '92173', '92174',
      '92175', '92176', '92177', '92178', '92179', '92182', '92186', '92187', '92190', '92191',
      '92192', '92193', '92194', '92195', '92196', '92197', '92198', '92199'
    ];

    if (sanDiegoZipCodes.includes(zipCodeStr)) {
      return res.json({
        success: true,
        data: {
          isServiced: true,
          zipCode: zipCodeStr,
          city: 'San Diego',
          state: 'CA',
          serviceType: 'standard'
        }
      });
    }

    // Check neighboring counties (limited service)
    const orangeCountyZipCodes = ['92602', '92603', '92604', '92605', '92606', '92607', '92609'];
    const riversideCountyZipCodes = ['92220', '92230', '92240', '92250', '92260'];

    if (orangeCountyZipCodes.includes(zipCodeStr)) {
      return res.json({
        success: true,
        data: {
          isServiced: true,
          zipCode: zipCodeStr,
          city: 'Orange County',
          state: 'CA',
          serviceType: 'limited',
          note: 'Limited service area - additional travel charges may apply'
        }
      });
    }

    if (riversideCountyZipCodes.includes(zipCodeStr)) {
      return res.json({
        success: true,
        data: {
          isServiced: true,
          zipCode: zipCodeStr,
          city: 'Riverside County',
          state: 'CA',
          serviceType: 'limited',
          note: 'Limited service area - additional travel charges may apply'
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