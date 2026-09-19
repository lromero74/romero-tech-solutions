import express from 'express';
import { logger } from '../../utils/logger.js';
import bcrypt from 'bcryptjs';
import { query } from '../../config/database.js';
import { sessionService } from '../../services/sessionService.js';
import { verifyPassword } from '../../utils/passwordUtils.js';
import {
  validateLoginInputs,
  validateDeviceFingerprint,
  generateMfaCode
} from '../../utils/inputValidation.js';
import {
  storeMfaCode,
  sendMfaEmail,
  sendMfaCode
} from '../../utils/mfaUtils.js';
import { mfaSettingsService } from '../../services/mfaSettingsService.js';
import { auditLogService, AUDIT_EVENTS } from '../../services/auditLogService.js';
import { SECURITY_MESSAGES, DUMMY_BCRYPT_HASH } from '../../config/security.js';
import {
  employeeLoginLimiter,
  clearEmployeeLoginAttempts,
  recordFailedEmployeeLogin
} from '../../middleware/employeeLoginRateLimiter.js';
import {
  checkAccountLockStatus,
  recordFailedLoginAttempt,
  resetFailedLoginAttempts
} from '../../services/accountLockoutService.js';
import {
  recordFailedAttempt,
  clearFailedAttempts,
  checkFailedAttempts
} from './attemptTracker.js';

const router = express.Router();

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
             CASE WHEN 'admin' = ANY(array_agg(r.name)) THEN 'admin' ELSE 'employee' END as role,
             e.time_format_preference
      FROM employees e
      LEFT JOIN employee_roles er ON e.id = er.employee_id
      LEFT JOIN roles r ON er.role_id = r.id AND r.is_active = true
      LEFT JOIN employee_employment_statuses es ON e.employee_status_id = es.id
      WHERE e.email = $1
      GROUP BY e.id, e.email, e.first_name, e.last_name, e.password_hash, e.email_verified,
               es.status_name, e.termination_date, e.time_format_preference
    `, [email]);

    // If not found in employees, check users table for clients
    if (userResult.rows.length === 0) {
      userResult = await query(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.password_hash, u.role, u.email_verified,
               b.business_name, 'client' as user_type, u.mfa_enabled, u.mfa_email, u.is_test_account,
               u.time_format_preference, u.is_trial, u.subscription_expires_at, u.business_id
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

      logger.warn(`🚫 Login denied for terminated employee: ${user.email}`);
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

          let message = 'Multi-factor authentication required. Please verify with the code sent to your email.';

          // Skip sending email for test accounts
          if (user.is_test_account) {
            logger.debug(`🧪 TEST ACCOUNT: Skipping MFA email for client ${user.email}. Code: ${mfaCode}`);
            message = `Test account login - MFA code: ${mfaCode}`;
          } else {
            await sendMfaEmail(user.mfa_email || user.email, user.first_name, mfaCode, userLanguage, 'client');
          }

          return res.status(200).json({
            success: true,
            requiresMfa: true,
            userType: 'client',
            message,
            email: user.email,
            mfaEmail: user.mfa_email || user.email
          });
        } catch (error) {
          logger.error('Error sending client MFA code:', error);
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
      businessId: user.business_id,
      timeFormatPreference: user.time_format_preference || '12h',
      isTrial: user.is_trial || false,
      trialExpiresAt: user.subscription_expires_at,
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
    logger.error('Login error:', error);

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
    logger.error('Logout error:', error);

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
    logger.error('Session validation error:', error);

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
    logger.error('Session heartbeat error:', error);

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

      logger.debug(`🔄 Session extended for user: ${session.userEmail}`);

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
    logger.error('Session extension error:', error);

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
    logger.error('Check admin error:', error);

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
    logger.debug('🔍 ADMIN-LOGIN-MFA REQUEST:', { email, hasPassword: !!password, deviceFingerprint: deviceFingerprint ? `${deviceFingerprint.substring(0, 16)}...` : 'MISSING' });

    // Validate and sanitize inputs
    const validation = validateLoginInputs({ email, password });
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: Object.values(validation.errors)[0] || 'Invalid input'
      });
    }

    const sanitizedEmail = validation.sanitized.email;

    // SECURITY: Check if account is locked due to too many failed attempts
    const lockStatus = await checkAccountLockStatus(sanitizedEmail, 'employee');
    if (lockStatus.isLocked) {
      logger.warn(`🔒 Login attempt for locked account: ${sanitizedEmail}, locked for ${lockStatus.remainingMinutes} more minutes`);
      return res.status(423).json({
        success: false,
        message: `Account temporarily locked due to multiple failed login attempts. Please try again in ${lockStatus.remainingMinutes} minutes or reset your password.`,
        code: 'ACCOUNT_LOCKED',
        remainingMinutes: lockStatus.remainingMinutes
      });
    }

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
             e.phone, es.status_name as employee_status, e.termination_date, e.is_test_account,
             e.time_format_preference
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
      logger.warn(`🚫 Login denied for terminated admin: ${user.email}`);
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

      // SECURITY: Record failed login attempt and check if account should be locked
      const lockoutResult = await recordFailedLoginAttempt(sanitizedEmail, 'employee');
      if (lockoutResult.accountLocked) {
        return res.status(423).json({
          success: false,
          message: `Account locked due to ${lockoutResult.remainingAttempts + 5} failed login attempts. A password reset link has been sent to your email.`,
          code: 'ACCOUNT_LOCKED',
          lockoutMinutes: lockoutResult.lockoutMinutes
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
        remainingAttempts: lockoutResult.remainingAttempts > 0 ? lockoutResult.remainingAttempts : undefined
      });
    }

    // Clear successful login attempts (password was correct)
    clearEmployeeLoginAttempts(clientIP, email);
    await resetFailedLoginAttempts(sanitizedEmail, 'employee');

    // Check if device is trusted (skip MFA if trusted)
    if (deviceFingerprint) {
      try {
        const { checkTrustedDevice } = await import('../utils/trustedDeviceUtils.js');
        const trustedDevice = await checkTrustedDevice(user.id, 'employee', deviceFingerprint);

        if (trustedDevice) {
          logger.debug(`🔐 Trusted device detected for ${user.email}, skipping MFA and creating session`);

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
            phone: user.phone,
            timeFormatPreference: user.time_format_preference || '12h'
          };

          logger.debug(`✅ Session created for trusted device login: ${sessionData.sessionToken.substring(0, 20)}...`);

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
          logger.debug(`🔓 Device not trusted for ${user.email}, proceeding with MFA`);
        }
      } catch (error) {
        logger.error('Error checking trusted device:', error);
        // Continue with MFA flow if trusted device check fails
      }
    }

    // Generate and store MFA code (only reached if device is NOT trusted)
    const mfaCode = generateMfaCode();
    await storeMfaCode(user.id, user.email, mfaCode, 'employee');

    // Initialize message variable
    let message = 'Verification code sent. Please check and enter the code to complete login.';

    // Send MFA via both email and SMS (skip for test accounts)
    try {
      if (user.is_test_account) {
        logger.debug(`🧪 TEST ACCOUNT: Skipping MFA email/SMS for ${user.email}. Code: ${mfaCode}`);
        // For test accounts, skip email/SMS but allow login to proceed
        message = `Test account login - MFA code: ${mfaCode}`;
      } else {
        logger.debug(`🚀 DEBUG: About to send MFA with phone: ${user.phone}, email: ${user.email}, deliveryMethod: all`);
        const deliveryResult = await sendMfaCode({
          email: user.email,
          phoneNumber: user.phone, // Use phone from employees table
          firstName: user.first_name,
          mfaCode,
          language: 'en',
          userType: 'admin',
          deliveryMethod: 'all', // Send via email, SMS, and push
          codeType: 'login',
          userId: user.id // Pass userId for push notifications
        });
        logger.debug(`🚀 DEBUG: MFA deliveryResult:`, deliveryResult);

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
        if (deliveryResult.push?.sent) methods.push('device (push notification)');

        if (methods.length > 0) {
          message += ` to your ${methods.join(' and ')}`;
        }
        message += '. Please check and enter the code to complete login.';
      }

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
    logger.error('Admin login MFA error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
