/**
 * MFA Code Verification Rate Limiter
 *
 * Throttles pre-auth MFA code verification endpoints
 * (/verify-admin-mfa, /verify-client-mfa, client /verify-login).
 * MFA codes are 6 digits (10^6 space, 5-minute TTL): without throttling,
 * an attacker can brute-force a code inside its validity window.
 *
 * Tracking is per IP+email in a sliding 15-minute window. Fails closed:
 * limiter errors deny the request rather than bypassing the throttle.
 */

import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

// Exported for the eviction regression test (mirrors attemptTracker.js).
export const mfaVerifyAttempts = new Map();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

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
    logger.error('❌ Error logging MFA verify security event:', error);
  }
}

export const mfaVerifyLimiter = async (req, res, next) => {
  const clientIP = req.ip || req.connection?.remoteAddress || 'unknown';
  const userAgent = req.get?.('User-Agent') || 'Unknown';
  const { email, userId } = req.body || {};

  const now = Date.now();

  try {
    // Code-issuance endpoints send userId instead of email; key on whichever
    // identity the body carries so one sender cannot burn another's budget.
    const trackingKey = `${clientIP}:${email || userId || 'unknown'}`;

    if (!mfaVerifyAttempts.has(trackingKey)) {
      mfaVerifyAttempts.set(trackingKey, []);
    }

    const recentAttempts = mfaVerifyAttempts
      .get(trackingKey)
      .filter(attemptTime => now - attemptTime < WINDOW_MS);
    // Drop the key when nothing remains — otherwise the map grows one entry
    // per unique IP forever (same pattern as cleanupEmployeeLoginTracking).
    if (recentAttempts.length === 0) {
      mfaVerifyAttempts.delete(trackingKey);
    } else {
      mfaVerifyAttempts.set(trackingKey, recentAttempts);
    }

    if (recentAttempts.length >= MAX_ATTEMPTS) {
      logger.warn(`🚨 MFA verify rate limit exceeded for IP: ${clientIP}, Email: ${email}`);
      await logSecurityEvent('mfa_verify_rate_limit_exceeded', {
        ip: clientIP,
        email: email,
        attempts: recentAttempts.length,
        maxAttempts: MAX_ATTEMPTS,
        userAgent: userAgent
      });

      const retryAfter = Math.ceil((recentAttempts[0] + WINDOW_MS - now) / 1000);

      return res.status(429).json({
        success: false,
        message: 'Too many verification attempts. Please request a new code and try again later.',
        code: 'MFA_VERIFY_RATE_LIMIT_EXCEEDED',
        retryAfter: retryAfter
      });
    }

    recentAttempts.push(now);
    mfaVerifyAttempts.set(trackingKey, recentAttempts);

    next();
  } catch (error) {
    logger.error('❌ Error in MFA verify rate limiter:', error);
    return res.status(503).json({
      success: false,
      message: 'Service temporarily unavailable. Please try again in a few moments.',
      code: 'SERVICE_UNAVAILABLE'
    });
  }
};

/**
 * Clear tracked attempts, e.g. after a successful verification or a fresh
 * code issuance, so legitimate users are not throttled by stale failures.
 */
export const clearMfaVerifyAttempts = (clientIP, email, userId) => {
  mfaVerifyAttempts.delete(`${clientIP}:${email || userId || 'unknown'}`);
};

/**
 * Delete keys whose every attempt has expired. Runs on an unref()ed interval
 * so idle keys (IPs never seen again) cannot grow the map forever — the
 * request path alone cannot evict them because each request re-records.
 */
export const sweepMfaVerifyAttempts = (now = Date.now()) => {
  for (const [key, attempts] of mfaVerifyAttempts.entries()) {
    if (!attempts.some(attemptTime => now - attemptTime < WINDOW_MS)) {
      mfaVerifyAttempts.delete(key);
    }
  }
};

setInterval(sweepMfaVerifyAttempts, 15 * 60 * 1000).unref();
