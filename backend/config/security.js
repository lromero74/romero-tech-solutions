/**
 * Centralized Security Configuration
 * Single source of truth for all security-related settings
 */

export const SECURITY_CONFIG = {
  // Session Management
  SESSION_TIMEOUT_MS: 15 * 60 * 1000,       // 15 minutes
  SESSION_WARNING_MS: 2 * 60 * 1000,        // 2 minutes warning before expiry
  MAX_SESSIONS_PER_USER: 5,                 // Maximum concurrent sessions per user

  // Password Security
  BCRYPT_SALT_ROUNDS: 12,                   // Bcrypt salt rounds for password hashing
  PASSWORD_HISTORY_COUNT: 10,               // Number of previous passwords to check

  // Rate Limiting
  GENERAL_RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,  // 15 minutes
  GENERAL_RATE_LIMIT_MAX: 100,              // Max requests per window (production)
  GENERAL_RATE_LIMIT_MAX_DEV: 5000,         // Max requests per window (development)

  ADMIN_RATE_LIMIT_MAX: 1000,               // Admin endpoint rate limit (production)
  ADMIN_RATE_LIMIT_MAX_DEV: 2000,           // Admin endpoint rate limit (development)

  AUTH_RATE_LIMIT_MAX: 10,                  // Auth endpoint rate limit (production)
  AUTH_RATE_LIMIT_MAX_DEV: 500,             // Auth endpoint rate limit (development)

  EMPLOYEE_LOGIN_RATE_LIMIT_MAX: 3,         // Employee login attempts per window
  EMPLOYEE_LOGIN_SUSPICIOUS_THRESHOLD: 10,   // Requests before flagging as suspicious

  // MFA Settings
  MFA_CODE_EXPIRY_MS: 10 * 60 * 1000,       // 10 minutes
  MFA_CODE_LENGTH: 6,                       // 6-digit MFA codes

  // Security Monitoring
  FAILED_LOGIN_THRESHOLD: 15,               // Failed logins per hour before alert
  SECURITY_LOG_RETENTION_DAYS: 90,          // Days to retain security logs

  // CSRF Protection
  CSRF_COOKIE_NAME: '__Host-csrf',          // Use __Host- prefix for enhanced security
  CSRF_HEADER_NAME: 'X-CSRF-Token',         // Expected header name for CSRF token

  // Audit Logging
  AUDIT_LOG_RETENTION_DAYS: 365,            // Days to retain audit logs (1 year for compliance)
};

// Allowed table names for dynamic SQL (prevents SQL injection)
export const ALLOWED_USER_TABLES = {
  employee: 'employees',
  client: 'users'
};

// Generic error messages (prevents account enumeration)
export const SECURITY_MESSAGES = {
  INVALID_CREDENTIALS: 'Authentication failed. Please check your credentials and try again.',
  ACCOUNT_LOCKED: 'Your account has been temporarily locked. Please contact support.',
  SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
  UNAUTHORIZED_ACCESS: 'You do not have permission to access this resource.',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
  CSRF_TOKEN_INVALID: 'Security validation failed. Please refresh the page and try again.',
  SERVER_ERROR: 'An error occurred. Please try again later.',
};

// Dummy bcrypt hash for timing attack prevention
// Pre-computed hash of "dummy_password_for_timing_safety_do_not_use"
export const DUMMY_BCRYPT_HASH = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYsYPbQ3K9C';

export default SECURITY_CONFIG;