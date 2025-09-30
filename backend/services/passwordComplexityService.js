import { query } from '../config/database.js';
import bcrypt from 'bcryptjs';

/**
 * Password Complexity Service
 * Handles password complexity requirements, validation, and history management
 */
export class PasswordComplexityService {
  constructor() {
    this.commonPasswords = new Set([
      'password', '123456', '123456789', '12345678', '12345', '1234567',
      'password123', 'admin', 'qwerty', 'abc123', 'Password1', 'welcome',
      'login', 'monkey', 'dragon', 'pass', 'master', '123123', 'letmein',
      'baseball', 'shadow', 'football', 'superman', 'michael', 'ninja',
      'mustang', 'access', 'batman', 'trustno1', 'thomas', 'robert'
    ]);
  }

  /**
   * Get current active password complexity requirements
   * @param {string} userType - The user type ('employee' or 'client')
   */
  async getPasswordComplexityRequirements(userType = 'employee') {
    try {
      const result = await query(`
        SELECT * FROM password_complexity_requirements
        WHERE is_active = true AND user_type = $1
        ORDER BY created_at DESC
        LIMIT 1
      `, [userType]);

      if (result.rows.length === 0) {
        // Return default requirements if none found
        return {
          minLength: 8,
          maxLength: 128,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialCharacters: true,
          specialCharacterSet: '!@#$%^&*()_+-=[]{}|;:,.<>?',
          preventCommonPasswords: true,
          preventUserInfoInPassword: true,
          enablePasswordHistory: true,
          passwordHistoryCount: 5,
          enablePasswordExpiration: true,
          expirationDays: 90
        };
      }

      const req = result.rows[0];
      return {
        id: req.id,
        minLength: req.min_length,
        maxLength: req.max_length,
        requireUppercase: req.require_uppercase,
        requireLowercase: req.require_lowercase,
        requireNumbers: req.require_numbers,
        requireSpecialCharacters: req.require_special_characters,
        specialCharacterSet: req.special_character_set,
        preventCommonPasswords: req.prevent_common_passwords,
        preventUserInfoInPassword: req.prevent_user_info_in_password,
        enablePasswordHistory: req.enable_password_history ?? true,
        passwordHistoryCount: req.password_history_count,
        enablePasswordExpiration: req.enable_password_expiration ?? true,
        expirationDays: req.expiration_days,
        isActive: req.is_active,
        createdAt: req.created_at,
        updatedAt: req.updated_at
      };
    } catch (error) {
      console.error('Error fetching password complexity requirements:', error);
      throw new Error('Failed to fetch password complexity requirements');
    }
  }

  /**
   * Update password complexity requirements (optimized to only update changed fields)
   */
  async updatePasswordComplexityRequirements(requirements, userId) {
    try {
      // First, get the current requirements to compare
      const current = await this.getPasswordComplexityRequirements();

      // Build dynamic UPDATE query with only changed fields
      const updates = [];
      const values = [];
      let paramIndex = 1;

      // Field mappings: [requirementField, dbColumn, defaultValue]
      const fieldMappings = [
        ['minLength', 'min_length'],
        ['maxLength', 'max_length'],
        ['requireUppercase', 'require_uppercase'],
        ['requireLowercase', 'require_lowercase'],
        ['requireNumbers', 'require_numbers'],
        ['requireSpecialCharacters', 'require_special_characters'],
        ['specialCharacterSet', 'special_character_set', '!@#$%^&*()_+-=[]{}|;:,.<>?'],
        ['preventCommonPasswords', 'prevent_common_passwords', true],
        ['preventUserInfoInPassword', 'prevent_user_info_in_password', true],
        ['enablePasswordHistory', 'enable_password_history', true],
        ['passwordHistoryCount', 'password_history_count', 5],
        ['enablePasswordExpiration', 'enable_password_expiration', true],
        ['expirationDays', 'expiration_days', 90]
      ];

      for (const [reqField, dbColumn, defaultValue] of fieldMappings) {
        let newValue = requirements[reqField];

        // Apply default values for certain fields
        if (newValue === undefined || newValue === null) {
          if (defaultValue !== undefined) {
            newValue = defaultValue;
          }
        }

        // Handle special character set default
        if (reqField === 'specialCharacterSet' && !newValue) {
          newValue = defaultValue;
        }

        // Compare with current value (handle different field naming)
        const currentField = reqField === 'minLength' ? 'minLength' :
                           reqField === 'maxLength' ? 'maxLength' :
                           reqField === 'requireUppercase' ? 'requireUppercase' :
                           reqField === 'requireLowercase' ? 'requireLowercase' :
                           reqField === 'requireNumbers' ? 'requireNumbers' :
                           reqField === 'requireSpecialCharacters' ? 'requireSpecialCharacters' :
                           reqField === 'specialCharacterSet' ? 'specialCharacterSet' :
                           reqField === 'preventCommonPasswords' ? 'preventCommonPasswords' :
                           reqField === 'preventUserInfoInPassword' ? 'preventUserInfoInPassword' :
                           reqField === 'enablePasswordHistory' ? 'enablePasswordHistory' :
                           reqField === 'passwordHistoryCount' ? 'passwordHistoryCount' :
                           reqField === 'enablePasswordExpiration' ? 'enablePasswordExpiration' :
                           reqField === 'expirationDays' ? 'expirationDays' : reqField;

        if (current[currentField] !== newValue) {
          updates.push(`${dbColumn} = $${paramIndex}`);
          values.push(newValue);
          paramIndex++;
        }
      }

      // Always update these fields
      updates.push(`updated_by = $${paramIndex}`, `updated_at = CURRENT_TIMESTAMP`);
      values.push(userId);

      // If no fields changed (except updated_by/updated_at), just return current
      if (updates.length === 2) {
        return current;
      }

      const result = await query(`
        UPDATE password_complexity_requirements
        SET ${updates.join(', ')}
        WHERE is_active = true
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        throw new Error('No active password complexity configuration found to update');
      }

      const req = result.rows[0];
      return {
        id: req.id,
        minLength: req.min_length,
        maxLength: req.max_length,
        requireUppercase: req.require_uppercase,
        requireLowercase: req.require_lowercase,
        requireNumbers: req.require_numbers,
        requireSpecialCharacters: req.require_special_characters,
        specialCharacterSet: req.special_character_set,
        preventCommonPasswords: req.prevent_common_passwords,
        preventUserInfoInPassword: req.prevent_user_info_in_password,
        enablePasswordHistory: req.enable_password_history,
        passwordHistoryCount: req.password_history_count,
        enablePasswordExpiration: req.enable_password_expiration,
        expirationDays: req.expiration_days,
        isActive: req.is_active,
        createdAt: req.created_at,
        updatedAt: req.updated_at
      };
    } catch (error) {
      console.error('Error updating password complexity requirements:', error);
      throw new Error('Failed to update password complexity requirements');
    }
  }

  /**
   * Create new password complexity requirements
   */
  async createPasswordComplexityRequirements(requirements, userId) {
    try {
      const result = await query(`
        INSERT INTO password_complexity_requirements (
          min_length, max_length, require_uppercase, require_lowercase,
          require_numbers, require_special_characters, special_character_set,
          prevent_common_passwords, prevent_user_info_in_password,
          enable_password_history, password_history_count, enable_password_expiration,
          expiration_days, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
        RETURNING *
      `, [
        requirements.minLength,
        requirements.maxLength,
        requirements.requireUppercase,
        requirements.requireLowercase,
        requirements.requireNumbers,
        requirements.requireSpecialCharacters,
        requirements.specialCharacterSet || '!@#$%^&*()_+-=[]{}|;:,.<>?',
        requirements.preventCommonPasswords ?? true,
        requirements.preventUserInfoInPassword ?? true,
        requirements.enablePasswordHistory ?? true,
        requirements.passwordHistoryCount || 5,
        requirements.enablePasswordExpiration ?? true,
        requirements.expirationDays || 90,
        userId
      ]);

      const req = result.rows[0];
      return {
        id: req.id,
        minLength: req.min_length,
        maxLength: req.max_length,
        requireUppercase: req.require_uppercase,
        requireLowercase: req.require_lowercase,
        requireNumbers: req.require_numbers,
        requireSpecialCharacters: req.require_special_characters,
        specialCharacterSet: req.special_character_set,
        preventCommonPasswords: req.prevent_common_passwords,
        preventUserInfoInPassword: req.prevent_user_info_in_password,
        enablePasswordHistory: req.enable_password_history,
        passwordHistoryCount: req.password_history_count,
        enablePasswordExpiration: req.enable_password_expiration,
        expirationDays: req.expiration_days,
        isActive: req.is_active,
        createdAt: req.created_at,
        updatedAt: req.updated_at
      };
    } catch (error) {
      console.error('Error creating password complexity requirements:', error);
      throw new Error('Failed to create password complexity requirements');
    }
  }

  /**
   * Validate password against current requirements
   */
  async validatePassword(password, userInfo = {}) {
    try {
      const requirements = await this.getPasswordComplexityRequirements();
      const feedback = [];
      let score = 0;

      // Length validation
      if (password.length < requirements.minLength) {
        feedback.push(`Password must be at least ${requirements.minLength} characters long`);
      } else {
        score += 20;
      }

      if (requirements.maxLength && password.length > requirements.maxLength) {
        feedback.push(`Password must not exceed ${requirements.maxLength} characters`);
      }

      // Character requirements
      if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
        feedback.push('Password must contain at least one uppercase letter');
      } else if (requirements.requireUppercase) {
        score += 15;
      }

      if (requirements.requireLowercase && !/[a-z]/.test(password)) {
        feedback.push('Password must contain at least one lowercase letter');
      } else if (requirements.requireLowercase) {
        score += 15;
      }

      if (requirements.requireNumbers && !/[0-9]/.test(password)) {
        feedback.push('Password must contain at least one number');
      } else if (requirements.requireNumbers) {
        score += 15;
      }

      if (requirements.requireSpecialCharacters) {
        const specialChars = requirements.specialCharacterSet || '!@#$%^&*()_+-=[]{}|;:,.<>?';
        const specialCharRegex = new RegExp(`[${specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`);
        if (!specialCharRegex.test(password)) {
          feedback.push(`Password must contain at least one special character (${specialChars})`);
        } else {
          score += 15;
        }
      }

      // Common password check
      if (requirements.preventCommonPasswords) {
        const lowercasePassword = password.toLowerCase();
        if (this.commonPasswords.has(lowercasePassword)) {
          feedback.push('Password is too common. Please choose a more unique password');
        } else {
          score += 10;
        }
      }

      // User info in password check
      if (requirements.preventUserInfoInPassword && userInfo) {
        const lowercasePassword = password.toLowerCase();
        const userInfoFields = ['name', 'email', 'firstName', 'lastName', 'username'];

        for (const field of userInfoFields) {
          if (userInfo[field]) {
            const fieldValue = userInfo[field].toLowerCase();
            if (fieldValue.length >= 3 && lowercasePassword.includes(fieldValue)) {
              feedback.push('Password must not contain personal information');
              break;
            }
          }
        }

        if (!feedback.some(f => f.includes('personal information'))) {
          score += 10;
        }
      }

      // Additional strength scoring
      const lengthBonus = Math.min((password.length - requirements.minLength) * 2, 10);
      score += lengthBonus;

      const isValid = feedback.length === 0;
      return {
        isValid,
        feedback,
        strength: Math.min(score, 100)
      };
    } catch (error) {
      console.error('Error validating password:', error);
      throw new Error('Failed to validate password');
    }
  }

  /**
   * Add password to history
   */
  async addPasswordToHistory(userId, passwordHash) {
    try {
      const requirements = await this.getPasswordComplexityRequirements();

      if (!requirements.enablePasswordHistory || !requirements.passwordHistoryCount || requirements.passwordHistoryCount === 0) {
        return; // History disabled
      }

      // Add new password to history
      await query(`
        INSERT INTO password_history (user_id, password_hash)
        VALUES ($1, $2)
      `, [userId, passwordHash]);

      // Clean up old passwords beyond the history limit
      await query(`
        DELETE FROM password_history
        WHERE user_id = $1
        AND id NOT IN (
          SELECT id FROM password_history
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT $2
        )
      `, [userId, requirements.passwordHistoryCount]);

    } catch (error) {
      console.error('Error adding password to history:', error);
      // Don't throw here as this is not critical for password change
    }
  }

  /**
   * Check if password was used recently
   */
  async checkPasswordHistory(userId, passwordHash) {
    try {
      const requirements = await this.getPasswordComplexityRequirements();

      if (!requirements.enablePasswordHistory || !requirements.passwordHistoryCount || requirements.passwordHistoryCount === 0) {
        return false; // History disabled, allow any password
      }

      const result = await query(`
        SELECT password_hash FROM password_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [userId, requirements.passwordHistoryCount]);

      // Check if the new password matches any of the stored hashes
      for (const row of result.rows) {
        const isMatch = await bcrypt.compare(passwordHash, row.password_hash);
        if (isMatch) {
          return true; // Password was used recently
        }
      }

      return false; // Password is not in recent history
    } catch (error) {
      console.error('Error checking password history:', error);
      return false; // Default to allowing password if check fails
    }
  }

  /**
   * Get password expiration info for a user
   */
  async getPasswordExpirationInfo(userId) {
    try {
      // Get user's password change date from either employees or users table
      let userResult = await query(`
        SELECT password_changed_at, password_expires_at, force_password_change
        FROM employees
        WHERE id = $1
      `, [userId]);

      if (userResult.rows.length === 0) {
        userResult = await query(`
          SELECT password_changed_at, password_expires_at, force_password_change
          FROM users
          WHERE id = $1
        `, [userId]);
      }

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];
      const requirements = await this.getPasswordComplexityRequirements();

      let passwordExpiresAt = user.password_expires_at;
      let passwordChangedAt = user.password_changed_at;

      // Calculate expiration if not set and expiration is enabled
      if (!passwordExpiresAt && requirements.enablePasswordExpiration && requirements.expirationDays && passwordChangedAt) {
        const expirationDate = new Date(passwordChangedAt);
        expirationDate.setDate(expirationDate.getDate() + requirements.expirationDays);
        passwordExpiresAt = expirationDate.toISOString();
      }

      const now = new Date();
      const expirationDate = passwordExpiresAt ? new Date(passwordExpiresAt) : null;

      let daysUntilExpiration = null;
      let isExpired = false;

      if (expirationDate) {
        const timeDiff = expirationDate.getTime() - now.getTime();
        daysUntilExpiration = Math.ceil(timeDiff / (1000 * 3600 * 24));
        isExpired = daysUntilExpiration <= 0;
      }

      return {
        passwordChangedAt,
        passwordExpiresAt,
        daysUntilExpiration,
        isExpired,
        forcePasswordChange: user.force_password_change || false
      };
    } catch (error) {
      console.error('Error getting password expiration info:', error);
      throw new Error('Failed to get password expiration info');
    }
  }

  /**
   * Update user's password change timestamp and expiration
   */
  async updatePasswordChangeTimestamp(userId, userType = 'employee') {
    try {
      const requirements = await this.getPasswordComplexityRequirements();
      const now = new Date();

      let passwordExpiresAt = null;
      if (requirements.enablePasswordExpiration && requirements.expirationDays) {
        const expirationDate = new Date(now);
        expirationDate.setDate(expirationDate.getDate() + requirements.expirationDays);
        passwordExpiresAt = expirationDate;
      }

      const table = userType === 'employee' ? 'employees' : 'users';

      await query(`
        UPDATE ${table}
        SET
          password_changed_at = $1,
          password_expires_at = $2,
          force_password_change = false
        WHERE id = $3
      `, [now, passwordExpiresAt, userId]);

    } catch (error) {
      console.error('Error updating password change timestamp:', error);
      // Don't throw here as this is not critical for password change
    }
  }
}

export const passwordComplexityService = new PasswordComplexityService();
export default passwordComplexityService;