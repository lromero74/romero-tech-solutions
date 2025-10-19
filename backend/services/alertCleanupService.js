/**
 * Alert Cleanup Service
 *
 * Automatically cleans up resolved alerts from alert_history table
 * that have been resolved for more than 365 days.
 *
 * Active (unresolved) alerts are NEVER deleted - only resolved ones.
 *
 * Runs daily at 3:00 AM server time.
 *
 * Retention Policy:
 * - Active alerts: Retained indefinitely (until resolved)
 * - Resolved alerts: 365 days after resolution
 *
 * Rationale:
 * - Accountability: Track resolution patterns
 * - Trend analysis: Identify recurring issues
 * - Compliance: Maintain audit trail for SLA monitoring
 */

import { query } from '../config/database.js';
import schedule from 'node-schedule';

class AlertCleanupService {
  constructor() {
    this.job = null;
    this.retentionDays = 365; // Industry best practice
  }

  /**
   * Start the cleanup service
   * Schedules daily cleanup at 3:00 AM
   */
  start() {
    // Schedule cleanup daily at 3:00 AM
    // Cron format: second minute hour day month dayOfWeek
    this.job = schedule.scheduleJob('0 0 3 * * *', async () => {
      console.log('🧹 Running scheduled alert_history cleanup...');
      await this.runCleanup();
    });

    console.log('✅ Alert cleanup service started (scheduled for 3:00 AM daily)');
  }

  /**
   * Stop the cleanup service
   */
  stop() {
    if (this.job) {
      this.job.cancel();
      this.job = null;
      console.log('🛑 Alert cleanup service stopped');
    }
  }

  /**
   * Run cleanup manually (can be called from API endpoint for testing)
   * ONLY deletes resolved alerts - active alerts are never touched
   * @returns {Promise<Object>} Cleanup results
   */
  async runCleanup() {
    try {
      const startTime = Date.now();

      // CRITICAL: Only delete alerts that are:
      // 1. Resolved (resolved_at IS NOT NULL)
      // 2. Resolved more than retention period ago
      const result = await query(`
        DELETE FROM alert_history
        WHERE resolved_at IS NOT NULL
          AND resolved_at < NOW() - INTERVAL '${this.retentionDays} days'
        RETURNING id, alert_type, triggered_at, resolved_at
      `);

      const deletedCount = result.rowCount || 0;
      const duration = Date.now() - startTime;

      const cleanupResult = {
        success: true,
        service: 'alertCleanupService',
        retention_days: this.retentionDays,
        records_deleted: deletedCount,
        resolved_before: new Date(Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000)).toISOString(),
        execution_time_ms: duration,
        timestamp: new Date().toISOString(),
        deleted_alerts: result.rows.slice(0, 10) // Sample of deleted alerts (max 10)
      };

      // Log cleanup results
      if (deletedCount > 0) {
        console.log(`✅ Alert cleanup completed: ${deletedCount} resolved alerts deleted (took ${duration}ms)`);

        // Log the cleanup operation to audit trail
        await this.logCleanupOperation(cleanupResult);
      } else {
        console.log(`✅ Alert cleanup completed: No resolved alerts to delete (took ${duration}ms)`);
      }

      return cleanupResult;
    } catch (error) {
      console.error('❌ Alert cleanup failed:', error);

      const errorResult = {
        success: false,
        service: 'alertCleanupService',
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
          'alert_history',
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
      // Get alert_history table statistics
      const stats = await query(`
        SELECT
          COUNT(*) as total_alerts,
          pg_size_pretty(pg_total_relation_size('alert_history')) as table_size,
          MIN(triggered_at) as oldest_alert,
          MAX(triggered_at) as newest_alert,
          COUNT(*) FILTER (WHERE resolved_at IS NULL) as active_alerts,
          COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) as resolved_alerts,
          COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at < NOW() - INTERVAL '${this.retentionDays} days') as expired_resolved_alerts,
          COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at >= NOW() - INTERVAL '30 days') as resolved_last_30_days
        FROM alert_history
      `);

      // Get recent cleanup operations
      const recentCleanups = await query(`
        SELECT
          created_at,
          result,
          event_data
        FROM audit_logs
        WHERE event_type = 'data_retention_cleanup'
          AND resource = 'alert_history'
        ORDER BY created_at DESC
        LIMIT 10
      `);

      // Get alert resolution statistics
      const resolutionStats = await query(`
        SELECT
          severity,
          COUNT(*) as total_resolved,
          AVG(EXTRACT(EPOCH FROM (resolved_at - triggered_at))/3600)::numeric(10,2) as avg_resolution_hours
        FROM alert_history
        WHERE resolved_at IS NOT NULL
          AND resolved_at >= NOW() - INTERVAL '365 days'
        GROUP BY severity
        ORDER BY severity
      `);

      return {
        ...stats.rows[0],
        retention_policy: `Active: Indefinite, Resolved: ${this.retentionDays} days after resolution`,
        cleanup_schedule: 'Daily at 3:00 AM',
        next_cleanup: this.job ? this.job.nextInvocation() : null,
        resolution_statistics: resolutionStats.rows,
        recent_cleanups: recentCleanups.rows.map(row => ({
          timestamp: row.created_at,
          result: row.result,
          details: row.event_data
        }))
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
          MIN(triggered_at) as oldest_alert,
          MAX(resolved_at) as newest_resolution_to_delete,
          json_agg(
            json_build_object(
              'id', id,
              'alert_type', alert_type,
              'severity', severity,
              'triggered_at', triggered_at,
              'resolved_at', resolved_at
            )
          ) FILTER (WHERE id IS NOT NULL) as sample_alerts
        FROM (
          SELECT *
          FROM alert_history
          WHERE resolved_at IS NOT NULL
            AND resolved_at < NOW() - INTERVAL '${this.retentionDays} days'
          LIMIT 10
        ) subquery
      `);

      return {
        dry_run: true,
        retention_days: this.retentionDays,
        would_delete_count: parseInt(result.rows[0].would_delete),
        oldest_alert: result.rows[0].oldest_alert,
        newest_resolution_to_delete: result.rows[0].newest_resolution_to_delete,
        cutoff_date: new Date(Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000)).toISOString(),
        sample_alerts: result.rows[0].sample_alerts || []
      };
    } catch (error) {
      console.error('❌ Dry run failed:', error);
      throw error;
    }
  }

  /**
   * Get alert retention compliance report
   * Useful for audits and compliance verification
   * @returns {Promise<Object>} Compliance report
   */
  async getComplianceReport() {
    try {
      const report = await query(`
        SELECT
          'Active Alerts' as category,
          COUNT(*) as count,
          'Retained indefinitely until resolution' as policy
        FROM alert_history
        WHERE resolved_at IS NULL
        UNION ALL
        SELECT
          'Resolved Alerts (Within Retention)',
          COUNT(*),
          'Retained for ${this.retentionDays} days after resolution'
        FROM alert_history
        WHERE resolved_at IS NOT NULL
          AND resolved_at >= NOW() - INTERVAL '${this.retentionDays} days'
        UNION ALL
        SELECT
          'Resolved Alerts (Eligible for Deletion)',
          COUNT(*),
          'Scheduled for next cleanup cycle'
        FROM alert_history
        WHERE resolved_at IS NOT NULL
          AND resolved_at < NOW() - INTERVAL '${this.retentionDays} days'
      `);

      return {
        generated_at: new Date().toISOString(),
        retention_policy: `${this.retentionDays} days after resolution`,
        compliance_frameworks: ['Industry Best Practice', 'Operational Need'],
        report: report.rows
      };
    } catch (error) {
      console.error('❌ Failed to generate compliance report:', error);
      throw error;
    }
  }
}

// Singleton instance
export const alertCleanupService = new AlertCleanupService();
