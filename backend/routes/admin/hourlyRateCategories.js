import express from 'express';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { requirePermission } from '../../middleware/permissionMiddleware.js';
import { sanitizeInputMiddleware } from '../../utils/inputValidation.js';
import { getPool } from '../../config/database.js';

const router = express.Router();

// Apply middleware to all routes
router.use(authMiddleware);
router.use(sanitizeInputMiddleware);

/**
 * GET /api/admin/hourly-rate-categories
 * Get all hourly rate categories
 */
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const query = `
      SELECT
        id,
        category_name,
        base_hourly_rate,
        description,
        is_default,
        is_active,
        display_order,
        created_at,
        updated_at
      FROM hourly_rate_categories
      WHERE is_active = true
      ORDER BY display_order ASC, category_name ASC
    `;

    const result = await pool.query(query);

    const categories = result.rows.map(row => ({
      id: row.id,
      categoryName: row.category_name,
      baseHourlyRate: parseFloat(row.base_hourly_rate),
      description: row.description,
      isDefault: row.is_default,
      isActive: row.is_active,
      displayOrder: row.display_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({
      success: true,
      data: categories
    });

  } catch (error) {
    console.error('❌ Error fetching hourly rate categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hourly rate categories'
    });
  }
});

/**
 * POST /api/admin/hourly-rate-categories
 * Create a new hourly rate category
 * Requires modify.hourly_rate_categories.enable permission
 */
router.post('/', requirePermission('modify.hourly_rate_categories.enable'), async (req, res) => {
  try {
    const { categoryName, baseHourlyRate, description, isDefault, displayOrder } = req.body;

    if (!categoryName || baseHourlyRate === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Category name and base hourly rate are required'
      });
    }

    if (baseHourlyRate <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Base hourly rate must be greater than 0'
      });
    }

    const pool = await getPool();

    // Get the next display order if not provided
    let nextDisplayOrder = displayOrder;
    if (!nextDisplayOrder) {
      const orderResult = await pool.query(
        'SELECT COALESCE(MAX(display_order), 0) + 1 as next_order FROM hourly_rate_categories'
      );
      nextDisplayOrder = orderResult.rows[0].next_order;
    }

    const query = `
      INSERT INTO hourly_rate_categories (
        category_name,
        base_hourly_rate,
        description,
        is_default,
        display_order
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      categoryName,
      baseHourlyRate,
      description || null,
      isDefault || false,
      nextDisplayOrder
    ];

    const result = await pool.query(query, values);
    const row = result.rows[0];

    const category = {
      id: row.id,
      categoryName: row.category_name,
      baseHourlyRate: parseFloat(row.base_hourly_rate),
      description: row.description,
      isDefault: row.is_default,
      isActive: row.is_active,
      displayOrder: row.display_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    console.log(`✅ Created hourly rate category: ${categoryName} ($${baseHourlyRate}/hr)`);

    res.status(201).json({
      success: true,
      data: category,
      message: 'Hourly rate category created successfully'
    });

  } catch (error) {
    console.error('❌ Error creating hourly rate category:', error);

    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        success: false,
        message: 'A category with this name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create hourly rate category'
    });
  }
});

/**
 * PUT /api/admin/hourly-rate-categories/:id
 * Update an hourly rate category (Executive/Admin only)
 */
router.put('/:id', requirePermission('modify.hourly_rate_categories.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const { categoryName, baseHourlyRate, description, isDefault, displayOrder, isActive } = req.body;

    if (baseHourlyRate !== undefined && baseHourlyRate <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Base hourly rate must be greater than 0'
      });
    }

    const pool = await getPool();

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (categoryName !== undefined) {
      updates.push(`category_name = $${paramCount++}`);
      values.push(categoryName);
    }
    if (baseHourlyRate !== undefined) {
      updates.push(`base_hourly_rate = $${paramCount++}`);
      values.push(baseHourlyRate);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (isDefault !== undefined) {
      updates.push(`is_default = $${paramCount++}`);
      values.push(isDefault);
    }
    if (displayOrder !== undefined) {
      updates.push(`display_order = $${paramCount++}`);
      values.push(displayOrder);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(isActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    values.push(id);

    const query = `
      UPDATE hourly_rate_categories
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Hourly rate category not found'
      });
    }

    const row = result.rows[0];
    const category = {
      id: row.id,
      categoryName: row.category_name,
      baseHourlyRate: parseFloat(row.base_hourly_rate),
      description: row.description,
      isDefault: row.is_default,
      isActive: row.is_active,
      displayOrder: row.display_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    console.log(`✅ Updated hourly rate category: ${category.categoryName}`);

    res.json({
      success: true,
      data: category,
      message: 'Hourly rate category updated successfully'
    });

  } catch (error) {
    console.error('❌ Error updating hourly rate category:', error);

    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({
        success: false,
        message: 'A category with this name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update hourly rate category'
    });
  }
});

/**
 * DELETE /api/admin/hourly-rate-categories/:id
 * Soft delete an hourly rate category (Executive/Admin only)
 */
router.delete('/:id', requirePermission('modify.hourly_rate_categories.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    // Check if this is the default category
    const checkQuery = 'SELECT is_default FROM hourly_rate_categories WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Hourly rate category not found'
      });
    }

    if (checkResult.rows[0].is_default) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the default category'
      });
    }

    // Soft delete (set is_active = false)
    const query = `
      UPDATE hourly_rate_categories
      SET is_active = false
      WHERE id = $1
      RETURNING category_name
    `;

    const result = await pool.query(query, [id]);

    console.log(`✅ Deleted hourly rate category: ${result.rows[0].category_name}`);

    res.json({
      success: true,
      message: 'Hourly rate category deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting hourly rate category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete hourly rate category'
    });
  }
});

export default router;
