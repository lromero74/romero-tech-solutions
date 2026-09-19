import express from 'express';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import crypto from 'crypto';
import { query } from '../config/database.js';
import jwt from 'jsonwebtoken';
import {
  generateTrialVerificationCode,
  checkEmailNotRegistered,
  storeTrialEmailVerificationCode,
  validateTrialEmailVerificationCode,
  sendTrialVerificationEmail,
  getOrCreateTrialUser
} from '../utils/trialEmailVerificationUtils.js';

const router = express.Router();

// Namespace UUID for trial agents (generated once, used consistently)
const TRIAL_NAMESPACE = 'a8f5f167-d5e9-4c91-a3d2-7e5c8f9b1c4a';

/**
 * Convert trial-{timestamp} ID to deterministic UUID
 * This allows trial IDs to be stored as UUIDs in the database
 * while maintaining uniqueness and traceability
 */
function trialIdToUUID(trialId) {
  return uuidv5(trialId, TRIAL_NAMESPACE);
}

/**
 * Trial Email Verification - Send Code
 * POST /api/agents/trial/send-verification
 *
 * Sends a verification code to the email address for trial registration
 * Prevents registration with emails already used for full accounts
 */
router.post('/trial/send-verification', async (req, res) => {
  try {
    const { email, deviceName } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required',
        code: 'MISSING_EMAIL'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
        code: 'INVALID_EMAIL'
      });
    }

    // Check if email is already registered as non-trial user
    const emailCheck = await checkEmailNotRegistered(email);
    if (emailCheck.exists) {
      return res.status(409).json({
        success: false,
        message: emailCheck.message,
        code: 'EMAIL_ALREADY_REGISTERED'
      });
    }

    // Generate and store verification code
    const verificationCode = generateTrialVerificationCode();

    // Store trial metadata
    const trialData = {
      deviceName,
      requestedAt: new Date().toISOString(),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    await storeTrialEmailVerificationCode(email, verificationCode, 15, trialData);

    // Send verification email
    await sendTrialVerificationEmail(email, verificationCode, deviceName);

    // Provide appropriate message based on whether this is an existing trial user
    const message = emailCheck.isTrial
      ? 'Verification code sent! You are adding another device to your existing trial account.'
      : 'Verification code sent to your email';

    res.json({
      success: true,
      message: message,
      data: {
        isExistingTrialUser: emailCheck.isTrial || false,
        expiresIn: 15 // minutes
      }
    });

  } catch (error) {
    console.error('❌ Error sending trial verification email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send verification code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Free Tier Registration - Verify Email and Create Agent
 * POST /api/agents/trial/verify-email
 *
 * Verifies the email code, creates free tier user (if not exists),
 * creates agent device, and returns full registration (agent_id + token)
 *
 * FREEMIUM MODEL: No trial mode, no expiration - just free tier with 2 devices
 */
router.post('/trial/verify-email', async (req, res) => {
  try {
    const { email, verificationCode, contactName, phone, deviceName, deviceType, osType, osVersion, agentVersion } = req.body;

    if (!email || !verificationCode) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required',
        code: 'MISSING_FIELDS'
      });
    }

    // Device info required for agent creation
    if (!deviceName || !deviceType || !osType || !agentVersion) {
      return res.status(400).json({
        success: false,
        message: 'Device name, device type, OS type, and agent version are required for registration',
        code: 'MISSING_DEVICE_INFO'
      });
    }

    // Validate verification code
    const verification = await validateTrialEmailVerificationCode(email, verificationCode);
    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        message: verification.message || 'Invalid verification code',
        code: 'INVALID_CODE'
      });
    }

    // UNIFIED ARCHITECTURE: Get or create free tier user in main users table
    const { userId, businessId, isVerified } = await getOrCreateTrialUser(email);

    // Mark verification code as used
    await query(`
      UPDATE trial_email_verifications
      SET used = TRUE
      WHERE email = $1
    `, [email]);

    // Mark user's email as verified
    await query(`
      UPDATE users
      SET email_verified = TRUE
      WHERE id = $1
    `, [userId]);

    console.log(`✅ Email verified for ${email} (user_id: ${userId}, business_id: ${businessId})`);

    // FREEMIUM: Check device limit before creating agent
    const userResult = await query(`
      SELECT subscription_tier, devices_allowed
      FROM users
      WHERE id = $1
    `, [userId]);

    const devicesAllowed = userResult.rows[0]?.devices_allowed || 2;

    // Count existing active agents
    const agentCountResult = await query(`
      SELECT COUNT(*) as count
      FROM agent_devices
      WHERE business_id = $1 AND soft_delete = FALSE AND is_active = TRUE
    `, [businessId]);

    const currentAgentCount = parseInt(agentCountResult.rows[0].count) || 0;

    if (currentAgentCount >= devicesAllowed) {
      // Generate magic link for user to manage devices
      const magicToken = jwt.sign(
        {
          user_id: userId,
          business_id: businessId,
          type: 'agent_magic_link'
        },
        process.env.JWT_SECRET,
        { expiresIn: '10m' } // 10 minute expiration
      );

      const magicLinkUrl = `https://www.romerotechsolutions.com/agent/login?token=${magicToken}`;

      return res.status(403).json({
        success: false,
        message: `Device limit reached (${devicesAllowed} devices on Free tier). Please remove a device or upgrade.`,
        code: 'DEVICE_LIMIT_REACHED',
        data: {
          devices_used: currentAgentCount,
          devices_allowed: devicesAllowed,
          subscription_tier: 'free',
          magic_link_url: magicLinkUrl  // Magic link for auto-login to manage devices
        }
      });
    }

    // Create agent device
    const agentId = uuidv4();

    // Generate proper JWT token for agent authentication
    // Opaque random agent token (48 random bytes, base64url-encoded
    // → ~64 chars, 384 bits of entropy). Stored verbatim in
    // agent_devices.agent_token; auth is DB equality. See the
    // authenticateAgent middleware comment for the rationale and the
    // JWT-to-opaque migration story.
    const agentToken = crypto.randomBytes(48).toString('base64url');

    await query(`
      INSERT INTO agent_devices (
        id, business_id, device_name, device_type, os_type, os_version,
        agent_token, agent_version, status, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'online', true, NOW(), NOW())
    `, [agentId, businessId, deviceName, deviceType, osType, osVersion || null, agentToken, agentVersion]);

    console.log(`✅ Free tier agent created: ${agentId} for ${email}`);

    // Return full registration details
    res.json({
      success: true,
      message: 'Registration complete! Welcome to RTS Agent (Free tier - 2 devices)',
      data: {
        agent_id: agentId,
        business_id: businessId,
        token: agentToken,
        user_id: userId,
        email: email,
        subscription_tier: 'free',
        devices_allowed: devicesAllowed,
        devices_used: currentAgentCount + 1,
        verified: true
      }
    });

  } catch (error) {
    console.error('❌ Error in free tier registration:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Trial Email Verification - Resend Code
 * POST /api/agents/trial/resend-verification
 *
 * Resends verification code to the email address
 */
router.post('/trial/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required',
        code: 'MISSING_EMAIL'
      });
    }

    // Get existing verification record to retrieve metadata
    const result = await query(`
      SELECT trial_data
      FROM trial_email_verifications
      WHERE email = $1 AND used = FALSE
      ORDER BY created_at DESC
      LIMIT 1
    `, [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No pending verification found for this email',
        code: 'NO_PENDING_VERIFICATION'
      });
    }

    const trialData = typeof result.rows[0].trial_data === 'string'
      ? JSON.parse(result.rows[0].trial_data || '{}')
      : (result.rows[0].trial_data || {});

    const deviceName = trialData.deviceName || '';

    // Generate new verification code
    const verificationCode = generateTrialVerificationCode();

    // Update verification record with new code
    await storeTrialEmailVerificationCode(email, verificationCode, 15, trialData);

    // Send new verification email
    await sendTrialVerificationEmail(email, verificationCode, deviceName);

    res.json({
      success: true,
      message: 'New verification code sent to your email',
      expiresIn: 15 // minutes
    });

  } catch (error) {
    console.error('❌ Error resending trial verification email:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend verification code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Trial Agent Heartbeat Endpoint
 * POST /api/agents/trial/heartbeat
 *
 * Accepts heartbeat from trial agents without authentication
 * Trial agents use trial-{timestamp} as their ID
 * NOW REQUIRES: trial_email to link agent to trial_users
 */
router.post('/trial/heartbeat', async (req, res) => {
  try {
    const {
      trial_id,
      access_code,
      trial_email,  // NEW: Required email for trial
      status,
      device_name,
      os_type,
      os_version,
      agent_version,
      system_info
    } = req.body;

    // Validate required fields (now including trial_email)
    if (!trial_id || !device_name || !os_type || !trial_email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: trial_id, device_name, os_type, trial_email',
        code: 'MISSING_FIELDS'
      });
    }

    // Validate trial_email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trial_email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid trial_email format',
        code: 'INVALID_EMAIL'
      });
    }

    // Validate access_code if provided (required for new trial agents)
    if (access_code && !/^\d{6}$/.test(access_code)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid access_code format. Must be 6 digits.',
        code: 'INVALID_ACCESS_CODE'
      });
    }

    // Validate trial_id format
    if (!trial_id.startsWith('trial-')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid trial_id format. Must start with "trial-"',
        code: 'INVALID_TRIAL_ID'
      });
    }

    // Convert trial_id to UUID for database storage
    const trialUUID = trialIdToUUID(trial_id);

    // Check if trial agent already exists
    const existingResult = await query(
      'SELECT id, is_trial, trial_end_date, trial_converted_at, trial_original_id FROM agent_devices WHERE id = $1',
      [trialUUID]
    );

    let trialStatus, daysRemaining;

    if (existingResult.rows.length > 0) {
      // Trial agent exists - update heartbeat
      const trial = existingResult.rows[0];

      // Check if trial has been converted
      if (trial.trial_converted_at) {
        return res.status(403).json({
          success: false,
          message: 'This trial has been converted to a paid account. Please use your registration token.',
          code: 'TRIAL_CONVERTED'
        });
      }

      // Check if trial has expired
      if (new Date(trial.trial_end_date) < new Date()) {
        return res.status(403).json({
          success: false,
          message: 'Your trial has expired. Subscribe at https://romerotechsolutions.com/pricing',
          code: 'TRIAL_EXPIRED',
          data: {
            trial_status: 'expired',
            expired_at: trial.trial_end_date
          }
        });
      }

      // Calculate days remaining
      const now = new Date();
      const endDate = new Date(trial.trial_end_date);
      daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

      // Get or create trial user and business (UNIFIED ARCHITECTURE)
      const { userId, businessId } = await getOrCreateTrialUser(trial_email);

      // Update heartbeat, link to business if not already linked
      await query(
        `UPDATE agent_devices
         SET last_heartbeat = NOW(),
             status = COALESCE($2, status),
             agent_version = COALESCE($3, agent_version),
             trial_email = $4,
             trial_user_id = $5,
             business_id = $6,
             is_guest = false,
             updated_at = NOW()
         WHERE id = $1`,
        [trialUUID, status || 'online', agent_version, trial_email, userId, businessId]
      );

      trialStatus = 'active';

    } else {
      // New trial agent - create record
      const trialStartDate = new Date();
      const trialEndDate = new Date(trialStartDate);
      trialEndDate.setDate(trialEndDate.getDate() + 30); // 30-day trial

      // Get or create trial user and business (UNIFIED ARCHITECTURE)
      const { userId, businessId } = await getOrCreateTrialUser(trial_email);

      // SUBSCRIPTION DEVICE LIMIT: Check subscription tier and devices allowed
      // Query user's subscription tier and device limit
      const userSubResult = await query(
        `SELECT subscription_tier, devices_allowed
         FROM users
         WHERE id = $1`,
        [userId]
      );

      const subscription_tier = userSubResult.rows[0]?.subscription_tier || 'free';
      const devices_allowed = userSubResult.rows[0]?.devices_allowed || 2;

      // Count active agents for this business
      const existingAgentsResult = await query(
        `SELECT COUNT(*) as agent_count
         FROM agent_devices
         WHERE business_id = $1
           AND is_active = true`,
        [businessId]
      );

      const currentAgentCount = parseInt(existingAgentsResult.rows[0].agent_count);

      if (currentAgentCount >= devices_allowed) {
        // User has reached device limit - generate magic-link to manage devices
        const managementToken = jwt.sign(
          {
            user_id: userId,
            business_id: businessId,
            email: trial_email,
            type: 'device_management'
          },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );

        const managementUrl = `https://romerotechsolutions.com/agent-magic-login?token=${managementToken}`;

        // Get pricing information for graduated pricing display in agent
        const pricingResult = await query(
          `SELECT tier, pricing_ranges FROM subscription_pricing WHERE tier = $1::subscription_tier_type AND is_active = TRUE`,
          [subscription_tier]
        );

        let pricingInfo = null;
        if (pricingResult.rows.length > 0 && pricingResult.rows[0].pricing_ranges) {
          const pricingRanges = pricingResult.rows[0].pricing_ranges;
          const maxDevices = getMaxDevicesForTier(pricingRanges);

          // Calculate current monthly cost
          const currentCost = calculateGraduatedPrice(currentAgentCount, pricingRanges);

          // Determine if adding next device requires tier upgrade
          const nextDeviceCount = currentAgentCount + 1;
          const requiresTierUpgrade = nextDeviceCount > maxDevices;

          // Determine next tier
          let nextTier = null;
          let nextDeviceCost = 0;
          let newMonthlyCost = 0;
          let nextDeviceBreakdown = [];

          if (requiresTierUpgrade) {
            // User needs to upgrade to next tier
            const tierMap = { 'free': 'subscribed', 'subscribed': 'enterprise', 'enterprise': null };
            nextTier = tierMap[subscription_tier];

            if (nextTier) {
              // Get pricing for next tier
              const nextTierPricingResult = await query(
                `SELECT pricing_ranges FROM subscription_pricing WHERE tier = $1::subscription_tier_type AND is_active = TRUE`,
                [nextTier]
              );

              if (nextTierPricingResult.rows.length > 0) {
                const nextTierRanges = nextTierPricingResult.rows[0].pricing_ranges;
                const nextTierCost = calculateGraduatedPrice(nextDeviceCount, nextTierRanges);
                newMonthlyCost = nextTierCost.totalCost;
                nextDeviceCost = newMonthlyCost - currentCost.totalCost;
                nextDeviceBreakdown = nextTierCost.breakdown;
              }
            }
          } else {
            // User can add device within current tier
            const nextDeviceCostCalc = calculateGraduatedPrice(nextDeviceCount, pricingRanges);
            newMonthlyCost = nextDeviceCostCalc.totalCost;
            nextDeviceCost = newMonthlyCost - currentCost.totalCost;
            nextDeviceBreakdown = nextDeviceCostCalc.breakdown;
          }

          pricingInfo = {
            current_monthly_cost: currentCost.totalCost,
            next_device_cost: nextDeviceCost,
            new_monthly_cost: newMonthlyCost,
            requires_tier_upgrade: requiresTierUpgrade,
            next_tier: nextTier,
            cost_breakdown: currentCost.breakdown,
            next_device_breakdown: nextDeviceBreakdown
          };
        }

        // Customize message based on subscription tier
        let tierMessage = '';
        if (subscription_tier === 'free') {
          tierMessage = `Free accounts are limited to ${devices_allowed} devices. Upgrade to add more devices.`;
        } else {
          tierMessage = `Your subscription allows ${devices_allowed} devices. Upgrade to add more devices.`;
        }

        return res.status(403).json({
          success: false,
          message: tierMessage,
          code: 'DEVICE_LIMIT_REACHED',
          data: {
            current_device_count: currentAgentCount,
            device_limit: devices_allowed,
            subscription_tier: subscription_tier,
            management_url: managementUrl,
            pricing_info: pricingInfo, // NEW: Graduated pricing information for agent display
            message: `You currently have ${currentAgentCount} of ${devices_allowed} devices active. To add this device, please remove one of your existing devices or upgrade your subscription.`
          }
        });
      }

      // Extract system info
      const hostname = system_info?.hostname || null;
      const cpu_model = system_info?.cpu_model || null;
      const total_memory_gb = system_info?.total_memory_gb || null;

      // Generate a unique trial token for this trial agent
      const trialToken = `trial-token-${crypto.randomBytes(16).toString('hex')}`;

      // Create agent linked to real business (UNIFIED ARCHITECTURE)
      await query(
        `INSERT INTO agent_devices (
          id,
          business_id,
          service_location_id,
          agent_token,
          device_name,
          device_type,
          os_type,
          os_version,
          hostname,
          cpu_model,
          total_memory_gb,
          agent_version,
          status,
          monitoring_enabled,
          is_active,
          is_trial,
          trial_start_date,
          trial_end_date,
          trial_original_id,
          trial_access_code,
          trial_email,
          trial_user_id
        ) VALUES ($1, $2, NULL, $3, $4, 'desktop', $5, $6, $7, $8, $9, $10, $11, true, true, true, $12, $13, $14, $15, $16, $17)`,
        [
          trialUUID,
          businessId, // Real business ID (UNIFIED)
          trialToken,
          device_name,
          os_type,
          os_version || null,
          hostname,
          cpu_model,
          total_memory_gb,
          agent_version || '1.0.0',
          status || 'online',
          trialStartDate,
          trialEndDate,
          trial_id, // Store original trial-{timestamp} ID
          access_code || null, // Store access code for trial dashboard access
          trial_email, // Store trial email
          userId // Link to users table (UNIFIED)
        ]
      );

      daysRemaining = 30;
      trialStatus = 'active';

      console.log(`✅ New trial agent registered: ${device_name} (${trial_id}) - Expires: ${trialEndDate.toISOString()}`);
      console.log(`📧 Trial user: ${trial_email} - Business: ${businessId} (UNIFIED ARCHITECTURE)`);

      // Note: User account already created by getOrCreateTrialUser() with proper business linkage
      // No need for separate user creation - UNIFIED ARCHITECTURE handles this
    }

    // Generate magic-link token for auto-login (if access_code provided)
    let magicLinkUrl = null;
    if (access_code) {
      // Strip "trial-" prefix from trial_id for consistent email format
      const cleanTrialId = trial_id.startsWith('trial-') ? trial_id.substring(6) : trial_id;

      // Create short-lived magic-link token (valid for 10 minutes)
      const magicToken = jwt.sign(
        {
          trial_id: cleanTrialId,  // Use clean ID without prefix
          access_code: access_code,
          type: 'trial_magic_link'
        },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
      );

      // Construct magic-link URL for agent to open
      magicLinkUrl = `https://romerotechsolutions.com/trial/login?token=${magicToken}`;
    }

    res.json({
      success: true,
      message: 'Heartbeat received',
      data: {
        trial_status: trialStatus,
        days_remaining: daysRemaining,
        magic_link_url: magicLinkUrl, // URL for agent to open in browser
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Trial heartbeat error:', error);
    res.status(500).json({
      success: false,
      message: 'Heartbeat processing failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Trial Agent Metrics Upload Endpoint
 * POST /api/agents/trial/metrics
 *
 * Accepts metrics from trial agents without authentication
 */
router.post('/trial/metrics', async (req, res) => {
  try {
    const { trial_id, metrics } = req.body;

    if (!trial_id || !metrics) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: trial_id, metrics',
        code: 'MISSING_FIELDS'
      });
    }

    // Convert trial_id to UUID
    const trialUUID = trialIdToUUID(trial_id);

    // Validate trial exists and is active
    const trialResult = await query(
      `SELECT id, is_trial, trial_end_date, trial_converted_at
       FROM agent_devices
       WHERE id = $1 AND is_trial = true`,
      [trialUUID]
    );

    if (trialResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Trial agent not found',
        code: 'TRIAL_NOT_FOUND'
      });
    }

    const trial = trialResult.rows[0];

    // Check if trial has been converted
    if (trial.trial_converted_at) {
      return res.status(403).json({
        success: false,
        message: 'Trial has been converted. Please use your registered agent.',
        code: 'TRIAL_CONVERTED'
      });
    }

    // Check if trial has expired
    if (new Date(trial.trial_end_date) < new Date()) {
      const daysExpired = Math.floor((new Date() - new Date(trial.trial_end_date)) / (1000 * 60 * 60 * 24));
      return res.status(403).json({
        success: false,
        message: `Your trial expired ${daysExpired} day(s) ago. Subscribe at https://romerotechsolutions.com/pricing`,
        code: 'TRIAL_EXPIRED',
        data: {
          expired_at: trial.trial_end_date,
          days_expired: daysExpired,
          upgrade_url: 'https://romerotechsolutions.com/pricing'
        }
      });
    }

    // Calculate days remaining
    const now = new Date();
    const endDate = new Date(trial.trial_end_date);
    const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

    // Insert metrics (supports both single metric and array)
    const metricsArray = Array.isArray(metrics) ? metrics : [metrics];

    for (const metric of metricsArray) {
      await query(
        `INSERT INTO agent_metrics (
          id,
          agent_device_id,
          cpu_percent,
          memory_percent,
          memory_used_gb,
          disk_percent,
          disk_used_gb,
          network_rx_bytes,
          network_tx_bytes,
          collected_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          uuidv4(),
          trialUUID,
          metric.cpu_percent || null,
          metric.memory_percent || null,
          metric.memory_used_gb || null,
          metric.disk_percent || null,
          metric.disk_used_gb || null,
          metric.network_rx_bytes || null,
          metric.network_tx_bytes || null,
          metric.collected_at || new Date()
        ]
      );
    }

    // Update last metrics received timestamp
    await query(
      'UPDATE agent_devices SET last_metrics_received = NOW() WHERE id = $1',
      [trialUUID]
    );

    res.json({
      success: true,
      message: 'Metrics received',
      data: {
        metrics_count: metricsArray.length,
        trial_status: 'active',
        days_remaining: daysRemaining
      }
    });

  } catch (error) {
    console.error('Trial metrics upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Metrics upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Trial Agent Conversion Endpoint
 * POST /api/agents/trial/convert
 *
 * Converts a trial agent to a registered (paid) agent
 * This provides an easy path from trial to customer
 */
router.post('/trial/convert', async (req, res) => {
  try {
    const { trial_id, registration_token, preserve_data = true } = req.body;

    if (!trial_id || !registration_token) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: trial_id, registration_token',
        code: 'MISSING_FIELDS'
      });
    }

    // Convert trial_id to UUID
    const trialUUID = trialIdToUUID(trial_id);

    // Verify trial agent exists
    const trialResult = await query(
      `SELECT id, device_name, os_type, os_version, hostname, cpu_model,
              total_memory_gb, agent_version, is_trial, trial_converted_at
       FROM agent_devices
       WHERE id = $1 AND is_trial = true`,
      [trialUUID]
    );

    if (trialResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Trial agent not found',
        code: 'TRIAL_NOT_FOUND'
      });
    }

    const trialAgent = trialResult.rows[0];

    // Check if trial has already been converted
    if (trialAgent.trial_converted_at) {
      return res.status(400).json({
        success: false,
        message: 'Trial has already been converted',
        code: 'ALREADY_CONVERTED'
      });
    }

    // Verify registration token
    const tokenResult = await query(
      `SELECT id, business_id, service_location_id, created_by, expires_at, is_used
       FROM agent_registration_tokens
       WHERE token = $1`,
      [registration_token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid registration token',
        code: 'INVALID_TOKEN'
      });
    }

    const tokenData = tokenResult.rows[0];

    // Check if token is already used
    if (tokenData.is_used) {
      return res.status(401).json({
        success: false,
        message: 'Registration token has already been used',
        code: 'TOKEN_ALREADY_USED'
      });
    }

    // Check if token is expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        message: 'Registration token has expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    // BEGIN TRANSACTION - Atomic conversion
    await query('BEGIN');

    try {
      // Generate new agent ID and opaque random token (see
      // authenticateAgent middleware for rationale).
      const newAgentId = uuidv4();
      const permanentToken = crypto.randomBytes(48).toString('base64url');

      // Create new registered agent
      await query(
        `INSERT INTO agent_devices (
          id,
          business_id,
          service_location_id,
          agent_token,
          device_name,
          device_type,
          os_type,
          os_version,
          hostname,
          cpu_model,
          total_memory_gb,
          agent_version,
          status,
          created_by,
          monitoring_enabled,
          is_active,
          is_trial,
          trial_original_id
        ) VALUES ($1, $2, $3, $4, $5, 'desktop', $6, $7, $8, $9, $10, $11, 'online', $12, true, true, false, $13)`,
        [
          newAgentId,
          tokenData.business_id,
          tokenData.service_location_id,
          permanentToken,
          trialAgent.device_name,
          trialAgent.os_type,
          trialAgent.os_version,
          trialAgent.hostname,
          trialAgent.cpu_model,
          trialAgent.total_memory_gb,
          trialAgent.agent_version,
          tokenData.created_by,
          trial_id // Store original trial ID for reference
        ]
      );

      // Migrate metrics if preserve_data is true
      let metricsMigrated = 0;
      if (preserve_data) {
        const migrateResult = await query(
          `UPDATE agent_metrics
           SET agent_device_id = $1
           WHERE agent_device_id = $2`,
          [newAgentId, trialUUID]
        );
        metricsMigrated = migrateResult.rowCount;
      }

      // Mark original trial agent as converted
      await query(
        `UPDATE agent_devices
         SET trial_converted_at = NOW(),
             trial_converted_to_agent_id = $2,
             is_active = false,
             status = 'offline',
             updated_at = NOW()
         WHERE id = $1`,
        [trialUUID, newAgentId]
      );

      // Mark registration token as used
      await query(
        `UPDATE agent_registration_tokens
         SET is_used = true, used_at = NOW(), used_by_agent_id = $1
         WHERE id = $2`,
        [newAgentId, tokenData.id]
      );

      // COMMIT TRANSACTION
      await query('COMMIT');

      console.log(`✅ Trial agent converted successfully: ${trial_id} → ${newAgentId}`);
      console.log(`   Device: ${trialAgent.device_name}`);
      console.log(`   Business: ${tokenData.business_id}`);
      console.log(`   Metrics migrated: ${metricsMigrated}`);

      res.json({
        success: true,
        message: 'Trial converted successfully! Welcome to RTS Monitoring.',
        data: {
          agent_id: newAgentId,
          agent_token: permanentToken,
          business_id: tokenData.business_id,
          service_location_id: tokenData.service_location_id,
          metrics_migrated: metricsMigrated,
          trial_id: trial_id
        }
      });

    } catch (error) {
      // ROLLBACK on error
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Trial conversion error:', error);
    res.status(500).json({
      success: false,
      message: 'Trial conversion failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Trial Status
 * GET /api/agents/trial/status/:trial_id
 *
 * Returns current status of a trial agent
 */
router.get('/trial/status/:trial_id', async (req, res) => {
  try {
    const { trial_id } = req.params;

    // Convert trial_id to UUID
    const trialUUID = trialIdToUUID(trial_id);

    // Get trial agent details
    const trialResult = await query(
      `SELECT
        id,
        trial_original_id,
        device_name,
        os_type,
        status,
        is_trial,
        trial_start_date,
        trial_end_date,
        trial_converted_at,
        trial_converted_to_agent_id,
        last_heartbeat,
        last_metrics_received,
        created_at
       FROM agent_devices
       WHERE id = $1 AND is_trial = true`,
      [trialUUID]
    );

    if (trialResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Trial agent not found',
        code: 'TRIAL_NOT_FOUND'
      });
    }

    const trial = trialResult.rows[0];

    // Calculate trial status
    const now = new Date();
    const startDate = new Date(trial.trial_start_date);
    const endDate = new Date(trial.trial_end_date);

    const daysElapsed = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
    const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const percentUsed = Math.round((daysElapsed / totalDays) * 100);

    let trialStatus;
    if (trial.trial_converted_at) {
      trialStatus = 'converted';
    } else if (endDate < now) {
      trialStatus = 'expired';
    } else {
      trialStatus = 'active';
    }

    res.json({
      success: true,
      data: {
        trial_id: trial.id,
        device_name: trial.device_name,
        os_type: trial.os_type,
        status: trialStatus,
        is_active: trialStatus === 'active',
        trial_start_date: trial.trial_start_date,
        trial_end_date: trial.trial_end_date,
        days_elapsed: daysElapsed,
        days_remaining: Math.max(0, daysRemaining),
        total_days: totalDays,
        percent_used: percentUsed,
        converted_at: trial.trial_converted_at,
        converted_to_agent_id: trial.trial_converted_to_agent_id,
        last_heartbeat: trial.last_heartbeat,
        last_metrics_received: trial.last_metrics_received,
        created_at: trial.created_at,
        upgrade_url: 'https://romerotechsolutions.com/pricing'
      }
    });

  } catch (error) {
    console.error('Get trial status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get trial status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Trial Agent Software Inventory Upload Endpoint
 * POST /api/agents/trial/inventory/software
 *
 * Accepts software inventory from trial agents without authentication
 */
router.post('/trial/inventory/software', async (req, res) => {
  try {
    const { trial_id, software } = req.body;

    if (!trial_id || !software) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: trial_id, software',
        code: 'MISSING_FIELDS'
      });
    }

    // Convert trial_id to UUID
    const trialUUID = trialIdToUUID(trial_id);

    // Validate trial exists and is active
    const trialResult = await query(
      `SELECT id, is_trial, trial_end_date, trial_converted_at
       FROM agent_devices
       WHERE id = $1 AND is_trial = true`,
      [trialUUID]
    );

    if (trialResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Trial agent not found',
        code: 'TRIAL_NOT_FOUND'
      });
    }

    const trial = trialResult.rows[0];

    // Check if trial has been converted
    if (trial.trial_converted_at) {
      return res.status(403).json({
        success: false,
        message: 'Trial has been converted. Please use your registered agent.',
        code: 'TRIAL_CONVERTED'
      });
    }

    // Check if trial has expired
    if (new Date(trial.trial_end_date) < new Date()) {
      const daysExpired = Math.floor((new Date() - new Date(trial.trial_end_date)) / (1000 * 60 * 60 * 24));
      return res.status(403).json({
        success: false,
        message: `Your trial expired ${daysExpired} day(s) ago. Subscribe at https://romerotechsolutions.com/pricing`,
        code: 'TRIAL_EXPIRED'
      });
    }

    // Delete existing software inventory for this agent
    await query(
      'DELETE FROM agent_software_inventory WHERE agent_device_id = $1',
      [trialUUID]
    );

    // Insert new software inventory
    const softwareArray = Array.isArray(software) ? software : [software];
    for (const sw of softwareArray) {
      await query(
        `INSERT INTO agent_software_inventory (
          id, agent_device_id, name, version, publisher,
          package_manager, install_date, update_available,
          security_update, last_updated
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          uuidv4(),
          trialUUID,
          sw.name || 'Unknown',
          sw.version || null,
          sw.publisher || null,
          sw.package_manager || null,
          sw.install_date || null,
          sw.update_available || false,
          sw.security_update || false
        ]
      );
    }

    res.json({
      success: true,
      message: 'Software inventory received',
      data: {
        software_count: softwareArray.length
      }
    });

  } catch (error) {
    console.error('Trial software inventory upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Software inventory upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Trial Agent Storage Inventory Upload Endpoint
 * POST /api/agents/trial/inventory/storage
 *
 * Accepts storage device inventory from trial agents without authentication
 */
router.post('/trial/inventory/storage', async (req, res) => {
  try {
    const { trial_id, storage } = req.body;

    if (!trial_id || !storage) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: trial_id, storage',
        code: 'MISSING_FIELDS'
      });
    }

    // Convert trial_id to UUID
    const trialUUID = trialIdToUUID(trial_id);

    // Validate trial exists and is active
    const trialResult = await query(
      `SELECT id, is_trial, trial_end_date, trial_converted_at
       FROM agent_devices
       WHERE id = $1 AND is_trial = true`,
      [trialUUID]
    );

    if (trialResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Trial agent not found',
        code: 'TRIAL_NOT_FOUND'
      });
    }

    const trial = trialResult.rows[0];

    // Check if trial has been converted
    if (trial.trial_converted_at) {
      return res.status(403).json({
        success: false,
        message: 'Trial has been converted. Please use your registered agent.',
        code: 'TRIAL_CONVERTED'
      });
    }

    // Check if trial has expired
    if (new Date(trial.trial_end_date) < new Date()) {
      const daysExpired = Math.floor((new Date() - new Date(trial.trial_end_date)) / (1000 * 60 * 60 * 24));
      return res.status(403).json({
        success: false,
        message: `Your trial expired ${daysExpired} day(s) ago. Subscribe at https://romerotechsolutions.com/pricing`,
        code: 'TRIAL_EXPIRED'
      });
    }

    // Delete existing storage inventory for this agent
    await query(
      'DELETE FROM agent_storage_devices WHERE agent_device_id = $1',
      [trialUUID]
    );

    // Insert new storage inventory
    const storageArray = Array.isArray(storage) ? storage : [storage];
    for (const device of storageArray) {
      await query(
        `INSERT INTO agent_storage_devices (
          id, agent_device_id, device_name, device_type,
          capacity_gb, used_gb, mount_point, file_system,
          health_status, smart_status, smart_temperature_c,
          smart_power_on_hours, last_updated
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
        [
          uuidv4(),
          trialUUID,
          device.device_name || device.DeviceName || 'Unknown',
          device.device_type || device.DeviceType || 'Unknown',
          device.capacity_gb || device.CapacityGB || 0,
          device.used_gb || device.UsedGB || 0,
          device.mount_point || device.MountPoint || null,
          device.file_system || device.FileSystem || null,
          device.health_status || device.HealthStatus || 'Unknown',
          device.smart_status || device.SMARTStatus || null,
          device.smart_temperature_c || device.SMARTTemperatureC || null,
          device.smart_power_on_hours || device.SMARTPowerOnHours || null
        ]
      );
    }

    res.json({
      success: true,
      message: 'Storage inventory received',
      data: {
        storage_count: storageArray.length
      }
    });

  } catch (error) {
    console.error('Trial storage inventory upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Storage inventory upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Trial Agent Hardware Inventory Upload Endpoint
 * POST /api/agents/trial/inventory/hardware
 *
 * Accepts hardware inventory from trial agents without authentication
 */
router.post('/trial/inventory/hardware', async (req, res) => {
  try {
    const { trial_id, hardware } = req.body;

    if (!trial_id || !hardware) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: trial_id, hardware',
        code: 'MISSING_FIELDS'
      });
    }

    // Convert trial_id to UUID
    const trialUUID = trialIdToUUID(trial_id);

    // Validate trial exists and is active
    const trialResult = await query(
      `SELECT id, is_trial, trial_end_date, trial_converted_at
       FROM agent_devices
       WHERE id = $1 AND is_trial = true`,
      [trialUUID]
    );

    if (trialResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Trial agent not found',
        code: 'TRIAL_NOT_FOUND'
      });
    }

    const trial = trialResult.rows[0];

    // Check if trial has been converted
    if (trial.trial_converted_at) {
      return res.status(403).json({
        success: false,
        message: 'Trial has been converted. Please use your registered agent.',
        code: 'TRIAL_CONVERTED'
      });
    }

    // Check if trial has expired
    if (new Date(trial.trial_end_date) < new Date()) {
      const daysExpired = Math.floor((new Date() - new Date(trial.trial_end_date)) / (1000 * 60 * 60 * 24));
      return res.status(403).json({
        success: false,
        message: `Your trial expired ${daysExpired} day(s) ago. Subscribe at https://romerotechsolutions.com/pricing`,
        code: 'TRIAL_EXPIRED'
      });
    }

    // Update hardware inventory for this agent
    await query(
      `INSERT INTO agent_hardware_inventory (
        id, agent_device_id,
        cpu_model, cpu_cores, cpu_threads, cpu_speed_mhz,
        total_memory_gb, total_storage_gb, storage_type,
        network_interface_count, has_battery,
        battery_health_percent, battery_cycle_count,
        last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      ON CONFLICT (agent_device_id) DO UPDATE SET
        cpu_model = EXCLUDED.cpu_model,
        cpu_cores = EXCLUDED.cpu_cores,
        cpu_threads = EXCLUDED.cpu_threads,
        cpu_speed_mhz = EXCLUDED.cpu_speed_mhz,
        total_memory_gb = EXCLUDED.total_memory_gb,
        total_storage_gb = EXCLUDED.total_storage_gb,
        storage_type = EXCLUDED.storage_type,
        network_interface_count = EXCLUDED.network_interface_count,
        has_battery = EXCLUDED.has_battery,
        battery_health_percent = EXCLUDED.battery_health_percent,
        battery_cycle_count = EXCLUDED.battery_cycle_count,
        last_updated = NOW()`,
      [
        uuidv4(),
        trialUUID,
        hardware.cpu_model || hardware.CPUModel || 'Unknown',
        hardware.cpu_cores || hardware.CPUCores || 0,
        hardware.cpu_threads || hardware.CPUThreads || 0,
        hardware.cpu_speed_mhz || hardware.CPUSpeedMhz || 0,
        hardware.total_memory_gb || hardware.TotalMemoryGB || 0,
        hardware.total_storage_gb || hardware.TotalStorageGB || 0,
        hardware.storage_type || hardware.StorageType || 'Unknown',
        hardware.network_interface_count || hardware.NetworkInterfaceCount || 0,
        hardware.has_battery || hardware.HasBattery || false,
        hardware.battery_health_percent || hardware.BatteryHealthPercent || null,
        hardware.battery_cycle_count || hardware.BatteryCycleCount || null
      ]
    );

    res.json({
      success: true,
      message: 'Hardware inventory received'
    });

  } catch (error) {
    console.error('Trial hardware inventory upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Hardware inventory upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
