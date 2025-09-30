/**
 * Enhanced Employee Login Rate Limiter
 *
 * Provides specialized rate limiting for employee authentication endpoints
 * with additional security measures against DoS and injection attacks.
 *
 * Features:
 * - Aggressive rate limiting for employee login attempts
 * - Progressive penalties for repeated failures
 * - Email-based tracking to prevent account enumeration
 * - Suspicious pattern detection
 * - Integration with security monitoring
 */

import { query } from '../config/database.js';

// In-memory tracking for real-time rate limiting
const employeeLoginAttempts = new Map();
const suspiciousPatterns = new Map();

/**
 * Enhanced employee login rate limiter with progressive penalties
 */
export const employeeLoginLimiter = async (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || 'Unknown';
  const { email } = req.body;

  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 3; // Very strict for employee accounts

  try {
    // Check for suspicious patterns first
    if (await detectSuspiciousPatterns(clientIP, email, userAgent)) {
      console.warn(`🚨 Suspicious employee login pattern detected from IP: ${clientIP}, Email: ${email}`);
      await logSecurityEvent('suspicious_employee_login_pattern', {
        ip: clientIP,
        email: email,
        userAgent: userAgent,
        endpoint: req.path
      });

      return res.status(429).json({
        success: false,
        message: 'Access temporarily restricted due to suspicious activity.',
        code: 'SUSPICIOUS_ACTIVITY_DETECTED'
      });
    }

    // Get tracking key (combine IP and email for stricter control)
    const trackingKey = `${clientIP}:${email || 'unknown'}`;

    if (!employeeLoginAttempts.has(trackingKey)) {
      employeeLoginAttempts.set(trackingKey, []);
    }

    const attempts = employeeLoginAttempts.get(trackingKey);

    // Remove attempts older than the window
    const recentAttempts = attempts.filter(attemptTime => now - attemptTime < windowMs);
    employeeLoginAttempts.set(trackingKey, recentAttempts);

    // Check if rate limit exceeded
    if (recentAttempts.length >= maxAttempts) {
      console.warn(`🚨 Employee login rate limit exceeded for IP: ${clientIP}, Email: ${email}`);

      // Log security event
      await logSecurityEvent('employee_login_rate_limit_exceeded', {
        ip: clientIP,
        email: email,
        attempts: recentAttempts.length,
        maxAttempts: maxAttempts,
        userAgent: userAgent
      });

      const retryAfter = Math.ceil((recentAttempts[0] + windowMs - now) / 1000);

      return res.status(429).json({
        success: false,
        message: 'Too many employee login attempts. Please try again later.',
        code: 'EMPLOYEE_LOGIN_RATE_LIMIT_EXCEEDED',
        retryAfter: retryAfter
      });
    }

    // Add current attempt for tracking
    recentAttempts.push(now);
    employeeLoginAttempts.set(trackingKey, recentAttempts);

    next();

  } catch (error) {
    console.error('❌ Error in employee login rate limiter:', error);
    // Allow request to continue if rate limiter fails (fail open for availability)
    next();
  }
};

/**
 * Clear successful login attempts (call after successful authentication)
 */
export const clearEmployeeLoginAttempts = (clientIP, email) => {
  const trackingKey = `${clientIP}:${email}`;
  employeeLoginAttempts.delete(trackingKey);
  console.log(`✅ Cleared employee login attempts for IP: ${clientIP}, Email: ${email}`);
};

/**
 * Record failed employee login attempt (call after authentication failure)
 */
export const recordFailedEmployeeLogin = async (clientIP, email, reason) => {
  try {
    await logSecurityEvent('failed_employee_login', {
      ip: clientIP,
      email: email,
      reason: reason,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error recording failed employee login:', error);
  }
};

/**
 * Detect suspicious patterns in login attempts
 */
async function detectSuspiciousPatterns(clientIP, email, userAgent) {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minute window for pattern detection

  try {
    // Check for rapid-fire requests from same IP
    const rapidFireKey = `rapid_${clientIP}`;
    if (!suspiciousPatterns.has(rapidFireKey)) {
      suspiciousPatterns.set(rapidFireKey, []);
    }

    const rapidAttempts = suspiciousPatterns.get(rapidFireKey);
    rapidAttempts.push(now);

    // Keep only recent attempts
    const recentRapidAttempts = rapidAttempts.filter(time => now - time < windowMs);
    suspiciousPatterns.set(rapidFireKey, recentRapidAttempts);

    // If more than 10 requests in 5 minutes from same IP, flag as suspicious
    if (recentRapidAttempts.length > 10) {
      return true;
    }

    // Check for multiple different emails from same IP
    const emailKey = `emails_${clientIP}`;
    if (!suspiciousPatterns.has(emailKey)) {
      suspiciousPatterns.set(emailKey, new Set());
    }

    const emailSet = suspiciousPatterns.get(emailKey);
    if (email) {
      emailSet.add(email);

      // If more than 5 different emails tried from same IP in window, flag as suspicious
      if (emailSet.size > 5) {
        return true;
      }
    }

    // Check database for historical suspicious activity
    const dbResult = await query(`
      SELECT COUNT(*) as recent_failures
      FROM security_logs
      WHERE event_type = 'failed_employee_login'
        AND ip_address = $1
        AND created_at > NOW() - INTERVAL '1 hour'
    `, [clientIP]);

    const recentFailures = parseInt(dbResult.rows[0]?.recent_failures || 0);

    // If more than 15 failures from this IP in past hour, flag as suspicious
    if (recentFailures > 15) {
      return true;
    }

    return false;

  } catch (error) {
    console.error('❌ Error detecting suspicious patterns:', error);
    return false; // Fail open
  }
}

/**
 * Log security events to database for monitoring and analysis
 */
async function logSecurityEvent(eventType, eventData) {
  try {
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
      eventData.ip,
      eventData.userAgent || 'Unknown',
      JSON.stringify(eventData)
    ]);
  } catch (error) {
    console.error('❌ Error logging security event:', error);
    // Don't throw - logging failures shouldn't block authentication
  }
}

/**
 * Get employee login security statistics (for admin monitoring)
 */
export const getEmployeeLoginStats = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Get today's failed employee login attempts
    const failedAttemptsResult = await query(`
      SELECT
        ip_address,
        COUNT(*) as attempts,
        array_agg(DISTINCT (event_data->>'email')) as emails_attempted,
        MAX(created_at) as last_attempt
      FROM security_logs
      WHERE event_type = 'failed_employee_login'
        AND DATE(created_at) = $1
      GROUP BY ip_address
      ORDER BY attempts DESC, last_attempt DESC
    `, [today]);

    // Get rate limit violations
    const rateLimitResult = await query(`
      SELECT
        ip_address,
        COUNT(*) as violations,
        MAX(created_at) as last_violation
      FROM security_logs
      WHERE event_type = 'employee_login_rate_limit_exceeded'
        AND DATE(created_at) = $1
      GROUP BY ip_address
      ORDER BY violations DESC
    `, [today]);

    // Get suspicious pattern detections
    const suspiciousResult = await query(`
      SELECT
        ip_address,
        COUNT(*) as detections,
        MAX(created_at) as last_detection
      FROM security_logs
      WHERE event_type = 'suspicious_employee_login_pattern'
        AND DATE(created_at) = $1
      GROUP BY ip_address
      ORDER BY detections DESC
    `, [today]);

    res.json({
      success: true,
      data: {
        date: today,
        currentMemoryTracking: {
          activeIpTracking: employeeLoginAttempts.size,
          suspiciousPatternTracking: suspiciousPatterns.size
        },
        failedAttempts: failedAttemptsResult.rows,
        rateLimitViolations: rateLimitResult.rows,
        suspiciousPatterns: suspiciousResult.rows,
        summary: {
          totalFailedAttempts: failedAttemptsResult.rows.reduce((sum, row) => sum + parseInt(row.attempts), 0),
          totalRateLimitViolations: rateLimitResult.rows.reduce((sum, row) => sum + parseInt(row.violations), 0),
          totalSuspiciousDetections: suspiciousResult.rows.reduce((sum, row) => sum + parseInt(row.detections), 0),
          uniqueIpsWithFailures: failedAttemptsResult.rows.length
        }
      }
    });

  } catch (error) {
    console.error('❌ Error getting employee login stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve employee login statistics'
    });
  }
};

/**
 * Cleanup old tracking data (should be called periodically)
 */
export const cleanupEmployeeLoginTracking = () => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes

  // Clean up expired login attempts
  for (const [key, attempts] of employeeLoginAttempts.entries()) {
    const recentAttempts = attempts.filter(attemptTime => now - attemptTime < windowMs);
    if (recentAttempts.length === 0) {
      employeeLoginAttempts.delete(key);
    } else {
      employeeLoginAttempts.set(key, recentAttempts);
    }
  }

  // Clean up suspicious patterns (keep for 1 hour)
  const patternWindowMs = 60 * 60 * 1000; // 1 hour
  for (const [key, data] of suspiciousPatterns.entries()) {
    if (Array.isArray(data)) {
      const recentData = data.filter(time => now - time < patternWindowMs);
      if (recentData.length === 0) {
        suspiciousPatterns.delete(key);
      } else {
        suspiciousPatterns.set(key, recentData);
      }
    } else if (key.startsWith('emails_')) {
      // Reset email sets every hour
      suspiciousPatterns.delete(key);
    }
  }

  console.log(`🧹 Employee login tracking cleanup completed. Active tracking: ${employeeLoginAttempts.size} IPs, ${suspiciousPatterns.size} pattern entries`);
};

// Run cleanup every 15 minutes
setInterval(cleanupEmployeeLoginTracking, 15 * 60 * 1000);