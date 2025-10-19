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
 * IMPORTANT: Trial users (is_trial = true) are allowed to add additional devices
 * @param {string} email - The email address to check
 * @returns {Promise<{exists: boolean, isTrial?: boolean, message?: string}>}
 */
export async function checkEmailNotRegistered(email) {
  try {
    const result = await query(`
      SELECT id, first_name, last_name, email, is_trial
      FROM users
      WHERE email = $1 AND is_test_account = FALSE
      LIMIT 1
    `, [email]);

    if (result.rows.length > 0) {
      const user = result.rows[0];

      // If user is a trial user, allow them to add additional devices
      if (user.is_trial) {
        console.log(`✅ Trial user ${email} adding additional device`);
        return {
          exists: false, // Allow trial users to add more devices
          isTrial: true
        };
      }

      // If user is a non-trial (paid) user, reject
      return {
        exists: true,
        isTrial: false,
        message: 'This email address is already registered with a full account. Please sign in or use a different email address.'
      };
    }

    // Email doesn't exist - new trial user
    return { exists: false, isTrial: false };
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
      console.log(`❌ No verification code found for email: ${email}`);
      return { valid: false, message: 'No verification code found for this email' };
    }

    const record = result.rows[0];

    if (record.used) {
      console.log(`❌ Verification code already used for email: ${email}`);
      return { valid: false, message: 'Verification code has already been used' };
    }

    if (new Date() > new Date(record.expires_at)) {
      console.log(`❌ Verification code expired for email: ${email}`);
      return { valid: false, message: 'Verification code has expired. Please request a new code.' };
    }

    // Defensive: Trim and normalize both codes for comparison
    const storedCode = String(record.verification_code).trim();
    const providedCode = String(verificationCode).trim();

    console.log(`🔍 Comparing verification codes for ${email}:`);
    console.log(`   Stored:   "${storedCode}" (length: ${storedCode.length}, type: ${typeof record.verification_code})`);
    console.log(`   Provided: "${providedCode}" (length: ${providedCode.length}, type: ${typeof verificationCode})`);

    if (storedCode !== providedCode) {
      console.log(`❌ Code mismatch! Stored "${storedCode}" !== Provided "${providedCode}"`);
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
 * Get or create trial user by email (UNIFIED ARCHITECTURE)
 * Used during trial agent heartbeat to link agents to trial users
 * Creates users in the main `users` table with is_trial flag
 * @param {string} email - The trial user email
 * @returns {Promise<{userId: string, businessId: string, isVerified: boolean}>}
 */
export async function getOrCreateTrialUser(email) {
  try {
    // Import UUID generator
    const { v4: uuidv4 } = await import('uuid');
    const bcrypt = await import('bcrypt');

    // First, check if user exists in unified users table
    // Check for both is_trial flag (legacy) and subscription_tier = 'free'
    let result = await query(`
      SELECT u.id, u.email_verified, u.business_id, b.business_name, u.subscription_tier
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      WHERE u.email = $1 AND (u.is_trial = true OR u.subscription_tier = 'free')
    `, [email]);

    if (result.rows.length > 0) {
      const user = result.rows[0];

      // If user exists but doesn't have a business, create one now
      if (!user.business_id) {
        const businessId = uuidv4();
        const businessName = `Trial - ${email}`;

        // Create business
        await query(`
          INSERT INTO businesses (id, business_name, is_individual, created_at)
          VALUES ($1, $2, true, NOW())
        `, [businessId, businessName]);

        // Link user to business
        await query(`
          UPDATE users SET business_id = $1 WHERE id = $2
        `, [businessId, user.id]);

        console.log(`✅ Created business ${businessId} for existing trial user ${email}`);

        return {
          userId: user.id,
          businessId: businessId,
          isVerified: user.email_verified
        };
      }

      return {
        userId: user.id,
        businessId: user.business_id,
        isVerified: user.email_verified
      };
    }

    // If not exists, create free tier user with business (FREEMIUM MODEL)
    const userId = uuidv4();
    const businessId = uuidv4();
    const businessName = `Free - ${email}`;

    // Generate a random password (user will use magic-link to login)
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.default.hash(randomPassword, 10);

    // Get default device limit for free tier from subscription_pricing
    const pricingResult = await query(`
      SELECT default_devices_allowed
      FROM subscription_pricing
      WHERE tier = 'free'::subscription_tier_type AND is_active = TRUE
      LIMIT 1
    `);
    const defaultDevicesAllowed = pricingResult.rows[0]?.default_devices_allowed || 2; // Fallback to 2 if not found

    // Start transaction
    const pool = await import('../config/database.js').then(m => m.getPool());
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Create business
      await client.query(`
        INSERT INTO businesses (id, business_name, is_individual, created_at)
        VALUES ($1, $2, true, NOW())
      `, [businessId, businessName]);

      // 2. Create user in users table with free subscription tier
      await client.query(`
        INSERT INTO users (
          id, email, password_hash, first_name, last_name,
          role, is_active, email_verified, business_id,
          subscription_tier, devices_allowed, profile_completed,
          is_trial, subscription_expires_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::subscription_tier_type, $11, $12, $13, $14, NOW())
      `, [
        userId,
        email,
        passwordHash,
        'Free',
        'User',
        'customer',
        true,
        false, // Will be verified when they complete email verification
        businessId,
        'free', // subscription_tier = 'free' (perpetual free tier)
        defaultDevicesAllowed, // devices_allowed from pricing config (default 2 for free tier)
        false, // profile_completed = false (not completed yet)
        true, // is_trial = true (backward compatibility)
        null // subscription_expires_at = NULL (free tier never expires)
      ]);

      await client.query('COMMIT');

      console.log(`✅ Created free tier user ${email} with business ${businessId} (FREEMIUM MODEL)`);

      return {
        userId: userId,
        businessId: businessId,
        isVerified: false
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
