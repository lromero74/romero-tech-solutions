import crypto from 'crypto';
import { query } from '../config/database.js';
import { emailService } from '../services/emailService.js';

/**
 * Trial Email Verification Utilities
 * Handles email verification specifically for trial agent registrations
 * Separate from client registration email verification to avoid conflicts
 */

/**
 * Generate a 6-digit verification code
 * @returns {string} 6-digit verification code
 */
export function generateTrialVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Check if email is already registered as a non-trial user
 * @param {string} email - The email address to check
 * @returns {Promise<{exists: boolean, message?: string}>}
 */
export async function checkEmailNotRegistered(email) {
  try {
    const result = await query(`
      SELECT id, first_name, last_name, email
      FROM users
      WHERE email = $1 AND is_test_account = FALSE
      LIMIT 1
    `, [email]);

    if (result.rows.length > 0) {
      return {
        exists: true,
        message: 'This email address is already registered. Please sign in or use a different email address.'
      };
    }

    return { exists: false };
  } catch (error) {
    console.error('❌ Error checking email registration:', error);
    throw error;
  }
}

/**
 * Store trial email verification code
 * @param {string} email - The email address to verify
 * @param {string} verificationCode - The generated verification code
 * @param {number} expirationMinutes - Minutes until expiration (default: 15)
 * @param {Object} trialData - Additional trial data to store temporarily
 * @returns {Promise<void>}
 */
export async function storeTrialEmailVerificationCode(email, verificationCode, expirationMinutes = 15, trialData = {}) {
  try {
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

    await query(`
      INSERT INTO trial_email_verifications (
        email,
        verification_code,
        expires_at,
        trial_data,
        created_at
      )
      VALUES ($1, $2, $3, $4::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (email)
      DO UPDATE SET
        verification_code = $2,
        expires_at = $3,
        trial_data = $4::jsonb,
        used = FALSE,
        created_at = CURRENT_TIMESTAMP
    `, [email, verificationCode, expiresAt, JSON.stringify(trialData)]);

    console.log(`📧 Stored trial email verification code for ${email}`);
  } catch (error) {
    console.error('❌ Error storing trial email verification code:', error);
    throw error;
  }
}

/**
 * Validate trial email verification code
 * @param {string} email - The email address
 * @param {string} verificationCode - The provided verification code
 * @returns {Promise<{valid: boolean, trialData?: Object, message?: string}>}
 */
export async function validateTrialEmailVerificationCode(email, verificationCode) {
  try {
    const result = await query(`
      SELECT verification_code, expires_at, used, trial_data
      FROM trial_email_verifications
      WHERE email = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [email]);

    if (result.rows.length === 0) {
      return { valid: false, message: 'No verification code found for this email' };
    }

    const record = result.rows[0];

    if (record.used) {
      return { valid: false, message: 'Verification code has already been used' };
    }

    if (new Date() > new Date(record.expires_at)) {
      return { valid: false, message: 'Verification code has expired. Please request a new code.' };
    }

    if (record.verification_code !== verificationCode) {
      return { valid: false, message: 'Invalid verification code' };
    }

    // Parse stored trial data
    let trialData = {};
    try {
      // PostgreSQL JSONB columns return parsed objects, check if parsing is needed
      if (typeof record.trial_data === 'string') {
        trialData = JSON.parse(record.trial_data || '{}');
      } else {
        trialData = record.trial_data || {};
      }
    } catch (parseError) {
      console.warn('⚠️ Could not parse trial data from verification record');
    }

    console.log(`✅ Trial email verification code validated for ${email}`);
    return { valid: true, trialData };
  } catch (error) {
    console.error('❌ Error validating trial email verification code:', error);
    throw error;
  }
}

/**
 * Mark trial email verification code as used and create trial_users record
 * @param {string} email - The email address
 * @param {Object} options - Additional options for trial user creation
 * @returns {Promise<{trialUserId: string}>}
 */
export async function confirmTrialEmailAndCreateUser(email, options = {}) {
  try {
    const { contactName, phone } = options;

    // Start transaction
    const pool = await import('../config/database.js').then(m => m.getPool());
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Mark verification code as used
      await client.query(`
        UPDATE trial_email_verifications
        SET used = TRUE
        WHERE email = $1
      `, [email]);

      // Create trial_users record (with 30-day trial period)
      const trialExpiresAt = new Date();
      trialExpiresAt.setDate(trialExpiresAt.getDate() + 30); // 30-day trial

      const result = await client.query(`
        INSERT INTO trial_users (
          email,
          email_verified,
          email_verified_at,
          trial_start_date,
          trial_expires_at,
          contact_name,
          phone,
          created_at
        ) VALUES ($1, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (email) DO UPDATE
        SET
          email_verified = TRUE,
          email_verified_at = CURRENT_TIMESTAMP,
          contact_name = COALESCE($3, trial_users.contact_name),
          phone = COALESCE($4, trial_users.phone),
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `, [email, trialExpiresAt, contactName || null, phone || null]);

      const trialUserId = result.rows[0].id;

      await client.query('COMMIT');

      console.log(`✅ Trial user created/updated for ${email}, ID: ${trialUserId}`);
      return { trialUserId };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Error confirming trial email and creating user:', error);
    throw error;
  }
}

/**
 * Send trial verification email
 * @param {string} email - The recipient email
 * @param {string} verificationCode - The verification code
 * @param {string} deviceName - The device name for personalization (optional)
 * @returns {Promise<void>}
 */
export async function sendTrialVerificationEmail(email, verificationCode, deviceName = '') {
  try {
    const subject = 'Email Verification - RTS Agent Trial';

    const deviceText = deviceName ? ` for ${deviceName}` : '';

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Trial Email Verification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #059669, #10b981); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f0fdf4; padding: 30px; border-radius: 0 0 8px 8px; }
          .code-box { background: white; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
          .code { font-size: 32px; font-weight: bold; color: #059669; letter-spacing: 4px; font-family: 'Courier New', monospace; }
          .footer { margin-top: 20px; padding: 20px; background: #dcfce7; border-radius: 8px; font-size: 14px; color: #15803d; }
          .trial-info { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Trial Email Verification</h1>
            <p>RTS Agent - Romero Tech Solutions</p>
          </div>
          <div class="content">
            <h2>Welcome to RTS Agent Trial!</h2>
            <p>Thank you for starting your 30-day free trial${deviceText}.</p>
            <p>To verify your email address and activate your trial, please enter the following verification code:</p>

            <div class="code-box">
              <div class="code">${verificationCode}</div>
            </div>

            <div class="trial-info">
              <strong>📋 What's Next:</strong>
              <ul style="margin: 10px 0;">
                <li>Enter the verification code in your agent installation</li>
                <li>Your trial will be active for 30 days</li>
                <li>You can install the agent on multiple devices using this email</li>
                <li>Access your dashboard at: <a href="https://romerotechsolutions.com/trial">romerotechsolutions.com/trial</a></li>
              </ul>
            </div>

            <p><strong>Important:</strong></p>
            <ul>
              <li>This code expires in 15 minutes</li>
              <li>It can only be used once</li>
              <li>Keep this email for your records</li>
            </ul>

            <p>If you didn't request this trial, you can safely ignore this email.</p>

            <div class="footer">
              <p><strong>Need help?</strong> Visit <a href="https://romerotechsolutions.com/support">romerotechsolutions.com/support</a></p>
              <p>This is an automated verification email. Please do not reply to this message.</p>
              <p>© 2025 Romero Tech Solutions. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const textBody = `
RTS Agent Trial - Email Verification

Your verification code is: ${verificationCode}

This code expires in 15 minutes and can only be used once.

What's Next:
- Enter the verification code in your agent installation
- Your trial will be active for 30 days
- You can install the agent on multiple devices using this email
- Access your dashboard at: https://romerotechsolutions.com/trial

If you didn't request this trial, you can safely ignore this email.

© 2025 Romero Tech Solutions
    `.trim();

    // Send using the existing email service
    await emailService.sendEmail({
      to: email,
      subject: subject,
      html: htmlBody,
      text: textBody
    });

    console.log(`📧 Trial verification email sent to ${email}`);
  } catch (error) {
    console.error('❌ Error sending trial verification email:', error);
    throw error;
  }
}

/**
 * Get or create trial user by email
 * Used during trial agent heartbeat to link agents to trial users
 * @param {string} email - The trial user email
 * @returns {Promise<{trialUserId: string, isVerified: boolean}>}
 */
export async function getOrCreateTrialUser(email) {
  try {
    // First, check if trial user exists
    let result = await query(`
      SELECT id, email_verified
      FROM trial_users
      WHERE email = $1
    `, [email]);

    if (result.rows.length > 0) {
      return {
        trialUserId: result.rows[0].id,
        isVerified: result.rows[0].email_verified
      };
    }

    // If not exists, create unverified trial user
    // (will be verified later when they complete email verification)
    const trialExpiresAt = new Date();
    trialExpiresAt.setDate(trialExpiresAt.getDate() + 30); // 30-day trial

    result = await query(`
      INSERT INTO trial_users (
        email,
        email_verified,
        trial_start_date,
        trial_expires_at,
        created_at
      ) VALUES ($1, FALSE, CURRENT_TIMESTAMP, $2, CURRENT_TIMESTAMP)
      RETURNING id
    `, [email, trialExpiresAt]);

    console.log(`📝 Created unverified trial user for ${email}`);

    return {
      trialUserId: result.rows[0].id,
      isVerified: false
    };
  } catch (error) {
    console.error('❌ Error getting/creating trial user:', error);
    throw error;
  }
}

/**
 * Clean up expired trial verification codes (can be run periodically)
 * @returns {Promise<number>} Number of cleaned up records
 */
export async function cleanupExpiredTrialVerificationCodes() {
  try {
    const result = await query(`
      DELETE FROM trial_email_verifications
      WHERE expires_at < CURRENT_TIMESTAMP
        OR created_at < (CURRENT_TIMESTAMP - INTERVAL '24 hours')
    `);

    const deletedCount = result.rowCount || 0;
    if (deletedCount > 0) {
      console.log(`🧹 Cleaned up ${deletedCount} expired trial verification records`);
    }

    return deletedCount;
  } catch (error) {
    console.error('❌ Error cleaning up expired trial verification codes:', error);
    throw error;
  }
}
