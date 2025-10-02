import express from 'express';
import { query } from '../config/database.js';

const router = express.Router();

// Public service area validation endpoint (no auth required)
// This allows validation during business creation before full authentication
router.post('/service-areas/validate', async (req, res) => {
  try {
    console.log('🌍 Public service area validation endpoint called with body:', req.body);
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

// Public endpoint to get base hourly rate (no auth required)
// Needed for clients to see pricing in scheduler
// Now supports business-specific rates via rate categories
router.get('/base-hourly-rate', async (req, res) => {
  try {
    const { businessId } = req.query;

    // If business ID provided, get business-specific rate from rate category
    if (businessId) {
      const businessResult = await query(`
        SELECT
          b.id,
          b.rate_category_id,
          rc.base_hourly_rate as category_rate,
          (SELECT base_hourly_rate FROM hourly_rate_categories WHERE is_default = true LIMIT 1) as default_rate
        FROM businesses b
        LEFT JOIN hourly_rate_categories rc ON b.rate_category_id = rc.id
        WHERE b.id = $1
      `, [businessId]);

      if (businessResult.rows.length > 0) {
        const business = businessResult.rows[0];
        // Use business category rate if assigned, otherwise use default category rate
        const baseRate = business.category_rate || business.default_rate || 75;

        return res.json({
          success: true,
          data: {
            baseHourlyRate: parseFloat(baseRate),
            source: business.category_rate ? 'business_category' : 'default_category'
          }
        });
      }
    }

    // Fallback: Get default category rate
    const defaultResult = await query(`
      SELECT base_hourly_rate
      FROM hourly_rate_categories
      WHERE is_default = true
      LIMIT 1
    `);

    if (defaultResult.rows.length > 0) {
      return res.json({
        success: true,
        data: {
          baseHourlyRate: parseFloat(defaultResult.rows[0].base_hourly_rate),
          source: 'default_category'
        }
      });
    }

    // Ultimate fallback: system setting (for backwards compatibility)
    const result = await query(`
      SELECT setting_value
      FROM system_settings
      WHERE setting_key = 'base_hourly_rate'
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Base hourly rate not configured'
      });
    }

    const baseRate = result.rows[0].setting_value;

    res.status(200).json({
      success: true,
      data: {
        baseHourlyRate: parseFloat(baseRate)
      }
    });

  } catch (error) {
    console.error('Get base hourly rate error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get base hourly rate',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;