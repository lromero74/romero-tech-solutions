import crypto from 'crypto';
import { query } from '../config/database.js';
import { emailService } from '../services/emailService.js';

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
 * @param {number} expirationMinutes - Minutes until expiration (default: 5)
 * @returns {Promise<void>}
 */
export async function storeMfaCode(userId, email, mfaCode, expirationMinutes = 5) {
  try {
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

    await query(`
      INSERT INTO admin_login_mfa (user_id, email, mfa_code, expires_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email)
      DO UPDATE SET
        mfa_code = $3,
        expires_at = $4,
        used = FALSE,
        created_at = CURRENT_TIMESTAMP
    `, [userId, email, mfaCode, expiresAt]);
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
 * Send admin login MFA email
 * @param {string} email - The user's email
 * @param {string} firstName - The user's first name
 * @param {string} mfaCode - The MFA code to send
 * @returns {Promise<void>}
 */
export async function sendMfaEmail(email, firstName, mfaCode) {
  try {
    await emailService.sendAdminLoginMfaEmail(email, firstName || 'Admin', mfaCode);
    console.log(`🔐 Admin login MFA code sent to ${email}: ${mfaCode}`);
  } catch (error) {
    console.error('Failed to send admin login MFA email:', error);
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