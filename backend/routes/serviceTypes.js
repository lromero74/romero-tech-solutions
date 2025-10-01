/**
 * Service Types API Routes
 * Manages service types with translation support
 */

import express from 'express';
import pool from '../config/database.js';
import {
  authMiddleware,
  requireAdminOrExecutive,
  requireExecutive
} from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * GET /api/service-types
 * Get all active service types with translations
 * Available to all authenticated users (employees and clients)
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const languageCode = req.query.lang || req.user?.preferredLanguage || 'en';

    const result = await pool.query(
      'SELECT * FROM get_service_types_with_translations($1)',
      [languageCode]
    );

    res.json({
      success: true,
      data: {
        serviceTypes: result.rows
      }
    });
  } catch (error) {
    console.error('Error fetching service types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service types',
      error: error.message
    });
  }
});

/**
 * GET /api/service-types/admin
 * Get all service types (including inactive) for admin management
 * Admin or Executive only endpoint
 */
router.get('/admin', authMiddleware, requireAdminOrExecutive, async (req, res) => {
  try {
    const languageCode = req.query.lang || 'en';

    // Get service types without active filter
    const result = await pool.query(`
      SELECT
        st.id,
        st.type_code,
        st.category,
        st.name_key,
        st.description_key,
        st.is_active,
        st.is_system,
        st.sort_order,
        st.icon,
        st.created_at,
        st.updated_at,

        -- Get English translations
        (SELECT t.value
         FROM t_translation_keys tk
         JOIN t_translations t ON tk.id = t.key_id
         JOIN t_languages l ON t.language_id = l.id
         WHERE tk.key_path = st.name_key AND l.code = 'en'
         LIMIT 1) as name_en,

        (SELECT t.value
         FROM t_translation_keys tk
         JOIN t_translations t ON tk.id = t.key_id
         JOIN t_languages l ON t.language_id = l.id
         WHERE tk.key_path = st.description_key AND l.code = 'en'
         LIMIT 1) as description_en,

        -- Get Spanish translations
        (SELECT t.value
         FROM t_translation_keys tk
         JOIN t_translations t ON tk.id = t.key_id
         JOIN t_languages l ON t.language_id = l.id
         WHERE tk.key_path = st.name_key AND l.code = 'es'
         LIMIT 1) as name_es,

        (SELECT t.value
         FROM t_translation_keys tk
         JOIN t_translations t ON tk.id = t.key_id
         JOIN t_languages l ON t.language_id = l.id
         WHERE tk.key_path = st.description_key AND l.code = 'es'
         LIMIT 1) as description_es,

        -- Get current language translations
        (SELECT t.value
         FROM t_translation_keys tk
         JOIN t_translations t ON tk.id = t.key_id
         JOIN t_languages l ON t.language_id = l.id
         WHERE tk.key_path = st.name_key AND l.code = $1
         LIMIT 1) as name_current,

        (SELECT t.value
         FROM t_translation_keys tk
         JOIN t_translations t ON tk.id = t.key_id
         JOIN t_languages l ON t.language_id = l.id
         WHERE tk.key_path = st.description_key AND l.code = $1
         LIMIT 1) as description_current
      FROM service_types st
      ORDER BY
        CASE WHEN st.type_code = 'other' THEN 1 ELSE 0 END,
        st.sort_order,
        st.type_code
    `, [languageCode]);

    res.json({
      success: true,
      data: {
        serviceTypes: result.rows
      }
    });
  } catch (error) {
    console.error('Error fetching service types for admin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service types',
      error: error.message
    });
  }
});

/**
 * POST /api/service-types
 * Create a new service type
 * Admin or Executive only endpoint
 */
router.post('/', authMiddleware, requireAdminOrExecutive, async (req, res) => {
  try {
    const {
      type_code,
      category,
      name_en,
      description_en,
      name_es,
      description_es,
      sort_order = 999,
      icon
    } = req.body;

    // Validate required fields
    if (!type_code || !category || !name_en || !description_en) {
      return res.status(400).json({
        success: false,
        message: 'type_code, category, name_en, and description_en are required'
      });
    }

    // Validate type_code format (lowercase, hyphens only)
    if (!/^[a-z0-9-]+$/.test(type_code)) {
      return res.status(400).json({
        success: false,
        message: 'type_code must contain only lowercase letters, numbers, and hyphens'
      });
    }

    // Call the database function to create service type with translations
    const result = await pool.query(
      'SELECT upsert_service_type_with_translations($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        type_code,
        category,
        name_en,
        description_en,
        name_es,
        description_es,
        sort_order,
        false, // is_system (admin-created types are not system types)
        req.user.id
      ]
    );

    const serviceTypeId = result.rows[0].upsert_service_type_with_translations;

    // Update icon if provided
    if (icon) {
      await pool.query(
        'UPDATE service_types SET icon = $1 WHERE id = $2',
        [icon, serviceTypeId]
      );
    }

    // Fetch the created service type
    const createdType = await pool.query(
      'SELECT * FROM service_types WHERE id = $1',
      [serviceTypeId]
    );

    res.status(201).json({
      success: true,
      message: 'Service type created successfully',
      data: {
        serviceType: createdType.rows[0]
      }
    });
  } catch (error) {
    console.error('Error creating service type:', error);

    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        message: 'Service type with this code already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create service type',
      error: error.message
    });
  }
});

/**
 * PUT /api/service-types/:id
 * Update an existing service type
 * Admin or Executive only endpoint
 */
router.put('/:id', authMiddleware, requireAdminOrExecutive, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      type_code,
      category,
      name_en,
      description_en,
      name_es,
      description_es,
      sort_order,
      icon
    } = req.body;

    // Check if service type exists
    const existingType = await pool.query(
      'SELECT * FROM service_types WHERE id = $1',
      [id]
    );

    if (existingType.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service type not found'
      });
    }

    // Use the type_code from existing record if not provided
    const finalTypeCode = type_code || existingType.rows[0].type_code;

    // Update service type with translations
    await pool.query(
      'SELECT upsert_service_type_with_translations($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [
        finalTypeCode,
        category,
        name_en,
        description_en,
        name_es,
        description_es,
        sort_order,
        existingType.rows[0].is_system,
        req.user.id
      ]
    );

    // Update icon if provided
    if (icon !== undefined) {
      await pool.query(
        'UPDATE service_types SET icon = $1 WHERE id = $2',
        [icon, id]
      );
    }

    // Fetch the updated service type
    const updatedType = await pool.query(
      'SELECT * FROM service_types WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      message: 'Service type updated successfully',
      data: {
        serviceType: updatedType.rows[0]
      }
    });
  } catch (error) {
    console.error('Error updating service type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service type',
      error: error.message
    });
  }
});

/**
 * PATCH /api/service-types/:id/toggle
 * Toggle active status of a service type
 * Admin or Executive only endpoint
 */
router.patch('/:id/toggle', authMiddleware, requireAdminOrExecutive, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if service type exists
    const existingType = await pool.query(
      'SELECT * FROM service_types WHERE id = $1',
      [id]
    );

    if (existingType.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service type not found'
      });
    }

    // Toggle active status
    const result = await pool.query(
      `UPDATE service_types
       SET is_active = NOT is_active,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = $1
       WHERE id = $2
       RETURNING *`,
      [req.user.id, id]
    );

    res.json({
      success: true,
      message: `Service type ${result.rows[0].is_active ? 'activated' : 'deactivated'} successfully`,
      data: {
        serviceType: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Error toggling service type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle service type status',
      error: error.message
    });
  }
});

/**
 * DELETE /api/service-types/:id
 * Delete a service type (only non-system types can be deleted)
 * Executive only endpoint
 */
router.delete('/:id', authMiddleware, requireExecutive, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if service type exists and is not a system type
    const existingType = await pool.query(
      'SELECT * FROM service_types WHERE id = $1',
      [id]
    );

    if (existingType.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service type not found'
      });
    }

    if (existingType.rows[0].is_system) {
      return res.status(403).json({
        success: false,
        message: 'System service types cannot be deleted. You can deactivate them instead.'
      });
    }

    // Check if service type is in use
    const inUse = await pool.query(
      'SELECT COUNT(*) as count FROM service_requests WHERE service_type_id = $1',
      [id]
    );

    if (parseInt(inUse.rows[0].count) > 0) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete service type that is in use by service requests. Deactivate it instead.'
      });
    }

    // Delete the service type
    await pool.query(
      'DELETE FROM service_types WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      message: 'Service type deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting service type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service type',
      error: error.message
    });
  }
});

/**
 * GET /api/service-types/categories
 * Get list of available categories
 * Admin or Executive only endpoint
 */
router.get('/categories', authMiddleware, requireAdminOrExecutive, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT category FROM service_types ORDER BY category'
    );

    res.json({
      success: true,
      data: {
        categories: result.rows.map(row => row.category)
      }
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
});

export default router;
