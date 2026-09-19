import express from 'express';
import { logger } from '../../utils/logger.js';
import { query } from '../../config/database.js';
import {
  validatePasswordComplexity,
  addPasswordToHistory,
  checkPasswordHistory,
  updatePasswordChangeTimestamp,
  getPasswordExpirationInfo
} from '../../utils/passwordUtils.js';
import { generateMfaCode } from '../../utils/inputValidation.js';
import {
  generateResetToken,
  storePasswordResetToken,
  validatePasswordResetToken,
  markResetTokenAsUsed,
  sendPasswordResetEmail
} from '../../utils/mfaUtils.js';

const router = express.Router();

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // First check employees table for admin/sales/technician users
    let userResult = await query(`
      SELECT id, email, first_name, last_name, role, 'employee' as user_type
      FROM employees
      WHERE email = $1 AND employee_status != 'terminated'
    `, [email]);

    // If not found in employees, check users table for clients
    if (userResult.rows.length === 0) {
      userResult = await query(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.role, 'client' as user_type
        FROM users u
        WHERE u.email = $1
      `, [email]);
    }

    if (userResult.rows.length === 0) {
      // Don't reveal if the user exists or not for security
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, you will receive a password reset code.'
      });
    }

    const user = userResult.rows[0];

    // Generate reset token and code
    const resetToken = generateResetToken();
    const resetCode = generateMfaCode(); // Reuse the 6-digit code generator

    // Store password reset token
    await storePasswordResetToken(user.id, user.user_type, email, resetToken, resetCode);

    // Send password reset email
    await sendPasswordResetEmail(email, user.first_name, resetCode);

    // SECURITY FIX: Never expose reset codes in API responses (even in development)
    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, you will receive a password reset code.'
    });

  } catch (error) {
    logger.error('Forgot password error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/reset-password - Confirm password reset with code
router.post('/reset-password', async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;

    if (!email || !resetCode || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, reset code, and new password are required'
      });
    }

    // Get user info for validation
    let userInfo = {};
    try {
      let userResult = await query(`
        SELECT email, first_name, last_name FROM employees WHERE id = (
          SELECT user_id FROM password_reset_tokens WHERE email = $1 AND reset_code = $2
        )
      `, [email, resetCode]);

      if (userResult.rows.length === 0) {
        userResult = await query(`
          SELECT email, first_name, last_name FROM users WHERE id = (
            SELECT user_id FROM password_reset_tokens WHERE email = $1 AND reset_code = $2
          )
        `, [email, resetCode]);
      }

      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        userInfo = {
          name: `${user.first_name} ${user.last_name}`,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name
        };
      }
    } catch (error) {
      logger.warn('Could not get user info for password validation:', error.message);
    }

    // Validate password against complexity requirements
    const validation = await validatePasswordComplexity(newPassword, userInfo);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Password does not meet complexity requirements',
        feedback: validation.feedback
      });
    }

    // Validate reset token
    const tokenData = await validatePasswordResetToken(email, resetCode);

    if (tokenData.error) {
      return res.status(400).json({
        success: false,
        message: tokenData.error
      });
    }

    // Hash the new password
    const passwordHash = await hashPassword(newPassword);

    // SECURITY FIX: Use whitelist for table names to prevent SQL injection
    const table = ALLOWED_USER_TABLES[tokenData.user_type];

    if (!table) {
      logger.error(`Invalid user type for password reset: ${tokenData.user_type}`);
      return res.status(500).json({
        success: false,
        message: SECURITY_MESSAGES.SERVER_ERROR
      });
    }

    await query(`
      UPDATE ${table}
      SET password_hash = $1
      WHERE id = $2
    `, [passwordHash, tokenData.user_id]);

    // Mark the token as used
    await markResetTokenAsUsed(email, resetCode);

    // Add password to history
    await addPasswordToHistory(tokenData.user_id, passwordHash);

    // Update password change timestamp
    await updatePasswordChangeTimestamp(tokenData.user_id, tokenData.user_type);

    // End all existing sessions for this user
    await sessionService.endAllUserSessions(tokenData.user_id);

    logger.debug(`🔐 Password reset successful for ${email}`);

    res.status(200).json({
      success: true,
      message: 'Password reset successful. You can now sign in with your new password.'
    });

  } catch (error) {
    logger.error('Reset password error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to reset password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========================================
// PASSWORD COMPLEXITY & VALIDATION
// ========================================

// POST /api/auth/validate-password - Validate password against current requirements
router.post('/validate-password', async (req, res) => {
  try {
    const { password, userInfo } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }

    const validation = await validatePasswordComplexity(password, userInfo);

    res.status(200).json({
      success: true,
      ...validation
    });
  } catch (error) {
    logger.error('Error validating password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/password-history - Add password to history (internal use)
router.post('/password-history', async (req, res) => {
  try {
    const { userId, passwordHash } = req.body;

    if (!userId || !passwordHash) {
      return res.status(400).json({
        success: false,
        message: 'User ID and password hash are required'
      });
    }

    await addPasswordToHistory(userId, passwordHash);

    res.status(200).json({
      success: true,
      message: 'Password added to history successfully'
    });
  } catch (error) {
    logger.error('Error adding password to history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add password to history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/password-history/check - Check if password was used recently
router.post('/password-history/check', async (req, res) => {
  try {
    const { userId, passwordHash } = req.body;

    if (!userId || !passwordHash) {
      return res.status(400).json({
        success: false,
        message: 'User ID and password hash are required'
      });
    }

    const isInHistory = await checkPasswordHistory(userId, passwordHash);

    res.status(200).json({
      success: true,
      isInHistory
    });
  } catch (error) {
    logger.error('Error checking password history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check password history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/auth/password-expiration/:userId - Get password expiration info
router.get('/password-expiration/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const expirationInfo = await getPasswordExpirationInfo(userId);

    res.status(200).json({
      success: true,
      ...expirationInfo
    });
  } catch (error) {
    logger.error('Error getting password expiration info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get password expiration info',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/change-password - Change user password with complexity validation
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword, userInfo } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    // Get user ID from session or request (this would need to be implemented with proper auth middleware)
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User must be authenticated'
      });
    }

    // Get user from database
    let userResult = await query(`
      SELECT id, email, first_name, last_name, password_hash, 'employee' as user_type
      FROM employees WHERE id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      userResult = await query(`
        SELECT id, email, first_name, last_name, password_hash, 'client' as user_type
        FROM users WHERE id = $1
      `, [userId]);
    }

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Verify current password
    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Validate new password against complexity requirements
    const validation = await validatePasswordComplexity(newPassword, {
      name: `${user.first_name} ${user.last_name}`,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name
    });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'New password does not meet complexity requirements',
        feedback: validation.feedback
      });
    }

    // Check if password was used recently
    const newPasswordHash = await hashPassword(newPassword);
    const isInHistory = await checkPasswordHistory(userId, newPassword);

    if (isInHistory) {
      const requirements = await passwordComplexityService.getPasswordComplexityRequirements();
      return res.status(400).json({
        success: false,
        message: `Password was used recently. Please choose a password you haven't used in the last ${requirements.passwordHistoryCount} passwords.`
      });
    }

    // SECURITY FIX: Use whitelist for table names to prevent SQL injection
    const table = ALLOWED_USER_TABLES[user.user_type];

    if (!table) {
      logger.error(`Invalid user type for password update: ${user.user_type}`);
      return res.status(500).json({
        success: false,
        message: SECURITY_MESSAGES.SERVER_ERROR
      });
    }

    await query(`
      UPDATE ${table}
      SET password_hash = $1
      WHERE id = $2
    `, [newPasswordHash, userId]);

    // Add password to history
    await addPasswordToHistory(userId, newPasswordHash);

    // Update password change timestamp
    await updatePasswordChangeTimestamp(userId, user.user_type);

    // End all other sessions for this user
    await sessionService.endAllUserSessions(userId);

    logger.debug(`🔐 Password changed successfully for user ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
