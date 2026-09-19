import express from 'express';
import { logger } from '../../utils/logger.js';
import jwt from 'jsonwebtoken';
import { v5 as uuidv5 } from 'uuid';
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
  sendMfaEmail
} from '../../utils/mfaUtils.js';
import { sanitizeRelativeRedirectPath } from '../../utils/redirectSafety.js';
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
             END as role,
             e.time_format_preference
      FROM employees e
      LEFT JOIN employee_roles er ON e.id = er.employee_id
      LEFT JOIN roles r ON er.role_id = r.id AND r.is_active = true
      LEFT JOIN employee_employment_statuses es ON e.employee_status_id = es.id
      WHERE e.email = $1
      GROUP BY e.id, e.email, e.first_name, e.last_name, e.password_hash, e.email_verified, es.status_name, e.time_format_preference
    `, [sanitizedEmail]);

    // If not found in employees, check users table for clients
    if (userResult.rows.length === 0) {
      userResult = await query(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.password_hash, u.email_verified,
               u.role, b.business_name, 'client' as user_type, null as employee_status,
               ARRAY[]::text[] as roles, u.time_format_preference
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
      logger.warn(`🚫 Trusted device login denied for terminated employee: ${user.email}`);
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
    logger.debug('🔐 Creating new session for user:', user.email);
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


    logger.debug(`✅ Trusted device login successful for: ${user.email} (${user.user_type})`);

    // Return user data appropriate for user type
    const userData = {
      id: user.id,
      email: user.email,
      role: user.role || (user.user_type === 'client' ? 'client' : 'employee'),
      name: `${user.first_name} ${user.last_name}`.trim() || user.email,
      emailVerified: user.email_verified,
      timeFormatPreference: user.time_format_preference || '12h'
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

    logger.debug('📤 Sending trusted device login response:', {
      success: responsePayload.success,
      userEmail: responsePayload.user.email,
      hasSessionToken: !!responsePayload.session.sessionToken,
      sessionTokenLength: responsePayload.session.sessionToken?.length,
      sessionStructure: Object.keys(responsePayload.session)
    });

    res.json(responsePayload);

  } catch (error) {
    logger.error('Trusted device login error:', error);
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

    // SECURITY: Check if account is locked due to too many failed attempts
    const lockStatus = await checkAccountLockStatus(sanitizedEmail, 'client');
    if (lockStatus.isLocked) {
      logger.warn(`🔒 Login attempt for locked client account: ${sanitizedEmail}, locked for ${lockStatus.remainingMinutes} more minutes`);
      return res.status(423).json({
        success: false,
        message: `Account temporarily locked due to multiple failed login attempts. Please try again in ${lockStatus.remainingMinutes} minutes or reset your password.`,
        code: 'ACCOUNT_LOCKED',
        remainingMinutes: lockStatus.remainingMinutes
      });
    }

    // SECURITY: Block all @romerotechsolutions.com emails from client login
    const emailDomain = sanitizedEmail.toLowerCase().split('@')[1];
    if (emailDomain === 'romerotechsolutions.com') {
      recordFailedAttempt(clientIP);
      logger.warn(`⚠️ Company email domain used for client login: ${sanitizedEmail}`);
      return res.status(403).json({
        success: false,
        message: 'Client login using @romerotechsolutions.com email addresses is not permitted.'
      });
    }

    // Only check users table for clients (FREEMIUM MODEL - include subscription fields)
    const userResult = await query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.password_hash, u.role, u.email_verified,
             b.business_name, b.id as business_id, 'client' as user_type, u.mfa_enabled, u.mfa_email, u.is_test_account,
             u.time_format_preference, u.subscription_tier, u.devices_allowed, u.profile_completed,
             u.is_trial, u.subscription_expires_at
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

      // SECURITY: Record failed login attempt and check if account should be locked
      const lockoutResult = await recordFailedLoginAttempt(sanitizedEmail, 'client');
      if (lockoutResult.accountLocked) {
        return res.status(423).json({
          success: false,
          message: `Account locked due to multiple failed login attempts. A password reset link has been sent to your email.`,
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

    // Clear failed attempts on successful authentication
    clearFailedAttempts(clientIP);
    await resetFailedLoginAttempts(sanitizedEmail, 'client');

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

    // Return successful login response with session (FREEMIUM MODEL)
    const userData = {
      id: user.id,
      email: user.email,
      role: user.role || 'client',
      name: `${user.first_name} ${user.last_name}`.trim() || user.email,
      businessName: user.business_name,
      businessId: user.business_id,
      timeFormatPreference: user.time_format_preference || '12h',
      isFirstAdmin: false,
      // Legacy trial fields (if applicable)
      isTrial: user.is_trial || false,
      trialExpiresAt: user.subscription_expires_at,
      // NEW: Freemium subscription fields
      subscriptionTier: user.subscription_tier || 'free',
      devicesAllowed: user.devices_allowed || 2,
      profileCompleted: user.profile_completed || false
    };

    logger.debug(`✅ Client login successful: ${user.email}`);

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
    logger.error('Client login error:', error);

    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/trial-magic-login - Auto-login for trial users via magic link
router.post('/trial-magic-login', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Magic link token is required'
      });
    }

    // Verify and decode magic-link token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired magic link',
        code: 'INVALID_TOKEN'
      });
    }

    // Validate token type
    if (decoded.type !== 'trial_magic_link') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE'
      });
    }

    const { trial_id, access_code } = decoded;

    logger.debug('🔐 Trial magic-link login attempt:', { trial_id, access_code });

    // Convert trial_id to UUID for database lookup
    const trialUUID = uuidv5(`trial-${trial_id}`, 'a8f5f167-d5e9-4c91-a3d2-7e5c8f9b1c4a');

    logger.debug('🔑 Looking for trial agent with UUID:', trialUUID);

    // Find trial agent device and associated user (UNIFIED ARCHITECTURE + FREEMIUM MODEL)
    const agentResult = await query(`
      SELECT ad.id as agent_id, ad.trial_access_code, ad.business_id,
             u.id as user_id, u.email, u.first_name, u.last_name,
             u.email_verified, u.is_trial, u.subscription_expires_at,
             u.subscription_tier, u.devices_allowed, u.profile_completed,
             b.business_name
      FROM agent_devices ad
      LEFT JOIN users u ON u.business_id = ad.business_id AND u.is_trial = true
      LEFT JOIN businesses b ON ad.business_id = b.id
      WHERE ad.id = $1 AND ad.is_trial = true AND ad.is_active = true
    `, [trialUUID]);

    logger.debug('📊 Query result:', { rowCount: agentResult.rows.length, rows: agentResult.rows });

    if (agentResult.rows.length === 0) {
      logger.warn('❌ Trial account not found for UUID:', trialUUID);
      return res.status(404).json({
        success: false,
        message: 'Trial account not found',
        code: 'TRIAL_NOT_FOUND'
      });
    }

    const agent = agentResult.rows[0];

    // Verify access code matches
    if (agent.trial_access_code !== access_code) {
      return res.status(401).json({
        success: false,
        message: 'Invalid access code',
        code: 'INVALID_ACCESS_CODE'
      });
    }

    // Use trial user data from unified users table (FREEMIUM MODEL)
    const user = {
      id: agent.user_id,
      email: agent.email,
      first_name: agent.first_name || 'Free',
      last_name: agent.last_name || 'User',
      email_verified: agent.email_verified,
      role: 'client',
      time_format_preference: '12h',
      is_trial: agent.is_trial,
      trial_expires_at: agent.subscription_expires_at,
      subscription_tier: agent.subscription_tier || 'free',
      devices_allowed: agent.devices_allowed || 2,
      profile_completed: agent.profile_completed || false,
      business_id: agent.business_id,
      business_name: agent.business_name
    };

    // Create or update user record in users table for trial user
    // This allows trial users to work with the existing permission/settings infrastructure
    const userCheck = await query('SELECT id FROM users WHERE id = $1', [user.id]);

    if (userCheck.rows.length === 0) {
      // Create minimal user record for trial user
      await query(`
        INSERT INTO users (id, email, first_name, last_name, password_hash, role, email_verified, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
      `, [user.id, user.email, user.first_name, user.last_name, '', 'client', user.email_verified]);

      logger.debug(`✅ Created users table entry for trial user: ${user.email}`);
    }

    // Create session for trial user
    const userAgent = req.get('User-Agent');
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress ||
                     (req.connection.socket ? req.connection.socket.remoteAddress : null);

    const session = await sessionService.createSession(
      user.id,
      user.email,
      userAgent,
      ipAddress
    );

    // Get session timeout from database
    const sessionTimeoutMs = await sessionService.getSessionTimeoutMs();

    // Set HttpOnly session cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: sessionTimeoutMs,
      path: '/'
    };

    res.cookie('sessionToken', session.sessionToken, cookieOptions);

    // Return successful login response (FREEMIUM MODEL)
    const userData = {
      id: user.id,
      email: user.email,
      role: user.role || 'client',
      name: `${user.first_name} ${user.last_name}`.trim() || user.email,
      businessName: user.business_name,
      businessId: user.business_id,
      timeFormatPreference: user.time_format_preference || '12h',
      isFirstAdmin: false,
      // Legacy trial fields (backward compatibility)
      isTrial: user.is_trial || true,
      trialExpiresAt: user.subscription_expires_at,
      trialAgentId: agent.agent_id,  // Link to the trial agent device (legacy)
      trialId: trial_id,              // Original trial ID for reference (legacy)
      agentId: agent.agent_id,        // Current standard field name
      // NEW: Freemium subscription fields
      subscriptionTier: user.subscription_tier || 'free',
      devicesAllowed: user.devices_allowed || 2,
      profileCompleted: user.profile_completed || false
    };

    logger.debug(`✅ Trial magic-link login successful: ${user.email} (${trial_id})`);
    logger.debug('📊 Trial userData:', JSON.stringify(userData, null, 2));

    res.status(200).json({
      success: true,
      message: 'Trial login successful',
      user: userData,
      session: {
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt
      }
    });

  } catch (error) {
    logger.error('Trial magic-link login error:', error);

    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/auth/agent-magic-login - Auto-login for registered agent users via magic link
router.post('/agent-magic-login', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Magic link token is required'
      });
    }

    // Verify and decode magic-link token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired magic link',
        code: 'INVALID_TOKEN'
      });
    }

    // Validate token type
    if (decoded.type !== 'agent_magic_link' && decoded.type !== 'device_management') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type',
        code: 'INVALID_TOKEN_TYPE'
      });
    }

    const { agent_id, user_id, business_id, pending_guest_id, redirect } = decoded;
    const safeRedirect = sanitizeRelativeRedirectPath(redirect);

    // For device_management tokens, we need to look up business_id from the user
    let effectiveBusinessId = business_id;
    if (decoded.type === 'device_management' && !business_id) {
      const userResult = await query(`
        SELECT business_id FROM users WHERE id = $1
      `, [user_id]);

      if (userResult.rows.length > 0) {
        effectiveBusinessId = userResult.rows[0].business_id;
      }
    }

    // Handle Guest Promotion if pending_guest_id is present
    if (pending_guest_id) {
      logger.debug(`🎁 Promoting guest agent ${pending_guest_id} for user ${user_id}`);
      
      // Look up service location for this business (default to first active one)
      const locationResult = await query(
        'SELECT id FROM service_locations WHERE business_id = $1 AND is_active = true ORDER BY is_headquarters DESC, created_at ASC LIMIT 1',
        [effectiveBusinessId]
      );
      const locationId = locationResult.rows[0]?.id;
      
      const permanentToken = crypto.randomBytes(48).toString('base64url');
      
      await query(`
        UPDATE agent_devices
        SET is_guest = false,
            monitoring_enabled = true,
            business_id = $2,
            service_location_id = $3,
            agent_token = $4,
            updated_at = NOW()
        WHERE id = $1 AND is_guest = true
      `, [pending_guest_id, effectiveBusinessId, locationId, permanentToken]);
    }

    // Validate agent exists and belongs to the specified business (if agent_id provided)
    // For device_management tokens, agent_id may be null
    if (agent_id) {
      const agentResult = await query(`
        SELECT ad.id, ad.device_name, ad.business_id, ad.is_active
        FROM agent_devices ad
        WHERE ad.id = $1 AND ad.business_id = $2 AND ad.is_active = true
      `, [agent_id, effectiveBusinessId]);

      if (agentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Agent not found or inactive',
          code: 'AGENT_NOT_FOUND'
        });
      }
    }

    // Get user account
    const userResult = await query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.role,
             u.email_verified, u.time_format_preference, b.business_name,
             u.subscription_tier, u.devices_allowed, u.subscription_expires_at, u.business_id
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      WHERE u.id = $1 AND u.business_id = $2 AND u.is_active = true AND u.email_verified = true
    `, [user_id, effectiveBusinessId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User account not found or inactive',
        code: 'USER_NOT_FOUND'
      });
    }

    const user = userResult.rows[0];

    // Create session for user
    const userAgent = req.get('User-Agent');
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress ||
                     (req.connection.socket ? req.connection.socket.remoteAddress : null);

    const session = await sessionService.createSession(
      user.id,
      user.email,
      userAgent,
      ipAddress
    );

    // Get session timeout from database
    const sessionTimeoutMs = await sessionService.getSessionTimeoutMs();

    // Set HttpOnly session cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: sessionTimeoutMs,
      path: '/'
    };

    res.cookie('sessionToken', session.sessionToken, cookieOptions);

    // Return successful login response with agent info
    const userData = {
      id: user.id,
      email: user.email,
      role: user.role || 'customer',
      name: `${user.first_name} ${user.last_name}`.trim() || user.email,
      businessName: user.business_name,
      businessId: effectiveBusinessId,
      timeFormatPreference: user.time_format_preference || '12h',
      subscriptionTier: user.subscription_tier || 'free',
      devicesAllowed: user.devices_allowed || 2,
      subscriptionExpiresAt: user.subscription_expires_at,
      isFirstAdmin: false,
      agentId: agent_id  // Link to the specific agent that opened dashboard
    };

    const redirectInfo = safeRedirect ? ` → ${safeRedirect}` : '';
    logger.debug(`✅ Agent magic-link login successful: ${user.email} (agent: ${agent_id})${redirectInfo}`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: userData,
      session: {
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt
      },
      redirect: safeRedirect || null // Include redirect path if present
    });

  } catch (error) {
    logger.error('Agent magic-link login error:', error);

    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
