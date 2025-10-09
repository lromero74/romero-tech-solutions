/**
 * Account Lockout Service
 *
 * Provides account-level lockout functionality to prevent brute force attacks
 * by locking accounts after repeated failed login attempts.
 *
 * Features:
 * - Track failed login attempts per account (not just per IP)
 * - Lock account after threshold exceeded
 * - Send password reset email when account is locked
 * - Auto-unlock after configurable timeout
 * - Reset counter on successful login
 */

import { query } from '../config/database.js';
import { sendPasswordResetEmail } from './emailService.js';
import crypto from 'crypto';

// Configuration
const MAX_FAILED_ATTEMPTS = 5; // Lock after 5 failed attempts
const LOCKOUT_DURATION_MINUTES = 30; // Auto-unlock after 30 minutes
const ATTEMPTS_RESET_WINDOW_MINUTES = 15; // Reset counter if no attempts in 15 min

/**
 * Check if an account is currently locked
 * @param {string} email - User email
 * @param {string} userType - 'employee' or 'client'
 * @returns {Promise<{isLocked: boolean, lockedUntil: Date|null, remainingMinutes: number}>}
 */
export async function checkAccountLockStatus(email, userType = 'employee') {
  const tableName = userType === 'employee' ? 'employees' : 'users';

  const result = await query(`
    SELECT account_locked_until, failed_login_attempts
    FROM ${tableName}
    WHERE email = $1
  `, [email]);

  if (result.rows.length === 0) {
    return { isLocked: false, lockedUntil: null, remainingMinutes: 0 };
  }

  const { account_locked_until, failed_login_attempts } = result.rows[0];

  // If account_locked_until is in the future, account is locked
  if (account_locked_until && new Date(account_locked_until) > new Date()) {
    const remainingMs = new Date(account_locked_until) - new Date();
    const remainingMinutes = Math.ceil(remainingMs / 60000);

    return {
      isLocked: true,
      lockedUntil: account_locked_until,
      remainingMinutes,
      failedAttempts: failed_login_attempts
    };
  }

  // Account was locked but timeout has passed - auto-unlock
  if (account_locked_until && new Date(account_locked_until) <= new Date()) {
    await unlockAccount(email, userType);
    return { isLocked: false, lockedUntil: null, remainingMinutes: 0 };
  }

  return { isLocked: false, lockedUntil: null, remainingMinutes: 0 };
}

/**
 * Record a failed login attempt and lock account if threshold exceeded
 * @param {string} email - User email
 * @param {string} userType - 'employee' or 'client'
 * @returns {Promise<{accountLocked: boolean, remainingAttempts: number}>}
 */
export async function recordFailedLoginAttempt(email, userType = 'employee') {
  const tableName = userType === 'employee' ? 'employees' : 'users';

  // Check if last failed attempt was too long ago (reset counter)
  const result = await query(`
    SELECT id, failed_login_attempts, last_failed_login_at, first_name, last_name
    FROM ${tableName}
    WHERE email = $1
  `, [email]);

  if (result.rows.length === 0) {
    return { accountLocked: false, remainingAttempts: MAX_FAILED_ATTEMPTS };
  }

  const user = result.rows[0];
  let newAttemptCount = user.failed_login_attempts + 1;

  // Reset counter if last attempt was more than ATTEMPTS_RESET_WINDOW_MINUTES ago
  if (user.last_failed_login_at) {
    const minutesSinceLastAttempt = (new Date() - new Date(user.last_failed_login_at)) / 60000;
    if (minutesSinceLastAttempt > ATTEMPTS_RESET_WINDOW_MINUTES) {
      newAttemptCount = 1; // Reset to 1 (this attempt)
    }
  }

  const shouldLockAccount = newAttemptCount >= MAX_FAILED_ATTEMPTS;
  const lockoutUntil = shouldLockAccount
    ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60000)
    : null;

  // Update the account
  await query(`
    UPDATE ${tableName}
    SET
      failed_login_attempts = $1,
      last_failed_login_at = CURRENT_TIMESTAMP,
      account_locked_until = $2
    WHERE email = $3
  `, [newAttemptCount, lockoutUntil, email]);

  console.log(`⚠️  Failed login attempt ${newAttemptCount}/${MAX_FAILED_ATTEMPTS} for ${userType} ${email}`);

  // If account just got locked, send password reset email
  if (shouldLockAccount) {
    console.log(`🔒 Account locked for ${userType} ${email} until ${lockoutUntil.toISOString()}`);

    // Generate password reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store reset token in database
    const resetTokensTable = userType === 'employee' ? 'employee_password_resets' : 'password_resets';

    // Check if table exists, if not create it
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS ${resetTokensTable} (
          id SERIAL PRIMARY KEY,
          user_id UUID NOT NULL,
          email VARCHAR(255) NOT NULL,
          reset_token VARCHAR(255) NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          used BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(reset_token)
        )
      `);

      // Insert the reset token
      await query(`
        INSERT INTO ${resetTokensTable} (user_id, email, reset_token, expires_at)
        VALUES ($1, $2, $3, $4)
      `, [user.id, email, resetToken, resetTokenExpiry]);

      // Send password reset email
      try {
        await sendPasswordResetEmail(
          email,
          `${user.first_name} ${user.last_name}`.trim() || email,
          resetToken,
          userType,
          true // isAccountLocked flag
        );
        console.log(`📧 Password reset email sent to locked account: ${email}`);
      } catch (emailError) {
        console.error(`❌ Failed to send lockout email to ${email}:`, emailError);
      }
    } catch (error) {
      console.error(`❌ Error creating reset token for locked account ${email}:`, error);
    }
  }

  return {
    accountLocked: shouldLockAccount,
    remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - newAttemptCount),
    lockoutMinutes: shouldLockAccount ? LOCKOUT_DURATION_MINUTES : null
  };
}

/**
 * Reset failed login attempts after successful login
 * @param {string} email - User email
 * @param {string} userType - 'employee' or 'client'
 */
export async function resetFailedLoginAttempts(email, userType = 'employee') {
  const tableName = userType === 'employee' ? 'employees' : 'users';

  await query(`
    UPDATE ${tableName}
    SET
      failed_login_attempts = 0,
      account_locked_until = NULL,
      last_failed_login_at = NULL
    WHERE email = $1
  `, [email]);

  console.log(`✅ Reset failed login attempts for ${userType} ${email}`);
}

/**
 * Manually unlock an account (admin action or auto-unlock after timeout)
 * @param {string} email - User email
 * @param {string} userType - 'employee' or 'client'
 */
export async function unlockAccount(email, userType = 'employee') {
  const tableName = userType === 'employee' ? 'employees' : 'users';

  await query(`
    UPDATE ${tableName}
    SET
      failed_login_attempts = 0,
      account_locked_until = NULL,
      last_failed_login_at = NULL
    WHERE email = $1
  `, [email]);

  console.log(`🔓 Unlocked account for ${userType} ${email}`);
}

/**
 * Get account lockout statistics (for admin monitoring)
 * @returns {Promise<Object>} Statistics about locked accounts
 */
export async function getAccountLockoutStats() {
  const employeesLocked = await query(`
    SELECT
      email,
      failed_login_attempts,
      account_locked_until,
      last_failed_login_at
    FROM employees
    WHERE account_locked_until > CURRENT_TIMESTAMP
    ORDER BY account_locked_until DESC
  `);

  const usersLocked = await query(`
    SELECT
      email,
      failed_login_attempts,
      account_locked_until,
      last_failed_login_at
    FROM users
    WHERE account_locked_until > CURRENT_TIMESTAMP
    ORDER BY account_locked_until DESC
  `);

  const employeesNearLockout = await query(`
    SELECT
      email,
      failed_login_attempts,
      last_failed_login_at
    FROM employees
    WHERE failed_login_attempts >= $1
      AND (account_locked_until IS NULL OR account_locked_until <= CURRENT_TIMESTAMP)
    ORDER BY failed_login_attempts DESC, last_failed_login_at DESC
  `, [MAX_FAILED_ATTEMPTS - 2]);

  const usersNearLockout = await query(`
    SELECT
      email,
      failed_login_attempts,
      last_failed_login_at
    FROM users
    WHERE failed_login_attempts >= $1
      AND (account_locked_until IS NULL OR account_locked_until <= CURRENT_TIMESTAMP)
    ORDER BY failed_login_attempts DESC, last_failed_login_at DESC
  `, [MAX_FAILED_ATTEMPTS - 2]);

  return {
    config: {
      maxAttempts: MAX_FAILED_ATTEMPTS,
      lockoutDurationMinutes: LOCKOUT_DURATION_MINUTES,
      attemptsResetWindowMinutes: ATTEMPTS_RESET_WINDOW_MINUTES
    },
    currentlyLocked: {
      employees: employeesLocked.rows,
      clients: usersLocked.rows,
      total: employeesLocked.rows.length + usersLocked.rows.length
    },
    nearLockout: {
      employees: employeesNearLockout.rows,
      clients: usersNearLockout.rows,
      total: employeesNearLockout.rows.length + usersNearLockout.rows.length
    }
  };
}

export default {
  checkAccountLockStatus,
  recordFailedLoginAttempt,
  resetFailedLoginAttempts,
  unlockAccount,
  getAccountLockoutStats,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MINUTES
};
