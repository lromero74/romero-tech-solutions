import { getPool } from '../config/database.js';

/**
 * Quota Management Service
 * Handles hierarchical storage quotas and usage tracking
 */
class QuotaManagementService {

  /**
   * Check if file upload is allowed within quota limits
   * @param {string} businessId - Business UUID
   * @param {number} fileSizeBytes - Size of file to upload
   * @param {string} serviceLocationId - Service location UUID (optional)
   * @param {string} userId - User UUID (optional)
   * @returns {object} Quota check result
   */
  async checkQuotaAvailability(businessId, fileSizeBytes, serviceLocationId = null, userId = null) {
    try {
      const query = `SELECT * FROM check_available_quota($1, $2, $3, $4)`;
      const values = [businessId, fileSizeBytes, serviceLocationId, userId];

      const pool = await getPool();
      const result = await pool.query(query, values);
      const quotaResult = result.rows[0];

      console.log(`💾 Quota check for business ${businessId}:`, {
        fileSizeBytes,
        canUpload: quotaResult.can_upload,
        quotaType: quotaResult.quota_type,
        availableBytes: quotaResult.available_bytes,
        usagePercentage: quotaResult.usage_percentage,
        warningLevel: quotaResult.warning_level
      });

      return {
        canUpload: quotaResult.can_upload,
        quotaType: quotaResult.quota_type,
        availableBytes: parseInt(quotaResult.available_bytes),
        reason: quotaResult.reason,
        warningLevel: quotaResult.warning_level,
        softLimitExceeded: quotaResult.soft_limit_exceeded,
        usagePercentage: parseFloat(quotaResult.usage_percentage),
        message: this.formatQuotaMessage(quotaResult)
      };

    } catch (error) {
      console.error('❌ Failed to check quota availability:', error);
      return {
        canUpload: false,
        quotaType: 'unknown',
        availableBytes: 0,
        reason: 'System error checking quota',
        warningLevel: 'error',
        softLimitExceeded: true,
        usagePercentage: 100,
        message: 'Unable to verify storage quota. Please try again later.'
      };
    }
  }

  /**
   * Get comprehensive quota information for a business
   * @param {string} businessId - Business UUID
   * @returns {object} Detailed quota information
   */
  async getBusinessQuotaInfo(businessId) {
    try {
      const query = `
        SELECT
          q.*,
          COALESCE(u.total_used_bytes, 0) as current_usage_bytes,
          CASE
            WHEN q.storage_limit_bytes > 0 THEN
              ROUND((COALESCE(u.total_used_bytes, 0)::numeric / q.storage_limit_bytes::numeric) * 100, 2)
            ELSE 0
          END as usage_percentage,
          CASE
            WHEN q.storage_limit_bytes > 0 THEN (q.storage_limit_bytes - COALESCE(u.total_used_bytes, 0))
            ELSE -1
          END as available_bytes
        FROM t_client_storage_quotas q
        LEFT JOIN (
          SELECT
            business_id,
            SUM(file_size_bytes) as total_used_bytes
          FROM t_client_files
          WHERE business_id = $1 AND deleted_at IS NULL
          GROUP BY business_id
        ) u ON q.business_id = u.business_id
        WHERE q.business_id = $1 AND q.quota_type = 'business'
      `;

      const pool = await getPool();
      const result = await pool.query(query, [businessId]);

      if (result.rows.length === 0) {
        // Create default business quota if none exists
        return await this.createDefaultBusinessQuota(businessId);
      }

      const quota = result.rows[0];

      return {
        businessId: quota.business_id,
        quotaType: quota.quota_type,
        softLimitBytes: parseInt(quota.storage_soft_limit_bytes || 0),
        hardLimitBytes: parseInt(quota.storage_limit_bytes),
        currentUsageBytes: parseInt(quota.current_usage_bytes),
        availableBytes: parseInt(quota.available_bytes),
        usagePercentage: parseFloat(quota.usage_percentage),
        warningLevel: this.getWarningLevel(parseFloat(quota.usage_percentage)),
        createdAt: quota.created_at,
        updatedAt: quota.updated_at
      };

    } catch (error) {
      console.error('❌ Failed to get business quota info:', error);
      return null;
    }
  }

  /**
   * Create default business quota
   * @param {string} businessId - Business UUID
   * @returns {object} Created quota information
   */
  async createDefaultBusinessQuota(businessId) {
    try {
      const defaultSoftLimit = 1024 * 1024 * 1024; // 1GB
      const defaultHardLimit = 2 * 1024 * 1024 * 1024; // 2GB

      const query = `
        INSERT INTO t_client_storage_quotas (
          business_id, quota_type, soft_limit_bytes, hard_limit_bytes, is_active
        ) VALUES ($1, 'business', $2, $3, true)
        RETURNING *
      `;

      const pool = await getPool();
      const result = await pool.query(query, [businessId, defaultSoftLimit, defaultHardLimit]);
      const quota = result.rows[0];

      console.log(`📊 Created default business quota for ${businessId}: ${this.formatBytes(defaultHardLimit)}`);

      return {
        businessId: quota.business_id,
        quotaType: quota.quota_type,
        softLimitBytes: parseInt(quota.storage_soft_limit_bytes || 0),
        hardLimitBytes: parseInt(quota.storage_limit_bytes),
        currentUsageBytes: 0,
        availableBytes: parseInt(quota.storage_limit_bytes),
        usagePercentage: 0,
        warningLevel: 'none',
        createdAt: quota.created_at,
        updatedAt: quota.updated_at
      };

    } catch (error) {
      console.error('❌ Failed to create default business quota:', error);
      return null;
    }
  }

  /**
   * Update business quota limits
   * @param {string} businessId - Business UUID
   * @param {object} quotaLimits - New quota limits
   * @returns {boolean} Success status
   */
  async updateBusinessQuota(businessId, quotaLimits) {
    try {
      const { softLimitBytes, hardLimitBytes } = quotaLimits;

      // Validate limits
      if (softLimitBytes > hardLimitBytes) {
        throw new Error('Soft limit cannot exceed hard limit');
      }

      const query = `
        UPDATE t_client_storage_quotas
        SET
          soft_limit_bytes = $2,
          hard_limit_bytes = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE business_id = $1 AND quota_type = 'business'
        RETURNING *
      `;

      const pool = await getPool();
      const result = await pool.query(query, [businessId, softLimitBytes, hardLimitBytes]);

      if (result.rows.length === 0) {
        throw new Error('Business quota not found');
      }

      console.log(`📊 Updated business quota for ${businessId}: soft=${this.formatBytes(softLimitBytes)}, hard=${this.formatBytes(hardLimitBytes)}`);
      return true;

    } catch (error) {
      console.error('❌ Failed to update business quota:', error);
      return false;
    }
  }

  /**
   * Record file upload and update usage
   * @param {object} fileData - File metadata
   * @returns {object} Upload result
   */
  async recordFileUpload(fileData) {
    const pool = await getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Insert file record
      const fileQuery = `
        INSERT INTO t_client_files (
          business_id, service_location_id, uploaded_by_user_id, stored_filename, original_filename,
          file_size_bytes, content_type, file_path, file_category_id, file_description,
          is_public_to_business
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, created_at
      `;

      const fileValues = [
        fileData.businessId,
        fileData.serviceLocationId || null,
        fileData.userId || null,
        fileData.fileName,
        fileData.originalName,
        fileData.fileSizeBytes,
        fileData.mimeType,
        fileData.filePath,
        fileData.categoryId || null,
        fileData.description || null,
        fileData.isPublic || false
      ];

      const fileResult = await client.query(fileQuery, fileValues);
      const fileId = fileResult.rows[0].id;

      // Log file access
      const accessQuery = `
        INSERT INTO t_client_file_access_log (
          client_file_id, accessed_by_user_id, access_type, access_granted, ip_address, user_agent
        ) VALUES ($1, $2, 'upload', true, $3, $4)
      `;

      await client.query(accessQuery, [
        fileId,
        fileData.userId,
        fileData.ipAddress || null,
        fileData.userAgent || null
      ]);

      await client.query('COMMIT');

      console.log(`📁 File uploaded successfully: ${fileData.originalName} (${this.formatBytes(fileData.fileSizeBytes)})`);

      return {
        success: true,
        fileId,
        createdAt: fileResult.rows[0].created_at
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to record file upload:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get file usage statistics for a business
   * @param {string} businessId - Business UUID
   * @returns {object} Usage statistics
   */
  async getUsageStatistics(businessId) {
    try {
      const query = `
        SELECT
          COUNT(*) as total_files,
          SUM(file_size_bytes) as total_bytes,
          AVG(file_size_bytes) as avg_file_size,
          MAX(file_size_bytes) as largest_file,
          MIN(file_size_bytes) as smallest_file,
          COUNT(DISTINCT category_id) as categories_used,
          COUNT(DISTINCT DATE(created_at)) as upload_days
        FROM t_client_files
        WHERE business_id = $1 AND deleted_at IS NULL
      `;

      const pool = await getPool();
      const result = await pool.query(query, [businessId]);
      const stats = result.rows[0];

      return {
        totalFiles: parseInt(stats.total_files),
        totalBytes: parseInt(stats.total_bytes || 0),
        averageFileSize: parseInt(stats.avg_file_size || 0),
        largestFile: parseInt(stats.largest_file || 0),
        smallestFile: parseInt(stats.smallest_file || 0),
        categoriesUsed: parseInt(stats.categories_used),
        uploadDays: parseInt(stats.upload_days),
        totalFormatted: this.formatBytes(parseInt(stats.total_bytes || 0))
      };

    } catch (error) {
      console.error('❌ Failed to get usage statistics:', error);
      return null;
    }
  }

  /**
   * Get warning level based on usage percentage
   * @param {number} usagePercentage - Current usage percentage
   * @returns {string} Warning level
   */
  getWarningLevel(usagePercentage) {
    if (usagePercentage >= 95) return 'critical';
    if (usagePercentage >= 85) return 'high';
    if (usagePercentage >= 75) return 'medium';
    if (usagePercentage >= 50) return 'low';
    return 'none';
  }

  /**
   * Format quota check result into user-friendly message
   * @param {object} quotaResult - Result from check_available_quota function
   * @returns {string} Formatted message
   */
  formatQuotaMessage(quotaResult) {
    if (!quotaResult.can_upload) {
      return `Upload blocked: ${quotaResult.reason}. Available space: ${this.formatBytes(quotaResult.available_bytes)}`;
    }

    if (quotaResult.warning_level === 'critical') {
      return `Warning: You're at ${quotaResult.usage_percentage}% of your storage limit. Consider cleaning up old files.`;
    }

    if (quotaResult.warning_level === 'high') {
      return `Notice: You're using ${quotaResult.usage_percentage}% of your storage. ${this.formatBytes(quotaResult.available_bytes)} remaining.`;
    }

    if (quotaResult.soft_limit_exceeded) {
      return `Soft limit exceeded but upload allowed. Current usage: ${quotaResult.usage_percentage}%`;
    }

    return `Upload allowed. Available space: ${this.formatBytes(quotaResult.available_bytes)}`;
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

  /**
   * Clean up orphaned files (files without database records)
   * @param {string} uploadsPath - Path to uploads directory
   * @returns {object} Cleanup result
   */
  async cleanupOrphanedFiles(uploadsPath) {
    try {
      // This would require file system scanning and database comparison
      // Implementation depends on specific file storage structure
      console.log('🧹 Orphaned file cleanup not yet implemented');
      return { cleaned: 0, errors: 0 };
    } catch (error) {
      console.error('❌ Failed to cleanup orphaned files:', error);
      return { cleaned: 0, errors: 1 };
    }
  }
}

// Create singleton instance
const quotaManagementService = new QuotaManagementService();

export default quotaManagementService;