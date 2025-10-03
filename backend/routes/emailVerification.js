import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to write registration logs to file
function logRegistrationAttempt(data) {
  const logDir = path.join(__dirname, '..', 'logs');
  const logFile = path.join(logDir, 'registration-attempts.log');

  // Ensure logs directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const logEntry = `\n${'='.repeat(80)}\n${timestamp}\n${JSON.stringify(data, null, 2)}\n${'='.repeat(80)}\n`;

  fs.appendFileSync(logFile, logEntry);
}

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
      isIndividual = false,
      streetAddress1,
      streetAddress2,
      city,
      state,
      zipCode,
      country = 'United States'
    } = req.body;

    // 📊 LOG ALL SUBMITTED DATA (sanitized)
    console.log('='.repeat(80));
    console.log('📝 CLIENT REGISTRATION ATTEMPT');
    console.log('='.repeat(80));
    console.log('Timestamp:', new Date().toISOString());
    console.log('IP Address:', req.ip);
    console.log('User Agent:', req.get('User-Agent'));
    console.log('\n📧 Contact Information:');
    console.log('  Email:', email);
    console.log('  Contact Name:', contactName);
    console.log('  Title:', title || '(not provided)');
    console.log('  Phone:', phone || '(not provided)');
    console.log('  Cell Phone:', cellPhone || '(not provided)');
    console.log('\n🏢 Business Information:');
    console.log('  Business Name:', businessName || '(not provided)');
    console.log('  Is Individual:', isIndividual ? 'YES' : 'NO');
    console.log('\n📍 Address Information:');
    console.log('  Street Address 1:', streetAddress1 || '(not provided)');
    console.log('  Street Address 2:', streetAddress2 || '(not provided)');
    console.log('  City:', city || '(not provided)');
    console.log('  State:', state || '(not provided)');
    console.log('  ZIP Code:', zipCode || '(not provided)');
    console.log('  Country:', country);
    console.log('\n🔐 Verification:');
    console.log('  Verification Code Provided:', verificationCode ? 'YES' : 'NO');
    console.log('  Password Provided:', password ? 'YES (length: ' + password.length + ')' : 'NO');
    console.log('='.repeat(80));

    // 💾 Write to log file for easy access on production server
    logRegistrationAttempt({
      timestamp: new Date().toISOString(),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      email,
      contactName,
      title: title || null,
      phone: phone || null,
      cellPhone: cellPhone || null,
      businessName: businessName || null,
      isIndividual: isIndividual || false,
      streetAddress1: streetAddress1 || null,
      streetAddress2: streetAddress2 || null,
      city: city || null,
      state: state || null,
      zipCode: zipCode || null,
      country,
      hasVerificationCode: !!verificationCode,
      passwordLength: password ? password.length : 0
    });

    // Validate required fields
    if (!email || !verificationCode || !password || !contactName) {
      console.log('❌ Validation failed: Missing required fields');
      logRegistrationAttempt({
        result: 'FAILED',
        reason: 'Missing required fields',
        email
      });
      return res.status(400).json({
        success: false,
        error: 'Email, verification code, password, and contact name are required'
      });
    }

    // Validate verification code
    console.log('🔍 Validating email verification code...');
    const verification = await validateEmailVerificationCode(email, verificationCode);
    if (!verification.valid) {
      console.log('❌ Verification code validation failed:', verification.message);
      return res.status(400).json({
        success: false,
        error: verification.message || 'Invalid verification code'
      });
    }
    console.log('✅ Verification code valid');

    // Extract business data from verification record
    const userData = verification.userData || {};
    const businessNameFromVerification = userData.businessName;

    // Use business name from form data or fall back to verification data
    const finalBusinessName = businessName || businessNameFromVerification;
    console.log('🏢 Final business name:', finalBusinessName);

    if (!finalBusinessName) {
      console.log('❌ Business name missing');
      return res.status(400).json({
        success: false,
        error: 'Business information not found. Please restart registration.'
      });
    }

    // Validate address fields
    console.log('🔍 Validating address fields...');
    if (!streetAddress1 || !city || !state || !zipCode) {
      console.log('❌ Address validation failed:');
      console.log('  streetAddress1:', streetAddress1 ? 'PROVIDED' : 'MISSING');
      console.log('  city:', city ? 'PROVIDED' : 'MISSING');
      console.log('  state:', state ? 'PROVIDED' : 'MISSING');
      console.log('  zipCode:', zipCode ? 'PROVIDED' : 'MISSING');
      return res.status(400).json({
        success: false,
        error: 'Complete address information is required'
      });
    }
    console.log('✅ Address fields valid');

    // Hash password
    console.log('🔐 Hashing password...');
    const hashedPassword = await hashPassword(password);
    console.log('✅ Password hashed');

    // Start transaction
    console.log('💾 Starting database transaction...');
    const pool = await import('../config/database.js').then(m => m.getPool());
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      console.log('✅ Transaction started');

      // Create business record (without primary address fields)
      console.log('🏢 Creating business record:', finalBusinessName, '(Individual:', isIndividual, ')');
      const businessResult = await client.query(`
        INSERT INTO businesses (
          business_name,
          is_individual,
          created_at
        ) VALUES ($1, $2, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        finalBusinessName,
        isIndividual
      ]);

      const businessId = businessResult.rows[0].id;
      console.log('✅ Business created with ID:', businessId);

      // Parse contactName into first and last name
      const nameParts = contactName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      console.log('👤 Creating user:', { firstName, lastName, email });

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
      console.log('✅ User created with ID:', userId);

      // Create service location for the business address
      console.log('📍 Creating service location (Headquarters):', {
        city,
        state,
        zipCode,
        streetAddress1
      });
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
      console.log('✅ Service location created');

      // Mark verification code as used
      console.log('🔐 Marking verification code as used...');
      await markEmailVerificationCodeAsUsed(email);

      await client.query('COMMIT');
      console.log('✅ Transaction committed');

      console.log('='.repeat(80));
      console.log(`✅ NEW CLIENT REGISTRATION SUCCESS`);
      console.log(`   Email: ${email}`);
      console.log(`   Business: ${finalBusinessName}`);
      console.log(`   User ID: ${userId}`);
      console.log(`   Business ID: ${businessId}`);
      console.log('='.repeat(80));

      // Log success to file
      logRegistrationAttempt({
        result: 'SUCCESS',
        email,
        businessName: finalBusinessName,
        userId,
        businessId
      });

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
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      stack: error.stack
    });

    // Log error to file
    logRegistrationAttempt({
      result: 'ERROR',
      email: req.body.email,
      errorMessage: error.message,
      errorCode: error.code,
      errorDetail: error.detail,
      errorConstraint: error.constraint,
      errorStack: error.stack
    });

    // Check for specific error types
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({
        success: false,
        error: 'An account with this email already exists'
      });
    }

    if (error.code === '23502') { // NOT NULL constraint violation
      console.error('NULL constraint violation:', error.column);
      return res.status(400).json({
        success: false,
        error: 'Missing required information. Please ensure all fields are filled out.'
      });
    }

    if (error.code === '23503') { // Foreign key violation
      return res.status(400).json({
        success: false,
        error: 'Invalid business or user reference. Please try again.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again or contact support if the problem persists.'
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