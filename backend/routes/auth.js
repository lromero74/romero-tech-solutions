import express from 'express';
import { query } from '../config/database.js';
import { sessionService } from '../services/sessionService.js';
import { passwordComplexityService } from '../services/passwordComplexityService.js';
import { mfaSettingsService } from '../services/mfaSettingsService.js';
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
  generateMfaCode,
  generateResetToken,
  storeMfaCode,
  validateMfaCode,
  markMfaCodeAsUsed,
  sendMfaEmail,
  storePasswordResetToken,
  validatePasswordResetToken,
  markResetTokenAsUsed,
  sendPasswordResetEmail
} from '../utils/mfaUtils.js';

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

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = userResult.rows[0];

    // Check if employee is terminated (for employee accounts only)
    if (user.user_type === 'employee' && user.employee_status === 'terminated') {
      console.log(`🚫 Login denied for terminated employee: ${user.email}`);
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
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

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

    // Set HttpOnly session cookie for enhanced security
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes (matches session expiry)
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
router.post('/admin-login-mfa', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Check employees table for admin users only using normalized roles
    const userResult = await query(`
      SELECT e.id, e.email, e.first_name, e.last_name, e.password_hash, e.email_verified,
             es.status_name as employee_status, e.termination_date
      FROM employees e
      JOIN employee_roles er ON e.id = er.employee_id
      JOIN roles r ON er.role_id = r.id
      LEFT JOIN employee_employment_statuses es ON e.employee_status_id = es.id
      WHERE e.email = $1 AND r.name = 'admin' AND r.is_active = true
    `, [email]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = userResult.rows[0];

    // Check if employee is terminated
    if (user.employee_status === 'terminated') {
      console.log(`🚫 Login denied for terminated admin: ${user.email}`);
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
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate and store MFA code
    const mfaCode = generateMfaCode();
    await storeMfaCode(user.id, user.email, mfaCode);

    // Send MFA email
    try {
      await sendMfaEmail(user.email, user.first_name, mfaCode);
    } catch (emailError) {
      return res.status(500).json({
        success: false,
        message: emailError.message
      });
    }

    res.status(200).json({
      success: true,
      message: 'Verification code sent to your email. Please check your email and enter the code to complete login.',
      requiresMfa: true,
      email: user.email,
      // Include mfaCode in development for testing
      ...(process.env.NODE_ENV === 'development' && { mfaCode })
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

    if (!email || !mfaCode) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required'
      });
    }

    // Validate MFA code
    const mfaData = await validateMfaCode(email, mfaCode);

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
    await markMfaCodeAsUsed(email, mfaCode);

    // Get user data with roles
    const userResult = await query(`
      SELECT e.id, e.email, e.first_name, e.last_name, e.email_verified,
             es.status_name as employee_status,
             COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) as roles,
             CASE WHEN 'admin' = ANY(array_agg(r.name)) THEN 'admin' ELSE 'employee' END as role
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

    // Set HttpOnly session cookie for enhanced security
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes (matches session expiry)
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
    if (!email || !mfaCode) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required'
      });
    }

    // Validate MFA code
    const mfaData = await validateMfaCode(email, mfaCode);
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
    await markMfaCodeAsUsed(email, mfaCode);

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

    // Set HttpOnly session cookie for enhanced security
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 15 * 60 * 1000, // 15 minutes (matches session expiry)
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

    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, you will receive a password reset code.',
      // Include resetCode in development for testing
      ...(process.env.NODE_ENV === 'development' && { resetCode })
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

    // Update the password in the appropriate table
    if (tokenData.user_type === 'employee') {
      await query(`
        UPDATE employees
        SET password_hash = $1
        WHERE id = $2
      `, [passwordHash, tokenData.user_id]);
    } else {
      await query(`
        UPDATE users
        SET password_hash = $1
        WHERE id = $2
      `, [passwordHash, tokenData.user_id]);
    }

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

    // Update password in database
    const table = user.user_type === 'employee' ? 'employees' : 'users';
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

export default router;