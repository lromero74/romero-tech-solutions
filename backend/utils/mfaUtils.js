import crypto from 'crypto';
import { query } from '../config/database.js';
import { emailService } from '../services/emailService.js';
import { smsService } from '../services/smsService.js';
import twilioSmsService from '../services/twilioSmsService.js';

/**
 * MFA (Multi-Factor Authentication) Utilities
 * Reusable MFA-related utility functions extracted from auth routes
 */

/**
 * Generate a 6-digit MFA code
 * @returns {string} 6-digit MFA code
 */
export function generateMfaCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Generate a secure reset token
 * @returns {string} 32-byte hex token
 */
export function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Store MFA code for admin login
 * @param {string} userId - The user ID
 * @param {string} email - The user's email
 * @param {string} mfaCode - The generated MFA code
 * @param {string} userType - The user type (admin, employee, client)
 * @param {number} expirationMinutes - Minutes until expiration (default: 5)
 * @returns {Promise<void>}
 */
export async function storeMfaCode(userId, email, mfaCode, userType = 'admin', expirationMinutes = 5) {
  try {
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

    await query(`
      INSERT INTO admin_login_mfa (user_id, email, mfa_code, user_type, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email)
      DO UPDATE SET
        mfa_code = $3,
        user_type = $4,
        expires_at = $5,
        used = FALSE,
        created_at = CURRENT_TIMESTAMP
    `, [userId, email, mfaCode, userType, expiresAt]);
  } catch (error) {
    console.error('Error storing MFA code:', error);
    throw new Error('Failed to store MFA code');
  }
}

/**
 * Validate MFA code for admin login
 * @param {string} email - The user's email
 * @param {string} mfaCode - The MFA code to validate
 * @returns {Promise<Object|null>} MFA data if valid, null if invalid
 */
export async function validateMfaCode(email, mfaCode) {
  try {
    // Find and validate the MFA code
    const mfaResult = await query(`
      SELECT user_id, expires_at, used
      FROM admin_login_mfa
      WHERE email = $1 AND mfa_code = $2
    `, [email, mfaCode]);

    if (mfaResult.rows.length === 0) {
      return null; // Invalid code
    }

    const mfaData = mfaResult.rows[0];

    // Check if already used
    if (mfaData.used) {
      return { error: 'Verification code has already been used' };
    }

    // Check if expired
    if (new Date() > new Date(mfaData.expires_at)) {
      return { error: 'Verification code has expired. Please request a new one.' };
    }

    return mfaData;
  } catch (error) {
    console.error('Error validating MFA code:', error);
    throw new Error('Failed to validate MFA code');
  }
}

/**
 * Mark MFA code as used
 * @param {string} email - The user's email
 * @param {string} mfaCode - The MFA code to mark as used
 * @returns {Promise<void>}
 */
export async function markMfaCodeAsUsed(email, mfaCode) {
  try {
    await query(`
      UPDATE admin_login_mfa
      SET used = TRUE
      WHERE email = $1 AND mfa_code = $2
    `, [email, mfaCode]);
  } catch (error) {
    console.error('Error marking MFA code as used:', error);
    throw new Error('Failed to mark MFA code as used');
  }
}

/**
 * Send MFA verification email to user (client or admin)
 * @param {string} email - User email address
 * @param {string} firstName - User first name
 * @param {string} mfaCode - The MFA code to send
 * @param {string} language - User's preferred language ('en' or 'es')
 * @param {string} userType - Type of user ('client' or 'admin')
 * @returns {Promise<void>}
 */
export async function sendMfaEmail(email, firstName, mfaCode, language = 'en', userType = 'admin') {
  try {
    if (userType === 'client') {
      // Use client-specific email template with language support
      await emailService.sendClientMfaEmail(email, firstName, mfaCode, 'login', language);
      console.log(`🔐 Client login MFA code sent to ${email}: ${mfaCode} (language: ${language})`);
    } else {
      // Use admin email template (admin users always use English for now)
      await emailService.sendAdminLoginMfaEmail(email, firstName || 'Admin', mfaCode);
      console.log(`🔐 Admin login MFA code sent to ${email}: ${mfaCode}`);
    }
  } catch (error) {
    console.error('Failed to send MFA email:', error);
    throw new Error('Failed to send verification code. Please try again.');
  }
}

/**
 * Check if MFA code has expired
 * @param {Date} expiresAt - The expiration timestamp
 * @returns {boolean} True if expired
 */
export function checkMfaExpiration(expiresAt) {
  return new Date() > new Date(expiresAt);
}

/**
 * Store password reset token
 * @param {string} userId - The user ID
 * @param {string} userType - The user type ('employee' or 'client')
 * @param {string} email - The user's email
 * @param {string} resetToken - The reset token
 * @param {string} resetCode - The reset code
 * @param {number} expirationMinutes - Minutes until expiration (default: 15)
 * @returns {Promise<void>}
 */
export async function storePasswordResetToken(userId, userType, email, resetToken, resetCode, expirationMinutes = 15) {
  try {
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

    // Create or update password reset token table (drop and recreate to fix schema)
    await query(`
      DROP TABLE IF EXISTS password_reset_tokens;
      CREATE TABLE password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        user_type VARCHAR(20) NOT NULL,
        email VARCHAR(255) NOT NULL,
        reset_token VARCHAR(255) NOT NULL,
        reset_code VARCHAR(10) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(email)
      )
    `);

    // Insert or update the reset token (upsert)
    await query(`
      INSERT INTO password_reset_tokens (user_id, user_type, email, reset_token, reset_code, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email)
      DO UPDATE SET
        reset_token = $4,
        reset_code = $5,
        expires_at = $6,
        used = FALSE,
        created_at = CURRENT_TIMESTAMP
    `, [userId, userType, email, resetToken, resetCode, expiresAt]);
  } catch (error) {
    console.error('Error storing password reset token:', error);
    throw new Error('Failed to store password reset token');
  }
}

/**
 * Validate password reset token
 * @param {string} email - The user's email
 * @param {string} resetCode - The reset code to validate
 * @returns {Promise<Object|null>} Token data if valid, null if invalid
 */
export async function validatePasswordResetToken(email, resetCode) {
  try {
    // Find and validate the reset token
    const tokenResult = await query(`
      SELECT user_id, user_type, expires_at, used
      FROM password_reset_tokens
      WHERE email = $1 AND reset_code = $2
    `, [email, resetCode]);

    if (tokenResult.rows.length === 0) {
      return { error: 'Invalid or expired reset code' };
    }

    const tokenData = tokenResult.rows[0];

    // Check if token is expired
    if (new Date() > new Date(tokenData.expires_at)) {
      return { error: 'Reset code has expired. Please request a new one.' };
    }

    // Check if token has already been used
    if (tokenData.used) {
      return { error: 'Reset code has already been used' };
    }

    return tokenData;
  } catch (error) {
    console.error('Error validating password reset token:', error);
    throw new Error('Failed to validate password reset token');
  }
}

/**
 * Mark password reset token as used
 * @param {string} email - The user's email
 * @param {string} resetCode - The reset code to mark as used
 * @returns {Promise<void>}
 */
export async function markResetTokenAsUsed(email, resetCode) {
  try {
    await query(`
      UPDATE password_reset_tokens
      SET used = TRUE
      WHERE email = $1 AND reset_code = $2
    `, [email, resetCode]);
  } catch (error) {
    console.error('Error marking reset token as used:', error);
    throw new Error('Failed to mark reset token as used');
  }
}

/**
 * Send password reset email
 * @param {string} email - The user's email
 * @param {string} firstName - The user's first name
 * @param {string} resetCode - The reset code to send
 * @returns {Promise<void>}
 */
export async function sendPasswordResetEmail(email, firstName, resetCode) {
  try {
    await emailService.sendPasswordResetEmail(email, firstName || 'User', resetCode);
    console.log(`🔐 Password reset code sent to ${email}: ${resetCode}`);
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    // Don't throw here - we continue anyway as we've created the token
  }
}

/**
 * CLIENT MFA FUNCTIONS
 * Functions for client Multi-Factor Authentication
 */

/**
 * Store MFA code for client login/setup
 * @param {string} userId - The client user ID
 * @param {string} code - The generated MFA code
 * @param {Date} expiresAt - The expiration timestamp
 * @param {string} codeType - Type of MFA code (client_mfa_setup, client_mfa_login)
 * @returns {Promise<void>}
 */
export async function storeClientMfaCode(userId, code, expiresAt, codeType = 'client_mfa_setup') {
  try {
    // First, clean up any existing codes for this user and type
    await query(`
      DELETE FROM mfa_verification_codes
      WHERE user_id = $1 AND code_type = $2
    `, [userId, codeType]);

    // Store the new code
    await query(`
      INSERT INTO mfa_verification_codes (user_id, code, expires_at, code_type, created_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    `, [userId, code, expiresAt, codeType]);
  } catch (error) {
    console.error('Error storing client MFA code:', error);
    throw new Error('Failed to store MFA code');
  }
}

/**
 * Get MFA validation error translations from database
 * @param {string} language - Language code ('en' or 'es')
 * @returns {Promise<Object>} Translations object
 */
async function getMfaValidationTranslations(language = 'en') {
  try {
    const result = await query(`
      SELECT tk.key_path, t.value
      FROM t_translation_keys tk
      JOIN t_translations t ON tk.id = t.key_id
      JOIN t_languages l ON t.language_id = l.id
      WHERE l.code = $1 AND tk.key_path LIKE 'mfa.validation.%'
    `, [language]);

    const translations = {};
    result.rows.forEach(row => {
      translations[row.key_path] = row.value;
    });

    // Return translations or fallback to English
    return {
      invalid: translations['mfa.validation.invalid'] || 'Invalid verification code. Please check the code and try again.',
      used: translations['mfa.validation.used'] || 'This verification code has already been used. Please request a new code.',
      expired: translations['mfa.validation.expired'] || 'Verification code has expired. Please request a new code.'
    };
  } catch (error) {
    console.error('Failed to fetch MFA validation translations:', error);
    // Fallback to hardcoded English
    return {
      invalid: 'Invalid verification code. Please check the code and try again.',
      used: 'This verification code has already been used. Please request a new code.',
      expired: 'Verification code has expired. Please request a new code.'
    };
  }
}

/**
 * Validate MFA code for client authentication
 * @param {string} userId - The client user ID
 * @param {string} code - The MFA code to validate
 * @param {string} codeType - Type of MFA code
 * @param {string} language - User's language preference ('en' or 'es')
 * @returns {Promise<Object>} Object with valid flag and message
 */
export async function validateClientMfaCode(userId, code, codeType = 'client_mfa_setup', language = 'en') {
  try {
    const result = await query(`
      SELECT id, code, expires_at, used_at
      FROM mfa_verification_codes
      WHERE user_id = $1 AND code_type = $2 AND code = $3
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId, codeType, code]);

    // Get translated error messages
    const messages = await getMfaValidationTranslations(language);

    if (result.rows.length === 0) {
      return {
        valid: false,
        message: messages.invalid
      };
    }

    const storedCode = result.rows[0];

    // Check if code has already been used
    if (storedCode.used_at) {
      return {
        valid: false,
        message: messages.used
      };
    }

    // Check if code has expired
    if (new Date() > new Date(storedCode.expires_at)) {
      return {
        valid: false,
        message: messages.expired
      };
    }

    return { valid: true }; // Code is valid
  } catch (error) {
    console.error('Error validating client MFA code:', error);
    throw new Error('Failed to validate MFA code');
  }
}

/**
 * Mark client MFA code as used
 * @param {string} userId - The client user ID
 * @param {string} codeType - Type of MFA code
 * @returns {Promise<void>}
 */
export async function markClientMfaCodeAsUsed(userId, codeType = 'client_mfa_setup') {
  try {
    await query(`
      UPDATE mfa_verification_codes
      SET used_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND code_type = $2 AND used_at IS NULL
    `, [userId, codeType]);
  } catch (error) {
    console.error('Error marking client MFA code as used:', error);
    throw new Error('Failed to mark MFA code as used');
  }
}

/**
 * Send client MFA email with professional styling
 * @param {string} email - The client's email
 * @param {string} firstName - The client's first name
 * @param {string} mfaCode - The MFA code to send
 * @param {string} codeType - Type of MFA code (setup or login)
 * @returns {Promise<void>}
 */
export async function sendClientMfaEmail(email, firstName, mfaCode, codeType = 'setup', language = 'en') {
  try {
    await emailService.sendClientMfaEmail(email, firstName || 'Valued Client', mfaCode, codeType, language);
    console.log(`🔐 Client MFA ${codeType} code sent to ${email}: ${mfaCode} (language: ${language})`);
  } catch (error) {
    console.error('Failed to send client MFA email:', error);
    throw new Error('Failed to send verification code. Please try again.');
  }
}

/**
 * Generate backup codes for client MFA
 * @returns {string[]} Array of 10 backup codes
 */
export function generateClientBackupCodes() {
  return Array.from({ length: 10 }, () =>
    Math.random().toString(36).substring(2, 10).toUpperCase()
  );
}

/**
 * SMS MFA FUNCTIONS
 * Enhanced MFA functions with SMS support via Twilio
 */

/**
 * Send MFA code via SMS using Twilio
 * @param {string} phoneNumber - User phone number
 * @param {string} firstName - User first name
 * @param {string} mfaCode - The MFA code to send
 * @param {string} language - User's preferred language ('en' or 'es')
 * @param {string} userType - Type of user ('client' or 'admin')
 * @returns {Promise<void>}
 */
export async function sendMfaSMS(phoneNumber, firstName, mfaCode, language = 'en', userType = 'admin') {
  try {
    console.log(`🚀 sendMfaSMS called via Twilio:`);
    console.log(`  📱 Phone: ${phoneNumber}`);
    console.log(`  👤 Name: ${firstName}`);
    console.log(`  🔑 Code: ${mfaCode}`);
    console.log(`  🌐 Language: ${language}`);
    console.log(`  👔 User Type: ${userType}`);

    // Use Twilio for both client and admin SMS (supports all languages)
    await twilioSmsService.sendMfaCode(phoneNumber, firstName || 'User', mfaCode, language);

    if (userType === 'client') {
      console.log(`📱 Client login MFA code sent via Twilio to ${phoneNumber}: ${mfaCode} (language: ${language})`);
    } else {
      console.log(`📱 Admin login MFA code sent via Twilio to ${phoneNumber}: ${mfaCode}`);
    }
  } catch (error) {
    console.error('Failed to send MFA SMS via Twilio:', error);
    throw new Error('Failed to send SMS verification code. Please try again.');
  }
}

/**
 * Send verification code via both email and SMS (universal MFA function)
 * @param {Object} options - MFA delivery options
 * @param {string} options.email - User email address
 * @param {string} options.phoneNumber - User phone number (optional)
 * @param {string} options.firstName - User first name
 * @param {string} options.mfaCode - The MFA code to send
 * @param {string} options.language - User's preferred language ('en' or 'es')
 * @param {string} options.userType - Type of user ('client' or 'admin')
 * @param {string} options.deliveryMethod - Delivery method ('email', 'sms', or 'both')
 * @param {string} options.codeType - Type of MFA code (setup or login)
 * @returns {Promise<Object>} Delivery status result
 */
export async function sendMfaCode(options) {
  const {
    email,
    phoneNumber,
    firstName,
    mfaCode,
    language = 'en',
    userType = 'admin',
    deliveryMethod = 'email',
    codeType = 'login'
  } = options;

  const result = {
    email: { sent: false, error: null },
    sms: { sent: false, error: null },
    success: false
  };

  try {
    // Send via email if requested
    if (deliveryMethod === 'email' || deliveryMethod === 'both') {
      try {
        await sendMfaEmail(email, firstName, mfaCode, language, userType);
        result.email.sent = true;
        console.log(`✅ MFA email sent successfully to ${email}`);
      } catch (error) {
        result.email.error = error.message;
        console.error(`❌ MFA email failed for ${email}:`, error.message);
      }
    }

    // Send via SMS if requested and phone number provided
    if ((deliveryMethod === 'sms' || deliveryMethod === 'both') && phoneNumber) {
      try {
        await sendMfaSMS(phoneNumber, firstName, mfaCode, language, userType);
        result.sms.sent = true;
        console.log(`✅ MFA SMS sent successfully to ${phoneNumber}`);
      } catch (error) {
        result.sms.error = error.message;
        console.error(`❌ MFA SMS failed for ${phoneNumber}:`, error.message);
      }
    }

    // Determine overall success
    if (deliveryMethod === 'email') {
      result.success = result.email.sent;
    } else if (deliveryMethod === 'sms') {
      result.success = result.sms.sent;
    } else if (deliveryMethod === 'both') {
      result.success = result.email.sent || result.sms.sent; // At least one must succeed
    }

    return result;

  } catch (error) {
    console.error('Error in sendMfaCode:', error);
    throw new Error('Failed to send verification code via any method');
  }
}

/**
 * Validate phone number for SMS MFA
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} True if valid phone number format
 */
export function validatePhoneNumberForMFA(phoneNumber) {
  if (!phoneNumber) return false;
  return smsService.validatePhoneNumber(phoneNumber);
}

/**
 * Get SMS statistics for rate limiting monitoring
 * @param {string} phoneNumber - Phone number to check
 * @returns {Object} SMS statistics (hourly/daily usage)
 */
export function getSMSStats(phoneNumber) {
  return smsService.getSMSStats(phoneNumber);
}

/**
 * Send phone verification code via SMS
 * @param {string} phoneNumber - Phone number to verify
 * @param {string} firstName - User first name
 * @param {string} verificationCode - Verification code
 * @param {string} language - User's preferred language
 * @returns {Promise<void>}
 */
export async function sendPhoneVerificationSMS(phoneNumber, firstName, verificationCode, language = 'en') {
  try {
    await smsService.sendPhoneVerification(phoneNumber, firstName, verificationCode, language);
    console.log(`📱 Phone verification code sent to ${phoneNumber}: ${verificationCode} (language: ${language})`);
  } catch (error) {
    console.error('Failed to send phone verification SMS:', error);
    throw new Error('Failed to send phone verification code. Please try again.');
  }
}

/**
 * Clean up expired MFA codes (maintenance function)
 * @returns {Promise<number>} Number of expired codes cleaned up
 */
export async function cleanupExpiredMfaCodes() {
  try {
    const result = await query(`
      DELETE FROM mfa_verification_codes
      WHERE expires_at < CURRENT_TIMESTAMP
    `);
    return result.rowCount;
  } catch (error) {
    console.error('Error cleaning up expired MFA codes:', error);
    return 0;
  }
}