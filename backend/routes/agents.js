import express from 'express';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { query } from '../config/database.js';
import { authenticateAgent, requireAgentMatch } from '../middleware/agentAuthMiddleware.js';
import { authMiddleware, requireEmployee } from '../middleware/authMiddleware.js';
import jwt from 'jsonwebtoken';
import { websocketService } from '../services/websocketService.js';
import { confluenceDetectionService } from '../services/confluenceDetectionService.js';
import { policySchedulerService } from '../services/policySchedulerService.js';

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

// ═══════════════════════════════════════════════════════════════════════════
// TRIAL AGENT ENDPOINTS (No Authentication Required)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Trial Agent Heartbeat Endpoint
 * POST /api/agents/trial/heartbeat
 *
 * Accepts heartbeat from trial agents without authentication
 * Trial agents use trial-{timestamp} as their ID
 */
router.post('/trial/heartbeat', async (req, res) => {
  try {
    const {
      trial_id,
      access_code,
      status,
      device_name,
      os_type,
      os_version,
      agent_version,
      system_info
    } = req.body;

    // Validate required fields
    if (!trial_id || !device_name || !os_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: trial_id, device_name, os_type',
        code: 'MISSING_FIELDS'
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

      // Update heartbeat
      await query(
        `UPDATE agent_devices
         SET last_heartbeat = NOW(),
             status = COALESCE($2, status),
             agent_version = COALESCE($3, agent_version),
             updated_at = NOW()
         WHERE id = $1`,
        [trialUUID, status || 'online', agent_version]
      );

      trialStatus = 'active';

    } else {
      // New trial agent - create record
      const trialStartDate = new Date();
      const trialEndDate = new Date(trialStartDate);
      trialEndDate.setDate(trialEndDate.getDate() + 30); // 30-day trial

      // Extract system info
      const hostname = system_info?.hostname || null;
      const cpu_model = system_info?.cpu_model || null;
      const total_memory_gb = system_info?.total_memory_gb || null;

      // Generate a unique trial token for this trial agent
      const trialToken = `trial-token-${crypto.randomBytes(16).toString('hex')}`;

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
          trial_access_code
        ) VALUES ($1, NULL, NULL, $2, $3, 'desktop', $4, $5, $6, $7, $8, $9, $10, true, true, true, $11, $12, $13, $14)`,
        [
          trialUUID,
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
          access_code || null // Store access code for trial dashboard access
        ]
      );

      daysRemaining = 30;
      trialStatus = 'active';

      console.log(`✅ New trial agent registered: ${device_name} (${trial_id}) - Expires: ${trialEndDate.toISOString()}`);

      // Auto-create user account for trial dashboard access (if access_code provided)
      if (access_code) {
        // Check if trial user account already exists for this trial ID
        const existingUserResult = await query(
          `SELECT id FROM users WHERE email = $1`,
          [`trial-${trial_id}@trial.romerotechsolutions.com`]
        );

        if (existingUserResult.rows.length === 0) {
          // Create user account with access_code as password
          const passwordHash = await bcrypt.hash(access_code, 10);
          const userId = uuidv4();

          await query(
            `INSERT INTO users (
              id, email, password_hash, first_name, last_name,
              role, is_active, is_verified, business_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [
              userId,
              `trial-${trial_id}@trial.romerotechsolutions.com`,
              passwordHash,
              'Trial',
              'User',
              'customer',
              true,
              true, // Auto-verify trial accounts
              null  // Trial users don't have business_id initially
            ]
          );

          console.log(`✅ Auto-created trial user account for ${trial_id} (access code: ${access_code})`);
        }
      }
    }

    // Generate magic-link token for auto-login (if access_code provided)
    let magicLinkUrl = null;
    if (access_code) {
      // Create short-lived magic-link token (valid for 10 minutes)
      const magicToken = jwt.sign(
        {
          trial_id: trial_id,
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
      // Generate new agent ID and JWT token
      const newAgentId = uuidv4();
      const permanentToken = jwt.sign(
        {
          agent_id: newAgentId,
          type: 'agent',
          business_id: tokenData.business_id,
          service_location_id: tokenData.service_location_id
        },
        process.env.JWT_SECRET,
        { expiresIn: '10y' }
      );

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

// ═══════════════════════════════════════════════════════════════════════════
// REGULAR AGENT ENDPOINTS (Require Authentication)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Agent Registration Endpoint
 * POST /api/agents/register
 *
 * Authenticates with one-time registration token and returns permanent JWT token
 */
router.post('/register', async (req, res) => {
  try {
    const {
      registration_token,
      device_name,
      device_type,
      os_type,
      os_version,
      system_info
    } = req.body;

    // Validate required fields
    if (!registration_token || !device_name || !device_type || !os_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: registration_token, device_name, device_type, os_type',
        code: 'MISSING_FIELDS'
      });
    }

    // Verify registration token exists and is not expired
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

    // Generate permanent JWT token for agent
    const agentId = uuidv4();
    const permanentToken = jwt.sign(
      {
        agent_id: agentId,
        type: 'agent',
        business_id: tokenData.business_id,
        service_location_id: tokenData.service_location_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '10y' } // Long-lived token for agent devices
    );

    // Extract system info fields
    const hostname = system_info?.hostname || null;
    const cpu_model = system_info?.cpu_model || null;
    const total_memory_gb = system_info?.total_memory_gb || null;
    const total_disk_gb = system_info?.total_disk_gb || null;
    const os_architecture = system_info?.os_architecture || null;

    // Create agent device record
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
        os_architecture,
        hostname,
        cpu_model,
        total_memory_gb,
        total_disk_gb,
        agent_version,
        status,
        created_by,
        monitoring_enabled,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        agentId,
        tokenData.business_id,
        tokenData.service_location_id,
        permanentToken,
        device_name,
        device_type,
        os_type,
        os_version || null,
        os_architecture,
        hostname,
        cpu_model,
        total_memory_gb,
        total_disk_gb,
        '1.0.0', // Default agent version
        'online',
        tokenData.created_by,
        true,
        true
      ]
    );

    // Mark registration token as used
    await query(
      `UPDATE agent_registration_tokens
       SET is_used = true, used_at = NOW(), used_by_agent_id = $1
       WHERE id = $2`,
      [agentId, tokenData.id]
    );

    console.log(`✅ Agent registered successfully: ${device_name} (${agentId})`);

    res.json({
      success: true,
      message: 'Agent registered successfully',
      data: {
        agent_id: agentId,
        agent_token: permanentToken,
        business_id: tokenData.business_id,
        service_location_id: tokenData.service_location_id
      }
    });

  } catch (error) {
    console.error('Agent registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Agent registration failed',
      code: 'REGISTRATION_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Agent Heartbeat Endpoint
 * POST /api/agents/:agent_id/heartbeat
 *
 * Updates agent status and last contact time
 */
/**
 * Agent Dashboard Magic-Link Endpoint
 * POST /api/agents/:agent_id/dashboard-link
 *
 * Generates a short-lived magic-link for agent to open user-specific dashboard
 * Requires agent authentication
 */
router.post('/:agent_id/dashboard-link', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;

    // Get agent details including business_id and service_location_id
    const agentResult = await query(
      `SELECT ad.id, ad.business_id, ad.service_location_id, ad.device_name,
              b.id as business_uuid, b.name as business_name
       FROM agent_devices ad
       LEFT JOIN businesses b ON ad.business_id = b.id
       WHERE ad.id = $1 AND ad.is_active = true`,
      [agent_id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or inactive',
        code: 'AGENT_NOT_FOUND'
      });
    }

    const agent = agentResult.rows[0];

    // Find primary user account for this business
    // Look for customer role user associated with this business
    const userResult = await query(
      `SELECT id, email, first_name, last_name, role, time_format_preference
       FROM users
       WHERE business_id = $1 AND role = 'customer' AND is_active = true AND is_verified = true
       ORDER BY created_at ASC
       LIMIT 1`,
      [agent.business_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No customer account found for this agent',
        code: 'NO_CUSTOMER_ACCOUNT'
      });
    }

    const user = userResult.rows[0];

    // Generate magic-link token with agent and user info
    const magicToken = jwt.sign(
      {
        agent_id: agent_id,
        user_id: user.id,
        business_id: agent.business_id,
        type: 'agent_magic_link'
      },
      process.env.JWT_SECRET,
      { expiresIn: '10m' } // 10 minute expiration
    );

    const magicLinkUrl = `https://romerotechsolutions.com/agent/login?token=${magicToken}`;

    console.log(`🔗 Generated agent magic-link for ${agent.device_name} (agent: ${agent_id}, user: ${user.email})`);

    res.json({
      success: true,
      message: 'Magic-link generated',
      data: {
        magic_link_url: magicLinkUrl,
        expires_in: '10m',
        agent_name: agent.device_name,
        business_name: agent.business_name
      }
    });

  } catch (error) {
    console.error('Agent dashboard-link error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate dashboard link',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.post('/:agent_id/heartbeat', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { status } = req.body;

    // Update agent status and last_heartbeat
    await query(
      `UPDATE agent_devices
       SET last_heartbeat = NOW(),
           status = COALESCE($2, status),
           updated_at = NOW()
       WHERE id = $1`,
      [agent_id, status || 'online']
    );

    res.json({
      success: true,
      message: 'Heartbeat received',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Agent heartbeat error:', error);
    res.status(500).json({
      success: false,
      message: 'Heartbeat processing failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Agent Status Update Endpoint
 * POST /api/agents/:agent_id/status
 *
 * Allows agent to report status changes (stopping, error, etc.)
 */
router.post('/:agent_id/status', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { status, timestamp, reason } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: status',
        code: 'MISSING_STATUS'
      });
    }

    // Validate status value
    const validStatuses = ['online', 'offline', 'stopping', 'error', 'maintenance'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        code: 'INVALID_STATUS'
      });
    }

    // Update agent status
    await query(
      `UPDATE agent_devices
       SET status = $1,
           last_status_change = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [status, agent_id]
    );

    // Log the status change
    console.log(`📊 Agent ${agent_id} status changed to: ${status}${reason ? ` (reason: ${reason})` : ''}`);

    res.json({
      success: true,
      message: 'Status updated',
      data: {
        status,
        updated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Agent status update error:', error);
    res.status(500).json({
      success: false,
      message: 'Status update failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Agent Uninstall Notification Endpoint
 * POST /api/agents/:agent_id/uninstall
 *
 * Agent notifies backend before uninstalling
 */
router.post('/:agent_id/uninstall', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { timestamp, keepData } = req.body;

    // Update agent record - mark as decommissioned
    await query(
      `UPDATE agent_devices
       SET status = 'offline',
           decommissioned_at = NOW(),
           decommission_reason = 'user_uninstall',
           is_active = false,
           monitoring_enabled = false,
           updated_at = NOW()
       WHERE id = $1`,
      [agent_id]
    );

    // Get agent details for logging
    const agentResult = await query(
      `SELECT device_name, device_type, business_id FROM agent_devices WHERE id = $1`,
      [agent_id]
    );

    if (agentResult.rows.length > 0) {
      const agent = agentResult.rows[0];
      console.log(`🗑️  Agent uninstalled: ${agent.device_name} (${agent.device_type}) - Business: ${agent.business_id}`);
      console.log(`   Keep data: ${keepData ? 'Yes' : 'No'}`);
    }

    res.json({
      success: true,
      message: 'Agent marked for decommission',
      data: {
        decommissionDate: new Date().toISOString(),
        message: 'Thank you for using Romero Tech Solutions'
      }
    });

  } catch (error) {
    console.error('Agent uninstall notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Uninstall notification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Agent Metrics Upload Endpoint
 * POST /api/agents/:agent_id/metrics
 *
 * Receives and stores performance metrics from agent
 */
router.post('/:agent_id/metrics', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { metrics } = req.body; // Can be single metric object or array

    if (!metrics) {
      return res.status(400).json({
        success: false,
        message: 'Missing metrics data',
        code: 'MISSING_METRICS'
      });
    }

    // Support batch upload
    const metricsArray = Array.isArray(metrics) ? metrics : [metrics];
    const insertedCount = metricsArray.length;

    // Insert metrics
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
          patches_available,
          security_patches_available,
          patches_require_reboot,
          eol_status,
          eol_date,
          security_eol_date,
          days_until_eol,
          days_until_sec_eol,
          eol_message,
          disk_health_status,
          disk_health_data,
          disk_failures_predicted,
          disk_temperature_max,
          disk_reallocated_sectors_total,
          system_uptime_seconds,
          last_boot_time,
          unexpected_reboot,
          services_monitored,
          services_running,
          services_failed,
          services_data,
          network_devices_monitored,
          network_devices_online,
          network_devices_offline,
          network_devices_data,
          backups_detected,
          backups_running,
          backups_with_issues,
          backup_data,
          antivirus_installed,
          antivirus_enabled,
          antivirus_up_to_date,
          firewall_enabled,
          security_products_count,
          security_issues_count,
          security_data,
          failed_login_attempts,
          failed_login_last_24h,
          unique_attacking_ips,
          failed_login_data,
          internet_connected,
          gateway_reachable,
          dns_working,
          avg_latency_ms,
          packet_loss_percent,
          connectivity_issues_count,
          connectivity_data,
          cpu_temperature_c,
          gpu_temperature_c,
          motherboard_temperature_c,
          highest_temperature_c,
          temperature_critical_count,
          fan_count,
          fan_speeds_rpm,
          fan_failure_count,
          sensor_data,
          critical_events_count,
          error_events_count,
          warning_events_count,
          last_critical_event,
          last_critical_event_message,
          package_managers_outdated,
          homebrew_outdated,
          npm_outdated,
          pip_outdated,
          mas_outdated,
          outdated_packages_data,
          raw_metrics,
          collected_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74, $75, $76, $77, $78)`,
        [
          uuidv4(),
          agent_id,
          metric.cpu_percent || metric.cpu_usage || null,
          metric.memory_percent || metric.memory_usage || null,
          metric.memory_used_gb || null,
          metric.disk_percent || metric.disk_usage || null,
          metric.disk_used_gb || null,
          metric.network_rx_bytes || metric.network_rx || null,
          metric.network_tx_bytes || metric.network_tx || null,
          metric.patches_available || 0,
          metric.security_patches_available || 0,
          metric.patches_require_reboot || false,
          metric.eol_status || null,
          metric.eol_date || null,
          metric.security_eol_date || null,
          metric.days_until_eol || null,
          metric.days_until_sec_eol || null,
          metric.eol_message || null,
          metric.disk_health_status || null,
          metric.disk_health_data ? JSON.stringify(metric.disk_health_data) : null,
          metric.disk_failures_predicted || 0,
          metric.disk_temperature_max || null,
          metric.disk_reallocated_sectors_total || 0,
          metric.system_uptime_seconds || null,
          metric.last_boot_time || null,
          metric.unexpected_reboot || false,
          metric.services_monitored || 0,
          metric.services_running || 0,
          metric.services_failed || 0,
          metric.services_data ? JSON.stringify(metric.services_data) : null,
          metric.network_devices_monitored || 0,
          metric.network_devices_online || 0,
          metric.network_devices_offline || 0,
          metric.network_devices_data ? JSON.stringify(metric.network_devices_data) : null,
          metric.backups_detected || 0,
          metric.backups_running || 0,
          metric.backups_with_issues || 0,
          metric.backup_data ? JSON.stringify(metric.backup_data) : null,
          metric.antivirus_installed || false,
          metric.antivirus_enabled || false,
          metric.antivirus_up_to_date || false,
          metric.firewall_enabled || false,
          metric.security_products_count || 0,
          metric.security_issues_count || 0,
          metric.security_data ? JSON.stringify(metric.security_data) : null,
          metric.failed_login_attempts || 0,
          metric.failed_login_last_24h || 0,
          metric.unique_attacking_ips || 0,
          metric.failed_login_data ? JSON.stringify(metric.failed_login_data) : null,
          metric.internet_connected !== undefined ? metric.internet_connected : true,
          metric.gateway_reachable !== undefined ? metric.gateway_reachable : true,
          metric.dns_working !== undefined ? metric.dns_working : true,
          metric.avg_latency_ms || null,
          metric.packet_loss_percent || null,
          metric.connectivity_issues_count || 0,
          metric.connectivity_data ? JSON.stringify(metric.connectivity_data) : null,
          metric.cpu_temperature_c || null,
          metric.gpu_temperature_c || null,
          metric.motherboard_temperature_c || null,
          metric.highest_temperature_c || 0,
          metric.temperature_critical_count || 0,
          metric.fan_count || 0,
          metric.fan_speeds_rpm ? metric.fan_speeds_rpm : null,
          metric.fan_failure_count || 0,
          metric.sensor_data ? JSON.stringify(metric.sensor_data) : null,
          metric.critical_events_count || 0,
          metric.error_events_count || 0,
          metric.warning_events_count || 0,
          metric.last_critical_event || null,
          metric.last_critical_event_message || null,
          metric.package_managers_outdated || 0,
          metric.homebrew_outdated || 0,
          metric.npm_outdated || 0,
          metric.pip_outdated || 0,
          metric.mas_outdated || 0,
          metric.outdated_packages_data ? JSON.stringify(metric.outdated_packages_data) : null,
          metric.raw_metrics || metric.custom_metrics ? JSON.stringify(metric.raw_metrics || metric.custom_metrics) : null,
          metric.collected_at || new Date()
        ]
      );
    }

    // Update last metrics received timestamp
    await query(
      `UPDATE agent_devices SET last_metrics_received = NOW() WHERE id = $1`,
      [agent_id]
    );

    // Detect confluence alerts using the latest metric
    const latestMetric = metricsArray[metricsArray.length - 1];
    const triggeredAlerts = await confluenceDetectionService.detectAndCreateAlerts(agent_id, latestMetric);

    // Broadcast metrics update to all connected admin clients via WebSocket
    // Get agent device info for the broadcast
    const agentInfo = await query(
      'SELECT device_name, status FROM agent_devices WHERE id = $1',
      [agent_id]
    );

    if (agentInfo.rows.length > 0) {
      if (websocketService && websocketService.io) {
        // Broadcast the latest metrics to admin sockets
        websocketService.io.emit('agent-metrics-update', {
          agentId: agent_id,
          deviceName: agentInfo.rows[0].device_name,
          status: agentInfo.rows[0].status,
          metrics: latestMetric,
          timestamp: new Date().toISOString()
        });
        console.log(`📊 Broadcasted agent metrics update for agent ${agent_id} via WebSocket`);

        // Broadcast any triggered alerts
        if (triggeredAlerts.length > 0) {
          for (const alert of triggeredAlerts) {
            websocketService.io.emit('agent-alert-triggered', {
              agentId: agent_id,
              deviceName: agentInfo.rows[0].device_name,
              alert: alert,
              timestamp: new Date().toISOString()
            });
          }
          console.log(`🚨 Broadcasted ${triggeredAlerts.length} alert(s) for agent ${agent_id} via WebSocket`);
        }
      }
    }

    res.json({
      success: true,
      message: 'Metrics received',
      data: {
        metrics_count: insertedCount,
        alerts_triggered: triggeredAlerts.length
      }
    });

  } catch (error) {
    console.error('Agent metrics upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Metrics upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Agent Hardware Inventory Upload Endpoint
 * POST /api/agents/:agent_id/inventory/hardware
 *
 * Receives and stores hardware inventory from agent
 */
router.post('/:agent_id/inventory/hardware', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { hardware } = req.body;

    if (!hardware) {
      return res.status(400).json({
        success: false,
        message: 'Missing hardware inventory data',
        code: 'MISSING_HARDWARE'
      });
    }

    // Upsert hardware inventory (one record per agent)
    await query(
      `INSERT INTO asset_hardware_inventory (
        id,
        agent_device_id,
        cpu_model,
        cpu_cores,
        cpu_threads,
        cpu_speed_mhz,
        cpu_architecture,
        total_memory_gb,
        memory_slots_used,
        memory_slots_total,
        memory_type,
        memory_speed_mhz,
        total_storage_gb,
        storage_type,
        motherboard_manufacturer,
        motherboard_model,
        bios_version,
        bios_date,
        chassis_type,
        serial_number,
        asset_tag,
        manufacturer,
        model,
        display_count,
        primary_display_resolution,
        network_interface_count,
        mac_addresses,
        usb_devices,
        has_battery,
        battery_health_percent,
        battery_cycle_count,
        raw_inventory_data,
        last_updated_at
      ) VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, NOW()
      )
      ON CONFLICT (agent_device_id)
      DO UPDATE SET
        cpu_model = EXCLUDED.cpu_model,
        cpu_cores = EXCLUDED.cpu_cores,
        cpu_threads = EXCLUDED.cpu_threads,
        cpu_speed_mhz = EXCLUDED.cpu_speed_mhz,
        cpu_architecture = EXCLUDED.cpu_architecture,
        total_memory_gb = EXCLUDED.total_memory_gb,
        memory_slots_used = EXCLUDED.memory_slots_used,
        memory_slots_total = EXCLUDED.memory_slots_total,
        memory_type = EXCLUDED.memory_type,
        memory_speed_mhz = EXCLUDED.memory_speed_mhz,
        total_storage_gb = EXCLUDED.total_storage_gb,
        storage_type = EXCLUDED.storage_type,
        motherboard_manufacturer = EXCLUDED.motherboard_manufacturer,
        motherboard_model = EXCLUDED.motherboard_model,
        bios_version = EXCLUDED.bios_version,
        bios_date = EXCLUDED.bios_date,
        chassis_type = EXCLUDED.chassis_type,
        serial_number = EXCLUDED.serial_number,
        asset_tag = EXCLUDED.asset_tag,
        manufacturer = EXCLUDED.manufacturer,
        model = EXCLUDED.model,
        display_count = EXCLUDED.display_count,
        primary_display_resolution = EXCLUDED.primary_display_resolution,
        network_interface_count = EXCLUDED.network_interface_count,
        mac_addresses = EXCLUDED.mac_addresses,
        usb_devices = EXCLUDED.usb_devices,
        has_battery = EXCLUDED.has_battery,
        battery_health_percent = EXCLUDED.battery_health_percent,
        battery_cycle_count = EXCLUDED.battery_cycle_count,
        raw_inventory_data = EXCLUDED.raw_inventory_data,
        last_updated_at = NOW()`,
      [
        agent_id,
        hardware.cpu_model || null,
        hardware.cpu_cores || null,
        hardware.cpu_threads || null,
        hardware.cpu_speed_mhz || null,
        hardware.cpu_architecture || null,
        hardware.total_memory_gb || null,
        hardware.memory_slots_used || null,
        hardware.memory_slots_total || null,
        hardware.memory_type || null,
        hardware.memory_speed_mhz || null,
        hardware.total_storage_gb || null,
        hardware.storage_type || null,
        hardware.motherboard_manufacturer || null,
        hardware.motherboard_model || null,
        hardware.bios_version || null,
        hardware.bios_date || null,
        hardware.chassis_type || null,
        hardware.serial_number || null,
        hardware.asset_tag || null,
        hardware.manufacturer || null,
        hardware.model || null,
        hardware.display_count || 0,
        hardware.primary_display_resolution || null,
        hardware.network_interface_count || 0,
        hardware.mac_addresses ? JSON.stringify(hardware.mac_addresses) : null,
        hardware.usb_devices ? JSON.stringify(hardware.usb_devices) : null,
        hardware.has_battery || false,
        hardware.battery_health_percent || null,
        hardware.battery_cycle_count || null,
        hardware.raw_inventory_data ? JSON.stringify(hardware.raw_inventory_data) : null
      ]
    );

    console.log(`💾 Hardware inventory received for agent ${agent_id}`);

    res.json({
      success: true,
      message: 'Hardware inventory received'
    });

  } catch (error) {
    console.error('Agent hardware inventory upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Hardware inventory upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Agent Software Inventory Upload Endpoint
 * POST /api/agents/:agent_id/inventory/software
 *
 * Receives and stores software inventory from agent
 */
router.post('/:agent_id/inventory/software', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { software } = req.body;

    if (!software || !Array.isArray(software)) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid software inventory data (must be array)',
        code: 'MISSING_SOFTWARE'
      });
    }

    // Delete existing software inventory for this agent (full replacement strategy)
    await query(
      'DELETE FROM asset_software_inventory WHERE agent_device_id = $1',
      [agent_id]
    );

    // Insert all software packages
    let insertedCount = 0;
    for (const sw of software) {
      await query(
        `INSERT INTO asset_software_inventory (
          id,
          agent_device_id,
          software_name,
          software_version,
          software_publisher,
          install_date,
          install_location,
          install_source,
          size_mb,
          requires_license,
          package_manager,
          package_name,
          software_category,
          is_system_software,
          last_seen_at
        ) VALUES (
          gen_random_uuid(),
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()
        )`,
        [
          agent_id,
          sw.software_name || 'Unknown',
          sw.software_version || null,
          sw.software_publisher || null,
          sw.install_date || null,
          sw.install_location || null,
          sw.install_source || null,
          sw.size_mb || null,
          sw.requires_license || false,
          sw.package_manager || null,
          sw.package_name || null,
          sw.software_category || null,
          sw.is_system_software || false
        ]
      );
      insertedCount++;
    }

    console.log(`💿 Software inventory received for agent ${agent_id}: ${insertedCount} packages`);

    res.json({
      success: true,
      message: 'Software inventory received',
      data: {
        software_count: insertedCount
      }
    });

  } catch (error) {
    console.error('Agent software inventory upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Software inventory upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Agent Storage Inventory Upload Endpoint
 * POST /api/agents/:agent_id/inventory/storage
 *
 * Receives and stores detailed storage device inventory from agent
 */
router.post('/:agent_id/inventory/storage', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { storage } = req.body;

    if (!storage || !Array.isArray(storage)) {
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid storage inventory data (must be array)',
        code: 'MISSING_STORAGE'
      });
    }

    // Upsert storage devices (by agent_device_id + device_name unique constraint)
    let upsertedCount = 0;
    for (const disk of storage) {
      await query(
        `INSERT INTO asset_storage_devices (
          id,
          agent_device_id,
          device_name,
          device_type,
          interface_type,
          capacity_gb,
          model,
          serial_number,
          firmware_version,
          smart_status,
          smart_temperature_c,
          smart_power_on_hours,
          smart_reallocated_sectors,
          smart_pending_sectors,
          partition_count,
          partitions,
          health_status,
          last_scanned_at
        ) VALUES (
          gen_random_uuid(),
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW()
        )
        ON CONFLICT (agent_device_id, device_name)
        DO UPDATE SET
          device_type = EXCLUDED.device_type,
          interface_type = EXCLUDED.interface_type,
          capacity_gb = EXCLUDED.capacity_gb,
          model = EXCLUDED.model,
          serial_number = EXCLUDED.serial_number,
          firmware_version = EXCLUDED.firmware_version,
          smart_status = EXCLUDED.smart_status,
          smart_temperature_c = EXCLUDED.smart_temperature_c,
          smart_power_on_hours = EXCLUDED.smart_power_on_hours,
          smart_reallocated_sectors = EXCLUDED.smart_reallocated_sectors,
          smart_pending_sectors = EXCLUDED.smart_pending_sectors,
          partition_count = EXCLUDED.partition_count,
          partitions = EXCLUDED.partitions,
          health_status = EXCLUDED.health_status,
          last_scanned_at = NOW()`,
        [
          agent_id,
          disk.device_name || 'Unknown',
          disk.device_type || null,
          disk.interface_type || null,
          disk.capacity_gb || null,
          disk.model || null,
          disk.serial_number || null,
          disk.firmware_version || null,
          disk.smart_status || null,
          disk.smart_temperature_c || null,
          disk.smart_power_on_hours || null,
          disk.smart_reallocated_sectors || null,
          disk.smart_pending_sectors || null,
          disk.partition_count || 0,
          disk.partitions ? JSON.stringify(disk.partitions) : null,
          disk.health_status || 'Healthy'
        ]
      );
      upsertedCount++;
    }

    console.log(`💾 Storage inventory received for agent ${agent_id}: ${upsertedCount} devices`);

    res.json({
      success: true,
      message: 'Storage inventory received',
      data: {
        storage_count: upsertedCount
      }
    });

  } catch (error) {
    console.error('Agent storage inventory upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Storage inventory upload failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Agent Hardware Inventory
 * GET /api/agents/:agent_id/inventory/hardware
 *
 * Returns hardware inventory for a specific agent
 */
router.get('/:agent_id/inventory/hardware', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const isEmployee = req.user.role !== 'customer';

    // Verify access to this agent
    let accessCheckQuery = `
      SELECT business_id FROM agent_devices
      WHERE id = $1 AND soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      accessCheckQuery += ' AND business_id = $2';
      accessParams.push(req.user.business_id);
    }

    const accessResult = await query(accessCheckQuery, accessParams);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Fetch hardware inventory
    const hardwareResult = await query(
      `SELECT * FROM asset_hardware_inventory WHERE agent_device_id = $1`,
      [agent_id]
    );

    res.json({
      success: true,
      data: {
        hardware: hardwareResult.rows[0] || null,
        has_data: hardwareResult.rows.length > 0
      }
    });

  } catch (error) {
    console.error('Get hardware inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hardware inventory',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Agent Software Inventory
 * GET /api/agents/:agent_id/inventory/software
 *
 * Returns software inventory for a specific agent
 */
router.get('/:agent_id/inventory/software', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { package_manager, category, search } = req.query;
    const isEmployee = req.user.role !== 'customer';

    // Verify access to this agent
    let accessCheckQuery = `
      SELECT business_id FROM agent_devices
      WHERE id = $1 AND soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      accessCheckQuery += ' AND business_id = $2';
      accessParams.push(req.user.business_id);
    }

    const accessResult = await query(accessCheckQuery, accessParams);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Build query for software inventory
    let queryText = `
      SELECT * FROM asset_software_inventory
      WHERE agent_device_id = $1
    `;

    const params = [agent_id];
    let paramIndex = 2;

    // Filter by package manager if provided
    if (package_manager) {
      queryText += ` AND package_manager = $${paramIndex}`;
      params.push(package_manager);
      paramIndex++;
    }

    // Filter by category if provided
    if (category) {
      queryText += ` AND software_category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    // Search by name if provided
    if (search) {
      queryText += ` AND software_name ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    queryText += ' ORDER BY software_name ASC';

    const softwareResult = await query(queryText, params);

    // Get summary statistics
    const statsResult = await query(
      `SELECT
        COUNT(*) as total_packages,
        COUNT(DISTINCT package_manager) as package_managers_count,
        COUNT(DISTINCT software_category) as categories_count,
        SUM(size_mb) as total_size_mb
       FROM asset_software_inventory
       WHERE agent_device_id = $1`,
      [agent_id]
    );

    res.json({
      success: true,
      data: {
        software: softwareResult.rows,
        count: softwareResult.rows.length,
        stats: statsResult.rows[0] || null
      }
    });

  } catch (error) {
    console.error('Get software inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch software inventory',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Agent Storage Inventory
 * GET /api/agents/:agent_id/inventory/storage
 *
 * Returns storage device inventory for a specific agent
 */
router.get('/:agent_id/inventory/storage', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const isEmployee = req.user.role !== 'customer';

    // Verify access to this agent
    let accessCheckQuery = `
      SELECT business_id FROM agent_devices
      WHERE id = $1 AND soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      accessCheckQuery += ' AND business_id = $2';
      accessParams.push(req.user.business_id);
    }

    const accessResult = await query(accessCheckQuery, accessParams);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Fetch storage device inventory
    const storageResult = await query(
      `SELECT * FROM asset_storage_devices
       WHERE agent_device_id = $1
       ORDER BY device_name ASC`,
      [agent_id]
    );

    // Get summary statistics
    const statsResult = await query(
      `SELECT
        COUNT(*) as total_devices,
        SUM(capacity_gb) as total_capacity_gb,
        COUNT(CASE WHEN health_status != 'Healthy' THEN 1 END) as devices_with_issues
       FROM asset_storage_devices
       WHERE agent_device_id = $1`,
      [agent_id]
    );

    res.json({
      success: true,
      data: {
        storage: storageResult.rows,
        count: storageResult.rows.length,
        stats: statsResult.rows[0] || null
      }
    });

  } catch (error) {
    console.error('Get storage inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch storage inventory',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * List Commands for Agent (Admin View)
 * GET /api/agents/:agent_id/commands/list
 *
 * Admins can view all commands for an agent
 */
router.get('/:agent_id/commands/list', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { status } = req.query;
    const isEmployee = req.user.role !== 'customer';

    // Verify access to this agent
    let accessCheckQuery = `
      SELECT business_id FROM agent_devices
      WHERE id = $1 AND soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      accessCheckQuery += ' AND business_id = $2';
      accessParams.push(req.user.business_id);
    }

    const accessResult = await query(accessCheckQuery, accessParams);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Build query for commands
    let queryText = `
      SELECT
        ac.id,
        ac.command_type,
        ac.command_params,
        ac.status,
        ac.requested_by,
        ac.approved_by,
        ac.approval_required,
        ac.exit_code,
        ac.stdout,
        ac.stderr,
        ac.error_message,
        ac.created_at,
        ac.sent_at,
        ac.started_at,
        ac.completed_at,
        e.first_name || ' ' || e.last_name as requested_by_name
      FROM agent_commands ac
      LEFT JOIN employees e ON ac.requested_by = e.id
      WHERE ac.agent_device_id = $1
    `;

    const params = [agent_id];
    let paramIndex = 2;

    // Filter by status if provided
    if (status) {
      queryText += ` AND ac.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    queryText += ' ORDER BY ac.created_at DESC LIMIT 100';

    const commandsResult = await query(queryText, params);

    res.json({
      success: true,
      data: {
        commands: commandsResult.rows,
        count: commandsResult.rows.length
      }
    });

  } catch (error) {
    console.error('Get agent commands list error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent commands',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Pending Commands for Agent
 * GET /api/agents/:agent_id/commands
 *
 * Agent polls for commands to execute
 */
router.get('/:agent_id/commands', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;

    // Fetch pending commands
    const commandsResult = await query(
      `SELECT id, command_type, command_params, requested_by, created_at
       FROM agent_commands
       WHERE agent_device_id = $1
         AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 10`,
      [agent_id]
    );

    // Mark commands as delivered
    if (commandsResult.rows.length > 0) {
      const commandIds = commandsResult.rows.map(c => c.id);
      await query(
        `UPDATE agent_commands
         SET status = 'delivered', delivered_at = NOW()
         WHERE id = ANY($1)`,
        [commandIds]
      );
    }

    res.json({
      success: true,
      data: {
        commands: commandsResult.rows.map(cmd => ({
          id: cmd.id,
          command_type: cmd.command_type,
          payload: cmd.command_params,
          requested_at: cmd.created_at
        }))
      }
    });

  } catch (error) {
    console.error('Get agent commands error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch commands',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Submit Command Result
 * POST /api/agents/:agent_id/commands/:command_id/result
 *
 * Agent submits execution result for a command
 */
router.post('/:agent_id/commands/:command_id/result', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id, command_id } = req.params;
    const { status, result, error } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: status',
        code: 'MISSING_STATUS'
      });
    }

    // Validate status
    if (!['completed', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "completed" or "failed"',
        code: 'INVALID_STATUS'
      });
    }

    // Update command status
    await query(
      `UPDATE agent_commands
       SET status = $1,
           stdout = $2,
           error_message = $3,
           completed_at = NOW()
       WHERE id = $4 AND agent_device_id = $5`,
      [status, result ? JSON.stringify(result) : null, error, command_id, agent_id]
    );

    // Update policy execution history if this command is related to a policy
    await policySchedulerService.updateExecutionHistory(
      command_id,
      status,
      result,
      error
    );

    res.json({
      success: true,
      message: 'Command result received'
    });

  } catch (error) {
    console.error('Command result submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit command result',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Create Registration Token (Employee Only)
 * POST /api/agents/registration-tokens
 *
 * Generates a one-time registration token for agent deployment
 */
router.post('/registration-tokens', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { business_id, service_location_id, expires_in_hours } = req.body;

    if (!business_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: business_id',
        code: 'MISSING_BUSINESS_ID'
      });
    }

    // Verify employee has access to this business
    const employeeId = req.user.id;

    // Generate secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (expires_in_hours || 24));

    // Create registration token
    const tokenResult = await query(
      `INSERT INTO agent_registration_tokens (
        id,
        token,
        business_id,
        service_location_id,
        created_by,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, token, expires_at`,
      [uuidv4(), token, business_id, service_location_id || null, employeeId, expiresAt]
    );

    res.json({
      success: true,
      message: 'Registration token created',
      data: tokenResult.rows[0]
    });

  } catch (error) {
    console.error('Create registration token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create registration token',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * List Agents (RBAC Filtered)
 * GET /api/agents
 *
 * Customers see only their business's agents
 * Employees see all agents across all businesses
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { business_id, service_location_id, status } = req.query;
    const isEmployee = req.user.role !== 'customer';

    let queryText = `
      SELECT
        ad.id,
        ad.business_id,
        ad.service_location_id,
        ad.device_name,
        ad.device_type,
        ad.os_type,
        ad.os_version,
        ad.status,
        ad.last_heartbeat,
        ad.monitoring_enabled,
        ad.is_active,
        ad.created_at,
        b.business_name,
        b.is_individual,
        u.first_name as individual_first_name,
        u.last_name as individual_last_name,
        sl.location_name,
        sl.street_address_1 as location_street,
        sl.street_address_2 as location_street2,
        sl.city as location_city,
        sl.state as location_state,
        sl.zip_code as location_zip,
        sl.country as location_country
      FROM agent_devices ad
      LEFT JOIN businesses b ON ad.business_id = b.id
      LEFT JOIN users u ON b.id = u.business_id AND b.is_individual = true AND u.is_primary_contact = true
      LEFT JOIN service_locations sl ON ad.service_location_id = sl.id
      WHERE ad.soft_delete = false
    `;

    const params = [];
    let paramIndex = 1;

    // RBAC filtering
    if (!isEmployee) {
      // Customers can only see their own business's agents
      queryText += ` AND ad.business_id = $${paramIndex}`;
      params.push(req.user.business_id);
      paramIndex++;
    }

    // Additional filters
    if (business_id && isEmployee) {
      queryText += ` AND ad.business_id = $${paramIndex}`;
      params.push(business_id);
      paramIndex++;
    }

    if (service_location_id) {
      queryText += ` AND ad.service_location_id = $${paramIndex}`;
      params.push(service_location_id);
      paramIndex++;
    }

    if (status) {
      queryText += ` AND ad.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    queryText += ' ORDER BY ad.created_at DESC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: {
        agents: result.rows,
        count: result.rows.length
      }
    });

  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agents',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Policies Assigned to Agent
 * GET /api/agents/:agent_id/policies
 *
 * Returns all policies assigned to a specific agent (direct + business-level)
 */
router.get('/:agent_id/policies', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const isEmployee = req.user.role !== 'customer';

    // Verify access to this agent
    let accessCheckQuery = `
      SELECT business_id FROM agent_devices
      WHERE id = $1 AND soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      accessCheckQuery += ' AND business_id = $2';
      accessParams.push(req.user.business_id);
    }

    const accessResult = await query(accessCheckQuery, accessParams);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    const agent = accessResult.rows[0];

    // Get all policies assigned to this agent (both direct and business-level)
    const policiesResult = await query(
      `SELECT DISTINCT
        p.id,
        p.policy_name,
        p.description,
        p.policy_type,
        p.execution_mode,
        p.schedule_cron,
        p.enabled,
        s.script_name,
        pa.id as assignment_id,
        pa.assigned_at,
        CASE
          WHEN pa.agent_device_id IS NOT NULL THEN 'direct'
          WHEN pa.business_id IS NOT NULL THEN 'business'
          ELSE 'unknown'
        END as assignment_type,
        e.first_name || ' ' || e.last_name as assigned_by_name
       FROM policy_assignments pa
       INNER JOIN automation_policies p ON pa.policy_id = p.id
       LEFT JOIN automation_scripts s ON p.script_id = s.id
       LEFT JOIN employees e ON pa.assigned_by = e.id
       WHERE (pa.agent_device_id = $1 OR pa.business_id = $2)
         AND p.enabled = true
       ORDER BY pa.assigned_at DESC`,
      [agent_id, agent.business_id]
    );

    res.json({
      success: true,
      data: {
        policies: policiesResult.rows,
        count: policiesResult.rows.length
      }
    });

  } catch (error) {
    console.error('Get agent policies error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent policies',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Agent Details (RBAC Filtered)
 * GET /api/agents/:agent_id
 *
 * Returns detailed information about a specific agent
 */
router.get('/:agent_id', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const isEmployee = req.user.role !== 'customer';

    let queryText = `
      SELECT
        ad.*,
        b.business_name,
        sl.location_name,
        sl.street_address_1 as location_street,
        sl.street_address_2 as location_street2,
        sl.city as location_city,
        sl.state as location_state,
        sl.zip_code as location_zip,
        sl.country as location_country,
        e.first_name || ' ' || e.last_name as created_by_name
      FROM agent_devices ad
      LEFT JOIN businesses b ON ad.business_id = b.id
      LEFT JOIN service_locations sl ON ad.service_location_id = sl.id
      LEFT JOIN employees e ON ad.created_by = e.id
      WHERE ad.id = $1 AND ad.soft_delete = false
    `;

    const params = [agent_id];

    // RBAC filtering
    if (!isEmployee) {
      queryText += ' AND ad.business_id = $2';
      params.push(req.user.business_id);
    }

    const result = await query(queryText, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Get agent details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Agent Metrics History
 * GET /api/agents/:agent_id/metrics/history
 *
 * Returns time-series metrics data for charting
 */
router.get('/:agent_id/metrics/history', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { hours = 24, metric_type } = req.query;
    const isEmployee = req.user.role !== 'customer';

    // Verify access to this agent
    let accessCheckQuery = `
      SELECT business_id FROM agent_devices
      WHERE id = $1 AND soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      accessCheckQuery += ' AND business_id = $2';
      accessParams.push(req.user.business_id);
    }

    const accessResult = await query(accessCheckQuery, accessParams);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Determine aggregation interval based on time range for performance optimization
    // This reduces payload size by 93-98% for longer time ranges
    const hoursInt = parseInt(hours);
    let aggregationInterval = null;
    let expectedPoints = 0;

    if (hoursInt <= 24) {
      // 1-24 hours: Raw 1-minute data (up to 1,440 points)
      aggregationInterval = null;
      expectedPoints = hoursInt * 60;
    } else if (hoursInt <= 168) {
      // 1-7 days: 5-minute averages (up to 2,016 points for 7 days)
      aggregationInterval = '5 minutes';
      expectedPoints = (hoursInt * 60) / 5;
    } else {
      // 7-30 days: 15-minute averages (up to 2,880 points for 30 days)
      aggregationInterval = '15 minutes';
      expectedPoints = (hoursInt * 60) / 15;
    }

    // Fetch metrics history with intelligent aggregation
    // Only select columns needed for charts (cpu_percent, memory_percent, disk_percent)
    // This reduces payload from 70+ columns to just 4 columns
    let metricsQuery;

    if (aggregationInterval) {
      // Aggregated data with time-bucketing using date_bin() for custom intervals
      metricsQuery = `
        SELECT
          date_bin('${aggregationInterval}'::interval, collected_at, TIMESTAMP '2000-01-01') as collected_at,
          ROUND(AVG(cpu_percent)::numeric, 2) as cpu_percent,
          ROUND(AVG(memory_percent)::numeric, 2) as memory_percent,
          ROUND(AVG(disk_percent)::numeric, 2) as disk_percent
        FROM agent_metrics
        WHERE agent_device_id = $1
          AND collected_at >= NOW() - INTERVAL '${hoursInt} hours'
        GROUP BY date_bin('${aggregationInterval}'::interval, collected_at, TIMESTAMP '2000-01-01')
        ORDER BY collected_at ASC
      `;
    } else {
      // Raw data for short time ranges (1-24 hours) - return ALL columns for full metric display
      metricsQuery = `
        SELECT *
        FROM agent_metrics
        WHERE agent_device_id = $1
          AND collected_at >= NOW() - INTERVAL '${hoursInt} hours'
        ORDER BY collected_at ASC
      `;
    }

    const metricsResult = await query(metricsQuery, [agent_id]);

    // If using aggregation, also fetch the latest full metric for overview display
    // (aggregated data doesn't include patch status, EOL info, disk health, etc.)
    let latestMetric = null;
    if (aggregationInterval) {
      const latestMetricResult = await query(
        `SELECT * FROM agent_metrics
         WHERE agent_device_id = $1
         ORDER BY collected_at DESC
         LIMIT 1`,
        [agent_id]
      );
      latestMetric = latestMetricResult.rows[0] || null;
    }

    // Log performance metrics for monitoring
    const actualPoints = metricsResult.rows.length;
    const reductionPercent = expectedPoints > 0
      ? Math.round((1 - actualPoints / (hoursInt * 60)) * 100)
      : 0;

    console.log(`📊 Metrics query for agent ${agent_id}: ${hoursInt}h range, ` +
                `${aggregationInterval ? aggregationInterval + ' aggregation' : 'raw data'}, ` +
                `${actualPoints} points returned (${reductionPercent}% reduction)`);


    res.json({
      success: true,
      data: {
        metrics: metricsResult.rows,
        latest_metric: latestMetric, // Full metric data for overview (null if no aggregation)
        count: metricsResult.rows.length,
        time_range_hours: hoursInt,
        aggregation_interval: aggregationInterval || 'raw',
        payload_reduction_percent: reductionPercent
      }
    });

  } catch (error) {
    console.error('Get metrics history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch metrics history',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Agent Alert History
 * GET /api/agents/:agent_id/alerts
 *
 * Returns alert history for a specific agent
 */
router.get('/:agent_id/alerts', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { status } = req.query;
    const isEmployee = req.user.role !== 'customer';

    // Verify access to this agent
    let accessCheckQuery = `
      SELECT business_id FROM agent_devices
      WHERE id = $1 AND soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      accessCheckQuery += ' AND business_id = $2';
      accessParams.push(req.user.business_id);
    }

    const accessResult = await query(accessCheckQuery, accessParams);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Build query for alert history
    let queryText = `
      SELECT
        aah.id,
        aah.agent_alert_id,
        aah.triggered_at,
        aah.resolved_at,
        aah.severity,
        aah.alert_message,
        aah.metric_value,
        aah.threshold_value,
        aah.status,
        aa.alert_name,
        aa.alert_type
      FROM agent_alert_history aah
      LEFT JOIN agent_alerts aa ON aah.agent_alert_id = aa.id
      WHERE aah.agent_device_id = $1
    `;

    const params = [agent_id];
    let paramIndex = 2;

    // Filter by status if provided
    if (status) {
      queryText += ` AND aah.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    queryText += ' ORDER BY aah.triggered_at DESC LIMIT 100';

    const alertsResult = await query(queryText, params);

    res.json({
      success: true,
      data: {
        alerts: alertsResult.rows,
        count: alertsResult.rows.length
      }
    });

  } catch (error) {
    console.error('Get agent alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent alerts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Create Remote Command (Employee Only)
 * POST /api/agents/:agent_id/commands
 *
 * Creates a command for the agent to execute
 */
router.post('/:agent_id/commands', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { command_type, command_params, requires_approval } = req.body;

    if (!command_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: command_type',
        code: 'MISSING_COMMAND_TYPE'
      });
    }

    // Verify agent exists
    const agentResult = await query(
      'SELECT id, business_id FROM agent_devices WHERE id = $1 AND soft_delete = false',
      [agent_id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found',
        code: 'AGENT_NOT_FOUND'
      });
    }

    const commandId = uuidv4();
    const employeeId = req.user.id;

    // Create command
    await query(
      `INSERT INTO agent_commands (
        id,
        agent_device_id,
        command_type,
        command_params,
        requested_by,
        approval_required,
        approved_by,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        commandId,
        agent_id,
        command_type,
        command_params ? JSON.stringify(command_params) : null,
        employeeId,
        requires_approval || false,
        requires_approval ? null : employeeId, // Auto-approve if not required
        'pending'
      ]
    );

    res.json({
      success: true,
      message: 'Command created',
      data: {
        command_id: commandId,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('Create command error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create command',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Update Agent Settings (Employee Only - RBAC Controlled)
 * PATCH /api/agents/:agent_id
 *
 * Updates agent device name, service location, monitoring status, etc.
 */
router.patch('/:agent_id', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { device_name, device_type, service_location_id, monitoring_enabled, is_active } = req.body;

    // Verify agent exists
    const agentResult = await query(
      'SELECT id, business_id FROM agent_devices WHERE id = $1 AND soft_delete = false',
      [agent_id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Build dynamic update query based on provided fields
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (device_name !== undefined) {
      updates.push(`device_name = $${paramIndex}`);
      values.push(device_name);
      paramIndex++;
    }

    if (device_type !== undefined) {
      updates.push(`device_type = $${paramIndex}`);
      values.push(device_type);
      paramIndex++;
    }

    if (service_location_id !== undefined) {
      updates.push(`service_location_id = $${paramIndex}`);
      values.push(service_location_id || null);
      paramIndex++;
    }

    if (monitoring_enabled !== undefined) {
      updates.push(`monitoring_enabled = $${paramIndex}`);
      values.push(monitoring_enabled);
      paramIndex++;
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      values.push(is_active);
      paramIndex++;
    }

    // Always update the updated_at timestamp
    updates.push('updated_at = NOW()');

    if (updates.length === 1) {
      // Only updated_at, no actual changes
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided for update',
        code: 'NO_UPDATES'
      });
    }

    // Add agent_id as last parameter
    values.push(agent_id);

    // Execute update
    await query(
      `UPDATE agent_devices SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    console.log(`✅ Agent ${agent_id} updated successfully by ${req.user.id}`);

    res.json({
      success: true,
      message: 'Agent updated successfully'
    });

  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update agent',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Regenerate Agent Token (Employee Only - RBAC Controlled)
 * POST /api/agents/:agent_id/regenerate-token
 *
 * Generates a new JWT token for the agent and invalidates the old one
 * Restricted to executive, admin, and manager roles only
 */
router.post('/:agent_id/regenerate-token', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const userRole = req.user.role;

    // RBAC check - only executive, admin, and manager can regenerate tokens
    const allowedRoles = ['executive', 'admin', 'manager'];
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions. Only executives, admins, and managers can regenerate tokens.',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    // Verify agent exists and get business info
    const agentResult = await query(
      `SELECT id, business_id, service_location_id, device_name FROM agent_devices
       WHERE id = $1 AND soft_delete = false`,
      [agent_id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found',
        code: 'AGENT_NOT_FOUND'
      });
    }

    const agent = agentResult.rows[0];

    // Generate new JWT token for agent
    const newToken = jwt.sign(
      {
        agent_id: agent.id,
        type: 'agent',
        business_id: agent.business_id,
        service_location_id: agent.service_location_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '10y' } // Long-lived token for agent devices
    );

    // Update agent with new token
    await query(
      `UPDATE agent_devices
       SET agent_token = $1, updated_at = NOW()
       WHERE id = $2`,
      [newToken, agent_id]
    );

    console.log(`🔑 Token regenerated for agent ${agent.device_name} (${agent_id}) by ${req.user.first_name} ${req.user.last_name} (${userRole})`);

    res.json({
      success: true,
      message: 'Token regenerated successfully',
      data: {
        token: newToken
      }
    });

  } catch (error) {
    console.error('Regenerate token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to regenerate token',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
