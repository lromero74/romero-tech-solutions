import { query } from '../config/database.js';

/**
 * Service for managing MFA settings
 */
class MfaSettingsService {
  /**
   * Get MFA requirement setting from database
   * @returns {Promise<boolean>} True if MFA is required, false otherwise
   */
  async getMfaRequired() {
    try {
      const result = await query(`
        SELECT setting_value
        FROM system_settings
        WHERE setting_key = 'mfa_required'
      `);

      if (result.rows.length === 0) {
        console.warn('MFA requirement setting not found in database, defaulting to true');
        return true; // Default to requiring MFA for security
      }

      const value = result.rows[0].setting_value;
      return value === 'true' || value === true;
    } catch (error) {
      console.error('Error getting MFA requirement setting:', error);
      return true; // Default to requiring MFA for security
    }
  }

  /**
   * Update MFA requirement setting in database
   * @param {boolean} required - Whether MFA should be required
   * @returns {Promise<void>}
   */
  async updateMfaRequired(required) {
    try {
      const result = await query(`
        UPDATE system_settings
        SET setting_value = $1, updated_at = NOW()
        WHERE setting_key = 'mfa_required'
        RETURNING *
      `, [required.toString()]);

      if (result.rows.length === 0) {
        // Setting doesn't exist, create it
        await query(`
          INSERT INTO system_settings (setting_key, setting_value, setting_type, description, created_at, updated_at)
          VALUES ('mfa_required', $1, 'security', 'Require multi-factor authentication for all employee logins', NOW(), NOW())
        `, [required.toString()]);
      }

      console.log(`⚙️ MFA requirement updated to: ${required}`);
    } catch (error) {
      console.error('Error updating MFA requirement setting:', error);
      throw error;
    }
  }

  /**
   * Check if MFA is required for a specific user type
   * @param {string} userType - The user type ('employee' or 'client')
   * @param {string} role - The user's role
   * @returns {Promise<boolean>} True if MFA is required for this user
   */
  async requiresMfaForUser(userType, role) {
    try {
      // Get the global MFA requirement setting
      const mfaRequired = await this.getMfaRequired();

      // Currently, MFA applies to all employees when enabled
      // Clients are not subject to MFA (they have separate authentication flow)
      if (userType === 'employee' && mfaRequired) {
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking MFA requirement for user:', error);
      // Default to requiring MFA for employees for security
      return userType === 'employee';
    }
  }
}

export const mfaSettingsService = new MfaSettingsService();
export default mfaSettingsService;