import express from 'express';
import bcrypt from 'bcryptjs';
import { getPool } from '../../config/database.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { clientContextMiddleware } from '../../middleware/clientMiddleware.js';

// Create composite middleware for client routes
const authenticateClient = [authMiddleware, clientContextMiddleware];

const router = express.Router();

// Get client profile information
router.get('/', authenticateClient, async (req, res) => {
  try {
    const pool = await getPool();
    const clientId = req.clientUser.clientId;

    const result = await pool.query(`
      SELECT
        first_name as "firstName",
        last_name as "lastName",
        email,
        phone
      FROM clients
      WHERE client_id = $1 AND soft_delete = false
    `, [clientId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client profile not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching client profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile information'
    });
  }
});

// Update client profile information
router.put('/', authenticateClient, async (req, res) => {
  try {
    const pool = await getPool();
    const clientId = req.clientUser.clientId;
    const { firstName, lastName, email, phone } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, and email are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Check if email is already in use by another client
    const emailCheck = await pool.query(`
      SELECT client_id
      FROM clients
      WHERE email = $1 AND client_id != $2 AND soft_delete = false
    `, [email, clientId]);

    if (emailCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email address is already in use'
      });
    }

    // Update client profile
    const result = await pool.query(`
      UPDATE clients
      SET
        first_name = $1,
        last_name = $2,
        email = $3,
        phone = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE client_id = $5 AND soft_delete = false
      RETURNING first_name as "firstName", last_name as "lastName", email, phone
    `, [firstName, lastName, email, phone, clientId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error updating client profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// Change client password
router.post('/change-password', authenticateClient, async (req, res) => {
  try {
    const pool = await getPool();
    const clientId = req.clientUser.clientId;
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    // Validate new password strength
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters and contain uppercase, lowercase, number, and special character'
      });
    }

    // Get current password hash
    const userResult = await pool.query(`
      SELECT password_hash
      FROM clients
      WHERE client_id = $1 AND soft_delete = false
    `, [clientId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await pool.query(`
      UPDATE clients
      SET
        password_hash = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE client_id = $2
    `, [newPasswordHash, clientId]);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

// Set client language preference
router.post('/language-preference', authenticateClient, async (req, res) => {
  try {
    const pool = await getPool();
    const clientId = req.clientUser.clientId;
    const { language, context = 'client' } = req.body;

    if (!language) {
      return res.status(400).json({
        success: false,
        message: 'Language code is required'
      });
    }

    // Validate language code format
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(language)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid language code format'
      });
    }

    // Use the database function to set preference
    const result = await pool.query(
      'SELECT set_user_language_preference($1, $2, $3) as success',
      [clientId, language, context]
    );

    if (result.rows[0].success) {
      res.json({
        success: true,
        message: 'Language preference saved successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid language code or language not active'
      });
    }

  } catch (error) {
    console.error('Error saving language preference:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save language preference'
    });
  }
});

// Get client language preference
router.get('/language-preference', authenticateClient, async (req, res) => {
  try {
    const pool = await getPool();
    const clientId = req.clientUser.clientId;
    const { context = 'client' } = req.query;

    // Use the database function to get preference
    const result = await pool.query(
      'SELECT get_user_language_preference($1, $2) as language_code',
      [clientId, context]
    );

    res.json({
      success: true,
      data: {
        language: result.rows[0].language_code,
        context
      }
    });

  } catch (error) {
    console.error('Error fetching language preference:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch language preference'
    });
  }
});

export default router;