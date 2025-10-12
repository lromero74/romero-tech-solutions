/**
 * Metrics Cleanup Service
 *
 * Automatically cleans up agent_metrics records older than 365 days
 * to maintain a 1-year retention policy.
 *
 * Runs daily at 2:00 AM server time.
 */

import { query } from '../config/database.js';
import schedule from 'node-schedule';

class MetricsCleanupService {
  constructor() {
    this.job = null;
  }

  /**
   * Start the cleanup service
   * Schedules daily cleanup at 2:00 AM
   */
  start() {
    // Schedule cleanup daily at 2:00 AM
    // Cron format: second minute hour day month dayOfWeek
    this.job = schedule.scheduleJob('0 0 2 * * *', async () => {
      console.log('🧹 Running scheduled agent_metrics cleanup...');
      await this.runCleanup();
    });

    console.log('✅ Metrics cleanup service started (scheduled for 2:00 AM daily)');
  }

  /**
   * Stop the cleanup service
   */
  stop() {
    if (this.job) {
      this.job.cancel();
      this.job = null;
      console.log('🛑 Metrics cleanup service stopped');
    }
  }

  /**
   * Run cleanup manually (can be called from API endpoint for testing)
   */
  async runCleanup() {
    try {
      const startTime = Date.now();

      // Call the database cleanup function
      const result = await query('SELECT cleanup_old_agent_metrics() as deleted_count');

      const deletedCount = result.rows[0]?.deleted_count || 0;
      const duration = Date.now() - startTime;

      console.log(`✅ Metrics cleanup completed: ${deletedCount} records deleted (took ${duration}ms)`);

      return {
        success: true,
        deletedCount,
        duration,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Metrics cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Get cleanup status and statistics
   */
  async getStatus() {
    try {
      // Get metrics table statistics
      const stats = await query(`
        SELECT
          COUNT(*) as total_records,
          pg_size_pretty(pg_total_relation_size('agent_metrics')) as table_size,
          MIN(collected_at) as oldest_record,
          MAX(collected_at) as newest_record,
          COUNT(*) FILTER (WHERE collected_at >= NOW() - INTERVAL '7 days') as last_7_days,
          COUNT(*) FILTER (WHERE collected_at >= NOW() - INTERVAL '30 days') as last_30_days,
          COUNT(*) FILTER (WHERE collected_at >= NOW() - INTERVAL '365 days') as last_365_days,
          COUNT(*) FILTER (WHERE collected_at < NOW() - INTERVAL '365 days') as expired_records
        FROM agent_metrics
      `);

      return {
        ...stats.rows[0],
        retention_policy: '365 days',
        cleanup_schedule: 'Daily at 2:00 AM',
        next_cleanup: this.job ? this.job.nextInvocation() : null
      };
    } catch (error) {
      console.error('❌ Failed to get cleanup status:', error);
      throw error;
    }
  }
}

// Singleton instance
export const metricsCleanupService = new MetricsCleanupService();
