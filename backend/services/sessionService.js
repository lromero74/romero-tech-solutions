import crypto from 'crypto';
import { query } from '../config/database.js';
import { websocketService } from './websocketService.js';
import { SECURITY_CONFIG } from '../config/security.js';

class SessionService {
  constructor() {
    this.lastCleanupTime = 0;
    this.cleanupInterval = 5 * 60 * 1000; // 5 minutes in milliseconds
  }

  /**
   * Generate a secure session token
   */
  generateSessionToken() {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Create a new user session with maximum session limit enforcement
   */
  async createSession(userId, email, userAgent = null, ipAddress = null) {
    try {
      // SECURITY FIX: Enforce maximum concurrent sessions per user
      const existingSessionsResult = await query(`
        SELECT COUNT(*) as session_count
        FROM user_sessions
        WHERE user_id = $1 AND is_active = true AND expires_at > CURRENT_TIMESTAMP
      `, [userId]);

      const existingSessionCount = parseInt(existingSessionsResult.rows[0].session_count);

      if (existingSessionCount >= SECURITY_CONFIG.MAX_SESSIONS_PER_USER) {
        // Terminate oldest session to make room for new one
        console.log(`⚠️ Max sessions (${SECURITY_CONFIG.MAX_SESSIONS_PER_USER}) reached for user ${email}, terminating oldest session`);

        await query(`
          UPDATE user_sessions
          SET is_active = false, updated_at = CURRENT_TIMESTAMP
          WHERE id = (
            SELECT id FROM user_sessions
            WHERE user_id = $1 AND is_active = true
            ORDER BY created_at ASC
            LIMIT 1
          )
        `, [userId]);
      }

      const sessionToken = this.generateSessionToken();

      console.log('🔐 Creating new session for user:', email);

      // Use centralized session timeout configuration
      const result = await query(`
        INSERT INTO user_sessions (user_id, user_email, session_token, user_agent, ip_address, expires_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + INTERVAL '${SECURITY_CONFIG.SESSION_TIMEOUT_MS / 1000} seconds')
        RETURNING id, session_token, expires_at, created_at
      `, [userId, email, sessionToken, userAgent, ipAddress]);

      const session = result.rows[0];
      console.log('✅ Session created:', session.id);

      // Emit WebSocket event for user login
      try {
        await websocketService.emitLoginStatusChange(userId, true);
      } catch (wsError) {
        console.error('⚠️ Failed to emit login status via WebSocket:', wsError.message);
      }

      return {
        sessionId: session.id,
        sessionToken: session.session_token,
        expiresAt: session.expires_at,
        createdAt: session.created_at
      };

    } catch (error) {
      console.error('❌ Error creating session:', error);
      throw new Error(`Failed to create session: ${error.message}`);
    }
  }

  /**
   * Regenerate session token after authentication (prevents session fixation)
   * SECURITY FIX: Addresses session fixation vulnerability
   */
  async regenerateSession(oldSessionToken, userId, email, userAgent = null, ipAddress = null) {
    try {
      console.log('🔄 Regenerating session for user:', email);

      // End old session
      await this.endSession(oldSessionToken);

      // Create new session with new token
      const newSession = await this.createSession(userId, email, userAgent, ipAddress);

      console.log('✅ Session regenerated successfully for user:', email);

      return newSession;

    } catch (error) {
      console.error('❌ Error regenerating session:', error);
      throw new Error(`Failed to regenerate session: ${error.message}`);
    }
  }

  /**
   * Check if it's time to run cleanup (only every 5 minutes)
   */
  shouldRunCleanup() {
    const now = Date.now();
    return (now - this.lastCleanupTime) > this.cleanupInterval;
  }

  /**
   * Conditionally clean up expired sessions only when needed
   */
  async conditionalCleanup() {
    if (this.shouldRunCleanup()) {
      this.lastCleanupTime = Date.now();
      return await this.cleanupExpiredSessions();
    }
    return 0;
  }

  /**
   * Validate a session token and update last activity
   * SECURITY FIX: Uses centralized session timeout configuration
   */
  async validateSession(sessionToken) {
    try {
      // Only clean up expired sessions periodically (every 5 minutes)
      await this.conditionalCleanup();

      const result = await query(`
        UPDATE user_sessions
        SET last_activity = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP,
            expires_at = CURRENT_TIMESTAMP + INTERVAL '${SECURITY_CONFIG.SESSION_TIMEOUT_MS / 1000} seconds'
        WHERE session_token = $1 AND is_active = true AND expires_at > CURRENT_TIMESTAMP
        RETURNING id, user_id, user_email, expires_at, last_activity
      `, [sessionToken]);

      if (result.rows.length === 0) {
        return null; // Session not found or expired
      }

      const session = result.rows[0];
      console.log(`🔍 Session validated for user: ${session.user_email}`);

      return {
        sessionId: session.id,
        userId: session.user_id,
        userEmail: session.user_email,
        expiresAt: session.expires_at,
        lastActivity: session.last_activity
      };

    } catch (error) {
      console.error('❌ Error validating session:', error);
      throw new Error(`Failed to validate session: ${error.message}`);
    }
  }

  /**
   * End a user session (logout)
   */
  async endSession(sessionToken) {
    try {
      const result = await query(`
        UPDATE user_sessions
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE session_token = $1 AND is_active = true
        RETURNING id, user_email
      `, [sessionToken]);

      if (result.rows.length > 0) {
        const session = result.rows[0];
        console.log(`🚪 Session ended for user: ${session.user_email}`);
        return true;
      }

      return false; // Session not found

    } catch (error) {
      console.error('❌ Error ending session:', error);
      throw new Error(`Failed to end session: ${error.message}`);
    }
  }

  /**
   * End all sessions for a specific user
   */
  async endAllUserSessions(userId) {
    try {
      const result = await query(`
        UPDATE user_sessions
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND is_active = true
        RETURNING user_email
      `, [userId]);

      const count = result.rows.length;
      if (count > 0) {
        const userEmail = result.rows[0].user_email;
        console.log(`🚪 Ended ${count} sessions for user: ${userEmail}`);

        // Emit WebSocket event for user logout
        try {
          await websocketService.emitLoginStatusChange(userId, false);
        } catch (wsError) {
          console.error('⚠️ Failed to emit logout status via WebSocket:', wsError.message);
        }
      }

      return count;

    } catch (error) {
      console.error('❌ Error ending user sessions:', error);
      throw new Error(`Failed to end user sessions: ${error.message}`);
    }
  }

  /**
   * Get all active sessions for admin viewing
   */
  async getActiveSessions() {
    try {
      const result = await query(`
        SELECT
          us.id,
          us.user_id,
          us.user_email,
          us.user_agent,
          us.ip_address,
          us.login_time,
          us.last_activity,
          us.expires_at,
          CASE
            WHEN us.last_activity > CURRENT_TIMESTAMP - INTERVAL '5 minutes' THEN true
            ELSE false
          END as is_recently_active
        FROM user_sessions us
        WHERE us.is_active = true
        AND us.expires_at > CURRENT_TIMESTAMP
        ORDER BY us.last_activity DESC
      `);

      return result.rows.map(row => ({
        sessionId: row.id,
        userId: row.user_id,
        userEmail: row.user_email,
        userAgent: row.user_agent,
        ipAddress: row.ip_address,
        loginTime: row.login_time,
        lastActivity: row.last_activity,
        expiresAt: row.expires_at,
        isRecentlyActive: row.is_recently_active
      }));

    } catch (error) {
      console.error('❌ Error getting active sessions:', error);
      throw new Error(`Failed to get active sessions: ${error.message}`);
    }
  }

  /**
   * Check if a user is currently logged in (has active session)
   */
  async isUserLoggedIn(userId) {
    try {
      const result = await query(`
        SELECT COUNT(*) as session_count
        FROM user_sessions
        WHERE user_id = $1 AND is_active = true AND expires_at > CURRENT_TIMESTAMP
      `, [userId]);

      return parseInt(result.rows[0].session_count) > 0;

    } catch (error) {
      console.error('❌ Error checking user login status:', error);
      return false;
    }
  }

  /**
   * Get login status for multiple users (for employee table)
   */
  async getUsersLoginStatus(userIds) {
    try {
      if (!userIds || userIds.length === 0) {
        return {};
      }

      const result = await query(`
        SELECT
          user_id,
          COUNT(*) as active_sessions,
          MAX(last_activity) as last_activity,
          CASE
            WHEN MAX(last_activity) > CURRENT_TIMESTAMP - INTERVAL '5 minutes' THEN true
            ELSE false
          END as is_recently_active
        FROM user_sessions
        WHERE user_id = ANY($1) AND is_active = true AND expires_at > CURRENT_TIMESTAMP
        GROUP BY user_id
      `, [userIds]);

      const statusMap = {};
      result.rows.forEach(row => {
        statusMap[row.user_id] = {
          isLoggedIn: true,
          activeSessions: parseInt(row.active_sessions),
          lastActivity: row.last_activity,
          isRecentlyActive: row.is_recently_active
        };
      });

      // Set logged out status for users not in the results
      userIds.forEach(userId => {
        if (!statusMap[userId]) {
          statusMap[userId] = {
            isLoggedIn: false,
            activeSessions: 0,
            lastActivity: null,
            isRecentlyActive: false
          };
        }
      });

      return statusMap;

    } catch (error) {
      console.error('❌ Error getting users login status:', error);
      return {};
    }
  }

  /**
   * Clean up expired sessions with retry logic
   */
  async cleanupExpiredSessions(retryCount = 0) {
    try {
      // Use a shorter timeout for cleanup queries
      const result = await query(`
        SELECT cleanup_expired_sessions() as cleaned_count
      `);

      const cleanedCount = result.rows[0].cleaned_count;
      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} expired sessions`);
      }

      return cleanedCount;

    } catch (error) {
      console.error('❌ Error cleaning up expired sessions:', error);

      // Retry logic for connection timeout errors
      if (retryCount < 2 && (
        error.message.includes('timeout') ||
        error.message.includes('Connection terminated') ||
        error.message.includes('connection closed')
      )) {
        console.log(`🔄 Retrying session cleanup (attempt ${retryCount + 1}/3) in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        return this.cleanupExpiredSessions(retryCount + 1);
      }

      return 0;
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats() {
    try {
      const result = await query(`
        SELECT
          COUNT(*) FILTER (WHERE is_active = true AND expires_at > CURRENT_TIMESTAMP) as active_sessions,
          COUNT(*) FILTER (WHERE is_active = true AND expires_at > CURRENT_TIMESTAMP AND last_activity > CURRENT_TIMESTAMP - INTERVAL '5 minutes') as recently_active,
          COUNT(*) FILTER (WHERE is_active = true AND expires_at <= CURRENT_TIMESTAMP) as expired_sessions,
          COUNT(*) FILTER (WHERE is_active = false) as ended_sessions,
          COUNT(DISTINCT user_id) FILTER (WHERE is_active = true AND expires_at > CURRENT_TIMESTAMP) as unique_active_users
        FROM user_sessions
      `);

      const stats = result.rows[0];
      return {
        activeSessions: parseInt(stats.active_sessions),
        recentlyActive: parseInt(stats.recently_active),
        expiredSessions: parseInt(stats.expired_sessions),
        endedSessions: parseInt(stats.ended_sessions),
        uniqueActiveUsers: parseInt(stats.unique_active_users)
      };

    } catch (error) {
      console.error('❌ Error getting session stats:', error);
      return {
        activeSessions: 0,
        recentlyActive: 0,
        expiredSessions: 0,
        endedSessions: 0,
        uniqueActiveUsers: 0
      };
    }
  }
}

export const sessionService = new SessionService();
export default sessionService;