/**
 * Asset Management API Routes
 * Phase 1 - RMM Feature Implementation
 *
 * Provides endpoints for hardware/software inventory tracking,
 * license management, and warranty information.
 */

import express from 'express';
import { query } from '../../config/database.js';
import { authMiddleware, requireEmployee } from '../../middleware/authMiddleware.js';

const router = express.Router();

/**
 * GET /api/admin/assets/hardware/:agent_id
 * Get hardware inventory for a specific agent
 */
router.get('/hardware/:agent_id', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { agent_id } = req.params;

    const result = await query(
      `SELECT * FROM asset_hardware_inventory
       WHERE agent_device_id = $1`,
      [agent_id]
    );

    res.json({
      success: true,
      data: result.rows[0] || null
    });
  } catch (error) {
    console.error('Get hardware inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hardware inventory',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/assets/software/:agent_id
 * Get software inventory for a specific agent
 */
router.get('/software/:agent_id', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { agent_id } = req.params;

    const result = await query(
      `SELECT * FROM asset_software_inventory
       WHERE agent_device_id = $1
       ORDER BY software_name ASC`,
      [agent_id]
    );

    res.json({
      success: true,
      data: {
        software: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('Get software inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch software inventory',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/assets/licenses
 * Get all licenses for a business or all businesses (admin)
 */
router.get('/licenses', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { business_id } = req.query;

    let queryText = `
      SELECT l.*, b.business_name
      FROM asset_licenses l
      LEFT JOIN businesses b ON l.business_id = b.id
      WHERE 1=1
    `;

    const params = [];
    if (business_id) {
      queryText += ' AND l.business_id = $1';
      params.push(business_id);
    }

    queryText += ' ORDER BY l.expiration_date ASC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: {
        licenses: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('Get licenses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch licenses',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/assets/licenses
 * Create or update a software license
 */
router.post('/licenses', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const {
      business_id,
      software_name,
      license_key,
      license_type,
      seats_total,
      expiration_date,
      vendor,
      cost_usd,
      notes
    } = req.body;

    if (!business_id || !software_name) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: business_id, software_name'
      });
    }

    const result = await query(
      `INSERT INTO asset_licenses (
        id, business_id, software_name, license_key, license_type,
        seats_total, expiration_date, vendor, cost_usd, notes, created_by
      ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        business_id,
        software_name,
        license_key,
        license_type,
        seats_total || 1,
        expiration_date,
        vendor,
        cost_usd,
        notes,
        req.user.id
      ]
    );

    res.json({
      success: true,
      message: 'License created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Create license error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create license',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/assets/warranties/:agent_id
 * Get warranty information for a specific agent
 */
router.get('/warranties/:agent_id', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { agent_id } = req.params;

    const result = await query(
      `SELECT * FROM asset_warranties
       WHERE agent_device_id = $1`,
      [agent_id]
    );

    res.json({
      success: true,
      data: result.rows[0] || null
    });
  } catch (error) {
    console.error('Get warranty error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch warranty information',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/assets/network-devices
 * Get all network-discovered devices for a business
 */
router.get('/network-devices', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { business_id } = req.query;

    let queryText = `
      SELECT * FROM asset_network_devices
      WHERE 1=1
    `;

    const params = [];
    if (business_id) {
      queryText += ' AND business_id = $1';
      params.push(business_id);
    }

    queryText += ' ORDER BY last_seen_at DESC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: {
        devices: result.rows,
        count: result.rows.length,
        online_count: result.rows.filter(d => d.is_online).length,
        offline_count: result.rows.filter(d => !d.is_online).length
      }
    });
  } catch (error) {
    console.error('Get network devices error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch network devices',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/assets/changes/:agent_id
 * Get asset change history for a specific agent
 */
router.get('/changes/:agent_id', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { limit = 50 } = req.query;

    const result = await query(
      `SELECT * FROM asset_change_history
       WHERE agent_device_id = $1
       ORDER BY detected_at DESC
       LIMIT $2`,
      [agent_id, limit]
    );

    res.json({
      success: true,
      data: {
        changes: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('Get asset changes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch asset changes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/admin/assets/scan/:agent_id
 * Trigger an immediate asset inventory scan on an agent
 *
 * TODO: Implementation - sends command to agent to perform full inventory scan
 */
router.post('/scan/:agent_id', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { scan_type = 'full' } = req.body; // full, hardware_only, software_only

    // TODO: Send command to agent to perform inventory scan
    // This would use the existing remote command infrastructure

    res.json({
      success: true,
      message: 'Inventory scan initiated',
      data: {
        agent_id,
        scan_type,
        status: 'pending'
      }
    });
  } catch (error) {
    console.error('Trigger inventory scan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate inventory scan',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
