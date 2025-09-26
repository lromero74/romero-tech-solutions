import express from 'express';
import { query } from '../../config/database.js';

const router = express.Router();

// GET /api/admin/location-types - Get all active location types
router.get('/location-types', async (req, res) => {
  try {
    console.log('📋 Fetching location types...');

    const queryText = `
      SELECT
        id,
        type_code,
        display_name,
        category,
        description,
        icon,
        sort_order
      FROM v_location_types
      ORDER BY sort_order, display_name
    `;

    const result = await query(queryText);

    console.log(`📋 Found ${result.rows.length} location types`);

    res.json({
      locationTypes: result.rows,
      totalCount: result.rows.length
    });
  } catch (error) {
    console.error('❌ Error fetching location types:', error);
    res.status(500).json({
      message: 'Failed to fetch location types',
      error: error.message
    });
  }
});

// GET /api/admin/location-types/categories - Get location types grouped by category
router.get('/location-types/categories', async (req, res) => {
  try {
    console.log('📋 Fetching location types by category...');

    const queryText = `
      SELECT
        category,
        json_agg(
          json_build_object(
            'id', id,
            'type_code', type_code,
            'display_name', display_name,
            'description', description,
            'icon', icon,
            'sort_order', sort_order
          ) ORDER BY sort_order, display_name
        ) as types
      FROM v_location_types
      GROUP BY category
      ORDER BY
        CASE category
          WHEN 'corporate' THEN 1
          WHEN 'educational' THEN 2
          WHEN 'religious' THEN 3
          WHEN 'government' THEN 4
          WHEN 'healthcare' THEN 5
          WHEN 'hospitality' THEN 6
          WHEN 'cultural' THEN 7
          WHEN 'industrial' THEN 8
          WHEN 'retail' THEN 9
          WHEN 'residential' THEN 10
          WHEN 'technology' THEN 11
          ELSE 12
        END
    `;

    const result = await query(queryText);

    console.log(`📋 Found ${result.rows.length} location type categories`);

    res.json({
      categories: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching location type categories:', error);
    res.status(500).json({
      message: 'Failed to fetch location type categories',
      error: error.message
    });
  }
});

export default router;