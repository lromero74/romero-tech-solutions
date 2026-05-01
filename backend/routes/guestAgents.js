import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query, transaction } from '../config/database.js';
import { sessionService } from '../services/sessionService.js';
import { emailService } from '../services/emailService.js';

const router = express.Router();

/**
 * Guest Agent Check-in
 * POST /api/agents/guest/check-in
 * 
 * Silently registers or updates a guest agent record.
 * Guests do not heartbeat or send metrics.
 */
router.post('/check-in', async (req, res) => {
  try {
    const {
      guest_id, // Deterministic UUID from agent
      device_name,
      device_type,
      os_type,
      os_version,
      hostname,
      agent_version,
      system_info
    } = req.body;

    if (!guest_id || !device_name || !os_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: guest_id, device_name, os_type',
        code: 'MISSING_FIELDS'
      });
    }

    // Upsert guest agent record
    await query(`
      INSERT INTO agent_devices (
        id, device_name, device_type, os_type, os_version, hostname, 
        agent_version, is_guest, monitoring_enabled, is_active, status,
        agent_token, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, false, true, 'online', 'GUEST', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        device_name = EXCLUDED.device_name,
        os_version = EXCLUDED.os_version,
        agent_version = EXCLUDED.agent_version,
        hostname = EXCLUDED.hostname,
        updated_at = NOW()
    `, [
      guest_id, device_name, device_type || 'desktop', os_type, os_version, 
      hostname, agent_version || '1.0.0'
    ]);

    res.json({ success: true, message: 'Guest check-in successful' });
  } catch (error) {
    console.error('Guest check-in error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

/**
 * Rapid Service Submission
 * POST /api/agents/guest/rapid-service
 * 
 * Handles atomic registration and service request creation.
 */
router.post('/rapid-service', async (req, res) => {
  try {
    const {
      email,
      firstName,
      lastName,
      phone,
      businessName,
      isIndividual,
      address, // { street, city, state, zip }
      issueTitle,
      issueDescription,
      urgency,
      guestId
    } = req.body;

    // 1. Check if Email already exists
    const userResult = await query('SELECT id, business_id FROM users WHERE email = $1', [email]);
    
    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      
      // Email exists - Trigger Magic Link Flow
      const magicToken = jwt.sign(
        {
          user_id: user.id,
          business_id: user.business_id,
          pending_guest_id: guestId,
          type: 'agent_magic_link',
          redirect: `/rapid-service-resume?issueTitle=${encodeURIComponent(issueTitle)}&issueDescription=${encodeURIComponent(issueDescription)}&urgency=${urgency}`
        },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      const magicLinkUrl = `${process.env.FRONTEND_URL}/agent/login?token=${magicToken}`;
      
      // Send magic link email
      await emailService.sendEmail({
        to: email,
        template: 'agent-magic-link',
        data: {
          firstName: firstName || 'there',
          magicLinkUrl,
          deviceName: req.body.deviceName || 'your computer'
        }
      });

      return res.json({
        success: true,
        email_exists: true,
        message: 'Email already exists. A magic link has been sent to your inbox to continue.'
      });
    }

    // 2. New User - Start Atomic Registration
    const result = await transaction(async (client) => {
      // Create Business
      const businessResult = await client.query(`
        INSERT INTO businesses (business_name, is_individual, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        RETURNING id
      `, [isIndividual ? `${firstName} ${lastName}` : businessName, isIndividual]);
      
      const businessId = businessResult.rows[0].id;

      // Create Service Location (HQ)
      const locationResult = await client.query(`
        INSERT INTO service_locations (
          business_id, address_label, street, city, state, zip_code, 
          is_headquarters, is_active, created_at, updated_at
        ) VALUES ($1, 'Primary Location', $2, $3, $4, $5, true, true, NOW(), NOW())
        RETURNING id
      `, [businessId, address.street, address.city, address.state, address.zip]);
      
      const locationId = locationResult.rows[0].id;

      // Create User
      const userId = uuidv4();
      await client.query(`
        INSERT INTO users (
          id, email, role, first_name, last_name, phone, business_id, 
          is_primary_contact, profile_completed, email_verified, created_at, updated_at
        ) VALUES ($1, $2, 'client', $3, $4, $5, $6, true, true, false, NOW(), NOW())
      `, [userId, email, firstName, lastName, phone, businessId]);

      // Promote Guest Agent
      const agentToken = crypto.randomBytes(48).toString('base64url');
      const promoteResult = await client.query(`
        UPDATE agent_devices
        SET is_guest = false,
            monitoring_enabled = true,
            business_id = $2,
            service_location_id = $3,
            agent_token = $4,
            updated_at = NOW()
        WHERE id = $1
        RETURNING id, device_name
      `, [guestId, businessId, locationId, agentToken]);

      if (promoteResult.rows.length === 0) {
        throw new Error('Guest agent not found for promotion');
      }

      // Create Service Request
      const requestNumber = `SR-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      
      // Get urgency ID
      const urgencyResult = await client.query('SELECT id FROM urgency_levels WHERE level_name ILIKE $1 LIMIT 1', [urgency || 'Normal']);
      const urgencyId = urgencyResult.rows[0]?.id;
      
      // Get default status/priority (assuming IDs are standard or looking them up)
      const statusResult = await client.query("SELECT id FROM service_request_statuses WHERE status_name = 'Pending' LIMIT 1");
      const priorityResult = await client.query("SELECT id FROM priority_levels WHERE level_name = 'Medium' LIMIT 1");
      
      const ticketResult = await client.query(`
        INSERT INTO service_requests (
          request_number, title, description, client_id, business_id, 
          service_location_id, created_by_user_id, urgency_level_id, 
          priority_level_id, status_id, current_status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', NOW(), NOW())
        RETURNING id, request_number
      `, [
        requestNumber, issueTitle, issueDescription, userId, businessId, 
        locationId, userId, urgencyId, priorityResult.rows[0].id, statusResult.rows[0].id
      ]);

      return {
        userId,
        businessId,
        agentToken,
        ticketId: ticketResult.rows[0].id,
        requestNumber: ticketResult.rows[0].request_number
      };
    });

    // Create session
    const session = await sessionService.createSession(
      result.userId,
      email,
      req.get('User-Agent'),
      req.ip
    );

    res.json({
      success: true,
      message: 'Service request created successfully!',
      data: {
        ticketId: result.ticketId,
        requestNumber: result.requestNumber,
        agentToken: result.agentToken,
        sessionToken: session.sessionToken
      }
    });

  } catch (error) {
    console.error('Rapid service submission error:', error);
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
});

/**
 * Guest Status Check
 * GET /api/agents/guest/status/:guestId
 * 
 * Polled by guest agent to see if it has been promoted.
 * Returns the new agent_token if promoted.
 */
router.get('/status/:guestId', async (req, res) => {
  try {
    const { guestId } = req.params;

    const result = await query(`
      SELECT is_guest, agent_token, business_id
      FROM agent_devices
      WHERE id = $1 AND is_active = true
    `, [guestId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    const agent = result.rows[0];

    if (!agent.is_guest && agent.agent_token !== 'GUEST') {
      return res.json({
        success: true,
        promoted: true,
        agent_token: agent.agent_token,
        business_id: agent.business_id
      });
    }

    res.json({
      success: true,
      promoted: false
    });
  } catch (error) {
    console.error('Guest status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;