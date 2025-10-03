import express from 'express';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { requirePermission } from '../../middleware/permissionMiddleware.js';
import { sanitizeInputMiddleware } from '../../utils/inputValidation.js';
import { getPool } from '../../config/database.js';

const router = express.Router();

// Apply middleware
router.use(authMiddleware);
router.use(sanitizeInputMiddleware);

/**
 * GET /api/admin/service-hour-rates
 * Get all service hour rate tiers
 * Accessible to all employees (view only)
 */
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();

    const query = `
      SELECT
        id,
        tier_name,
        tier_level,
        day_of_week,
        time_start,
        time_end,
        rate_multiplier,
        color_code,
        description,
        display_order,
        is_active,
        created_at,
        updated_at
      FROM service_hour_rate_tiers
      ORDER BY day_of_week, time_start, tier_level
    `;

    const result = await pool.query(query);

    const rateTiers = result.rows.map(row => ({
      id: row.id,
      tierName: row.tier_name,
      tierLevel: row.tier_level,
      dayOfWeek: row.day_of_week,
      timeStart: row.time_start,
      timeEnd: row.time_end,
      rateMultiplier: parseFloat(row.rate_multiplier),
      colorCode: row.color_code,
      description: row.description,
      displayOrder: row.display_order,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({
      success: true,
      data: rateTiers
    });

  } catch (error) {
    console.error('❌ Error fetching service hour rates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service hour rates'
    });
  }
});

/**
 * POST /api/admin/service-hour-rates
 * Create a new service hour rate tier
 * Requires modify.service_hour_rates.enable permission
 */
router.post('/', requirePermission('modify.service_hour_rates.enable'), async (req, res) => {
  try {
    const {
      tierName,
      tierLevel,
      dayOfWeek,
      timeStart,
      timeEnd,
      rateMultiplier,
      colorCode,
      description,
      displayOrder,
      isActive
    } = req.body;

    // Validation
    if (!tierName || tierLevel === undefined || dayOfWeek === undefined || !timeStart || !timeEnd || !rateMultiplier) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: tierName, tierLevel, dayOfWeek, timeStart, timeEnd, rateMultiplier'
      });
    }

    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({
        success: false,
        message: 'dayOfWeek must be between 0 (Sunday) and 6 (Saturday)'
      });
    }

    if (tierLevel < 1 || tierLevel > 3) {
      return res.status(400).json({
        success: false,
        message: 'tierLevel must be between 1 (Standard) and 3 (Emergency)'
      });
    }

    if (rateMultiplier <= 0) {
      return res.status(400).json({
        success: false,
        message: 'rateMultiplier must be greater than 0'
      });
    }

    const pool = await getPool();

    const query = `
      INSERT INTO service_hour_rate_tiers (
        tier_name,
        tier_level,
        day_of_week,
        time_start,
        time_end,
        rate_multiplier,
        color_code,
        description,
        display_order,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const values = [
      tierName,
      tierLevel,
      dayOfWeek,
      timeStart,
      timeEnd,
      rateMultiplier,
      colorCode || '#28a745',
      description || '',
      displayOrder || 0,
      isActive !== undefined ? isActive : true
    ];

    const result = await pool.query(query, values);

    console.log(`✅ Service hour rate tier created by ${req.user.email}: ${tierName} for day ${dayOfWeek}`);

    res.status(201).json({
      success: true,
      message: 'Service hour rate tier created successfully',
      data: {
        id: result.rows[0].id,
        tierName: result.rows[0].tier_name,
        tierLevel: result.rows[0].tier_level,
        dayOfWeek: result.rows[0].day_of_week,
        timeStart: result.rows[0].time_start,
        timeEnd: result.rows[0].time_end,
        rateMultiplier: parseFloat(result.rows[0].rate_multiplier),
        colorCode: result.rows[0].color_code,
        description: result.rows[0].description,
        displayOrder: result.rows[0].display_order,
        isActive: result.rows[0].is_active
      }
    });

  } catch (error) {
    console.error('❌ Error creating service hour rate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create service hour rate'
    });
  }
});

/**
 * PUT /api/admin/service-hour-rates/:id
 * Update a service hour rate tier
 * Requires executive role
 */
router.put('/:id', requirePermission('modify.service_hour_rates.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      tierName,
      tierLevel,
      dayOfWeek,
      timeStart,
      timeEnd,
      rateMultiplier,
      colorCode,
      description,
      displayOrder,
      isActive
    } = req.body;

    console.log(`🔧 Service hour rate update request from ${req.user.email}:`, {
      id,
      tierName,
      tierLevel,
      dayOfWeek,
      timeStart,
      timeEnd,
      rateMultiplier,
      colorCode,
      description,
      displayOrder,
      isActive
    });

    // Validation
    if (dayOfWeek !== undefined && (dayOfWeek < 0 || dayOfWeek > 6)) {
      console.log(`❌ Validation failed: dayOfWeek ${dayOfWeek} out of range`);
      return res.status(400).json({
        success: false,
        message: 'dayOfWeek must be between 0 (Sunday) and 6 (Saturday)'
      });
    }

    if (tierLevel !== undefined && (tierLevel < 1 || tierLevel > 3)) {
      console.log(`❌ Validation failed: tierLevel ${tierLevel} out of range`);
      return res.status(400).json({
        success: false,
        message: 'tierLevel must be between 1 (Standard) and 3 (Emergency)'
      });
    }

    if (rateMultiplier !== undefined && rateMultiplier <= 0) {
      console.log(`❌ Validation failed: rateMultiplier ${rateMultiplier} must be > 0`);
      return res.status(400).json({
        success: false,
        message: 'rateMultiplier must be greater than 0'
      });
    }

    const pool = await getPool();

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (tierName !== undefined) {
      updates.push(`tier_name = $${paramCount++}`);
      values.push(tierName);
    }
    if (tierLevel !== undefined) {
      updates.push(`tier_level = $${paramCount++}`);
      values.push(tierLevel);
    }
    if (dayOfWeek !== undefined) {
      updates.push(`day_of_week = $${paramCount++}`);
      values.push(dayOfWeek);
    }
    if (timeStart !== undefined) {
      updates.push(`time_start = $${paramCount++}`);
      values.push(timeStart);
    }
    if (timeEnd !== undefined) {
      updates.push(`time_end = $${paramCount++}`);
      values.push(timeEnd);
    }
    if (rateMultiplier !== undefined) {
      updates.push(`rate_multiplier = $${paramCount++}`);
      values.push(rateMultiplier);
    }
    if (colorCode !== undefined) {
      updates.push(`color_code = $${paramCount++}`);
      values.push(colorCode);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(description);
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
      console.log(`❌ No fields to update`);
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    values.push(id);

    const query = `
      UPDATE service_hour_rate_tiers
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    console.log(`📝 Executing SQL update:`, { query, values });

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      console.log(`❌ Service hour rate tier not found: ${id}`);
      return res.status(404).json({
        success: false,
        message: 'Service hour rate tier not found'
      });
    }

    console.log(`✅ Service hour rate tier updated by ${req.user.email}: ${id}`);

    res.json({
      success: true,
      message: 'Service hour rate tier updated successfully',
      data: {
        id: result.rows[0].id,
        tierName: result.rows[0].tier_name,
        tierLevel: result.rows[0].tier_level,
        dayOfWeek: result.rows[0].day_of_week,
        timeStart: result.rows[0].time_start,
        timeEnd: result.rows[0].time_end,
        rateMultiplier: parseFloat(result.rows[0].rate_multiplier),
        colorCode: result.rows[0].color_code,
        description: result.rows[0].description,
        displayOrder: result.rows[0].display_order,
        isActive: result.rows[0].is_active
      }
    });

  } catch (error) {
    console.error('❌ Error updating service hour rate:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint
    });
    res.status(500).json({
      success: false,
      message: 'Failed to update service hour rate',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * DELETE /api/admin/service-hour-rates/:id
 * Delete a service hour rate tier
 * Requires executive role
 */
router.delete('/:id', requirePermission('modify.service_hour_rates.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    const query = 'DELETE FROM service_hour_rate_tiers WHERE id = $1 RETURNING tier_name';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service hour rate tier not found'
      });
    }

    console.log(`✅ Service hour rate tier deleted by ${req.user.email}: ${result.rows[0].tier_name}`);

    res.json({
      success: true,
      message: 'Service hour rate tier deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting service hour rate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service hour rate'
    });
  }
});

export default router;
