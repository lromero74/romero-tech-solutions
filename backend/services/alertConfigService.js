/**
 * Alert Configuration Service
 * Manages alert configurations from database
 */

const db = require('../config/database');

class AlertConfigService {
  constructor() {
    this.configs = new Map(); // Cache configurations in memory
    this.lastLoadTime = null;
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Load all alert configurations from database
   */
  async loadConfigurations() {
    try {
      const result = await db.query(
        `SELECT * FROM alert_configurations WHERE enabled = true ORDER BY id`
      );

      // Clear and rebuild cache
      this.configs.clear();
      result.rows.forEach(config => {
        this.configs.set(config.alert_type, config);
      });

      this.lastLoadTime = Date.now();
      console.log(`✅ Loaded ${result.rows.length} alert configurations`);

      return result.rows;
    } catch (error) {
      console.error('❌ Error loading alert configurations:', error);
      throw error;
    }
  }

  /**
   * Get configuration for specific alert type
   */
  async getConfig(alertType) {
    await this.ensureFreshCache();
    return this.configs.get(alertType);
  }

  /**
   * Get all enabled configurations
   */
  async getAllConfigs() {
    await this.ensureFreshCache();
    return Array.from(this.configs.values());
  }

  /**
   * Get configuration by ID
   */
  async getConfigById(id) {
    try {
      const result = await db.query(
        'SELECT * FROM alert_configurations WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('❌ Error fetching alert config by ID:', error);
      throw error;
    }
  }

  /**
   * Update alert configuration
   */
  async updateConfig(id, updates, updatedBy) {
    try {
      const setFields = [];
      const values = [];
      let paramCount = 1;

      // Build dynamic UPDATE query
      Object.entries(updates).forEach(([key, value]) => {
        if (key !== 'id' && key !== 'created_at' && key !== 'created_by') {
          setFields.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      });

      // Add updated_at and updated_by
      setFields.push(`updated_at = NOW()`);
      setFields.push(`updated_by = $${paramCount}`);
      values.push(updatedBy);
      paramCount++;

      // Add ID for WHERE clause
      values.push(id);

      const query = `
        UPDATE alert_configurations
        SET ${setFields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;

      const result = await db.query(query, values);

      // Invalidate cache
      this.lastLoadTime = null;

      return result.rows[0];
    } catch (error) {
      console.error('❌ Error updating alert configuration:', error);
      throw error;
    }
  }

  /**
   * Create new alert configuration
   */
  async createConfig(configData, createdBy) {
    try {
      const {
        alert_name,
        alert_type,
        enabled = true,
        min_indicator_count = 2,
        require_extreme_for_single = true,
        rsi_thresholds,
        stochastic_thresholds,
        williams_r_thresholds,
        macd_settings,
        roc_settings,
        atr_settings,
        notify_email = false,
        notify_dashboard = true,
        notify_websocket = true,
      } = configData;

      const query = `
        INSERT INTO alert_configurations (
          alert_name, alert_type, enabled,
          min_indicator_count, require_extreme_for_single,
          rsi_thresholds, stochastic_thresholds, williams_r_thresholds,
          macd_settings, roc_settings, atr_settings,
          notify_email, notify_dashboard, notify_websocket,
          created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
        RETURNING *
      `;

      const values = [
        alert_name,
        alert_type,
        enabled,
        min_indicator_count,
        require_extreme_for_single,
        JSON.stringify(rsi_thresholds),
        JSON.stringify(stochastic_thresholds),
        JSON.stringify(williams_r_thresholds),
        JSON.stringify(macd_settings),
        JSON.stringify(roc_settings),
        JSON.stringify(atr_settings),
        notify_email,
        notify_dashboard,
        notify_websocket,
        createdBy,
      ];

      const result = await db.query(query, values);

      // Invalidate cache
      this.lastLoadTime = null;

      return result.rows[0];
    } catch (error) {
      console.error('❌ Error creating alert configuration:', error);
      throw error;
    }
  }

  /**
   * Delete alert configuration (soft delete by disabling)
   */
  async deleteConfig(id, updatedBy) {
    try {
      const result = await db.query(
        `UPDATE alert_configurations
         SET enabled = false, updated_at = NOW(), updated_by = $2
         WHERE id = $1
         RETURNING *`,
        [id, updatedBy]
      );

      // Invalidate cache
      this.lastLoadTime = null;

      return result.rows[0];
    } catch (error) {
      console.error('❌ Error deleting alert configuration:', error);
      throw error;
    }
  }

  /**
   * Ensure cache is fresh (reload if expired)
   */
  async ensureFreshCache() {
    if (!this.lastLoadTime || Date.now() - this.lastLoadTime > this.CACHE_TTL) {
      await this.loadConfigurations();
    }
  }

  /**
   * Get threshold values for a specific indicator
   */
  async getIndicatorThresholds(alertType, indicatorName) {
    const config = await this.getConfig(alertType);
    if (!config) return null;

    const thresholdKey = `${indicatorName}_thresholds`;
    const settingsKey = `${indicatorName}_settings`;

    return config[thresholdKey] || config[settingsKey] || null;
  }
}

// Export singleton instance
module.exports = new AlertConfigService();
