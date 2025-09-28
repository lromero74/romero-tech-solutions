import express from 'express';
import { getPool } from '../../config/database.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { clientContextMiddleware } from '../../middleware/clientMiddleware.js';

// Create composite middleware for client routes
const authenticateClient = [authMiddleware, clientContextMiddleware];

import { generateMfaCode, storeMfaCode, validateMfaCode, markMfaCodeAsUsed } from '../../utils/mfaUtils.js';

// Create a compatibility object for the existing code
const mfaUtils = {
  generateCode: generateMfaCode,
  storeCode: storeMfaCode,
  verifyCode: validateMfaCode,
  cleanupCode: markMfaCodeAsUsed,
  generateBackupCodes: () => {
    // Generate 10 backup codes (8 characters each)
    return Array.from({ length: 10 }, () =>
      Math.random().toString(36).substring(2, 10).toUpperCase()
    );
  }
};
import { emailService } from '../../services/emailService.js';

const router = express.Router();

// Get MFA settings for client
router.get('/settings', authenticateClient, async (req, res) => {
  try {
    const pool = await getPool();
    const clientId = req.clientUser.clientId;

    const result = await pool.query(`
      SELECT
        mfa_enabled as "isEnabled",
        mfa_email as "email",
        mfa_backup_codes as "backupCodes"
      FROM clients
      WHERE client_id = $1 AND soft_delete = false
    `, [clientId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const client = result.rows[0];

    res.json({
      success: true,
      data: {
        isEnabled: client.isEnabled || false,
        email: client.email || '',
        backupCodes: client.backupCodes ? JSON.parse(client.backupCodes) : []
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
    const clientId = req.clientUser.clientId;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    // Generate 6-digit code
    const verificationCode = mfaUtils.generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store verification code
    await mfaUtils.storeCode(clientId, verificationCode, expiresAt, 'client_mfa_setup');

    // Send email using notification service
    const emailSent = await emailService.sendNotificationEmail({
      toEmail: email,
      subject: 'MFA Setup - Verification Code',
      message: `Your MFA verification code is: ${verificationCode}. This code expires in 15 minutes.`
    });

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email'
      });
    }

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
    const clientId = req.clientUser.clientId;
    const { code, email } = req.body;

    if (!code || !email) {
      return res.status(400).json({
        success: false,
        message: 'Verification code and email are required'
      });
    }

    // Verify the code
    const isValidCode = await mfaUtils.verifyCode(clientId, code, 'client_mfa_setup');
    if (!isValidCode) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    // Generate backup codes
    const backupCodes = mfaUtils.generateBackupCodes();

    // Enable MFA for the client
    await pool.query(`
      UPDATE clients
      SET
        mfa_enabled = true,
        mfa_email = $1,
        mfa_backup_codes = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE client_id = $3
    `, [email, JSON.stringify(backupCodes), clientId]);

    // Clean up the verification code
    await mfaUtils.cleanupCode(clientId, 'client_mfa_setup');

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
    const clientId = req.clientUser.clientId;

    // Disable MFA
    await pool.query(`
      UPDATE clients
      SET
        mfa_enabled = false,
        mfa_email = NULL,
        mfa_backup_codes = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE client_id = $1
    `, [clientId]);

    // Clean up any pending verification codes
    await mfaUtils.cleanupCode(clientId, 'client_mfa_setup');

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
      SELECT client_id, first_name, mfa_enabled
      FROM clients
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
    const verificationCode = mfaUtils.generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes for login

    await mfaUtils.storeCode(client.client_id, verificationCode, expiresAt, 'client_mfa_login');

    // Send email using notification service
    const emailSent = await emailService.sendNotificationEmail({
      toEmail: email,
      subject: 'Login Verification Code',
      message: `Hello ${client.first_name}, your login verification code is: ${verificationCode}. This code expires in 10 minutes.`
    });

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email'
      });
    }

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

    // Find client by email
    const clientResult = await pool.query(`
      SELECT client_id, mfa_backup_codes
      FROM clients
      WHERE email = $1 AND soft_delete = false AND mfa_enabled = true
    `, [email]);

    if (clientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client not found or MFA not enabled'
      });
    }

    const client = clientResult.rows[0];
    let isValidCode = false;
    let usedBackupCode = false;

    // First try to verify as regular MFA code
    isValidCode = await mfaUtils.verifyCode(client.client_id, code, 'client_mfa_login');

    // If regular code failed, try backup codes
    if (!isValidCode && client.mfa_backup_codes) {
      const backupCodes = JSON.parse(client.mfa_backup_codes);
      const codeIndex = backupCodes.indexOf(code);

      if (codeIndex !== -1) {
        // Remove the used backup code
        backupCodes.splice(codeIndex, 1);
        await pool.query(`
          UPDATE clients
          SET mfa_backup_codes = $1
          WHERE client_id = $2
        `, [JSON.stringify(backupCodes), client.client_id]);

        isValidCode = true;
        usedBackupCode = true;
      }
    }

    if (!isValidCode) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    // Clean up the verification code (if it was a regular code)
    if (!usedBackupCode) {
      await mfaUtils.cleanupCode(client.client_id, 'client_mfa_login');
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