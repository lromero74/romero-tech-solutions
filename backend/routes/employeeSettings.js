/**
 * Employee Settings Routes
 *
 * Handles employee preference management including timezone, display settings, etc.
 */

import express from 'express';
import { query } from '../config/database.js';
import { authMiddleware, requireEmployee } from '../middleware/authMiddleware.js';
import { validateTimezone } from '../utils/timezoneHelper.js';

const router = express.Router();

/**
 * Get employee timezone preference
 * GET /api/employees/timezone
 *
 * Returns the authenticated employee's timezone preference
 */
router.get('/timezone', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const result = await query(
      'SELECT timezone_preference FROM employees WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    const timezone = result.rows[0].timezone_preference || 'America/Los_Angeles';

    res.json({
      success: true,
      timezone
    });
  } catch (error) {
    console.error('Get employee timezone error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get timezone preference',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Set employee timezone preference
 * POST /api/employees/timezone
 *
 * Body:
 * - timezone: string (IANA timezone format, e.g., 'America/New_York')
 */
router.post('/timezone', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { timezone } = req.body;

    if (!timezone) {
      return res.status(400).json({
        success: false,
        message: 'timezone is required'
      });
    }

    // Validate timezone format
    if (!validateTimezone(timezone)) {
      return res.status(400).json({
        success: false,
        message: `Invalid timezone: ${timezone}. Must be a valid IANA timezone (e.g., 'America/New_York')`
      });
    }

    // Update employee's timezone preference
    const result = await query(
      'UPDATE employees SET timezone_preference = $1, updated_at = NOW() WHERE id = $2 RETURNING timezone_preference',
      [timezone, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    res.json({
      success: true,
      message: 'Timezone preference updated successfully',
      timezone: result.rows[0].timezone_preference
    });
  } catch (error) {
    console.error('Set employee timezone error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update timezone preference',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get all employee preferences
 * GET /api/employees/preferences
 *
 * Returns all preferences for the authenticated employee
 */
router.get('/preferences', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const result = await query(
      `SELECT
        timezone_preference,
        time_format_preference
      FROM employees
      WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    const preferences = {
      timezone: result.rows[0].timezone_preference || 'America/Los_Angeles',
      timeFormat: result.rows[0].time_format_preference || '12h'
    };

    res.json({
      success: true,
      preferences
    });
  } catch (error) {
    console.error('Get employee preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get preferences',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
