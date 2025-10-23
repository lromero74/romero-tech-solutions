/**
 * Client Settings Routes
 *
 * Handles client/user preference management including timezone, display settings, etc.
 */

import express from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { validateTimezone } from '../utils/timezoneHelper.js';

const router = express.Router();

/**
 * Get client timezone preference
 * GET /api/client/timezone
 *
 * Returns the authenticated client's timezone preference
 */
router.get('/timezone', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      'SELECT timezone_preference FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const timezone = result.rows[0].timezone_preference || 'America/Los_Angeles';

    res.json({
      success: true,
      timezone
    });
  } catch (error) {
    console.error('Get client timezone error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get timezone preference',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Set client timezone preference
 * POST /api/client/timezone
 *
 * Body:
 * - timezone: string (IANA timezone format, e.g., 'America/New_York')
 */
router.post('/timezone', authMiddleware, async (req, res) => {
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

    // Update user's timezone preference
    const result = await query(
      'UPDATE users SET timezone_preference = $1, updated_at = NOW() WHERE id = $2 RETURNING timezone_preference',
      [timezone, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Timezone preference updated successfully',
      timezone: result.rows[0].timezone_preference
    });
  } catch (error) {
    console.error('Set client timezone error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update timezone preference',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get all client preferences
 * GET /api/client/preferences
 *
 * Returns all preferences for the authenticated client
 */
router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT
        timezone_preference,
        language_preference
      FROM users
      WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const preferences = {
      timezone: result.rows[0].timezone_preference || 'America/Los_Angeles',
      language: result.rows[0].language_preference || 'en'
    };

    res.json({
      success: true,
      preferences
    });
  } catch (error) {
    console.error('Get client preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get preferences',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
