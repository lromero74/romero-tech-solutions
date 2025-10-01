import express from 'express';
import { getPool } from '../../config/database.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { clientContextMiddleware } from '../../middleware/clientMiddleware.js';

// Create composite middleware for client routes
const authenticateClient = [authMiddleware, clientContextMiddleware];

import {
  generateMfaCode,
  storeClientMfaCode,
  validateClientMfaCode,
  markClientMfaCodeAsUsed,
  sendClientMfaEmail,
  generateClientBackupCodes
} from '../../utils/mfaUtils.js';
import { emailService } from '../../services/emailService.js';

const router = express.Router();

// Get MFA settings for client
router.get('/settings', authenticateClient, async (req, res) => {
  try {
    const pool = await getPool();

    if (!req.user || !req.user.clientId) {
      console.error('❌ MFA settings error: req.user is', req.user);
      return res.status(400).json({
        success: false,
        message: 'Client context not properly loaded'
      });
    }

    const clientId = req.user.clientId;

    const result = await pool.query(`
      SELECT mfa_enabled, mfa_email, mfa_backup_codes
      FROM users
      WHERE id = $1 AND role = 'client' AND soft_delete = false
    `, [clientId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const client = result.rows[0];
    const backupCodes = client.mfa_backup_codes ? JSON.parse(client.mfa_backup_codes) : [];

    res.json({
      success: true,
      data: {
        isEnabled: client.mfa_enabled || false,
        email: client.mfa_email || '',
        backupCodes: backupCodes
      }
    });

  } catch (error) {
    console.error('Error fetching MFA settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch MFA settings'
    });
  }
});

// Send MFA verification code to client email
router.post('/send-code', authenticateClient, async (req, res) => {
  try {
    const pool = await getPool();

    if (!req.user || !req.user.clientId) {
      console.error('❌ MFA send-code error: req.user is', req.user);
      return res.status(400).json({
        success: false,
        message: 'Client context not properly loaded'
      });
    }

    const clientId = req.user.clientId;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    // Get client information including language preference
    const clientResult = await pool.query(`
      SELECT first_name, email as user_email,
             COALESCE(language_preference, 'en') as language_preference
      FROM users
      WHERE id = $1 AND role = 'client' AND soft_delete = false
    `, [clientId]);

    if (clientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const client = clientResult.rows[0];

    // Generate and store verification code
    const verificationCode = generateMfaCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await storeClientMfaCode(clientId, verificationCode, expiresAt, 'client_mfa_setup');

    // Send email using notification service
    await sendClientMfaEmail(email, client.first_name, verificationCode, 'setup', client.language_preference || 'en');

    res.json({
      success: true,
      message: 'Verification code sent successfully'
    });

  } catch (error) {
    console.error('Error sending MFA code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification code'
    });
  }
});

// Verify MFA setup code and enable MFA
router.post('/verify-setup', authenticateClient, async (req, res) => {
  try {
    const pool = await getPool();

    if (!req.user || !req.user.clientId) {
      console.error('❌ MFA verify-setup error: req.user is', req.user);
      return res.status(400).json({
        success: false,
        message: 'Client context not properly loaded'
      });
    }

    const clientId = req.user.clientId;
    const { code, email } = req.body;

    if (!code || !email) {
      return res.status(400).json({
        success: false,
        message: 'Verification code and email are required'
      });
    }

    // Get client's language preference
    const clientResult = await pool.query(`
      SELECT COALESCE(language_preference, 'en') as language_preference
      FROM users
      WHERE id = $1
    `, [clientId]);

    const language = clientResult.rows[0]?.language_preference || 'en';

    // Verify the code with language support
    const validationResult = await validateClientMfaCode(clientId, code, 'client_mfa_setup', language);
    if (!validationResult.valid) {
      return res.status(400).json({
        success: false,
        message: validationResult.message || 'Invalid or expired verification code'
      });
    }

    // Generate backup codes
    const backupCodes = generateClientBackupCodes();

    // Enable MFA for the client
    await pool.query(`
      UPDATE users
      SET
        mfa_enabled = true,
        mfa_email = $1,
        mfa_backup_codes = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 AND role = 'client'
    `, [email, JSON.stringify(backupCodes), clientId]);

    // Clean up the verification code
    await markClientMfaCodeAsUsed(clientId, 'client_mfa_setup');

    res.json({
      success: true,
      message: 'MFA enabled successfully',
      data: {
        backupCodes
      }
    });

  } catch (error) {
    console.error('Error verifying MFA setup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify MFA setup'
    });
  }
});

// Disable MFA for client
router.post('/disable', authenticateClient, async (req, res) => {
  try {
    const pool = await getPool();
    const clientId = req.user.clientId;

    // Disable MFA
    await pool.query(`
      UPDATE users
      SET
        mfa_enabled = false,
        mfa_email = NULL,
        mfa_backup_codes = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND role = 'client'
    `, [clientId]);

    // Clean up any pending verification codes
    await markClientMfaCodeAsUsed(clientId, 'client_mfa_setup');

    res.json({
      success: true,
      message: 'MFA disabled successfully'
    });

  } catch (error) {
    console.error('Error disabling MFA:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disable MFA'
    });
  }
});

// Send MFA login code (for future login flow)
router.post('/send-login-code', async (req, res) => {
  try {
    const pool = await getPool();
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    // Find client by email
    const clientResult = await pool.query(`
      SELECT client_id, first_name, mfa_enabled,
             COALESCE(language_preference, 'en') as language_preference
      FROM users
      WHERE email = $1 AND soft_delete = false
    `, [email]);

    if (clientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const client = clientResult.rows[0];

    if (!client.mfa_enabled) {
      return res.status(400).json({
        success: false,
        message: 'MFA is not enabled for this account'
      });
    }

    // Generate and store verification code
    const verificationCode = generateMfaCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes for login

    await storeClientMfaCode(client.client_id, verificationCode, expiresAt, 'client_mfa_login');

    // Send email using notification service
    await sendClientMfaEmail(email, client.first_name, verificationCode, 'login', client.language_preference || 'en');

    res.json({
      success: true,
      message: 'Verification code sent successfully'
    });

  } catch (error) {
    console.error('Error sending login MFA code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification code'
    });
  }
});

// Verify MFA login code
router.post('/verify-login', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required'
      });
    }

    const pool = await getPool();

    // Find client by email and get language preference
    const clientResult = await pool.query(`
      SELECT client_id, mfa_backup_codes, COALESCE(language_preference, 'en') as language_preference
      FROM users
      WHERE email = $1 AND soft_delete = false AND mfa_enabled = true
    `, [email]);

    if (clientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found or MFA not enabled'
      });
    }

    const client = clientResult.rows[0];
    const language = client.language_preference || 'en';
    let isValidCode = false;
    let usedBackupCode = false;
    let errorMessage = 'Invalid or expired verification code';

    // First try to verify as regular MFA code with language support
    const validationResult = await validateClientMfaCode(client.client_id, code, 'client_mfa_login', language);

    if (validationResult.valid) {
      isValidCode = true;
    } else {
      // Store the specific error message from validation
      errorMessage = validationResult.message;

      // If regular code failed, try backup codes
      if (client.mfa_backup_codes) {
        const backupCodes = JSON.parse(client.mfa_backup_codes);
        const codeIndex = backupCodes.indexOf(code);

        if (codeIndex !== -1) {
          // Remove the used backup code
          backupCodes.splice(codeIndex, 1);
          await pool.query(`
            UPDATE users
            SET mfa_backup_codes = $1
            WHERE id = $2 AND role = 'client'
          `, [JSON.stringify(backupCodes), client.client_id]);

          isValidCode = true;
          usedBackupCode = true;
        }
      }
    }

    if (!isValidCode) {
      return res.status(400).json({
        success: false,
        message: errorMessage
      });
    }

    // Clean up the verification code (if it was a regular code)
    if (!usedBackupCode) {
      await markClientMfaCodeAsUsed(client.client_id, 'client_mfa_login');
    }

    res.json({
      success: true,
      message: 'MFA verification successful',
      data: {
        usedBackupCode
      }
    });

  } catch (error) {
    console.error('Error verifying MFA login:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify MFA code'
    });
  }
});

export default router;