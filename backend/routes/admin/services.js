import express from 'express';
import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const router = express.Router();

// GET /services - Get all services
router.get('/services', async (req, res) => {
  try {
    logger.debug('🔍 Fetching all services...');

    // Check if services table exists first, create if it doesn't
    const tableCheck = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'services'
    `);

    if (tableCheck.rows.length === 0) {
      logger.debug('📋 Creating services table...');
      await query(`
        CREATE TABLE IF NOT EXISTS services (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          base_price DECIMAL(10,2) DEFAULT 0,
          estimated_hours DECIMAL(5,2) DEFAULT 0,
          icon VARCHAR(100),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.debug('✅ Services table created');
    }

    const result = await query(`
      SELECT
        id,
        name,
        description,
        base_price as "basePrice",
        estimated_hours as "estimatedHours",
        icon,
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM services
      WHERE is_active = true
      ORDER BY name
    `);

    logger.debug(`📋 Found ${result.rows.length} services`);

    res.status(200).json({
      success: true,
      data: {
        services: result.rows
      },
      message: 'Services retrieved successfully'
    });

  } catch (error) {
    logger.error('❌ Error fetching services:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /services - Create a new service
router.post('/services', async (req, res) => {
  try {
    const { name, description, basePrice, estimatedHours, icon } = req.body;

    logger.debug('🆕 Creating new service:', { name, description, basePrice, estimatedHours, icon });

    // Validate input
    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: 'Name and description are required'
      });
    }

    // Check if services table exists first, create if it doesn't
    const tableCheck = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'services'
    `);

    if (tableCheck.rows.length === 0) {
      logger.debug('📋 Creating services table...');
      await query(`
        CREATE TABLE IF NOT EXISTS services (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          base_price DECIMAL(10,2) DEFAULT 0,
          estimated_hours DECIMAL(5,2) DEFAULT 0,
          icon VARCHAR(100),
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.debug('✅ Services table created');
    }

    const result = await query(`
      INSERT INTO services (name, description, base_price, estimated_hours, icon)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        name,
        description,
        base_price as "basePrice",
        estimated_hours as "estimatedHours",
        icon,
        is_active as "isActive",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [name, description, parseFloat(basePrice) || 0, parseFloat(estimatedHours) || 0, icon || null]);

    const newService = result.rows[0];
    logger.debug('✅ Service created successfully:', newService);

    res.status(201).json({
      success: true,
      data: {
        service: newService
      },
      message: 'Service created successfully'
    });

  } catch (error) {
    logger.error('❌ Error creating service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create service',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


// PUT /services/:id - Update a service
router.put('/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, basePrice, estimatedHours, icon, isActive } = req.body;

    const current = await query(`SELECT id FROM services WHERE id = $1`, [id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const updates = [];
    const params = [];
    let idx = 1;
    const set = (col, val) => { updates.push(`${col} = $${idx++}`); params.push(val); };
    if (name !== undefined) set('name', name);
    if (description !== undefined) set('description', description);
    if (basePrice !== undefined) set('base_price', parseFloat(basePrice) || 0);
    if (estimatedHours !== undefined) set('estimated_hours', parseFloat(estimatedHours) || 0);
    if (icon !== undefined) set('icon', icon);
    if (isActive !== undefined) set('is_active', !!isActive);
    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    updates.push(`updated_at = NOW()`);

    const result = await query(`
      UPDATE services SET ${updates.join(', ')} WHERE id = $${idx}
      RETURNING
        id, name, description,
        base_price as "basePrice", estimated_hours as "estimatedHours",
        icon, is_active as "isActive",
        created_at as "createdAt", updated_at as "updatedAt"
    `, [...params, id]);

    res.json({ success: true, data: { service: result.rows[0] }, message: 'Service updated successfully' });
  } catch (error) {
    logger.error('Error updating service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE /services/:id - Delete a service (no inbound FKs reference services)
router.delete('/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`DELETE FROM services WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    res.json({ success: true, message: 'Service deleted successfully' });
  } catch (error) {
    logger.error('Error deleting service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;