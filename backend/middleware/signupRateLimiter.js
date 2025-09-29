import rateLimit from 'express-rate-limit';
import { query } from '../config/database.js';

/**
 * Signup Rate Limiting Middleware
 * - Configurable signups per day from the same IP address (default: 3)
 * - Configurable signups per day total across all IPs (default: 20)
 * - 24-hour rolling window
 * - Limits stored in system_settings table
 */

// Track total daily signups globally
let dailyGlobalSignups = 0;
let globalResetTime = new Date();
globalResetTime.setHours(24, 0, 0, 0); // Reset at midnight

// Cache for rate limit settings (refreshed every hour)
let rateLimitSettings = {
  ipDailyLimit: 3,
  globalDailyLimit: 20,
  lastRefresh: new Date(0)
};

/**
 * Get rate limit settings from database with caching
 */
async function getRateLimitSettings() {
  const now = new Date();
  const oneHour = 60 * 60 * 1000;

  // Refresh cache every hour
  if (now - rateLimitSettings.lastRefresh > oneHour) {
    try {
      const result = await query(`
        SELECT setting_key, setting_value
        FROM system_settings
        WHERE setting_key IN ('signup_ip_daily_limit', 'signup_global_daily_limit')
      `);

      const settings = {};
      result.rows.forEach(row => {
        settings[row.setting_key] = parseInt(row.setting_value) ||
          (row.setting_key === 'signup_ip_daily_limit' ? 3 : 20);
      });

      rateLimitSettings = {
        ipDailyLimit: settings.signup_ip_daily_limit || 3,
        globalDailyLimit: settings.signup_global_daily_limit || 20,
        lastRefresh: now
      };

      console.log(`📊 Updated signup rate limits: IP=${rateLimitSettings.ipDailyLimit}/day, Global=${rateLimitSettings.globalDailyLimit}/day`);
    } catch (error) {
      console.error('❌ Error fetching rate limit settings, using defaults:', error);
    }
  }

  return rateLimitSettings;
}

/**
 * Reset global counter at midnight
 */
function resetGlobalCounterIfNeeded() {
  const now = new Date();
  if (now >= globalResetTime) {
    dailyGlobalSignups = 0;
    globalResetTime = new Date();
    globalResetTime.setHours(24, 0, 0, 0);
    console.log('🔄 Global signup counter reset for new day');
  }
}

/**
 * Per-IP rate limiter (configurable limit per day per IP)
 */
export const ipSignupLimiter = async (req, res, next) => {
  try {
    const settings = await getRateLimitSettings();
    const today = new Date().toISOString().split('T')[0];
    const clientIp = req.ip || req.connection.remoteAddress;

    // Check current IP's attempts today
    const result = await query(`
      SELECT COUNT(*) as attempts
      FROM security_logs
      WHERE event_type = 'signup_attempt'
        AND ip_address = $1
        AND DATE(created_at) = $2
    `, [clientIp, today]);

    const currentAttempts = parseInt(result.rows[0]?.attempts || 0);

    if (currentAttempts >= settings.ipDailyLimit) {
      console.warn(`🚨 IP signup limit exceeded for ${clientIp}: ${currentAttempts}/${settings.ipDailyLimit}`);
      return res.status(429).json({
        success: false,
        error: 'Too many signup attempts from this IP address. Please try again tomorrow.',
        code: 'IP_SIGNUP_LIMIT_EXCEEDED',
        limit: settings.ipDailyLimit,
        current: currentAttempts
      });
    }

    next();
  } catch (error) {
    console.error('❌ Error checking IP rate limit:', error);
    // Allow request to continue if rate limit check fails
    next();
  }
};

/**
 * Global signup rate limiter (configurable total per day across all IPs)
 */
export const globalSignupLimiter = async (req, res, next) => {
  try {
    resetGlobalCounterIfNeeded();
    const settings = await getRateLimitSettings();

    if (dailyGlobalSignups >= settings.globalDailyLimit) {
      console.warn(`🚨 Global signup limit exceeded. Current count: ${dailyGlobalSignups}/${settings.globalDailyLimit}`);
      return res.status(429).json({
        success: false,
        error: 'Maximum daily signups reached. Please try again tomorrow.',
        code: 'GLOBAL_SIGNUP_LIMIT_EXCEEDED',
        limit: settings.globalDailyLimit,
        current: dailyGlobalSignups
      });
    }

    // Track this signup attempt
    dailyGlobalSignups++;
    console.log(`📊 Global signup count: ${dailyGlobalSignups}/${settings.globalDailyLimit} for today`);

    next();
  } catch (error) {
    console.error('❌ Error checking global rate limit:', error);
    // Allow request to continue if rate limit check fails
    next();
  }
};

/**
 * Database-backed IP tracking for persistent monitoring
 * This creates a persistent record of signup attempts for security monitoring
 */
export const trackSignupAttempt = async (req, res, next) => {
  try {
    const clientIp = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'Unknown';
    const today = new Date().toISOString().split('T')[0];

    // Log the signup attempt to database for security monitoring
    await query(`
      INSERT INTO security_logs (
        event_type,
        ip_address,
        user_agent,
        event_data,
        created_at
      ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    `, [
      'signup_attempt',
      clientIp,
      userAgent,
      JSON.stringify({
        endpoint: req.path,
        date: today,
        method: req.method,
        body_keys: Object.keys(req.body || {}),
        timestamp: new Date().toISOString()
      })
    ]);

    console.log(`📝 Logged signup attempt from IP: ${clientIp}`);
    next();
  } catch (error) {
    console.error('❌ Error tracking signup attempt:', error);
    // Don't block the request if logging fails
    next();
  }
};

/**
 * Get current signup statistics (for admin monitoring)
 */
export const getSignupStats = async (req, res) => {
  try {
    resetGlobalCounterIfNeeded();

    const today = new Date().toISOString().split('T')[0];

    // Get today's signup attempts by IP
    const ipStatsResult = await query(`
      SELECT
        ip_address,
        COUNT(*) as attempts,
        MAX(created_at) as last_attempt
      FROM security_logs
      WHERE event_type = 'signup_attempt'
        AND DATE(created_at) = $1
      GROUP BY ip_address
      ORDER BY attempts DESC, last_attempt DESC
    `, [today]);

    // Get total attempts today
    const totalStatsResult = await query(`
      SELECT COUNT(*) as total_attempts
      FROM security_logs
      WHERE event_type = 'signup_attempt'
        AND DATE(created_at) = $1
    `, [today]);

    const totalAttempts = parseInt(totalStatsResult.rows[0]?.total_attempts || 0);

    res.json({
      success: true,
      data: {
        date: today,
        globalLimit: 20,
        ipLimit: 3,
        currentGlobalCount: dailyGlobalSignups,
        totalDatabaseAttempts: totalAttempts,
        ipStats: ipStatsResult.rows,
        resetTime: globalResetTime.toISOString(),
        status: {
          globalLimitReached: dailyGlobalSignups >= 20,
          highRiskIps: ipStatsResult.rows.filter(row => row.attempts >= 3)
        }
      }
    });
  } catch (error) {
    console.error('❌ Error getting signup stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve signup statistics'
    });
  }
};

/**
 * Combined signup rate limiting middleware
 * Apply this to all signup endpoints
 */
export const signupRateLimiters = [
  trackSignupAttempt,    // Track in database first
  ipSignupLimiter,       // Check IP limit (3 per day)
  globalSignupLimiter    // Check global limit (20 per day)
];