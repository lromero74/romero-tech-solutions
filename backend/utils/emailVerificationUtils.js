import crypto from 'crypto';
import { query } from '../config/database.js';
import { emailService } from '../services/emailService.js';

/**
 * Email Verification Utilities
 * Similar to MFA utilities but specifically for email verification during registration
 */

/**
 * Generate a 6-digit verification code
 * @returns {string} 6-digit verification code
 */
export function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store email verification code
 * @param {string} email - The email address to verify
 * @param {string} verificationCode - The generated verification code
 * @param {number} expirationMinutes - Minutes until expiration (default: 15)
 * @param {Object} userData - Additional user data to store temporarily
 * @returns {Promise<void>}
 */
export async function storeEmailVerificationCode(email, verificationCode, expirationMinutes = 15, userData = {}) {
  try {
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

    await query(`
      INSERT INTO email_verifications (
        email,
        verification_code,
        expires_at,
        user_data,
        created_at
      )
      VALUES ($1, $2, $3, $4::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (email)
      DO UPDATE SET
        verification_code = $2,
        expires_at = $3,
        user_data = $4::jsonb,
        used = FALSE,
        created_at = CURRENT_TIMESTAMP
    `, [email, verificationCode, expiresAt, JSON.stringify(userData)]);

    console.log(`📧 Stored email verification code for ${email}`);
  } catch (error) {
    console.error('❌ Error storing email verification code:', error);
    throw error;
  }
}

/**
 * Validate email verification code
 * @param {string} email - The email address
 * @param {string} verificationCode - The provided verification code
 * @returns {Promise<{valid: boolean, userData?: Object, message?: string}>}
 */
export async function validateEmailVerificationCode(email, verificationCode) {
  try {
    const result = await query(`
      SELECT verification_code, expires_at, used, user_data
      FROM email_verifications
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
      return { valid: false, message: 'Verification code has expired' };
    }

    if (record.verification_code !== verificationCode) {
      return { valid: false, message: 'Invalid verification code' };
    }

    // Parse stored user data
    let userData = {};
    try {
      // PostgreSQL JSONB columns return parsed objects, check if parsing is needed
      if (typeof record.user_data === 'string') {
        userData = JSON.parse(record.user_data || '{}');
      } else {
        userData = record.user_data || {};
      }
    } catch (parseError) {
      console.warn('⚠️ Could not parse user data from verification record');
    }

    console.log(`✅ Email verification code validated for ${email}`);
    return { valid: true, userData };
  } catch (error) {
    console.error('❌ Error validating email verification code:', error);
    throw error;
  }
}

/**
 * Mark email verification code as used
 * @param {string} email - The email address
 * @returns {Promise<void>}
 */
export async function markEmailVerificationCodeAsUsed(email) {
  try {
    await query(`
      UPDATE email_verifications
      SET used = TRUE
      WHERE email = $1
    `, [email]);

    console.log(`🔒 Marked email verification code as used for ${email}`);
  } catch (error) {
    console.error('❌ Error marking email verification code as used:', error);
    throw error;
  }
}

/**
 * Send verification email
 * @param {string} email - The recipient email
 * @param {string} verificationCode - The verification code
 * @param {string} businessName - The business name for personalization
 * @param {string} language - Language preference (default: 'en')
 * @returns {Promise<void>}
 */
export async function sendVerificationEmail(email, verificationCode, businessName, language = 'en') {
  try {
    // Use the existing email service with custom content for verification
    const subject = language === 'es'
      ? 'Código de verificación - Romero Tech Solutions'
      : 'Email Verification Code - Romero Tech Solutions';

    const htmlBody = language === 'es' ? `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Verificación de Email</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
          .code-box { background: white; border: 2px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
          .code { font-size: 32px; font-weight: bold; color: #1e40af; letter-spacing: 4px; }
          .footer { margin-top: 20px; padding: 20px; background: #e2e8f0; border-radius: 8px; font-size: 14px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Verificación de Email</h1>
            <p>Romero Tech Solutions</p>
          </div>
          <div class="content">
            <h2>¡Hola!</h2>
            <p>Gracias por registrarte con <strong>${businessName}</strong> en Romero Tech Solutions.</p>
            <p>Para completar tu registro, por favor ingresa el siguiente código de verificación:</p>

            <div class="code-box">
              <div class="code">${verificationCode}</div>
            </div>

            <p><strong>Importante:</strong></p>
            <ul>
              <li>Este código expira en 15 minutos</li>
              <li>Solo puede ser usado una vez</li>
              <li>No compartas este código con nadie</li>
            </ul>

            <p>Si no solicitaste este código, puedes ignorar este email de manera segura.</p>

            <div class="footer">
              <p>Este es un email automático de verificación. Por favor no respondas a este mensaje.</p>
              <p>© 2025 Romero Tech Solutions. Todos los derechos reservados.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    ` : `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Email Verification</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
          .code-box { background: white; border: 2px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
          .code { font-size: 32px; font-weight: bold; color: #1e40af; letter-spacing: 4px; }
          .footer { margin-top: 20px; padding: 20px; background: #e2e8f0; border-radius: 8px; font-size: 14px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Email Verification</h1>
            <p>Romero Tech Solutions</p>
          </div>
          <div class="content">
            <h2>Hello!</h2>
            <p>Thank you for registering <strong>${businessName}</strong> with Romero Tech Solutions.</p>
            <p>To complete your registration, please enter the following verification code:</p>

            <div class="code-box">
              <div class="code">${verificationCode}</div>
            </div>

            <p><strong>Important:</strong></p>
            <ul>
              <li>This code expires in 15 minutes</li>
              <li>It can only be used once</li>
              <li>Do not share this code with anyone</li>
            </ul>

            <p>If you didn't request this code, you can safely ignore this email.</p>

            <div class="footer">
              <p>This is an automated verification email. Please do not reply to this message.</p>
              <p>© 2025 Romero Tech Solutions. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send using the existing email service
    await emailService.sendEmail({
      to: email,
      subject: subject,
      html: htmlBody,
      text: `Your verification code is: ${verificationCode}. This code expires in 15 minutes and can only be used once.`
    });

    console.log(`📧 Verification email sent to ${email}`);
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
    throw error;
  }
}

/**
 * Clean up expired verification codes (can be run periodically)
 * @returns {Promise<number>} Number of cleaned up records
 */
export async function cleanupExpiredVerificationCodes() {
  try {
    const result = await query(`
      DELETE FROM email_verifications
      WHERE expires_at < CURRENT_TIMESTAMP
        OR created_at < (CURRENT_TIMESTAMP - INTERVAL '24 hours')
    `);

    const deletedCount = result.rowCount || 0;
    if (deletedCount > 0) {
      console.log(`🧹 Cleaned up ${deletedCount} expired email verification records`);
    }

    return deletedCount;
  } catch (error) {
    console.error('❌ Error cleaning up expired verification codes:', error);
    throw error;
  }
}