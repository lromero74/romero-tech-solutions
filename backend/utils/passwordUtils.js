import bcrypt from 'bcryptjs';
import { passwordComplexityService } from '../services/passwordComplexityService.js';

/**
 * Password Utilities
 * Reusable password-related utility functions extracted from auth routes
 */

/**
 * Hash a password using bcrypt
 * @param {string} password - The plain text password to hash
 * @param {number} saltRounds - Number of salt rounds (default: 12)
 * @returns {Promise<string>} The hashed password
 */
export async function hashPassword(password, saltRounds = 12) {
  try {
    return await bcrypt.hash(password, saltRounds);
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Failed to hash password');
  }
}

/**
 * Verify a password against a hash using bcrypt
 * @param {string} password - The plain text password to verify
 * @param {string} hash - The hash to compare against
 * @returns {Promise<boolean>} True if password matches hash
 */
export async function verifyPassword(password, hash) {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    console.error('Error verifying password:', error);
    throw new Error('Failed to verify password');
  }
}

/**
 * Validate password complexity requirements
 * @param {string} password - The password to validate
 * @param {Object} userInfo - User information for validation (optional)
 * @returns {Promise<Object>} Validation result with isValid, feedback, and strength
 */
export async function validatePasswordComplexity(password, userInfo = {}) {
  try {
    return await passwordComplexityService.validatePassword(password, userInfo);
  } catch (error) {
    console.error('Error validating password complexity:', error);
    throw new Error('Failed to validate password complexity');
  }
}

/**
 * Add password to user's password history
 * @param {string} userId - The user ID
 * @param {string} passwordHash - The hashed password to add to history
 * @returns {Promise<void>}
 */
export async function addPasswordToHistory(userId, passwordHash) {
  try {
    await passwordComplexityService.addPasswordToHistory(userId, passwordHash);
  } catch (error) {
    console.error('Error adding password to history:', error);
    // Don't throw here as this is not critical for password change
  }
}

/**
 * Check if password was used recently in user's history
 * @param {string} userId - The user ID
 * @param {string} password - The plain text password to check
 * @returns {Promise<boolean>} True if password was used recently
 */
export async function checkPasswordHistory(userId, password) {
  try {
    return await passwordComplexityService.checkPasswordHistory(userId, password);
  } catch (error) {
    console.error('Error checking password history:', error);
    return false; // Default to allowing password if check fails
  }
}

/**
 * Update user's password change timestamp and expiration
 * @param {string} userId - The user ID
 * @param {string} userType - The user type ('employee' or 'client')
 * @returns {Promise<void>}
 */
export async function updatePasswordChangeTimestamp(userId, userType = 'employee') {
  try {
    await passwordComplexityService.updatePasswordChangeTimestamp(userId, userType);
  } catch (error) {
    console.error('Error updating password change timestamp:', error);
    // Don't throw here as this is not critical for password change
  }
}

/**
 * Get password expiration information for a user
 * @param {string} userId - The user ID
 * @returns {Promise<Object>} Password expiration information
 */
export async function getPasswordExpirationInfo(userId) {
  try {
    return await passwordComplexityService.getPasswordExpirationInfo(userId);
  } catch (error) {
    console.error('Error getting password expiration info:', error);
    throw new Error('Failed to get password expiration info');
  }
}

/**
 * Get current password complexity requirements
 * @returns {Promise<Object>} Current password complexity requirements
 */
export async function getPasswordComplexityRequirements() {
  try {
    return await passwordComplexityService.getPasswordComplexityRequirements();
  } catch (error) {
    console.error('Error getting password complexity requirements:', error);
    throw new Error('Failed to get password complexity requirements');
  }
}