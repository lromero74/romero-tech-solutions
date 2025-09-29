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
    const clientId = req.user.clientId;

    const result = await pool.query(`
      SELECT
        first_name as "firstName",
        last_name as "lastName",
        email,
        phone
      FROM users
      WHERE id = $1 AND role = 'client' AND soft_delete = false
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
    const clientId = req.user.clientId;
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
      SELECT id
      FROM users
      WHERE email = $1 AND id != $2 AND soft_delete = false
    `, [email, clientId]);

    if (emailCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email address is already in use'
      });
    }

    // Update client profile
    const result = await pool.query(`
      UPDATE users
      SET
        first_name = $1,
        last_name = $2,
        email = $3,
        phone = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 AND role = 'client' AND soft_delete = false
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
    const clientId = req.user.clientId;
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
      FROM users
      WHERE id = $1 AND role = 'client' AND soft_delete = false
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
      UPDATE users
      SET
        password_hash = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND role = 'client'
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
    const clientId = req.user.clientId;
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
    const clientId = req.user.clientId;
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

// Get client business information
router.get('/business', authenticateClient, async (req, res) => {
  try {
    const pool = await getPool();

    if (!req.user || !req.user.clientId) {
      console.error('❌ Client business error: req.user is', req.user);
      return res.status(400).json({
        success: false,
        message: 'Client context not properly loaded'
      });
    }

    const clientId = req.user.clientId;

    // Get business info with headquarters address from service_locations
    const result = await pool.query(`
      SELECT
        b.id as id,
        b.business_name as name,
        COALESCE(hq.street_address_1, b.primary_street) as street,
        hq.city as city,
        hq.state as state,
        hq.zip_code as "zipCode",
        hq.country as country,
        hq.contact_person as "contactPerson",
        hq.contact_phone as "contactPhone",
        hq.contact_email as "contactEmail"
      FROM users u
      JOIN businesses b ON u.business_id = b.id
      LEFT JOIN service_locations hq ON b.id = hq.business_id AND hq.is_headquarters = true AND hq.soft_delete = false
      WHERE u.id = $1 AND u.role = 'client' AND u.soft_delete = false AND b.soft_delete = false
    `, [clientId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client business information not found'
      });
    }

    const business = result.rows[0];

    // Get accessible service locations for this client
    // Note: This may need adjustment based on how client-location relationships are structured
    const locationsResult = await pool.query(`
      SELECT
        sl.id as id,
        sl.location_name as name,
        sl.street_address_1 as street,
        sl.city,
        sl.state,
        sl.zip_code as "zipCode",
        sl.country,
        sl.contact_person as "contactPerson",
        sl.contact_phone as "contactPhone",
        sl.contact_email as "contactEmail"
      FROM service_locations sl
      JOIN businesses b ON sl.business_id = b.id
      JOIN users u ON u.business_id = b.id
      WHERE u.id = $1 AND u.role = 'client' AND sl.soft_delete = false AND u.soft_delete = false
      ORDER BY sl.location_name
    `, [clientId]);

    res.json({
      success: true,
      data: {
        business: {
          id: business.id,
          name: business.name,
          address: {
            street: business.street,
            city: business.city,
            state: business.state,
            zipCode: business.zipCode,
            country: business.country
          },
          contact: {
            person: business.contactPerson,
            phone: business.contactPhone,
            email: business.contactEmail
          }
        },
        accessibleLocations: locationsResult.rows.map(loc => ({
          id: loc.id,
          name: loc.name,
          address: {
            street: loc.street,
            city: loc.city,
            state: loc.state,
            zipCode: loc.zipCode,
            country: loc.country
          },
          contact: {
            person: loc.contactPerson,
            phone: loc.contactPhone,
            email: loc.contactEmail
          }
        }))
      }
    });

  } catch (error) {
    console.error('Error fetching client business information:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch business information'
    });
  }
});

export default router;