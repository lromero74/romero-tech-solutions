import { getPool } from '../config/database.js';

/**
 * Client Quota Service
 * Manages per-client quota customization
 */
class ClientQuotaService {

  /**
   * Get client quota configuration
   * @param {string} businessId - Business UUID
   * @returns {object} Client quota configuration
   */
  async getClientQuota(businessId) {
    try {
      const query = `
        SELECT
          business_id,
          max_file_size_bytes,
          max_file_count,
          storage_limit_bytes as max_total_storage_bytes,
          storage_soft_limit_bytes,
          warning_threshold_percentage,
          alert_threshold_percentage,
          use_global_defaults,
          custom_quota_enabled,
          quota_type,
          created_at,
          updated_at
        FROM t_client_storage_quotas
        WHERE business_id = $1 AND quota_type = 'business'
      `;

      const pool = await getPool();
      const result = await pool.query(query, [businessId]);

      if (result.rows.length === 0) {
        // Return null if no quota exists for this client
        return null;
      }

      const quota = result.rows[0];
      return {
        businessId: quota.business_id,
        maxFileSizeBytes: quota.max_file_size_bytes ? parseInt(quota.max_file_size_bytes) : null,
        maxTotalStorageBytes: parseInt(quota.max_total_storage_bytes),
        maxFileCount: quota.max_file_count ? parseInt(quota.max_file_count) : null,
        storageSoftLimitBytes: parseInt(quota.storage_soft_limit_bytes),
        warningThresholdPercentage: quota.warning_threshold_percentage,
        alertThresholdPercentage: quota.alert_threshold_percentage,
        useGlobalDefaults: quota.use_global_defaults,
        customQuotaEnabled: quota.custom_quota_enabled,
        quotaType: quota.quota_type,
        createdAt: quota.created_at,
        updatedAt: quota.updated_at,
        // Formatted values
        maxFileSizeFormatted: quota.max_file_size_bytes ? this.formatBytes(quota.max_file_size_bytes) : null,
        maxTotalStorageFormatted: this.formatBytes(quota.max_total_storage_bytes),
        storageSoftLimitFormatted: this.formatBytes(quota.storage_soft_limit_bytes)
      };

    } catch (error) {
      console.error('❌ Failed to get client quota:', error);
      throw error;
    }
  }

  /**
   * Update or create client quota customization
   * @param {string} businessId - Business UUID
   * @param {object} quotaData - Quota configuration
   * @param {string} employeeId - Employee making the change
   * @returns {object} Updated quota
   */
  async updateClientQuota(businessId, quotaData, employeeId) {
    const pool = await getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Validate quota data if custom quota is enabled
      if (quotaData.customQuotaEnabled && !quotaData.useGlobalDefaults) {
        this.validateQuotaData(quotaData);
      }

      // Check if quota record exists
      const checkQuery = `
        SELECT id FROM t_client_storage_quotas
        WHERE business_id = $1 AND quota_type = 'business'
      `;
      const checkResult = await client.query(checkQuery, [businessId]);

      let result;
      if (checkResult.rows.length === 0) {
        // Create new quota record
        const insertQuery = `
          INSERT INTO t_client_storage_quotas (
            business_id,
            quota_type,
            storage_limit_bytes,
            storage_soft_limit_bytes,
            max_file_size_bytes,
            max_file_count,
            warning_threshold_percentage,
            alert_threshold_percentage,
            use_global_defaults,
            custom_quota_enabled,
            is_active
          ) VALUES ($1, 'business', $2, $3, $4, $5, $6, $7, $8, $9, true)
          RETURNING *
        `;

        const values = [
          businessId,
          quotaData.maxTotalStorageBytes || null,
          quotaData.storageSoftLimitBytes || null,
          quotaData.maxFileSizeBytes || null,
          quotaData.maxFileCount || null,
          quotaData.warningThresholdPercentage || null,
          quotaData.alertThresholdPercentage || null,
          quotaData.useGlobalDefaults !== undefined ? quotaData.useGlobalDefaults : true,
          quotaData.customQuotaEnabled !== undefined ? quotaData.customQuotaEnabled : false
        ];

        result = await client.query(insertQuery, values);
      } else {
        // Update existing quota record
        const updateQuery = `
          UPDATE t_client_storage_quotas
          SET
            storage_limit_bytes = $2,
            storage_soft_limit_bytes = $3,
            max_file_size_bytes = $4,
            max_file_count = $5,
            warning_threshold_percentage = $6,
            alert_threshold_percentage = $7,
            use_global_defaults = $8,
            custom_quota_enabled = $9,
            updated_at = CURRENT_TIMESTAMP
          WHERE business_id = $1 AND quota_type = 'business'
          RETURNING *
        `;

        const values = [
          businessId,
          quotaData.maxTotalStorageBytes || null,
          quotaData.storageSoftLimitBytes || null,
          quotaData.maxFileSizeBytes || null,
          quotaData.maxFileCount || null,
          quotaData.warningThresholdPercentage || null,
          quotaData.alertThresholdPercentage || null,
          quotaData.useGlobalDefaults !== undefined ? quotaData.useGlobalDefaults : true,
          quotaData.customQuotaEnabled !== undefined ? quotaData.customQuotaEnabled : false
        ];

        result = await client.query(updateQuery, values);
      }

      await client.query('COMMIT');

      const updatedQuota = result.rows[0];
      console.log(`📊 Client quota updated for business ${businessId} by employee ${employeeId}`);

      return {
        businessId: updatedQuota.business_id,
        maxFileSizeBytes: updatedQuota.max_file_size_bytes ? parseInt(updatedQuota.max_file_size_bytes) : null,
        maxTotalStorageBytes: parseInt(updatedQuota.storage_limit_bytes),
        maxFileCount: updatedQuota.max_file_count ? parseInt(updatedQuota.max_file_count) : null,
        storageSoftLimitBytes: parseInt(updatedQuota.storage_soft_limit_bytes),
        warningThresholdPercentage: updatedQuota.warning_threshold_percentage,
        alertThresholdPercentage: updatedQuota.alert_threshold_percentage,
        useGlobalDefaults: updatedQuota.use_global_defaults,
        customQuotaEnabled: updatedQuota.custom_quota_enabled,
        quotaType: updatedQuota.quota_type,
        createdAt: updatedQuota.created_at,
        updatedAt: updatedQuota.updated_at
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to update client quota:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reset client to use global defaults
   * @param {string} businessId - Business UUID
   * @param {string} employeeId - Employee making the change
   * @returns {object} Updated quota
   */
  async resetToGlobalDefaults(businessId, employeeId) {
    try {
      const quotaData = {
        useGlobalDefaults: true,
        customQuotaEnabled: false,
        maxFileSizeBytes: null,
        maxTotalStorageBytes: null,
        maxFileCount: null,
        storageSoftLimitBytes: null,
        warningThresholdPercentage: null,
        alertThresholdPercentage: null
      };

      return await this.updateClientQuota(businessId, quotaData, employeeId);

    } catch (error) {
      console.error('❌ Failed to reset client to global defaults:', error);
      throw error;
    }
  }

  /**
   * Get current usage for a client
   * @param {string} businessId - Business UUID
   * @returns {object} Usage statistics
   */
  async getClientUsage(businessId) {
    try {
      const query = `
        SELECT
          COUNT(*) as file_count,
          COALESCE(SUM(file_size_bytes), 0) as total_bytes
        FROM t_client_files
        WHERE business_id = $1 AND soft_delete = false
      `;

      const pool = await getPool();
      const result = await pool.query(query, [businessId]);
      const usage = result.rows[0];

      return {
        fileCount: parseInt(usage.file_count),
        totalBytes: parseInt(usage.total_bytes),
        totalFormatted: this.formatBytes(usage.total_bytes)
      };

    } catch (error) {
      console.error('❌ Failed to get client usage:', error);
      throw error;
    }
  }

  /**
   * Validate quota data
   * @param {object} quotaData - Quota data to validate
   * @throws {Error} If validation fails
   */
  validateQuotaData(quotaData) {
    if (quotaData.maxFileSizeBytes && quotaData.maxFileSizeBytes <= 0) {
      throw new Error('Max file size must be greater than 0');
    }

    if (quotaData.maxTotalStorageBytes && quotaData.maxTotalStorageBytes <= 0) {
      throw new Error('Max total storage must be greater than 0');
    }

    if (quotaData.maxFileCount && quotaData.maxFileCount <= 0) {
      throw new Error('Max file count must be greater than 0');
    }

    if (quotaData.storageSoftLimitBytes && quotaData.storageSoftLimitBytes <= 0) {
      throw new Error('Storage soft limit must be greater than 0');
    }

    if (quotaData.storageSoftLimitBytes && quotaData.maxTotalStorageBytes &&
        quotaData.storageSoftLimitBytes > quotaData.maxTotalStorageBytes) {
      throw new Error('Soft limit cannot exceed hard limit');
    }

    if (quotaData.maxFileSizeBytes && quotaData.maxTotalStorageBytes &&
        quotaData.maxFileSizeBytes > quotaData.maxTotalStorageBytes) {
      throw new Error('Max file size cannot exceed total storage limit');
    }

    if (quotaData.warningThresholdPercentage !== undefined &&
        (quotaData.warningThresholdPercentage < 0 || quotaData.warningThresholdPercentage > 100)) {
      throw new Error('Warning threshold must be between 0 and 100');
    }

    if (quotaData.alertThresholdPercentage !== undefined &&
        (quotaData.alertThresholdPercentage < 0 || quotaData.alertThresholdPercentage > 100)) {
      throw new Error('Alert threshold must be between 0 and 100');
    }

    if (quotaData.warningThresholdPercentage && quotaData.alertThresholdPercentage &&
        quotaData.warningThresholdPercentage >= quotaData.alertThresholdPercentage) {
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
const clientQuotaService = new ClientQuotaService();

export default clientQuotaService;
