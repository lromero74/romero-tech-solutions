import { getPool } from '../config/database.js';

class SystemSettingsService {
  /**
   * Get system settings by keys
   * @param {Array<string>} keys - Array of setting keys to retrieve
   * @returns {Object} Settings object with key-value pairs
   */
  async getSettings(keys) {
    try {
      if (!Array.isArray(keys) || keys.length === 0) {
        return {};
      }

      const pool = await getPool();
      const placeholders = keys.map((_, index) => `$${index + 1}`).join(',');

      const query = `
        SELECT setting_key, setting_value
        FROM system_settings
        WHERE setting_key IN (${placeholders})
      `;

      const result = await pool.query(query, keys);

      const settings = {};
      result.rows.forEach(row => {
        // Parse JSON values if they're stored as JSON
        let value = row.setting_value;
        if (typeof value === 'string') {
          try {
            value = JSON.parse(value);
          } catch {
            // Keep as string if not valid JSON
          }
        }
        settings[row.setting_key] = value;
      });

      return settings;
    } catch (error) {
      console.error('Error fetching system settings:', error);
      return {};
    }
  }

  /**
   * Get a single setting value
   * @param {string} key - Setting key
   * @param {*} defaultValue - Default value if setting not found
   * @returns {*} Setting value or default
   */
  async getSetting(key, defaultValue = null) {
    try {
      const settings = await this.getSettings([key]);
      return settings[key] !== undefined ? settings[key] : defaultValue;
    } catch (error) {
      console.error(`Error fetching setting ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * Set a system setting
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   * @param {string} type - Setting type (optional)
   * @param {string} description - Setting description (optional)
   * @returns {boolean} Success status
   */
  async setSetting(key, value, type = 'general', description = null) {
    try {
      const pool = await getPool();

      // Convert value to JSON if it's an object
      const jsonValue = typeof value === 'object' ? JSON.stringify(value) : value;

      const query = `
        INSERT INTO system_settings (setting_key, setting_value, setting_type, description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (setting_key)
        DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          setting_type = EXCLUDED.setting_type,
          description = COALESCE(EXCLUDED.description, system_settings.description),
          updated_at = CURRENT_TIMESTAMP
      `;

      await pool.query(query, [key, jsonValue, type, description]);
      return true;
    } catch (error) {
      console.error(`Error setting ${key}:`, error);
      return false;
    }
  }

  /**
   * Get all settings by type
   * @param {string} type - Setting type
   * @returns {Object} Settings object
   */
  async getSettingsByType(type) {
    try {
      const pool = await getPool();

      const query = `
        SELECT setting_key, setting_value, description
        FROM system_settings
        WHERE setting_type = $1
        ORDER BY setting_key
      `;

      const result = await pool.query(query, [type]);

      const settings = {};
      result.rows.forEach(row => {
        let value = row.setting_value;
        if (typeof value === 'string') {
          try {
            value = JSON.parse(value);
          } catch {
            // Keep as string if not valid JSON
          }
        }
        settings[row.setting_key] = {
          value,
          description: row.description
        };
      });

      return settings;
    } catch (error) {
      console.error(`Error fetching settings by type ${type}:`, error);
      return {};
    }
  }

  /**
   * Delete a system setting
   * @param {string} key - Setting key
   * @returns {boolean} Success status
   */
  async deleteSetting(key) {
    try {
      const pool = await getPool();

      const query = 'DELETE FROM system_settings WHERE setting_key = $1';
      await pool.query(query, [key]);

      return true;
    } catch (error) {
      console.error(`Error deleting setting ${key}:`, error);
      return false;
    }
  }

  /**
   * Get scheduler configuration with defaults
   * @returns {Object} Scheduler configuration
   */
  async getSchedulerConfig() {
    const settings = await this.getSettings([
      'scheduler_buffer_before_hours',
      'scheduler_buffer_after_hours',
      'scheduler_default_slot_duration_hours',
      'scheduler_minimum_advance_hours'
    ]);

    return {
      bufferBeforeHours: parseInt(settings.scheduler_buffer_before_hours || '2'),
      bufferAfterHours: parseInt(settings.scheduler_buffer_after_hours || '1'),
      defaultSlotDurationHours: parseInt(settings.scheduler_default_slot_duration_hours || '2'),
      minimumAdvanceHours: parseInt(settings.scheduler_minimum_advance_hours || '1')
    };
  }
}

export const systemSettingsService = new SystemSettingsService();