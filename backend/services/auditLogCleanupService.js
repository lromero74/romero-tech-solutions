/**
 * Audit Log Cleanup Service
 *
 * Automatically cleans up audit_logs records older than 365 days
 * to maintain SOC 2 and GDPR compliance with documented retention policy.
 *
 * Runs daily at 2:30 AM server time.
 *
 * Compliance Mapping:
 * - SOC 2: 365-day minimum for audit trails
 * - GDPR Article 5(1)(e): Data kept no longer than necessary
 * - NIST 800-53 AU-11: Audit record retention
 */

import { query } from '../config/database.js';
import schedule from 'node-schedule';

class AuditLogCleanupService {
  constructor() {
    this.job = null;
    this.retentionDays = 365; // SOC 2 requirement
  }

  /**
   * Start the cleanup service
   * Schedules daily cleanup at 2:30 AM
   */
  start() {
    // Schedule cleanup daily at 2:30 AM
    // Cron format: second minute hour day month dayOfWeek
    this.job = schedule.scheduleJob('0 30 2 * * *', async () => {
      console.log('🧹 Running scheduled audit_logs cleanup...');
      await this.runCleanup();
    });

    console.log('✅ Audit log cleanup service started (scheduled for 2:30 AM daily)');
  }

  /**
   * Stop the cleanup service
   */
  stop() {
    if (this.job) {
      this.job.cancel();
      this.job = null;
      console.log('🛑 Audit log cleanup service stopped');
    }
  }

  /**
   * Run cleanup manually (can be called from API endpoint for testing)
   * @returns {Promise<Object>} Cleanup results
   */
  async runCleanup() {
    try {
      const startTime = Date.now();

      // Delete audit logs older than retention period
      const result = await query(`
        DELETE FROM audit_logs
        WHERE created_at < NOW() - INTERVAL '${this.retentionDays} days'
        RETURNING id
      `);

      const deletedCount = result.rowCount || 0;
      const duration = Date.now() - startTime;

      const cleanupResult = {
        success: true,
        service: 'auditLogCleanupService',
        retention_days: this.retentionDays,
        records_deleted: deletedCount,
        oldest_deleted_before: new Date(Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000)).toISOString(),
        execution_time_ms: duration,
        timestamp: new Date().toISOString()
      };

      // Log cleanup results
      if (deletedCount > 0) {
        console.log(`✅ Audit log cleanup completed: ${deletedCount} records deleted (took ${duration}ms)`);

        // Log the cleanup operation itself to audit trail (if new records can be inserted)
        await this.logCleanupOperation(cleanupResult);
      } else {
        console.log(`✅ Audit log cleanup completed: No records to delete (took ${duration}ms)`);
      }

      return cleanupResult;
    } catch (error) {
      console.error('❌ Audit log cleanup failed:', error);

      const errorResult = {
        success: false,
        service: 'auditLogCleanupService',
        error: error.message,
        timestamp: new Date().toISOString()
      };

      // Try to log the failure
      try {
        await this.logCleanupOperation(errorResult);
      } catch (logError) {
        console.error('❌ Failed to log cleanup error:', logError);
      }

      throw error;
    }
  }

  /**
   * Log cleanup operation to audit trail
   * @private
   */
  async logCleanupOperation(cleanupResult) {
    try {
      await query(`
        INSERT INTO audit_logs (
          event_type,
          user_id,
          user_email,
          resource,
          action,
          result,
          event_data,
          created_at
        ) VALUES (
          'data_retention_cleanup',
          NULL,
          'system',
          'audit_logs',
          'automated_cleanup',
          $1,
          $2,
          CURRENT_TIMESTAMP
        )
      `, [
        cleanupResult.success ? 'success' : 'failure',
        JSON.stringify(cleanupResult)
      ]);
    } catch (error) {
      // Don't throw - just log to console
      console.error('⚠️  Failed to log cleanup operation:', error.message);
    }
  }

  /**
   * Get cleanup status and statistics
   * @returns {Promise<Object>} Status information
   */
  async getStatus() {
    try {
      // Get audit_logs table statistics
      const stats = await query(`
        SELECT
          COUNT(*) as total_records,
          pg_size_pretty(pg_total_relation_size('audit_logs')) as table_size,
          MIN(created_at) as oldest_record,
          MAX(created_at) as newest_record,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as last_7_days,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as last_30_days,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '365 days') as last_365_days,
          COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '${this.retentionDays} days') as expired_records
        FROM audit_logs
      `);

      // Get recent cleanup operations
      const recentCleanups = await query(`
        SELECT
          created_at,
          result,
          event_data
        FROM audit_logs
        WHERE event_type = 'data_retention_cleanup'
          AND resource = 'audit_logs'
        ORDER BY created_at DESC
        LIMIT 10
      `);

      return {
        ...stats.rows[0],
        retention_policy: `${this.retentionDays} days`,
        cleanup_schedule: 'Daily at 2:30 AM',
        next_cleanup: this.job ? this.job.nextInvocation() : null,
        recent_cleanups: recentCleanups.rows.map(row => ({
          timestamp: row.created_at,
          result: row.result,
          details: row.event_data
        })),
        compliance_frameworks: ['SOC 2', 'GDPR Article 5(1)(e)', 'NIST 800-53 AU-11']
      };
    } catch (error) {
      console.error('❌ Failed to get cleanup status:', error);
      throw error;
    }
  }

  /**
   * Test cleanup with dry run (doesn't actually delete)
   * @returns {Promise<Object>} What would be deleted
   */
  async dryRun() {
    try {
      const result = await query(`
        SELECT
          COUNT(*) as would_delete,
          MIN(created_at) as oldest_record,
          MAX(created_at) as newest_to_delete
        FROM audit_logs
        WHERE created_at < NOW() - INTERVAL '${this.retentionDays} days'
      `);

      return {
        dry_run: true,
        retention_days: this.retentionDays,
        would_delete_count: parseInt(result.rows[0].would_delete),
        oldest_record: result.rows[0].oldest_record,
        newest_to_delete: result.rows[0].newest_to_delete,
        cutoff_date: new Date(Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000)).toISOString()
      };
    } catch (error) {
      console.error('❌ Dry run failed:', error);
      throw error;
    }
  }
}

// Singleton instance
export const auditLogCleanupService = new AuditLogCleanupService();
