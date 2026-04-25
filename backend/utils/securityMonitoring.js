import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Security Monitoring and Alerting System
 * Tracks security events, failed logins, and suspicious activities
 */

// Security event types
export const SECURITY_EVENTS = {
  FAILED_LOGIN: 'FAILED_LOGIN',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SUSPICIOUS_INPUT: 'SUSPICIOUS_INPUT',
  FILE_UPLOAD_BLOCKED: 'FILE_UPLOAD_BLOCKED',
  INVALID_SESSION: 'INVALID_SESSION',
  ADMIN_ACCESS: 'ADMIN_ACCESS',
  PASSWORD_RESET: 'PASSWORD_RESET',
  ACCOUNT_LOCKOUT: 'ACCOUNT_LOCKOUT',
  UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS'
};

// In-memory storage for tracking events (in production, use Redis or database)
const securityEvents = new Map();
const suspiciousIPs = new Map();

// Create security log directory
const securityLogDir = path.join(__dirname, '..', 'logs', 'security');
if (!fs.existsSync(securityLogDir)) {
  fs.mkdirSync(securityLogDir, { recursive: true });
}

// Path to the fail2ban-watched intrusion log on testbot. We append `[BAN] <ip>
// reason=<alert>` lines here so the romerotechsolutions-intrusion jail can
// promote app-level decisions to iptables-level bans. Override via env for
// tests / dev. If the file isn't writable, the helper below quietly disables
// itself after the first failure — we don't want to crash the API for it.
const INTRUSION_LOG_PATH = process.env.INTRUSION_LOG_PATH || '/var/log/romerotechsolutions/intrusion.log';
let intrusionLogDisabled = false;

// Alerts that warrant a hard IP ban. HIGH_ACTIVITY_VOLUME is intentionally not
// here: a legitimate burst (e.g., a user reloading repeatedly) shouldn't iptables
// us. Failed logins and rate-limit hits do — they're already gated by thresholds
// inside checkSecurityPatterns before reaching triggerSecurityAlert.
const BAN_WORTHY_ALERT_TYPES = new Set([
  'MULTIPLE_FAILED_LOGINS',
  'PERSISTENT_RATE_LIMITING',
  'MALWARE_UPLOAD',
  'ADMIN_COMPROMISE',
  'DATABASE_BREACH'
]);

const appendBanLine = (ip, reason) => {
  if (intrusionLogDisabled || !ip || ip === 'unknown') return;
  const line = `${new Date().toISOString()} [BAN] ${ip} reason=${reason}\n`;
  fs.appendFile(INTRUSION_LOG_PATH, line, (err) => {
    if (err) {
      intrusionLogDisabled = true;
      console.warn(`⚠️ Intrusion log unavailable (${INTRUSION_LOG_PATH}): ${err.code}. Disabling fail2ban hand-off for this process.`);
    }
  });
};

/**
 * Log security events to file and memory
 * @param {string} eventType - Type of security event
 * @param {object} eventData - Event details
 * @param {object} req - Express request object (optional)
 */
export const logSecurityEvent = (eventType, eventData, req = null) => {
  const timestamp = new Date().toISOString();
  const clientIP = req ? (req.ip || req.connection.remoteAddress) : 'unknown';
  const userAgent = req ? req.get('User-Agent') : 'unknown';

  const securityEvent = {
    timestamp,
    eventType,
    clientIP,
    userAgent,
    ...eventData
  };

  // Log to file
  const logEntry = JSON.stringify(securityEvent) + '\n';
  const logFile = path.join(securityLogDir, `security-${new Date().toISOString().split('T')[0]}.log`);

  fs.appendFile(logFile, logEntry, (err) => {
    if (err) {
      console.error('Failed to write security log:', err);
    }
  });

  // Store in memory for real-time monitoring
  const eventKey = `${eventType}-${clientIP}-${Date.now()}`;
  securityEvents.set(eventKey, securityEvent);

  // Clean up old events (keep last 1000)
  if (securityEvents.size > 1000) {
    const oldestKey = securityEvents.keys().next().value;
    securityEvents.delete(oldestKey);
  }

  // Console log for immediate visibility
  console.log(`🚨 SECURITY EVENT: ${eventType} from ${clientIP} - ${JSON.stringify(eventData)}`);

  // Check for patterns and trigger alerts
  checkSecurityPatterns(eventType, clientIP, securityEvent);
};

/**
 * Check for suspicious patterns and trigger alerts
 * @param {string} eventType - Type of security event
 * @param {string} clientIP - Client IP address
 * @param {object} event - Security event data
 */
const checkSecurityPatterns = (eventType, clientIP, event) => {
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  // Track suspicious activity per IP
  if (!suspiciousIPs.has(clientIP)) {
    suspiciousIPs.set(clientIP, { events: [], firstSeen: now });
  }

  const ipData = suspiciousIPs.get(clientIP);
  ipData.events.push({ type: eventType, timestamp: now });

  // Clean old events (older than 5 minutes)
  ipData.events = ipData.events.filter(e => now - e.timestamp < fiveMinutes);

  // Alert thresholds
  const recentEvents = ipData.events.length;
  const failedLogins = ipData.events.filter(e => e.type === SECURITY_EVENTS.FAILED_LOGIN).length;
  const rateLimits = ipData.events.filter(e => e.type === SECURITY_EVENTS.RATE_LIMIT_EXCEEDED).length;

  // Trigger alerts based on patterns
  if (failedLogins >= 3) {
    triggerSecurityAlert('MULTIPLE_FAILED_LOGINS', {
      clientIP,
      failedAttempts: failedLogins,
      timeWindow: '5 minutes',
      recommendation: 'Consider IP blocking or CAPTCHA'
    });
  }

  if (rateLimits >= 3) {
    triggerSecurityAlert('PERSISTENT_RATE_LIMITING', {
      clientIP,
      rateLimitHits: rateLimits,
      timeWindow: '5 minutes',
      recommendation: 'Possible bot activity - consider IP blocking'
    });
  }

  if (recentEvents >= 10) {
    triggerSecurityAlert('HIGH_ACTIVITY_VOLUME', {
      clientIP,
      totalEvents: recentEvents,
      timeWindow: '5 minutes',
      recommendation: 'Unusually high activity - investigate manually'
    });
  }
};

/**
 * Trigger security alerts
 * @param {string} alertType - Type of alert
 * @param {object} alertData - Alert details
 */
const triggerSecurityAlert = (alertType, alertData) => {
  const alert = {
    timestamp: new Date().toISOString(),
    alertType,
    severity: getSeverityLevel(alertType),
    ...alertData
  };

  // Console alert (in production, send to monitoring system)
  console.log(`🚨🚨 SECURITY ALERT: ${alertType} - Severity: ${alert.severity}`);
  console.log(`📊 Details:`, alert);

  // Log alert to file
  const alertLogFile = path.join(securityLogDir, `alerts-${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFile(alertLogFile, JSON.stringify(alert) + '\n', (err) => {
    if (err) {
      console.error('Failed to write alert log:', err);
    }
  });

  // Hand off to fail2ban for ban-worthy alert types. The jail at
  // /etc/fail2ban/jail.local watches the intrusion log for [BAN] lines.
  if (BAN_WORTHY_ALERT_TYPES.has(alertType) && alertData?.clientIP) {
    appendBanLine(alertData.clientIP, alertType);
  }

  // In production, integrate with:
  // - Email notifications
  // - Slack/Teams alerts
  // - Monitoring dashboards (DataDog, NewRelic, etc.)
  // - Incident management systems
};

/**
 * Get severity level for alert types
 * @param {string} alertType - Type of alert
 * @returns {string} - Severity level
 */
const getSeverityLevel = (alertType) => {
  const severityMap = {
    MULTIPLE_FAILED_LOGINS: 'MEDIUM',
    PERSISTENT_RATE_LIMITING: 'MEDIUM',
    HIGH_ACTIVITY_VOLUME: 'LOW',
    ADMIN_COMPROMISE: 'CRITICAL',
    DATABASE_BREACH: 'CRITICAL',
    MALWARE_UPLOAD: 'HIGH'
  };

  return severityMap[alertType] || 'LOW';
};

/**
 * Middleware to track failed authentication attempts
 */
export const trackFailedLoginMiddleware = (req, res, next) => {
  const originalJson = res.json;

  res.json = function(data) {
    // Check if this is a failed authentication response
    if (res.statusCode === 401 && data && data.success === false) {
      logSecurityEvent(SECURITY_EVENTS.FAILED_LOGIN, {
        email: req.body?.email || 'unknown',
        reason: data.message || 'authentication failed',
        endpoint: req.path
      }, req);
    }

    return originalJson.call(this, data);
  };

  next();
};

/**
 * Middleware to track rate limit violations
 */
export const trackRateLimitMiddleware = (req, res, next) => {
  const originalStatus = res.status;

  res.status = function(statusCode) {
    if (statusCode === 429) {
      logSecurityEvent(SECURITY_EVENTS.RATE_LIMIT_EXCEEDED, {
        endpoint: req.path,
        method: req.method,
        rateLimitType: 'general'
      }, req);
    }

    return originalStatus.call(this, statusCode);
  };

  next();
};

/**
 * Middleware to track suspicious input patterns
 */
export const trackSuspiciousInputMiddleware = (req, res, next) => {
  const checkInput = (input, source) => {
    if (typeof input === 'string') {
      // Check for SQL injection patterns
      const sqlPatterns = [
        /(\b(union|select|insert|update|delete|drop|create|alter)\b)/i,
        /(--|\/\*|\*\/)/,
        /(\b(or|and)\b.*[=<>])/i
      ];

      // Check for XSS patterns
      const xssPatterns = [
        /<script[^>]*>.*?<\/script>/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /<iframe[^>]*>/i
      ];

      const suspiciousPatterns = [...sqlPatterns, ...xssPatterns];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(input)) {
          logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_INPUT, {
            input: input.substring(0, 100), // Log first 100 chars
            source,
            pattern: pattern.toString(),
            endpoint: req.path
          }, req);
          break;
        }
      }
    }
  };

  // Check request body
  if (req.body && typeof req.body === 'object') {
    Object.entries(req.body).forEach(([key, value]) => {
      checkInput(value, `body.${key}`);
    });
  }

  // Check query parameters
  if (req.query && typeof req.query === 'object') {
    Object.entries(req.query).forEach(([key, value]) => {
      checkInput(value, `query.${key}`);
    });
  }

  next();
};

/**
 * Get security statistics
 * @returns {object} - Security statistics
 */
export const getSecurityStats = () => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const twentyFourHours = 24 * oneHour;

  const recentEvents = Array.from(securityEvents.values())
    .filter(event => now - new Date(event.timestamp).getTime() < twentyFourHours);

  const stats = {
    last24Hours: {
      totalEvents: recentEvents.length,
      failedLogins: recentEvents.filter(e => e.eventType === SECURITY_EVENTS.FAILED_LOGIN).length,
      rateLimitViolations: recentEvents.filter(e => e.eventType === SECURITY_EVENTS.RATE_LIMIT_EXCEEDED).length,
      suspiciousInput: recentEvents.filter(e => e.eventType === SECURITY_EVENTS.SUSPICIOUS_INPUT).length
    },
    lastHour: {
      totalEvents: recentEvents.filter(e => now - new Date(e.timestamp).getTime() < oneHour).length
    },
    topSuspiciousIPs: Array.from(suspiciousIPs.entries())
      .map(([ip, data]) => ({
        ip,
        eventCount: data.events.filter(e => now - e.timestamp < twentyFourHours).length,
        firstSeen: new Date(data.firstSeen).toISOString()
      }))
      .filter(data => data.eventCount > 0)
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10)
  };

  return stats;
};

export default {
  logSecurityEvent,
  trackFailedLoginMiddleware,
  trackRateLimitMiddleware,
  trackSuspiciousInputMiddleware,
  getSecurityStats,
  SECURITY_EVENTS
};