import express from 'express';
import { query } from '../../config/database.js';
import { requireRole } from '../../middleware/authMiddleware.js';

const router = express.Router();

// GET /system-settings/:key - Get a specific system setting
router.get('/system-settings/:key', async (req, res) => {
  try {
    const { key } = req.params;

    const result = await query(`
      SELECT setting_key, setting_value, setting_type, description, updated_at
      FROM system_settings
      WHERE setting_key = $1
    `, [key]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found'
      });
    }

    const setting = result.rows[0];

    res.status(200).json({
      success: true,
      data: {
        key: setting.setting_key,
        value: setting.setting_value,
        type: setting.setting_type,
        description: setting.description,
        updatedAt: setting.updated_at
      }
    });

  } catch (error) {
    console.error('Get system setting error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get system setting',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PUT /system-settings/:key - Update a specific system setting
// Requires executive role
router.put('/system-settings/:key', requireRole(['executive']), async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Setting value is required'
      });
    }

    // Update the setting
    const result = await query(`
      UPDATE system_settings
      SET setting_value = $1, updated_at = NOW()
      WHERE setting_key = $2
      RETURNING setting_key, setting_value, setting_type, description, updated_at
    `, [JSON.stringify(value), key]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found'
      });
    }

    const setting = result.rows[0];

    console.log(`⚙️ System setting updated: ${key}`, value);

    res.status(200).json({
      success: true,
      message: 'Setting updated successfully',
      data: {
        key: setting.setting_key,
        value: setting.setting_value,
        type: setting.setting_type,
        description: setting.description,
        updatedAt: setting.updated_at
      }
    });

  } catch (error) {
    console.error('Update system setting error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update system setting',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /system-settings - Get all system settings (optional, for admin overview)
router.get('/system-settings', async (req, res) => {
  try {
    const result = await query(`
      SELECT setting_key, setting_value, setting_type, description, updated_at
      FROM system_settings
      ORDER BY setting_type, setting_key
    `);

    const settings = result.rows.map(row => ({
      key: row.setting_key,
      value: row.setting_value,
      type: row.setting_type,
      description: row.description,
      updatedAt: row.updated_at
    }));

    res.status(200).json({
      success: true,
      data: {
        settings
      }
    });

  } catch (error) {
    console.error('Get all system settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get system settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;