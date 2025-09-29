import express from 'express';
import { sanitizeInputMiddleware } from '../utils/inputValidation.js';
import { signupRateLimiters } from '../middleware/signupRateLimiter.js';
import {
  generateVerificationCode,
  storeEmailVerificationCode,
  validateEmailVerificationCode,
  markEmailVerificationCodeAsUsed,
  sendVerificationEmail
} from '../utils/emailVerificationUtils.js';
import { query } from '../config/database.js';
import { hashPassword, getPasswordComplexityRequirements } from '../utils/passwordUtils.js';

const router = express.Router();

// Apply middleware
router.use(sanitizeInputMiddleware);

/**
 * POST /api/auth/send-verification
 * Send email verification code during registration
 */
router.post('/send-verification', signupRateLimiters, async (req, res) => {
  try {
    const { email, businessName, language = 'en' } = req.body;

    if (!email || !businessName) {
      return res.status(400).json({
        success: false,
        error: 'Email and business name are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Check if email already exists in users table
    const existingUser = await query('SELECT id, first_name, last_name FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists',
        code: 'EMAIL_ALREADY_EXISTS',
        data: {
          existingAccount: true,
          email: email,
          showPasswordRecovery: true,
          message: 'This email address is already registered. Would you like to reset your password instead?'
        }
      });
    }

    // Generate and store verification code
    const verificationCode = generateVerificationCode();

    // Store user data temporarily in verification record
    const userData = {
      businessName,
      language,
      registrationIp: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    };

    await storeEmailVerificationCode(email, verificationCode, 15, userData);

    // Send verification email
    await sendVerificationEmail(email, verificationCode, businessName, language);

    res.json({
      success: true,
      message: 'Verification code sent to your email',
      expiresIn: 15 // minutes
    });

  } catch (error) {
    console.error('❌ Error sending verification email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send verification code'
    });
  }
});

/**
 * POST /api/auth/register-client
 * Complete client registration after email verification
 */
router.post('/register-client', async (req, res) => {
  try {
    const {
      email,
      verificationCode,
      password,
      contactName,
      title,
      phone,
      cellPhone,
      businessName,
      streetAddress1,
      streetAddress2,
      city,
      state,
      zipCode,
      country = 'United States'
    } = req.body;

    // Validate required fields
    if (!email || !verificationCode || !password || !contactName) {
      return res.status(400).json({
        success: false,
        error: 'Email, verification code, password, and contact name are required'
      });
    }

    // Validate verification code
    const verification = await validateEmailVerificationCode(email, verificationCode);
    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        error: verification.message || 'Invalid verification code'
      });
    }

    // Extract business data from verification record
    const userData = verification.userData || {};
    const businessNameFromVerification = userData.businessName;

    // Use business name from form data or fall back to verification data
    const finalBusinessName = businessName || businessNameFromVerification;

    if (!finalBusinessName) {
      return res.status(400).json({
        success: false,
        error: 'Business information not found. Please restart registration.'
      });
    }

    // Validate address fields
    if (!streetAddress1 || !city || !state || !zipCode) {
      return res.status(400).json({
        success: false,
        error: 'Complete address information is required'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Start transaction
    const pool = await import('../config/database.js').then(m => m.getPool());
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Create business record (without primary address fields)
      const businessResult = await client.query(`
        INSERT INTO businesses (
          business_name,
          created_at
        ) VALUES ($1, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        finalBusinessName
      ]);

      const businessId = businessResult.rows[0].id;

      // Parse contactName into first and last name
      const nameParts = contactName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Create user record
      const userResult = await client.query(`
        INSERT INTO users (
          email,
          password_hash,
          first_name,
          last_name,
          title,
          phone,
          cell_phone,
          business_id,
          is_active,
          email_verified,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, true, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        email,
        hashedPassword,
        firstName,
        lastName,
        title || null,
        phone || null,
        cellPhone || null,
        businessId
      ]);

      const userId = userResult.rows[0].id;

      // Create service location for the business address
      await client.query(`
        INSERT INTO service_locations (
          business_id,
          address_label,
          street_address_1,
          street_address_2,
          city,
          state,
          zip_code,
          country,
          contact_person,
          contact_phone,
          contact_email,
          is_headquarters,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, CURRENT_TIMESTAMP)
      `, [
        businessId,
        'Headquarters',
        streetAddress1,
        streetAddress2 || null,
        city,
        state,
        zipCode,
        country,
        contactName,
        phone || null,
        email
      ]);

      // Mark verification code as used
      await markEmailVerificationCodeAsUsed(email);

      await client.query('COMMIT');

      console.log(`✅ New client registered: ${email} for business: ${finalBusinessName}`);

      res.json({
        success: true,
        message: 'Registration completed successfully',
        data: {
          userId,
          businessId,
          email,
          businessName: finalBusinessName,
          redirectTo: '/clogin'
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Error completing client registration:', error);

    // Check for specific error types
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({
        success: false,
        error: 'An account with this email already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again.'
    });
  }
});

/**
 * POST /api/auth/resend-verification
 * Resend verification code
 */
router.post('/resend-verification', signupRateLimiters, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Get existing verification record to retrieve business name
    const result = await query(`
      SELECT user_data, created_at
      FROM email_verifications
      WHERE email = $1 AND used = FALSE
      ORDER BY created_at DESC
      LIMIT 1
    `, [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No pending verification found for this email'
      });
    }

    const userData = JSON.parse(result.rows[0].user_data || '{}');
    const businessName = userData.businessName || 'Your Business';
    const language = userData.language || 'en';

    // Generate new verification code
    const verificationCode = generateVerificationCode();

    // Update verification record with new code
    await storeEmailVerificationCode(email, verificationCode, 15, userData);

    // Send new verification email
    await sendVerificationEmail(email, verificationCode, businessName, language);

    res.json({
      success: true,
      message: 'New verification code sent to your email',
      expiresIn: 15 // minutes
    });

  } catch (error) {
    console.error('❌ Error resending verification email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend verification code'
    });
  }
});

/**
 * GET /api/auth/client-password-requirements
 * Get password requirements for client registration (public endpoint)
 */
router.get('/client-password-requirements', async (req, res) => {
  try {
    const requirements = await getPasswordComplexityRequirements('client');

    res.json({
      success: true,
      requirements: {
        minLength: requirements.minLength,
        maxLength: requirements.maxLength,
        requireUppercase: requirements.requireUppercase,
        requireLowercase: requirements.requireLowercase,
        requireNumbers: requirements.requireNumbers,
        requireSpecialCharacters: requirements.requireSpecialCharacters,
        specialCharacterSet: requirements.specialCharacterSet
      }
    });

  } catch (error) {
    console.error('❌ Error fetching client password requirements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch password requirements'
    });
  }
});

export default router;