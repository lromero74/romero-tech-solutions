/**
 * Audit Log Service
 * Centralized service for logging security-relevant events
 * Provides tamper-proof audit trail for compliance and security monitoring
 */

import { query } from '../config/database.js';

/**
 * Audit event types
 */
export const AUDIT_EVENTS = {
  // Authentication Events
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILURE: 'login_failure',
  LOGOUT: 'logout',
  MFA_SENT: 'mfa_sent',
  MFA_VERIFIED: 'mfa_verified',
  MFA_FAILED: 'mfa_failed',

  // Password Events
  PASSWORD_CHANGED: 'password_changed',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  PASSWORD_RESET_COMPLETED: 'password_reset_completed',

  // Session Events
  SESSION_CREATED: 'session_created',
  SESSION_EXPIRED: 'session_expired',
  SESSION_TERMINATED: 'session_terminated',
  SESSION_REGENERATED: 'session_regenerated',

  // Security Events
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  ACCOUNT_LOCKED: 'account_locked',
  ACCOUNT_UNLOCKED: 'account_unlocked',

  // Access Control
  UNAUTHORIZED_ACCESS_ATTEMPT: 'unauthorized_access_attempt',
  PERMISSION_DENIED: 'permission_denied',

  // Account Management
  ACCOUNT_CREATED: 'account_created',
  ACCOUNT_DELETED: 'account_deleted',
  ACCOUNT_MODIFIED: 'account_modified',
};

class AuditLogService {
  /**
   * Log an audit event
   * @param {string} eventType - Type of event (from AUDIT_EVENTS)
   * @param {number} userId - User ID (null for unauthenticated events)
   * @param {object} metadata - Additional event metadata
   * @returns {Promise<void>}
   */
  async logEvent(eventType, userId = null, metadata = {}) {
    try {
      // Extract common metadata
      const {
        email = null,
        ipAddress = null,
        userAgent = null,
        resource = null,
        action = null,
        result = null,
        reason = null,
        sessionId = null,
      } = metadata;

      // Create event data object (everything not in dedicated columns)
      const eventData = {
        ...metadata,
        timestamp: new Date().toISOString(),
      };

      // Check if audit_logs table exists, if not use security_logs
      const tableCheckResult = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'audit_logs'
        ) as table_exists
      `);

      const useAuditLogs = tableCheckResult.rows[0].table_exists;

      if (useAuditLogs) {
        await query(`
          INSERT INTO audit_logs (
            event_type,
            user_id,
            user_email,
            ip_address,
            user_agent,
            resource,
            action,
            result,
            reason,
            session_id,
            event_data,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
        `, [
          eventType,
          userId,
          email,
          ipAddress,
          userAgent,
          resource,
          action,
          result,
          reason,
          sessionId,
          JSON.stringify(eventData)
        ]);
      } else {
        // Fallback to security_logs table
        await query(`
          INSERT INTO security_logs (
            event_type,
            ip_address,
            user_agent,
            event_data,
            created_at
          ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        `, [
          eventType,
          ipAddress || 'unknown',
          userAgent || 'unknown',
          JSON.stringify({ userId, email, ...eventData })
        ]);
      }

      // Log to console for real-time monitoring
      const logLevel = this.getLogLevel(eventType);
      console.log(`[${logLevel}] AUDIT: ${eventType} | User: ${userId || 'anonymous'} | IP: ${ipAddress || 'unknown'}`);

    } catch (error) {
      // CRITICAL: Audit logging failures should be logged to console but not throw
      // to prevent disruption of application functionality
      console.error('❌ CRITICAL: Audit logging failed:', error.message);
      console.error('Event details:', { eventType, userId, metadata });

      // In production, you might want to send this to an external monitoring service
      // to ensure audit log failures are detected
    }
  }

  /**
   * Get appropriate log level for event type
   * @private
   */
  getLogLevel(eventType) {
    const highPriorityEvents = [
      AUDIT_EVENTS.LOGIN_FAILURE,
      AUDIT_EVENTS.MFA_FAILED,
      AUDIT_EVENTS.RATE_LIMIT_EXCEEDED,
      AUDIT_EVENTS.SUSPICIOUS_ACTIVITY,
      AUDIT_EVENTS.UNAUTHORIZED_ACCESS_ATTEMPT,
      AUDIT_EVENTS.ACCOUNT_LOCKED,
    ];

    return highPriorityEvents.includes(eventType) ? 'WARN' : 'INFO';
  }

  /**
   * Query audit logs for a specific user
   * @param {number} userId - User ID
   * @param {number} limit - Maximum number of logs to return
   * @returns {Promise<Array>}
   */
  async getUserAuditLog(userId, limit = 100) {
    try {
      const result = await query(`
        SELECT
          event_type,
          user_email,
          ip_address,
          user_agent,
          resource,
          action,
          result,
          event_data,
          created_at
        FROM audit_logs
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [userId, limit]);

      return result.rows;
    } catch (error) {
      console.error('Error fetching user audit log:', error);
      return [];
    }
  }

  /**
   * Query recent security events
   * @param {number} hours - Number of hours to look back
   * @returns {Promise<Array>}
   */
  async getRecentSecurityEvents(hours = 24) {
    try {
      const result = await query(`
        SELECT
          event_type,
          user_id,
          user_email,
          ip_address,
          COUNT(*) as event_count,
          MAX(created_at) as last_occurrence
        FROM audit_logs
        WHERE event_type IN (
          'login_failure',
          'mfa_failed',
          'rate_limit_exceeded',
          'suspicious_activity',
          'unauthorized_access_attempt'
        )
        AND created_at > NOW() - INTERVAL '${hours} hours'
        GROUP BY event_type, user_id, user_email, ip_address
        ORDER BY event_count DESC, last_occurrence DESC
        LIMIT 100
      `);

      return result.rows;
    } catch (error) {
      console.error('Error fetching security events:', error);
      return [];
    }
  }

  /**
   * Clean up old audit logs based on retention policy
   * @param {number} retentionDays - Number of days to retain logs
   * @returns {Promise<number>} Number of logs deleted
   */
  async cleanupOldLogs(retentionDays = 365) {
    try {
      const result = await query(`
        DELETE FROM audit_logs
        WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
        RETURNING id
      `);

      const deletedCount = result.rowCount;
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} audit logs older than ${retentionDays} days`);
      }

      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up audit logs:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const auditLogService = new AuditLogService();
export default auditLogService;