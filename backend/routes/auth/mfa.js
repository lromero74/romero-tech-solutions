import express from 'express';
import { query } from '../../config/database.js';
import { sessionService } from '../../services/sessionService.js';
import {
  validateEmail,
  validateMfaCode as validateMfaCodeFormat,
  generateMfaCode
} from '../../utils/inputValidation.js';
import {
  storeMfaCode,
  validateMfaCode,
  markMfaCodeAsUsed,
  sendMfaEmail,
  sendMfaCode,
  validatePhoneNumberForMFA,
  getSMSStats,
  sendPhoneVerificationSMS
} from '../../utils/mfaUtils.js';
import { mfaVerifyLimiter } from '../../middleware/mfaVerifyRateLimiter.js';

export const mfaVerifyRouter = express.Router();

// POST /api/auth/verify-admin-mfa - Verify MFA code and complete admin login
mfaVerifyRouter.post('/verify-admin-mfa', mfaVerifyLimiter, async (req, res) => {
  try {
    const { email, mfaCode } = req.body;

    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: emailValidation.error || 'Invalid email'
      });
    }

    // Validate MFA code format
    const mfaValidation = validateMfaCodeFormat(mfaCode);
    if (!mfaValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: mfaValidation.error || 'Invalid MFA code'
      });
    }

    const sanitizedEmail = emailValidation.sanitized;
    const sanitizedMfaCode = mfaValidation.sanitized;

    // Validate MFA code against database
    const mfaData = await validateMfaCode(sanitizedEmail, sanitizedMfaCode);

    if (!mfaData) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    if (mfaData.error) {
      return res.status(400).json({
        success: false,
        message: mfaData.error
      });
    }

    // Mark MFA code as used
    await markMfaCodeAsUsed(sanitizedEmail, sanitizedMfaCode);

    // Get user data with roles
    const userResult = await query(`
      SELECT e.id, e.email, e.first_name, e.last_name, e.email_verified,
             es.status_name as employee_status,
             COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) as roles,
             CASE
               WHEN 'executive' = ANY(array_agg(r.name)) THEN 'executive'
               WHEN 'admin' = ANY(array_agg(r.name)) THEN 'admin'
               WHEN 'technician' = ANY(array_agg(r.name)) THEN 'technician'
               WHEN 'sales' = ANY(array_agg(r.name)) THEN 'sales'
               ELSE 'employee'
             END as role,
             e.time_format_preference
      FROM employees e
      LEFT JOIN employee_roles er ON e.id = er.employee_id
      LEFT JOIN roles r ON er.role_id = r.id AND r.is_active = true
      LEFT JOIN employee_employment_statuses es ON e.employee_status_id = es.id
      WHERE e.id = $1
      GROUP BY e.id, e.email, e.first_name, e.last_name, e.email_verified, es.status_name, e.time_format_preference
    `, [mfaData.user_id]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // SECURITY: Invalidate all existing sessions before creating new one (session regeneration after MFA)
    await query(`
      UPDATE user_sessions
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND is_active = true
    `, [user.id]);
    console.log(`🔒 Invalidated all existing sessions for user ${user.email} after MFA verification`);

    // Create a new session for the user
    const userAgent = req.get('User-Agent');
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress ||
                     (req.connection.socket ? req.connection.socket.remoteAddress : null);

    const session = await sessionService.createSession(
      user.id,
      user.email,
      userAgent,
      ipAddress
    );

    // Return successful login response with session
    const userData = {
      id: user.id,
      email: user.email,
      role: user.role || 'admin',
      name: `${user.first_name} ${user.last_name}`.trim() || user.email,
      businessName: null,
      timeFormatPreference: user.time_format_preference || '12h',
      isFirstAdmin: true
    };

    // Get session timeout from database (or fallback to config)
    const sessionTimeoutMs = await sessionService.getSessionTimeoutMs();

    // Set HttpOnly session cookie for enhanced security
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: sessionTimeoutMs, // Use database timeout setting
      path: '/'
    };

    res.cookie('sessionToken', session.sessionToken, cookieOptions);

    console.log(`✅ Admin login successful with MFA for: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: userData,
      session: {
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt
      }
    });

  } catch (error) {
    console.error('Admin MFA verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/verify-client-mfa - Verify MFA code and complete client login
mfaVerifyRouter.post('/verify-client-mfa', mfaVerifyLimiter, async (req, res) => {
  try {
    const { email, mfaCode } = req.body;

    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: emailValidation.error || 'Invalid email'
      });
    }

    // Validate MFA code format
    const mfaValidation = validateMfaCodeFormat(mfaCode);
    if (!mfaValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: mfaValidation.error || 'Invalid MFA code'
      });
    }

    const sanitizedEmail = emailValidation.sanitized;
    const sanitizedMfaCode = mfaValidation.sanitized;

    // Validate MFA code against database
    const mfaData = await validateMfaCode(sanitizedEmail, sanitizedMfaCode);
    if (!mfaData) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }
    if (mfaData.error) {
      return res.status(400).json({
        success: false,
        message: mfaData.error
      });
    }

    // Mark MFA code as used
    await markMfaCodeAsUsed(sanitizedEmail, sanitizedMfaCode);

    // Get client user data
    const userResult = await query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.email_verified,
             b.business_name, 'client' as user_type, u.time_format_preference,
             u.is_trial, u.subscription_expires_at, u.business_id
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      WHERE u.id = $1
    `, [mfaData.user_id]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // SECURITY: Invalidate all existing sessions before creating new one (session regeneration after MFA)
    await query(`
      UPDATE user_sessions
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND is_active = true
    `, [user.id]);
    console.log(`🔒 Invalidated all existing sessions for user ${user.email} after MFA verification`);

    // Create a new session for the client
    const userAgent = req.get('User-Agent');
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress ||
                     (req.connection.socket ? req.connection.socket.remoteAddress : null);

    const session = await sessionService.createSession(
      user.id,
      user.email,
      userAgent,
      ipAddress
    );

    // Get session timeout from database (or fallback to config)
    const sessionTimeoutMs = await sessionService.getSessionTimeoutMs();

    // Set HttpOnly session cookie for enhanced security
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: sessionTimeoutMs, // Use database timeout setting
      path: '/'
    };

    res.cookie('sessionToken', session.sessionToken, cookieOptions);

    // Return successful login response with session
    const userData = {
      id: user.id,
      email: user.email,
      role: user.role || 'client',
      name: `${user.first_name} ${user.last_name}`.trim() || user.email,
      businessName: user.business_name,
      businessId: user.business_id,
      timeFormatPreference: user.time_format_preference || '12h',
      isTrial: user.is_trial || false,
      trialExpiresAt: user.subscription_expires_at,
      isFirstAdmin: false
    };

    console.log(`✅ Client login successful with MFA for: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: userData,
      session: {
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt
      }
    });

  } catch (error) {
    console.error('Client MFA verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

const router = express.Router();

// Resend MFA code for client login
router.post('/resend-client-mfa', mfaVerifyLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find client user with MFA enabled
    const clientResult = await query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.mfa_enabled, u.mfa_email, u.is_test_account
      FROM users u
      WHERE u.email = $1 AND u.mfa_enabled = true
    `, [email]);

    if (clientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client with MFA enabled not found'
      });
    }

    const user = clientResult.rows[0];

    // Generate and store new MFA code
    const mfaCode = generateMfaCode();
    await storeMfaCode(user.id, user.email, mfaCode);

    // Get user's language preference for email
    const languageResult = await query(`
      SELECT language_preference FROM users WHERE email = $1
    `, [user.email]);
    const userLanguage = languageResult.rows[0]?.language_preference || 'en';

    let message = 'MFA code resent successfully';

    // Skip sending email for test accounts
    if (user.is_test_account) {
      console.log(`🧪 TEST ACCOUNT: Skipping MFA email resend for client ${user.email}. Code: ${mfaCode}`);
      message = `Test account - MFA code: ${mfaCode}`;
    } else {
      // Send MFA email with user's preferred language
      await sendMfaEmail(user.email, user.first_name, mfaCode, userLanguage, 'client');
      console.log(`🔐 Client MFA code resent to ${user.email}: ${userLanguage}`);
    }

    res.status(200).json({
      success: true,
      message
    });

  } catch (error) {
    console.error('Error resending client MFA code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend MFA code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// SMS MFA Endpoints - Enhanced MFA with SMS support via AWS SNS

// POST /api/auth/verify-phone - Verify phone number for SMS MFA
router.post('/verify-phone', async (req, res) => {
  try {
    const { userId, phoneNumber } = req.body;

    if (!userId || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'User ID and phone number are required'
      });
    }

    // Validate phone number format
    if (!validatePhoneNumberForMFA(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Please use international format (e.g., +1234567890)'
      });
    }

    // Check SMS rate limits for this phone number
    const smsStats = getSMSStats(phoneNumber);
    if (smsStats.hourly.remaining <= 0) {
      return res.status(429).json({
        success: false,
        message: 'SMS hourly limit exceeded. Please try again later.'
      });
    }

    // Find user to get their name and language preference
    const userResult = await query(`
      SELECT first_name, language_preference FROM users WHERE id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];
    const userLanguage = user.language_preference || 'en';

    // Generate verification code
    const verificationCode = generateMfaCode();

    // Store verification code in session/temporary storage (10 minute expiry)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await query(`
      INSERT INTO mfa_verification_codes (user_id, code, expires_at, code_type, phone_number)
      VALUES ($1, $2, $3, 'phone_verification', $4)
      ON CONFLICT (user_id, code_type)
      DO UPDATE SET code = $2, expires_at = $3, phone_number = $4, used_at = NULL
    `, [userId, verificationCode, expiresAt, phoneNumber]);

    // Send SMS verification code
    await sendPhoneVerificationSMS(phoneNumber, user.first_name, verificationCode, userLanguage);

    console.log(`📱 Phone verification code sent to ${phoneNumber} for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Verification code sent to your phone',
      smsStats: smsStats
    });

  } catch (error) {
    console.error('Error in phone verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/confirm-phone - Confirm phone verification
router.post('/confirm-phone', async (req, res) => {
  try {
    const { userId, phoneNumber, verificationCode } = req.body;

    if (!userId || !phoneNumber || !verificationCode) {
      return res.status(400).json({
        success: false,
        message: 'User ID, phone number, and verification code are required'
      });
    }

    // Find and validate verification code
    const codeResult = await query(`
      SELECT id, code, expires_at, used_at, phone_number
      FROM mfa_verification_codes
      WHERE user_id = $1 AND code_type = 'phone_verification' AND code = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId, verificationCode]);

    if (codeResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    const storedCode = codeResult.rows[0];

    // Check if code has been used
    if (storedCode.used_at) {
      return res.status(400).json({
        success: false,
        message: 'Verification code has already been used'
      });
    }

    // Check if code has expired
    if (new Date() > new Date(storedCode.expires_at)) {
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired'
      });
    }

    // Check if phone number matches
    if (storedCode.phone_number !== phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number mismatch'
      });
    }

    // Mark code as used
    await query(`
      UPDATE mfa_verification_codes
      SET used_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [storedCode.id]);

    // Update user's phone number and mark as verified
    await query(`
      UPDATE users
      SET phone_number = $1, phone_verified = true
      WHERE id = $2
    `, [phoneNumber, userId]);

    console.log(`✅ Phone number ${phoneNumber} verified for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Phone number verified successfully'
    });

  } catch (error) {
    console.error('Error confirming phone verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify phone number',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/update-mfa-method - Update user's MFA delivery method
router.post('/update-mfa-method', async (req, res) => {
  try {
    const { userId, mfaMethod } = req.body;

    if (!userId || !mfaMethod) {
      return res.status(400).json({
        success: false,
        message: 'User ID and MFA method are required'
      });
    }

    // Validate MFA method
    const validMethods = ['email', 'sms', 'both'];
    if (!validMethods.includes(mfaMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid MFA method. Must be email, sms, or both'
      });
    }

    // If SMS is requested, check if phone is verified
    if (mfaMethod === 'sms' || mfaMethod === 'both') {
      const userResult = await query(`
        SELECT phone_number, phone_verified FROM users WHERE id = $1
      `, [userId]);

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const user = userResult.rows[0];
      if (!user.phone_number || !user.phone_verified) {
        return res.status(400).json({
          success: false,
          message: 'Phone number must be verified before enabling SMS MFA'
        });
      }
    }

    // Update user's MFA method
    await query(`
      UPDATE users
      SET mfa_method = $1
      WHERE id = $2
    `, [mfaMethod, userId]);

    console.log(`🔧 MFA method updated to '${mfaMethod}' for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'MFA method updated successfully',
      mfaMethod: mfaMethod
    });

  } catch (error) {
    console.error('Error updating MFA method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update MFA method',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/send-mfa-code - Send MFA code via selected method(s)
router.post('/send-mfa-code', mfaVerifyLimiter, async (req, res) => {
  try {
    const { userId, deliveryMethod } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Get user details
    const userResult = await query(`
      SELECT email, phone_number, phone_verified, first_name, language_preference, mfa_method
      FROM users
      WHERE id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];
    const userLanguage = user.language_preference || 'en';
    const requestedMethod = deliveryMethod || user.mfa_method || 'email';

    // Validate delivery method based on user's verified contact methods
    if (requestedMethod === 'sms' || requestedMethod === 'both') {
      if (!user.phone_number || !user.phone_verified) {
        return res.status(400).json({
          success: false,
          message: 'SMS delivery not available - phone number not verified'
        });
      }

      // Check SMS rate limits
      const smsStats = getSMSStats(user.phone_number);
      if (smsStats.hourly.remaining <= 0) {
        return res.status(429).json({
          success: false,
          message: 'SMS hourly limit exceeded. Try email delivery or wait before trying again.'
        });
      }
    }

    // Generate MFA code
    const mfaCode = generateMfaCode();

    // Store MFA code
    await storeMfaCode(userId, user.email, mfaCode);

    // Send MFA code via requested method(s)
    const deliveryResult = await sendMfaCode({
      email: user.email,
      phoneNumber: user.phone_number,
      firstName: user.first_name,
      mfaCode: mfaCode,
      language: userLanguage,
      userType: 'client',
      deliveryMethod: requestedMethod,
      codeType: 'login'
    });

    // Prepare response based on delivery results
    let message = 'MFA code sent successfully';
    let deliveryDetails = {};

    if (requestedMethod === 'email') {
      message = deliveryResult.email.sent ? 'MFA code sent to your email' : 'Failed to send email';
      deliveryDetails.email = deliveryResult.email.sent;
    } else if (requestedMethod === 'sms') {
      message = deliveryResult.sms.sent ? 'MFA code sent to your phone' : 'Failed to send SMS';
      deliveryDetails.sms = deliveryResult.sms.sent;
    } else if (requestedMethod === 'both') {
      const emailSent = deliveryResult.email.sent;
      const smsSent = deliveryResult.sms.sent;

      if (emailSent && smsSent) {
        message = 'MFA code sent to both email and phone';
      } else if (emailSent) {
        message = 'MFA code sent to email (SMS failed)';
      } else if (smsSent) {
        message = 'MFA code sent to phone (email failed)';
      } else {
        message = 'Failed to send MFA code via any method';
      }

      deliveryDetails = { email: emailSent, sms: smsSent };
    }

    if (!deliveryResult.success) {
      return res.status(500).json({
        success: false,
        message: message,
        deliveryDetails: deliveryDetails
      });
    }

    console.log(`🔐 MFA code sent via ${requestedMethod} for user ${userId}`);

    res.status(200).json({
      success: true,
      message: message,
      deliveryMethod: requestedMethod,
      deliveryDetails: deliveryDetails
    });

  } catch (error) {
    console.error('Error sending MFA code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send MFA code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/auth/sms-stats/:phoneNumber - Get SMS usage statistics
router.get('/sms-stats/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Validate phone number format
    if (!validatePhoneNumberForMFA(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }

    const stats = getSMSStats(phoneNumber);

    res.status(200).json({
      success: true,
      stats: stats
    });

  } catch (error) {
    console.error('Error getting SMS stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get SMS statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
