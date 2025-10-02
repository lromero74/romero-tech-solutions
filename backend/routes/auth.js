import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { sessionService } from '../services/sessionService.js';
import { generateCsrfToken } from '../server.js';
import { passwordComplexityService } from '../services/passwordComplexityService.js';
import { mfaSettingsService } from '../services/mfaSettingsService.js';
import { auditLogService, AUDIT_EVENTS } from '../services/auditLogService.js';
import { SECURITY_CONFIG, SECURITY_MESSAGES, DUMMY_BCRYPT_HASH, ALLOWED_USER_TABLES } from '../config/security.js';
import {
  hashPassword,
  verifyPassword,
  validatePasswordComplexity,
  addPasswordToHistory,
  checkPasswordHistory,
  updatePasswordChangeTimestamp,
  getPasswordExpirationInfo
} from '../utils/passwordUtils.js';
import {
  validateEmail,
  validatePassword,
  validateMfaCode as validateMfaCodeFormat,
  validateDeviceFingerprint,
  sanitizeString,
  validateLoginInputs
} from '../utils/inputValidation.js';
import {
  generateMfaCode,
  generateResetToken,
  storeMfaCode,
  validateMfaCode,
  markMfaCodeAsUsed,
  sendMfaEmail,
  sendMfaCode,
  sendMfaSMS,
  validatePhoneNumberForMFA,
  getSMSStats,
  sendPhoneVerificationSMS,
  storePasswordResetToken,
  validatePasswordResetToken,
  markResetTokenAsUsed,
  sendPasswordResetEmail
} from '../utils/mfaUtils.js';
import {
  employeeLoginLimiter,
  clearEmployeeLoginAttempts,
  recordFailedEmployeeLogin,
  getEmployeeLoginStats
} from '../middleware/employeeLoginRateLimiter.js';

const router = express.Router();

// Smart rate limiting - only count failed authentication attempts
const failedAttempts = new Map(); // Store failed login attempts by IP

const recordFailedAttempt = (clientIP) => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes

  if (!failedAttempts.has(clientIP)) {
    failedAttempts.set(clientIP, []);
  }

  const attempts = failedAttempts.get(clientIP);
  attempts.push(now);

  // Remove attempts older than the window
  const recentAttempts = attempts.filter(attemptTime => now - attemptTime < windowMs);
  failedAttempts.set(clientIP, recentAttempts);
};

const clearFailedAttempts = (clientIP) => {
  failedAttempts.delete(clientIP);
};

const checkFailedAttempts = (clientIP) => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 5; // Maximum 5 failed attempts per 15 minutes

  if (!failedAttempts.has(clientIP)) {
    return { blocked: false };
  }

  const attempts = failedAttempts.get(clientIP);
  const recentAttempts = attempts.filter(attemptTime => now - attemptTime < windowMs);
  failedAttempts.set(clientIP, recentAttempts);

  if (recentAttempts.length >= maxAttempts) {
    return {
      blocked: true,
      retryAfter: Math.ceil((recentAttempts[0] + windowMs - now) / 1000)
    };
  }

  return { blocked: false };
};

// POST /api/auth/login - User login
router.post('/login', async (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress;

  // Check if IP is blocked due to too many failed attempts
  const rateLimitCheck = checkFailedAttempts(clientIP);
  if (rateLimitCheck.blocked) {
    return res.status(429).json({
      success: false,
      message: 'Too many failed login attempts. Please try again later.',
      retryAfter: rateLimitCheck.retryAfter
    });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      recordFailedAttempt(clientIP); // Count missing credentials as failed attempt
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // First check employees table for admin/sales/technician users using normalized roles
    let userResult = await query(`
      SELECT e.id, e.email, e.first_name, e.last_name, e.password_hash, e.email_verified,
             es.status_name as employee_status, e.termination_date, null as business_name, 'employee' as user_type,
             COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) as roles,
             CASE WHEN 'admin' = ANY(array_agg(r.name)) THEN 'admin' ELSE 'employee' END as role
      FROM employees e
      LEFT JOIN employee_roles er ON e.id = er.employee_id
      LEFT JOIN roles r ON er.role_id = r.id AND r.is_active = true
      LEFT JOIN employee_employment_statuses es ON e.employee_status_id = es.id
      WHERE e.email = $1
      GROUP BY e.id, e.email, e.first_name, e.last_name, e.password_hash, e.email_verified,
               es.status_name, e.termination_date
    `, [email]);

    // If not found in employees, check users table for clients
    if (userResult.rows.length === 0) {
      userResult = await query(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.password_hash, u.role, u.email_verified,
               b.business_name, 'client' as user_type, u.mfa_enabled, u.mfa_email
        FROM users u
        LEFT JOIN businesses b ON u.business_id = b.id
        WHERE u.email = $1
      `, [email]);
    }

    // SECURITY FIX: Timing attack prevention with dummy password comparison
    if (userResult.rows.length === 0) {
      // Perform dummy bcrypt comparison to maintain consistent timing
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);

      recordFailedAttempt(clientIP);
      await auditLogService.logEvent(AUDIT_EVENTS.LOGIN_FAILURE, null, {
        email,
        ipAddress: clientIP,
        userAgent: req.get('User-Agent'),
        reason: 'account_not_found'
      });

      return res.status(401).json({
        success: false,
        message: SECURITY_MESSAGES.INVALID_CREDENTIALS
      });
    }

    const user = userResult.rows[0];

    // SECURITY FIX: Use generic error message for all authentication failures
    // This prevents account enumeration attacks

    // Check if employee is terminated (for employee accounts only)
    if (user.user_type === 'employee' && user.employee_status === 'terminated') {
      // Perform dummy password comparison for consistent timing
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);

      console.log(`🚫 Login denied for terminated employee: ${user.email}`);
      recordFailedAttempt(clientIP);
      await auditLogService.logEvent(AUDIT_EVENTS.LOGIN_FAILURE, user.id, {
        email: user.email,
        ipAddress: clientIP,
        userAgent: req.get('User-Agent'),
        reason: 'account_terminated'
      });

      return res.status(401).json({
        success: false,
        message: SECURITY_MESSAGES.INVALID_CREDENTIALS
      });
    }

    // Check if email is verified
    if (!user.email_verified) {
      // Perform dummy password comparison for consistent timing
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);

      recordFailedAttempt(clientIP);
      await auditLogService.logEvent(AUDIT_EVENTS.LOGIN_FAILURE, user.id, {
        email: user.email,
        ipAddress: clientIP,
        userAgent: req.get('User-Agent'),
        reason: 'email_not_verified'
      });

      return res.status(401).json({
        success: false,
        message: SECURITY_MESSAGES.INVALID_CREDENTIALS
      });
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      recordFailedAttempt(clientIP);
      await auditLogService.logEvent(AUDIT_EVENTS.LOGIN_FAILURE, user.id, {
        email: user.email,
        ipAddress: clientIP,
        userAgent: req.get('User-Agent'),
        reason: 'invalid_password'
      });

      return res.status(401).json({
        success: false,
        message: SECURITY_MESSAGES.INVALID_CREDENTIALS
      });
    }

    // Clear failed attempts on successful authentication
    clearFailedAttempts(clientIP);

    // Check if this user requires MFA based on system settings OR individual client MFA setting
    const systemRequiresMfa = await mfaSettingsService.requiresMfaForUser(user.user_type, user.role);
    const clientMfaEnabled = (user.user_type === 'client' && user.mfa_enabled === true);

    if (systemRequiresMfa || clientMfaEnabled) {
      // For employees, redirect to admin-login-mfa
      if (user.user_type === 'employee') {
        return res.status(200).json({
          success: true,
          requiresMfa: true,
          message: 'Employee login requires multi-factor authentication. Use /api/auth/admin-login-mfa endpoint.',
          email: user.email
        });
      }

      // For clients with MFA enabled, initiate MFA verification process
      if (clientMfaEnabled) {
        try {
          // Generate and send MFA code to client
          const mfaCode = generateMfaCode();
          await storeMfaCode(user.id, user.email, mfaCode);

          // Get user's language preference for email
          const languageResult = await query(`
            SELECT language_preference FROM users WHERE email = $1
          `, [user.email]);
          const userLanguage = languageResult.rows[0]?.language_preference || 'en';

          await sendMfaEmail(user.mfa_email || user.email, user.first_name, mfaCode, userLanguage, 'client');

          return res.status(200).json({
            success: true,
            requiresMfa: true,
            userType: 'client',
            message: 'Multi-factor authentication required. Please verify with the code sent to your email.',
            email: user.email,
            mfaEmail: user.mfa_email || user.email
          });
        } catch (error) {
          console.error('Error sending client MFA code:', error);
          return res.status(500).json({
            success: false,
            message: 'Failed to send verification code. Please try again.'
          });
        }
      }
    }

    // Create a new session for the user (users not requiring MFA)
    const userAgent = req.get('User-Agent');
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress ||
                     (req.connection.socket ? req.connection.socket.remoteAddress : null);

    const session = await sessionService.createSession(
      user.id,
      user.email,
      userAgent,
      ipAddress
    );

    // Get session timeout from database (or fallback to config)
    const sessionTimeoutMs = await sessionService.getSessionTimeoutMs();

    // Set HttpOnly session cookie for enhanced security
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: sessionTimeoutMs, // Use database timeout setting
      path: '/'
    };

    res.cookie('sessionToken', session.sessionToken, cookieOptions);

    // Return successful login response with session
    const userData = {
      id: user.id,
      email: user.email,
      role: user.role || 'admin',
      name: `${user.first_name} ${user.last_name}`.trim() || user.email,
      businessName: user.business_name,
      isFirstAdmin: true // For now, default to true
    };

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: userData,
      session: {
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt
      }
    });

  } catch (error) {
    console.error('Login error:', error);

    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/logout - User logout
router.post('/logout', async (req, res) => {
  try {
    // Get session token from cookie or request body (backward compatibility)
    const sessionToken = req.cookies?.sessionToken || req.body?.sessionToken;

    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        message: 'Session token is required'
      });
    }

    const sessionEnded = await sessionService.endSession(sessionToken);

    // Clear the HttpOnly session cookie
    res.clearCookie('sessionToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/'
    });

    if (sessionEnded) {
      res.status(200).json({
        success: true,
        message: 'Logout successful'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Session not found or already ended'
      });
    }

  } catch (error) {
    console.error('Logout error:', error);

    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/auth/validate-session - Validate session token
router.get('/validate-session', async (req, res) => {
  try {
    // Check for session token in HttpOnly cookie first, then fallback to Authorization header
    const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        message: 'No session token provided'
      });
    }

    const session = await sessionService.validateSession(sessionToken);

    if (session) {
      res.status(200).json({
        success: true,
        message: 'Session is valid',
        session: {
          userId: session.userId,
          userEmail: session.userEmail,
          expiresAt: session.expiresAt,
          lastActivity: session.lastActivity
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }

  } catch (error) {
    console.error('Session validation error:', error);

    res.status(500).json({
      success: false,
      message: 'Session validation failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/heartbeat - Keep session alive and get current status
router.post('/heartbeat', async (req, res) => {
  try {
    // Check for session token in HttpOnly cookie first, then fallback to Authorization header
    const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        message: 'No session token provided'
      });
    }

    // Validate and update session (this extends the session automatically)
    const session = await sessionService.validateSession(sessionToken);

    if (session) {
      // Calculate time remaining until session expires
      const now = new Date();
      const expiresAt = new Date(session.expiresAt);
      const timeRemainingMs = expiresAt.getTime() - now.getTime();
      const timeRemainingMinutes = Math.max(0, Math.ceil(timeRemainingMs / (1000 * 60)));
      const timeRemainingSeconds = Math.max(0, Math.ceil(timeRemainingMs / 1000));

      res.status(200).json({
        success: true,
        message: 'Session heartbeat successful',
        session: {
          userId: session.userId,
          userEmail: session.userEmail,
          expiresAt: session.expiresAt,
          lastActivity: session.lastActivity,
          timeRemainingMinutes,
          timeRemainingSeconds,
          isActive: timeRemainingMs > 0
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }

  } catch (error) {
    console.error('Session heartbeat error:', error);

    res.status(500).json({
      success: false,
      message: 'Session heartbeat failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/extend-session - Explicitly extend session (for extend button)
router.post('/extend-session', async (req, res) => {
  try {
    // Check for session token in HttpOnly cookie first, then fallback to Authorization header
    const sessionToken = req.cookies?.sessionToken || req.headers.authorization?.replace('Bearer ', '');

    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        message: 'No session token provided'
      });
    }

    // Validate and extend session (validateSession automatically extends it)
    const session = await sessionService.validateSession(sessionToken);

    if (session) {
      // Calculate time remaining until session expires
      const now = new Date();
      const expiresAt = new Date(session.expiresAt);
      const timeRemainingMs = expiresAt.getTime() - now.getTime();
      const timeRemainingMinutes = Math.max(0, Math.ceil(timeRemainingMs / (1000 * 60)));
      const timeRemainingSeconds = Math.max(0, Math.ceil(timeRemainingMs / 1000));

      console.log(`🔄 Session extended for user: ${session.userEmail}`);

      res.status(200).json({
        success: true,
        message: 'Session extended successfully',
        session: {
          userId: session.userId,
          userEmail: session.userEmail,
          expiresAt: session.expiresAt,
          lastActivity: session.lastActivity,
          timeRemainingMinutes,
          timeRemainingSeconds,
          isActive: timeRemainingMs > 0
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired session - cannot extend'
      });
    }

  } catch (error) {
    console.error('Session extension error:', error);

    res.status(500).json({
      success: false,
      message: 'Session extension failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/auth/check-admin - Check if admin users exist
router.get('/check-admin', async (req, res) => {
  try {
    // Check if any admin users exist in the employees table using normalized roles
    const adminResult = await query(`
      SELECT COUNT(DISTINCT e.id) as admin_count
      FROM employees e
      JOIN employee_roles er ON e.id = er.employee_id
      JOIN roles r ON er.role_id = r.id
      WHERE r.name = $1 AND r.is_active = true
    `, ['admin']);

    const adminCount = parseInt(adminResult.rows[0].admin_count);
    const hasAdmins = adminCount > 0;

    res.status(200).json({
      success: true,
      hasAdmins: hasAdmins,
      adminCount: adminCount
    });

  } catch (error) {
    console.error('Check admin error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to check admin users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/admin-login-mfa - Send MFA code for admin login
router.post('/admin-login-mfa', employeeLoginLimiter, async (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress;

  try {
    const { email, password, deviceFingerprint } = req.body;
    console.log('🔍 ADMIN-LOGIN-MFA REQUEST:', { email, hasPassword: !!password, deviceFingerprint: deviceFingerprint ? `${deviceFingerprint.substring(0, 16)}...` : 'MISSING' });

    // Validate and sanitize inputs
    const validation = validateLoginInputs({ email, password });
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: Object.values(validation.errors)[0] || 'Invalid input'
      });
    }

    const sanitizedEmail = validation.sanitized.email;

    // Validate device fingerprint if provided
    if (deviceFingerprint) {
      const fingerprintValidation = validateDeviceFingerprint(deviceFingerprint);
      if (!fingerprintValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: fingerprintValidation.error || 'Invalid device fingerprint'
        });
      }
    }

    // Check employees table for any active employee with any role (unified employee login)
    const userResult = await query(`
      SELECT DISTINCT e.id, e.email, e.first_name, e.last_name, e.password_hash, e.email_verified,
             e.phone, es.status_name as employee_status, e.termination_date
      FROM employees e
      JOIN employee_roles er ON e.id = er.employee_id
      JOIN roles r ON er.role_id = r.id
      LEFT JOIN employee_employment_statuses es ON e.employee_status_id = es.id
      WHERE e.email = $1 AND r.is_active = true
    `, [sanitizedEmail]);

    if (userResult.rows.length === 0) {
      // Record failed attempt for non-existent employee account
      await recordFailedEmployeeLogin(clientIP, email, 'account_not_found');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = userResult.rows[0];

    // Check if employee is terminated
    if (user.employee_status === 'terminated') {
      console.log(`🚫 Login denied for terminated admin: ${user.email}`);
      await recordFailedEmployeeLogin(clientIP, email, 'account_terminated');
      return res.status(401).json({
        success: false,
        message: 'Account access has been terminated. Please contact your administrator.'
      });
    }

    // Check if email is verified
    if (!user.email_verified) {
      await recordFailedEmployeeLogin(clientIP, email, 'email_not_verified');
      return res.status(401).json({
        success: false,
        message: 'Account not confirmed. Please check your email to confirm your account.'
      });
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      await recordFailedEmployeeLogin(clientIP, email, 'invalid_password');
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Clear successful login attempts (password was correct)
    clearEmployeeLoginAttempts(clientIP, email);

    // Check if device is trusted (skip MFA if trusted)
    if (deviceFingerprint) {
      try {
        const { checkTrustedDevice } = await import('../utils/trustedDeviceUtils.js');
        const trustedDevice = await checkTrustedDevice(user.id, 'employee', deviceFingerprint);

        if (trustedDevice) {
          console.log(`🔐 Trusted device detected for ${user.email}, skipping MFA and creating session`);

          // Create session for trusted device login
          const sessionData = await sessionService.createSession(
            user.id,
            user.email,
            req.headers['user-agent'] || 'unknown',
            clientIP
          );

          // Get employee roles
          const rolesResult = await query(`
            SELECT r.name
            FROM roles r
            JOIN employee_roles er ON r.id = er.role_id
            WHERE er.employee_id = $1 AND r.is_active = true
          `, [user.id]);

          const roles = rolesResult.rows.map(row => row.name);

          // Get session timeout from database (or fallback to config)
          const sessionTimeoutMs = await sessionService.getSessionTimeoutMs();

          // Set session token cookie (camelCase to match authMiddleware)
          res.cookie('sessionToken', sessionData.sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
            maxAge: sessionTimeoutMs,
            path: '/'
          });


          const userData = {
            id: user.id,
            email: user.email,
            name: `${user.first_name} ${user.last_name}`,
            firstName: user.first_name,
            lastName: user.last_name,
            role: roles[0] || 'admin',
            roles: roles,
            userType: 'employee',
            phone: user.phone
          };

          console.log(`✅ Session created for trusted device login: ${sessionData.sessionToken.substring(0, 20)}...`);

          return res.json({
            success: true,
            requiresMfa: false,
            isTrustedDevice: true,
            message: 'Login successful with trusted device',
            user: userData,
            session: {
              sessionToken: sessionData.sessionToken,
              expiresAt: sessionData.expiresAt
            }
          });
        } else {
          console.log(`🔓 Device not trusted for ${user.email}, proceeding with MFA`);
        }
      } catch (error) {
        console.error('Error checking trusted device:', error);
        // Continue with MFA flow if trusted device check fails
      }
    }

    // Generate and store MFA code (only reached if device is NOT trusted)
    const mfaCode = generateMfaCode();
    await storeMfaCode(user.id, user.email, mfaCode, 'employee');

    // Initialize message variable
    let message = 'Verification code sent. Please check and enter the code to complete login.';

    // Send MFA via both email and SMS
    try {
      console.log(`🚀 DEBUG: About to send MFA with phone: ${user.phone}, email: ${user.email}, deliveryMethod: both`);
      const deliveryResult = await sendMfaCode({
        email: user.email,
        phoneNumber: user.phone, // Use phone from employees table
        firstName: user.first_name,
        mfaCode,
        language: 'en',
        userType: 'admin',
        deliveryMethod: 'both', // Send via both email and SMS
        codeType: 'login'
      });
      console.log(`🚀 DEBUG: MFA deliveryResult:`, deliveryResult);

      // Check if at least one delivery method succeeded
      if (!deliveryResult.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to send verification code. Please try again.'
        });
      }

      // Build success message based on which methods succeeded
      message = 'Verification code sent';
      const methods = [];
      if (deliveryResult.email.sent) methods.push('email');
      if (deliveryResult.sms.sent) methods.push('text message');

      if (methods.length > 0) {
        message += ` to your ${methods.join(' and ')}`;
      }
      message += '. Please check and enter the code to complete login.';

    } catch (deliveryError) {
      return res.status(500).json({
        success: false,
        message: deliveryError.message
      });
    }

    // SECURITY FIX: Never expose MFA codes in API responses (even in development)
    // Use server console logs or separate test/staging environment for debugging
    res.status(200).json({
      success: true,
      message,
      requiresMfa: true,
      email: user.email,
      phoneNumber: user.phone
    });

  } catch (error) {
    console.error('Admin login MFA error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/verify-admin-mfa - Verify MFA code and complete admin login
router.post('/verify-admin-mfa', async (req, res) => {
  try {
    const { email, mfaCode } = req.body;

    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: emailValidation.error || 'Invalid email'
      });
    }

    // Validate MFA code format
    const mfaValidation = validateMfaCodeFormat(mfaCode);
    if (!mfaValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: mfaValidation.error || 'Invalid MFA code'
      });
    }

    const sanitizedEmail = emailValidation.sanitized;
    const sanitizedMfaCode = mfaValidation.sanitized;

    // Validate MFA code against database
    const mfaData = await validateMfaCode(sanitizedEmail, sanitizedMfaCode);

    if (!mfaData) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }

    if (mfaData.error) {
      return res.status(400).json({
        success: false,
        message: mfaData.error
      });
    }

    // Mark MFA code as used
    await markMfaCodeAsUsed(sanitizedEmail, sanitizedMfaCode);

    // Get user data with roles
    const userResult = await query(`
      SELECT e.id, e.email, e.first_name, e.last_name, e.email_verified,
             es.status_name as employee_status,
             COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) as roles,
             CASE
               WHEN 'executive' = ANY(array_agg(r.name)) THEN 'executive'
               WHEN 'admin' = ANY(array_agg(r.name)) THEN 'admin'
               WHEN 'technician' = ANY(array_agg(r.name)) THEN 'technician'
               WHEN 'sales' = ANY(array_agg(r.name)) THEN 'sales'
               ELSE 'employee'
             END as role
      FROM employees e
      LEFT JOIN employee_roles er ON e.id = er.employee_id
      LEFT JOIN roles r ON er.role_id = r.id AND r.is_active = true
      LEFT JOIN employee_employment_statuses es ON e.employee_status_id = es.id
      WHERE e.id = $1
      GROUP BY e.id, e.email, e.first_name, e.last_name, e.email_verified, es.status_name
    `, [mfaData.user_id]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Create a new session for the user
    const userAgent = req.get('User-Agent');
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress ||
                     (req.connection.socket ? req.connection.socket.remoteAddress : null);

    const session = await sessionService.createSession(
      user.id,
      user.email,
      userAgent,
      ipAddress
    );

    // Return successful login response with session
    const userData = {
      id: user.id,
      email: user.email,
      role: user.role || 'admin',
      name: `${user.first_name} ${user.last_name}`.trim() || user.email,
      businessName: null,
      isFirstAdmin: true
    };

    // Get session timeout from database (or fallback to config)
    const sessionTimeoutMs = await sessionService.getSessionTimeoutMs();

    // Set HttpOnly session cookie for enhanced security
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: sessionTimeoutMs, // Use database timeout setting
      path: '/'
    };

    res.cookie('sessionToken', session.sessionToken, cookieOptions);

    console.log(`✅ Admin login successful with MFA for: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: userData,
      session: {
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt
      }
    });

  } catch (error) {
    console.error('Admin MFA verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/verify-client-mfa - Verify MFA code and complete client login
router.post('/verify-client-mfa', async (req, res) => {
  try {
    const { email, mfaCode } = req.body;

    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: emailValidation.error || 'Invalid email'
      });
    }

    // Validate MFA code format
    const mfaValidation = validateMfaCodeFormat(mfaCode);
    if (!mfaValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: mfaValidation.error || 'Invalid MFA code'
      });
    }

    const sanitizedEmail = emailValidation.sanitized;
    const sanitizedMfaCode = mfaValidation.sanitized;

    // Validate MFA code against database
    const mfaData = await validateMfaCode(sanitizedEmail, sanitizedMfaCode);
    if (!mfaData) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code'
      });
    }
    if (mfaData.error) {
      return res.status(400).json({
        success: false,
        message: mfaData.error
      });
    }

    // Mark MFA code as used
    await markMfaCodeAsUsed(sanitizedEmail, sanitizedMfaCode);

    // Get client user data
    const userResult = await query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.email_verified,
             b.business_name, 'client' as user_type
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      WHERE u.id = $1
    `, [mfaData.user_id]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Create a new session for the client
    const userAgent = req.get('User-Agent');
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress ||
                     (req.connection.socket ? req.connection.socket.remoteAddress : null);

    const session = await sessionService.createSession(
      user.id,
      user.email,
      userAgent,
      ipAddress
    );

    // Get session timeout from database (or fallback to config)
    const sessionTimeoutMs = await sessionService.getSessionTimeoutMs();

    // Set HttpOnly session cookie for enhanced security
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: sessionTimeoutMs, // Use database timeout setting
      path: '/'
    };

    res.cookie('sessionToken', session.sessionToken, cookieOptions);

    // Return successful login response with session
    const userData = {
      id: user.id,
      email: user.email,
      role: user.role || 'client',
      name: `${user.first_name} ${user.last_name}`.trim() || user.email,
      businessName: user.business_name,
      isFirstAdmin: false
    };

    console.log(`✅ Client login successful with MFA for: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: userData,
      session: {
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt
      }
    });

  } catch (error) {
    console.error('Client MFA verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // First check employees table for admin/sales/technician users
    let userResult = await query(`
      SELECT id, email, first_name, last_name, role, 'employee' as user_type
      FROM employees
      WHERE email = $1 AND employee_status != 'terminated'
    `, [email]);

    // If not found in employees, check users table for clients
    if (userResult.rows.length === 0) {
      userResult = await query(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.role, 'client' as user_type
        FROM users u
        WHERE u.email = $1
      `, [email]);
    }

    if (userResult.rows.length === 0) {
      // Don't reveal if the user exists or not for security
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, you will receive a password reset code.'
      });
    }

    const user = userResult.rows[0];

    // Generate reset token and code
    const resetToken = generateResetToken();
    const resetCode = generateMfaCode(); // Reuse the 6-digit code generator

    // Store password reset token
    await storePasswordResetToken(user.id, user.user_type, email, resetToken, resetCode);

    // Send password reset email
    await sendPasswordResetEmail(email, user.first_name, resetCode);

    // SECURITY FIX: Never expose reset codes in API responses (even in development)
    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, you will receive a password reset code.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/reset-password - Confirm password reset with code
router.post('/reset-password', async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;

    if (!email || !resetCode || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, reset code, and new password are required'
      });
    }

    // Get user info for validation
    let userInfo = {};
    try {
      let userResult = await query(`
        SELECT email, first_name, last_name FROM employees WHERE id = (
          SELECT user_id FROM password_reset_tokens WHERE email = $1 AND reset_code = $2
        )
      `, [email, resetCode]);

      if (userResult.rows.length === 0) {
        userResult = await query(`
          SELECT email, first_name, last_name FROM users WHERE id = (
            SELECT user_id FROM password_reset_tokens WHERE email = $1 AND reset_code = $2
          )
        `, [email, resetCode]);
      }

      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        userInfo = {
          name: `${user.first_name} ${user.last_name}`,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name
        };
      }
    } catch (error) {
      console.warn('Could not get user info for password validation:', error.message);
    }

    // Validate password against complexity requirements
    const validation = await validatePasswordComplexity(newPassword, userInfo);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Password does not meet complexity requirements',
        feedback: validation.feedback
      });
    }

    // Validate reset token
    const tokenData = await validatePasswordResetToken(email, resetCode);

    if (tokenData.error) {
      return res.status(400).json({
        success: false,
        message: tokenData.error
      });
    }

    // Hash the new password
    const passwordHash = await hashPassword(newPassword);

    // SECURITY FIX: Use whitelist for table names to prevent SQL injection
    const table = ALLOWED_USER_TABLES[tokenData.user_type];

    if (!table) {
      console.error(`Invalid user type for password reset: ${tokenData.user_type}`);
      return res.status(500).json({
        success: false,
        message: SECURITY_MESSAGES.SERVER_ERROR
      });
    }

    await query(`
      UPDATE ${table}
      SET password_hash = $1
      WHERE id = $2
    `, [passwordHash, tokenData.user_id]);

    // Mark the token as used
    await markResetTokenAsUsed(email, resetCode);

    // Add password to history
    await addPasswordToHistory(tokenData.user_id, passwordHash);

    // Update password change timestamp
    await updatePasswordChangeTimestamp(tokenData.user_id, tokenData.user_type);

    // End all existing sessions for this user
    await sessionService.endAllUserSessions(tokenData.user_id);

    console.log(`🔐 Password reset successful for ${email}`);

    res.status(200).json({
      success: true,
      message: 'Password reset successful. You can now sign in with your new password.'
    });

  } catch (error) {
    console.error('Reset password error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to reset password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========================================
// PASSWORD COMPLEXITY & VALIDATION
// ========================================

// POST /api/auth/validate-password - Validate password against current requirements
router.post('/validate-password', async (req, res) => {
  try {
    const { password, userInfo } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required'
      });
    }

    const validation = await validatePasswordComplexity(password, userInfo);

    res.status(200).json({
      success: true,
      ...validation
    });
  } catch (error) {
    console.error('Error validating password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/password-history - Add password to history (internal use)
router.post('/password-history', async (req, res) => {
  try {
    const { userId, passwordHash } = req.body;

    if (!userId || !passwordHash) {
      return res.status(400).json({
        success: false,
        message: 'User ID and password hash are required'
      });
    }

    await addPasswordToHistory(userId, passwordHash);

    res.status(200).json({
      success: true,
      message: 'Password added to history successfully'
    });
  } catch (error) {
    console.error('Error adding password to history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add password to history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/password-history/check - Check if password was used recently
router.post('/password-history/check', async (req, res) => {
  try {
    const { userId, passwordHash } = req.body;

    if (!userId || !passwordHash) {
      return res.status(400).json({
        success: false,
        message: 'User ID and password hash are required'
      });
    }

    const isInHistory = await checkPasswordHistory(userId, passwordHash);

    res.status(200).json({
      success: true,
      isInHistory
    });
  } catch (error) {
    console.error('Error checking password history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check password history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/auth/password-expiration/:userId - Get password expiration info
router.get('/password-expiration/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const expirationInfo = await getPasswordExpirationInfo(userId);

    res.status(200).json({
      success: true,
      ...expirationInfo
    });
  } catch (error) {
    console.error('Error getting password expiration info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get password expiration info',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/change-password - Change user password with complexity validation
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword, userInfo } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    // Get user ID from session or request (this would need to be implemented with proper auth middleware)
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User must be authenticated'
      });
    }

    // Get user from database
    let userResult = await query(`
      SELECT id, email, first_name, last_name, password_hash, 'employee' as user_type
      FROM employees WHERE id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      userResult = await query(`
        SELECT id, email, first_name, last_name, password_hash, 'client' as user_type
        FROM users WHERE id = $1
      `, [userId]);
    }

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Verify current password
    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Validate new password against complexity requirements
    const validation = await validatePasswordComplexity(newPassword, {
      name: `${user.first_name} ${user.last_name}`,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name
    });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'New password does not meet complexity requirements',
        feedback: validation.feedback
      });
    }

    // Check if password was used recently
    const newPasswordHash = await hashPassword(newPassword);
    const isInHistory = await checkPasswordHistory(userId, newPassword);

    if (isInHistory) {
      const requirements = await passwordComplexityService.getPasswordComplexityRequirements();
      return res.status(400).json({
        success: false,
        message: `Password was used recently. Please choose a password you haven't used in the last ${requirements.passwordHistoryCount} passwords.`
      });
    }

    // SECURITY FIX: Use whitelist for table names to prevent SQL injection
    const table = ALLOWED_USER_TABLES[user.user_type];

    if (!table) {
      console.error(`Invalid user type for password update: ${user.user_type}`);
      return res.status(500).json({
        success: false,
        message: SECURITY_MESSAGES.SERVER_ERROR
      });
    }

    await query(`
      UPDATE ${table}
      SET password_hash = $1
      WHERE id = $2
    `, [newPasswordHash, userId]);

    // Add password to history
    await addPasswordToHistory(userId, newPasswordHash);

    // Update password change timestamp
    await updatePasswordChangeTimestamp(userId, user.user_type);

    // End all other sessions for this user
    await sessionService.endAllUserSessions(userId);

    console.log(`🔐 Password changed successfully for user ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Resend MFA code for client login
router.post('/resend-client-mfa', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Find client user with MFA enabled
    const clientResult = await query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.mfa_enabled, u.mfa_email
      FROM users u
      WHERE u.email = $1 AND u.mfa_enabled = true
    `, [email]);

    if (clientResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Client with MFA enabled not found'
      });
    }

    const user = clientResult.rows[0];

    // Generate and store new MFA code
    const mfaCode = generateMfaCode();
    await storeMfaCode(user.id, user.email, mfaCode);

    // Get user's language preference for email
    const languageResult = await query(`
      SELECT language_preference FROM users WHERE email = $1
    `, [user.email]);
    const userLanguage = languageResult.rows[0]?.language_preference || 'en';

    // Send MFA email with user's preferred language
    await sendMfaEmail(user.email, user.first_name, mfaCode, userLanguage, 'client');

    console.log(`🔐 Client MFA code resent to ${user.email}: ${userLanguage}`);

    res.status(200).json({
      success: true,
      message: 'MFA code resent successfully'
    });

  } catch (error) {
    console.error('Error resending client MFA code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend MFA code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// SMS MFA Endpoints - Enhanced MFA with SMS support via AWS SNS

// POST /api/auth/verify-phone - Verify phone number for SMS MFA
router.post('/verify-phone', async (req, res) => {
  try {
    const { userId, phoneNumber } = req.body;

    if (!userId || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'User ID and phone number are required'
      });
    }

    // Validate phone number format
    if (!validatePhoneNumberForMFA(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format. Please use international format (e.g., +1234567890)'
      });
    }

    // Check SMS rate limits for this phone number
    const smsStats = getSMSStats(phoneNumber);
    if (smsStats.hourly.remaining <= 0) {
      return res.status(429).json({
        success: false,
        message: 'SMS hourly limit exceeded. Please try again later.'
      });
    }

    // Find user to get their name and language preference
    const userResult = await query(`
      SELECT first_name, language_preference FROM users WHERE id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];
    const userLanguage = user.language_preference || 'en';

    // Generate verification code
    const verificationCode = generateMfaCode();

    // Store verification code in session/temporary storage (10 minute expiry)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await query(`
      INSERT INTO mfa_verification_codes (user_id, code, expires_at, code_type, phone_number)
      VALUES ($1, $2, $3, 'phone_verification', $4)
      ON CONFLICT (user_id, code_type)
      DO UPDATE SET code = $2, expires_at = $3, phone_number = $4, used_at = NULL
    `, [userId, verificationCode, expiresAt, phoneNumber]);

    // Send SMS verification code
    await sendPhoneVerificationSMS(phoneNumber, user.first_name, verificationCode, userLanguage);

    console.log(`📱 Phone verification code sent to ${phoneNumber} for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Verification code sent to your phone',
      smsStats: smsStats
    });

  } catch (error) {
    console.error('Error in phone verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/confirm-phone - Confirm phone verification
router.post('/confirm-phone', async (req, res) => {
  try {
    const { userId, phoneNumber, verificationCode } = req.body;

    if (!userId || !phoneNumber || !verificationCode) {
      return res.status(400).json({
        success: false,
        message: 'User ID, phone number, and verification code are required'
      });
    }

    // Find and validate verification code
    const codeResult = await query(`
      SELECT id, code, expires_at, used_at, phone_number
      FROM mfa_verification_codes
      WHERE user_id = $1 AND code_type = 'phone_verification' AND code = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId, verificationCode]);

    if (codeResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code'
      });
    }

    const storedCode = codeResult.rows[0];

    // Check if code has been used
    if (storedCode.used_at) {
      return res.status(400).json({
        success: false,
        message: 'Verification code has already been used'
      });
    }

    // Check if code has expired
    if (new Date() > new Date(storedCode.expires_at)) {
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired'
      });
    }

    // Check if phone number matches
    if (storedCode.phone_number !== phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number mismatch'
      });
    }

    // Mark code as used
    await query(`
      UPDATE mfa_verification_codes
      SET used_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [storedCode.id]);

    // Update user's phone number and mark as verified
    await query(`
      UPDATE users
      SET phone_number = $1, phone_verified = true
      WHERE id = $2
    `, [phoneNumber, userId]);

    console.log(`✅ Phone number ${phoneNumber} verified for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Phone number verified successfully'
    });

  } catch (error) {
    console.error('Error confirming phone verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify phone number',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/update-mfa-method - Update user's MFA delivery method
router.post('/update-mfa-method', async (req, res) => {
  try {
    const { userId, mfaMethod } = req.body;

    if (!userId || !mfaMethod) {
      return res.status(400).json({
        success: false,
        message: 'User ID and MFA method are required'
      });
    }

    // Validate MFA method
    const validMethods = ['email', 'sms', 'both'];
    if (!validMethods.includes(mfaMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid MFA method. Must be email, sms, or both'
      });
    }

    // If SMS is requested, check if phone is verified
    if (mfaMethod === 'sms' || mfaMethod === 'both') {
      const userResult = await query(`
        SELECT phone_number, phone_verified FROM users WHERE id = $1
      `, [userId]);

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const user = userResult.rows[0];
      if (!user.phone_number || !user.phone_verified) {
        return res.status(400).json({
          success: false,
          message: 'Phone number must be verified before enabling SMS MFA'
        });
      }
    }

    // Update user's MFA method
    await query(`
      UPDATE users
      SET mfa_method = $1
      WHERE id = $2
    `, [mfaMethod, userId]);

    console.log(`🔧 MFA method updated to '${mfaMethod}' for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'MFA method updated successfully',
      mfaMethod: mfaMethod
    });

  } catch (error) {
    console.error('Error updating MFA method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update MFA method',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/send-mfa-code - Send MFA code via selected method(s)
router.post('/send-mfa-code', async (req, res) => {
  try {
    const { userId, deliveryMethod } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Get user details
    const userResult = await query(`
      SELECT email, phone_number, phone_verified, first_name, language_preference, mfa_method
      FROM users
      WHERE id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];
    const userLanguage = user.language_preference || 'en';
    const requestedMethod = deliveryMethod || user.mfa_method || 'email';

    // Validate delivery method based on user's verified contact methods
    if (requestedMethod === 'sms' || requestedMethod === 'both') {
      if (!user.phone_number || !user.phone_verified) {
        return res.status(400).json({
          success: false,
          message: 'SMS delivery not available - phone number not verified'
        });
      }

      // Check SMS rate limits
      const smsStats = getSMSStats(user.phone_number);
      if (smsStats.hourly.remaining <= 0) {
        return res.status(429).json({
          success: false,
          message: 'SMS hourly limit exceeded. Try email delivery or wait before trying again.'
        });
      }
    }

    // Generate MFA code
    const mfaCode = generateMfaCode();

    // Store MFA code
    await storeMfaCode(userId, user.email, mfaCode);

    // Send MFA code via requested method(s)
    const deliveryResult = await sendMfaCode({
      email: user.email,
      phoneNumber: user.phone_number,
      firstName: user.first_name,
      mfaCode: mfaCode,
      language: userLanguage,
      userType: 'client',
      deliveryMethod: requestedMethod,
      codeType: 'login'
    });

    // Prepare response based on delivery results
    let message = 'MFA code sent successfully';
    let deliveryDetails = {};

    if (requestedMethod === 'email') {
      message = deliveryResult.email.sent ? 'MFA code sent to your email' : 'Failed to send email';
      deliveryDetails.email = deliveryResult.email.sent;
    } else if (requestedMethod === 'sms') {
      message = deliveryResult.sms.sent ? 'MFA code sent to your phone' : 'Failed to send SMS';
      deliveryDetails.sms = deliveryResult.sms.sent;
    } else if (requestedMethod === 'both') {
      const emailSent = deliveryResult.email.sent;
      const smsSent = deliveryResult.sms.sent;

      if (emailSent && smsSent) {
        message = 'MFA code sent to both email and phone';
      } else if (emailSent) {
        message = 'MFA code sent to email (SMS failed)';
      } else if (smsSent) {
        message = 'MFA code sent to phone (email failed)';
      } else {
        message = 'Failed to send MFA code via any method';
      }

      deliveryDetails = { email: emailSent, sms: smsSent };
    }

    if (!deliveryResult.success) {
      return res.status(500).json({
        success: false,
        message: message,
        deliveryDetails: deliveryDetails
      });
    }

    console.log(`🔐 MFA code sent via ${requestedMethod} for user ${userId}`);

    res.status(200).json({
      success: true,
      message: message,
      deliveryMethod: requestedMethod,
      deliveryDetails: deliveryDetails
    });

  } catch (error) {
    console.error('Error sending MFA code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send MFA code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/auth/sms-stats/:phoneNumber - Get SMS usage statistics
router.get('/sms-stats/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    // Validate phone number format
    if (!validatePhoneNumberForMFA(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }

    const stats = getSMSStats(phoneNumber);

    res.status(200).json({
      success: true,
      stats: stats
    });

  } catch (error) {
    console.error('Error getting SMS stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get SMS statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/trusted-device-login - Complete authentication for trusted devices (bypass MFA)
router.post('/trusted-device-login', async (req, res) => {
  try {
    const { email, password, deviceFingerprint } = req.body;

    // Validate and sanitize inputs
    const validation = validateLoginInputs({ email, password });
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: Object.values(validation.errors)[0] || 'Invalid input'
      });
    }

    const sanitizedEmail = validation.sanitized.email;

    // Validate device fingerprint
    const fingerprintValidation = validateDeviceFingerprint(deviceFingerprint);
    if (!fingerprintValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: fingerprintValidation.error || 'Invalid device fingerprint'
      });
    }

    // First check employees table for admin/sales/technician users
    let userResult = await query(`
      SELECT e.id, e.email, e.first_name, e.last_name, e.password_hash, e.email_verified,
             es.status_name as employee_status, 'employee' as user_type,
             COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) as roles,
             CASE
               WHEN 'admin' = ANY(array_agg(r.name)) THEN 'admin'
               WHEN 'executive' = ANY(array_agg(r.name)) THEN 'executive'
               WHEN 'sales' = ANY(array_agg(r.name)) THEN 'sales'
               WHEN 'technician' = ANY(array_agg(r.name)) THEN 'technician'
               ELSE 'employee'
             END as role
      FROM employees e
      LEFT JOIN employee_roles er ON e.id = er.employee_id
      LEFT JOIN roles r ON er.role_id = r.id AND r.is_active = true
      LEFT JOIN employee_employment_statuses es ON e.employee_status_id = es.id
      WHERE e.email = $1
      GROUP BY e.id, e.email, e.first_name, e.last_name, e.password_hash, e.email_verified, es.status_name
    `, [sanitizedEmail]);

    // If not found in employees, check users table for clients
    if (userResult.rows.length === 0) {
      userResult = await query(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.password_hash, u.email_verified,
               u.role, b.business_name, 'client' as user_type, null as employee_status,
               ARRAY[]::text[] as roles
        FROM users u
        LEFT JOIN businesses b ON u.business_id = b.id
        WHERE u.email = $1
      `, [sanitizedEmail]);
    }

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const user = userResult.rows[0];

    // Check if employee is terminated (for employee accounts only)
    if (user.user_type === 'employee' && user.employee_status === 'terminated') {
      console.log(`🚫 Trusted device login denied for terminated employee: ${user.email}`);
      return res.status(401).json({
        success: false,
        message: 'Account access has been terminated. Please contact your administrator.'
      });
    }

    // Check if email is verified
    if (!user.email_verified) {
      return res.status(401).json({
        success: false,
        message: 'Account not confirmed. Please check your email to confirm your account.'
      });
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify device is actually trusted
    const { checkTrustedDevice } = await import('../utils/trustedDeviceUtils.js');
    const trustedDevice = await checkTrustedDevice(user.id, user.user_type, deviceFingerprint);

    if (!trustedDevice) {
      return res.status(403).json({
        success: false,
        message: 'Device is not trusted for this user'
      });
    }

    // Create session (same as MFA verification)
    console.log('🔐 Creating new session for user:', user.email);
    const sessionData = await sessionService.createSession(user.id, user.email, req.headers['user-agent'], req.ip);

    // Get session timeout from database (or fallback to config)
    const sessionTimeoutMs = await sessionService.getSessionTimeoutMs();

    // Set HttpOnly session cookie
    res.cookie('sessionToken', sessionData.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', // lax for development
      maxAge: sessionTimeoutMs, // Use database timeout setting
      path: '/'
    });


    console.log(`✅ Trusted device login successful for: ${user.email} (${user.user_type})`);

    // Return user data appropriate for user type
    const userData = {
      id: user.id,
      email: user.email,
      role: user.role || (user.user_type === 'client' ? 'client' : 'employee'),
      name: `${user.first_name} ${user.last_name}`.trim() || user.email,
      emailVerified: user.email_verified
    };

    // Add employee-specific fields
    if (user.user_type === 'employee') {
      userData.roles = user.roles;
      userData.employeeStatus = user.employee_status;
      userData.businessName = null;
      userData.isFirstAdmin = true;
    }

    // Add client-specific fields
    if (user.user_type === 'client') {
      userData.businessName = user.business_name;
      userData.isFirstAdmin = false;
    }

    const responsePayload = {
      success: true,
      message: 'Authentication successful via trusted device',
      user: userData,
      session: {
        sessionToken: sessionData.sessionToken,
        expiresAt: sessionData.expiresAt
      }
    };

    console.log('📤 Sending trusted device login response:', {
      success: responsePayload.success,
      userEmail: responsePayload.user.email,
      hasSessionToken: !!responsePayload.session.sessionToken,
      sessionTokenLength: responsePayload.session.sessionToken?.length,
      sessionStructure: Object.keys(responsePayload.session)
    });

    res.json(responsePayload);

  } catch (error) {
    console.error('Trusted device login error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/client-login - Client-specific login (only checks users table)
router.post('/client-login', async (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress;

  // Check if IP is blocked due to too many failed attempts
  const rateLimitCheck = checkFailedAttempts(clientIP);
  if (rateLimitCheck.blocked) {
    return res.status(429).json({
      success: false,
      message: 'Too many failed login attempts. Please try again later.',
      retryAfter: rateLimitCheck.retryAfter
    });
  }

  try {
    const { email, password } = req.body;

    // Validate and sanitize inputs
    const validation = validateLoginInputs({ email, password });
    if (!validation.isValid) {
      recordFailedAttempt(clientIP);
      return res.status(400).json({
        success: false,
        message: Object.values(validation.errors)[0] || 'Invalid input'
      });
    }

    // Use sanitized email for database queries
    const sanitizedEmail = validation.sanitized.email;

    // Only check users table for clients
    const userResult = await query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.password_hash, u.role, u.email_verified,
             b.business_name, 'client' as user_type, u.mfa_enabled, u.mfa_email
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      WHERE u.email = $1
    `, [sanitizedEmail]);

    if (userResult.rows.length === 0) {
      recordFailedAttempt(clientIP);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = userResult.rows[0];

    // Check if email is verified
    if (!user.email_verified) {
      return res.status(401).json({
        success: false,
        message: 'Account not confirmed. Please check your email to confirm your account.'
      });
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      recordFailedAttempt(clientIP);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Clear failed attempts on successful authentication
    clearFailedAttempts(clientIP);

    // Check if this client has MFA enabled
    if (user.mfa_enabled === true) {
      try {
        // Generate and send MFA code to client
        const mfaCode = generateMfaCode();
        await storeMfaCode(user.id, user.email, mfaCode);

        // Get user's language preference for email
        const languageResult = await query(`
          SELECT language_preference FROM users WHERE email = $1
        `, [user.email]);
        const userLanguage = languageResult.rows[0]?.language_preference || 'en';

        await sendMfaEmail(user.mfa_email || user.email, user.first_name, mfaCode, userLanguage, 'client');

        return res.status(200).json({
          success: true,
          requiresMfa: true,
          userType: 'client',
          message: 'Multi-factor authentication required. Please verify with the code sent to your email.',
          email: user.email,
          mfaEmail: user.mfa_email || user.email
        });
      } catch (error) {
        console.error('Error sending client MFA code:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to send verification code. Please try again.'
        });
      }
    }

    // Create a new session for the user (users not requiring MFA)
    const userAgent = req.get('User-Agent');
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress ||
                     (req.connection.socket ? req.connection.socket.remoteAddress : null);

    const session = await sessionService.createSession(
      user.id,
      user.email,
      userAgent,
      ipAddress
    );

    // Get session timeout from database (or fallback to config)
    const sessionTimeoutMs = await sessionService.getSessionTimeoutMs();

    // Set HttpOnly session cookie for enhanced security
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: sessionTimeoutMs, // Use database timeout setting
      path: '/'
    };

    res.cookie('sessionToken', session.sessionToken, cookieOptions);

    // Return successful login response with session
    const userData = {
      id: user.id,
      email: user.email,
      role: user.role || 'client',
      name: `${user.first_name} ${user.last_name}`.trim() || user.email,
      businessName: user.business_name,
      isFirstAdmin: false
    };

    console.log(`✅ Client login successful: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: userData,
      session: {
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt
      }
    });

  } catch (error) {
    console.error('Client login error:', error);

    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;