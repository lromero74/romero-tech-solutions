import { getPool } from '../config/database.js';

/**
 * Global Quota Service
 * Manages global default quotas that apply to all clients unless overridden
 */
class GlobalQuotaService {

  /**
   * Get the active global quota defaults
   * @returns {object} Global quota configuration
   */
  async getGlobalQuotaDefaults() {
    try {
      const query = `
        SELECT
          id,
          max_file_size_bytes,
          max_total_storage_bytes,
          max_file_count,
          storage_soft_limit_bytes,
          warning_threshold_percentage,
          alert_threshold_percentage,
          is_active,
          created_at,
          updated_at,
          created_by_employee_id,
          notes
        FROM t_global_quota_defaults
        WHERE is_active = true
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const pool = await getPool();
      const result = await pool.query(query);

      if (result.rows.length === 0) {
        return null;
      }

      const quota = result.rows[0];
      return {
        id: quota.id,
        maxFileSizeBytes: parseInt(quota.max_file_size_bytes),
        maxTotalStorageBytes: parseInt(quota.max_total_storage_bytes),
        maxFileCount: parseInt(quota.max_file_count),
        storageSoftLimitBytes: parseInt(quota.storage_soft_limit_bytes),
        warningThresholdPercentage: quota.warning_threshold_percentage,
        alertThresholdPercentage: quota.alert_threshold_percentage,
        isActive: quota.is_active,
        createdAt: quota.created_at,
        updatedAt: quota.updated_at,
        createdByEmployeeId: quota.created_by_employee_id,
        notes: quota.notes,
        // Formatted values for UI
        maxFileSizeFormatted: this.formatBytes(quota.max_file_size_bytes),
        maxTotalStorageFormatted: this.formatBytes(quota.max_total_storage_bytes),
        storageSoftLimitFormatted: this.formatBytes(quota.storage_soft_limit_bytes)
      };

    } catch (error) {
      console.error('❌ Failed to get global quota defaults:', error);
      throw error;
    }
  }

  /**
   * Update global quota defaults
   * @param {object} quotaData - New quota settings
   * @param {string} employeeId - Employee making the change
   * @returns {object} Updated quota
   */
  async updateGlobalQuotaDefaults(quotaData, employeeId) {
    const pool = await getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Validate input
      this.validateQuotaData(quotaData);

      // Deactivate old global quota
      await client.query(`
        UPDATE t_global_quota_defaults
        SET is_active = false
        WHERE is_active = true
      `);

      // Insert new global quota
      const insertQuery = `
        INSERT INTO t_global_quota_defaults (
          max_file_size_bytes,
          max_total_storage_bytes,
          max_file_count,
          storage_soft_limit_bytes,
          warning_threshold_percentage,
          alert_threshold_percentage,
          is_active,
          created_by_employee_id,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8)
        RETURNING *
      `;

      const values = [
        quotaData.maxFileSizeBytes,
        quotaData.maxTotalStorageBytes,
        quotaData.maxFileCount,
        quotaData.storageSoftLimitBytes,
        quotaData.warningThresholdPercentage || 80,
        quotaData.alertThresholdPercentage || 95,
        employeeId,
        quotaData.notes || null
      ];

      const result = await client.query(insertQuery, values);
      const newQuota = result.rows[0];

      await client.query('COMMIT');

      console.log(`📊 Global quota updated by employee ${employeeId}`);

      return {
        id: newQuota.id,
        maxFileSizeBytes: parseInt(newQuota.max_file_size_bytes),
        maxTotalStorageBytes: parseInt(newQuota.max_total_storage_bytes),
        maxFileCount: parseInt(newQuota.max_file_count),
        storageSoftLimitBytes: parseInt(newQuota.storage_soft_limit_bytes),
        warningThresholdPercentage: newQuota.warning_threshold_percentage,
        alertThresholdPercentage: newQuota.alert_threshold_percentage,
        isActive: newQuota.is_active,
        createdAt: newQuota.created_at,
        updatedAt: newQuota.updated_at,
        createdByEmployeeId: newQuota.created_by_employee_id,
        notes: newQuota.notes
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to update global quota:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get effective quota for a business (global or custom)
   * @param {string} businessId - Business UUID
   * @returns {object} Effective quota for the business
   */
  async getEffectiveQuota(businessId) {
    try {
      const query = `SELECT * FROM get_effective_quota($1)`;
      const pool = await getPool();
      const result = await pool.query(query, [businessId]);

      if (result.rows.length === 0) {
        return null;
      }

      const quota = result.rows[0];
      return {
        maxFileSizeBytes: parseInt(quota.max_file_size_bytes),
        maxTotalStorageBytes: parseInt(quota.max_total_storage_bytes),
        maxFileCount: parseInt(quota.max_file_count),
        storageSoftLimitBytes: parseInt(quota.storage_soft_limit_bytes),
        warningThresholdPercentage: quota.warning_threshold_percentage,
        alertThresholdPercentage: quota.alert_threshold_percentage,
        quotaSource: quota.quota_source, // 'global' or 'custom'
        // Formatted values
        maxFileSizeFormatted: this.formatBytes(quota.max_file_size_bytes),
        maxTotalStorageFormatted: this.formatBytes(quota.max_total_storage_bytes),
        storageSoftLimitFormatted: this.formatBytes(quota.storage_soft_limit_bytes)
      };

    } catch (error) {
      console.error('❌ Failed to get effective quota:', error);
      throw error;
    }
  }

  /**
   * Validate quota data
   * @param {object} quotaData - Quota data to validate
   * @throws {Error} If validation fails
   */
  validateQuotaData(quotaData) {
    if (!quotaData.maxFileSizeBytes || quotaData.maxFileSizeBytes <= 0) {
      throw new Error('Max file size must be greater than 0');
    }

    if (!quotaData.maxTotalStorageBytes || quotaData.maxTotalStorageBytes <= 0) {
      throw new Error('Max total storage must be greater than 0');
    }

    if (!quotaData.maxFileCount || quotaData.maxFileCount <= 0) {
      throw new Error('Max file count must be greater than 0');
    }

    if (!quotaData.storageSoftLimitBytes || quotaData.storageSoftLimitBytes <= 0) {
      throw new Error('Storage soft limit must be greater than 0');
    }

    if (quotaData.storageSoftLimitBytes > quotaData.maxTotalStorageBytes) {
      throw new Error('Soft limit cannot exceed hard limit');
    }

    if (quotaData.maxFileSizeBytes > quotaData.maxTotalStorageBytes) {
      throw new Error('Max file size cannot exceed total storage limit');
    }

    const warningThreshold = quotaData.warningThresholdPercentage || 80;
    const alertThreshold = quotaData.alertThresholdPercentage || 95;

    if (warningThreshold < 0 || warningThreshold > 100) {
      throw new Error('Warning threshold must be between 0 and 100');
    }

    if (alertThreshold < 0 || alertThreshold > 100) {
      throw new Error('Alert threshold must be between 0 and 100');
    }

    if (warningThreshold >= alertThreshold) {
      throw new Error('Warning threshold must be less than alert threshold');
    }
  }

  /**
   * Format bytes into human-readable format
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    if (bytes < 0) return 'Unlimited';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Create singleton instance
const globalQuotaService = new GlobalQuotaService();

export default globalQuotaService;
