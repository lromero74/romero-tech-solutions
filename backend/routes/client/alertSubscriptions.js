import express from 'express';
import { query } from '../../config/database.js';

const router = express.Router();

/**
 * @route   GET /api/client/alert-subscriptions
 * @desc    Get client's alert subscription preferences
 * @access  Client (authenticated)
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const businessId = req.user.business?.id;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID not found in user profile'
      });
    }

    // Get all client alert subscriptions for this user
    const result = await query(
      `SELECT
        cas.id,
        cas.user_id,
        cas.business_id,
        cas.agent_id,
        cas.alert_categories,
        cas.notify_email,
        cas.notify_sms,
        cas.notify_push,
        cas.email,
        cas.phone_number,
        cas.preferred_language,
        cas.digest_mode,
        cas.digest_time,
        cas.digest_timezone,
        cas.enabled,
        cas.created_at,
        cas.updated_at,
        a.device_name as agent_name,
        a.hostname as agent_hostname
       FROM client_alert_subscriptions cas
       LEFT JOIN monitoring_agents a ON cas.agent_id = a.id
       WHERE cas.user_id = $1 AND cas.business_id = $2
       ORDER BY cas.created_at DESC`,
      [userId, businessId]
    );

    res.json({
      success: true,
      subscriptions: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching client alert subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch alert subscriptions'
    });
  }
});

/**
 * @route   GET /api/client/alert-subscriptions/available-agents
 * @desc    Get list of agents that client can subscribe to
 * @access  Client (authenticated)
 */
router.get('/available-agents', async (req, res) => {
  try {
    const userId = req.user.id;
    const businessId = req.user.business?.id;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID not found in user profile'
      });
    }

    // Get all agents associated with the client's business/service locations
    const result = await query(
      `SELECT DISTINCT
        a.id,
        a.device_name,
        a.hostname,
        a.os_type,
        a.status,
        sl.name as location_name,
        b.name as business_name,
        CASE WHEN cas.id IS NOT NULL THEN true ELSE false END as has_subscription
       FROM monitoring_agents a
       INNER JOIN service_locations sl ON a.service_location_id = sl.id
       INNER JOIN businesses b ON sl.business_id = b.id
       LEFT JOIN client_alert_subscriptions cas ON (
         cas.agent_id = a.id
         AND cas.user_id = $1
         AND cas.business_id = $2
       )
       WHERE b.id = $2
         AND a.status IN ('active', 'trial')
         AND a.deleted_at IS NULL
       ORDER BY b.name, sl.name, a.device_name`,
      [userId, businessId]
    );

    res.json({
      success: true,
      agents: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching available agents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available agents'
    });
  }
});

/**
 * @route   POST /api/client/alert-subscriptions
 * @desc    Create alert subscription for an agent
 * @access  Client (authenticated)
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const businessId = req.user.business?.id;
    const userEmail = req.user.email;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID not found in user profile'
      });
    }

    const {
      agentId,
      alertCategories,
      notifyEmail,
      notifySms,
      notifyPush,
      email,
      phoneNumber,
      preferredLanguage,
      digestMode,
      digestTime,
      digestTimezone,
      enabled
    } = req.body;

    // Validate at least one notification channel
    const hasChannel = (notifyEmail !== false) || notifySms || notifyPush;
    if (!hasChannel) {
      return res.status(400).json({
        success: false,
        message: 'At least one notification channel must be enabled'
      });
    }

    // If agentId provided, verify client has access to it
    if (agentId) {
      const accessCheck = await query(
        `SELECT 1
         FROM monitoring_agents a
         INNER JOIN service_locations sl ON a.service_location_id = sl.id
         WHERE a.id = $1 AND sl.business_id = $2`,
        [agentId, businessId]
      );

      if (accessCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this agent'
        });
      }
    }

    // Check if subscription already exists for this user + agent combination
    const existing = await query(
      `SELECT id FROM client_alert_subscriptions
       WHERE user_id = $1
         AND business_id = $2
         AND ($3::uuid IS NULL AND agent_id IS NULL OR agent_id = $3)`,
      [userId, businessId, agentId || null]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Subscription already exists for this agent. Use PUT to update.'
      });
    }

    // Create new subscription
    const result = await query(
      `INSERT INTO client_alert_subscriptions (
         user_id,
         business_id,
         agent_id,
         alert_categories,
         notify_email,
         notify_sms,
         notify_push,
         email,
         phone_number,
         preferred_language,
         digest_mode,
         digest_time,
         digest_timezone,
         enabled
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        userId,
        businessId,
        agentId || null,
        alertCategories || '{critical_issue,performance_degradation,security_alert}',
        notifyEmail !== false,
        notifySms || false,
        notifyPush !== false,
        email || userEmail,
        phoneNumber || null,
        preferredLanguage || null,
        digestMode || false,
        digestTime || '08:00:00',
        digestTimezone || 'America/New_York',
        enabled !== false
      ]
    );

    res.json({
      success: true,
      subscription: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error creating client alert subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create alert subscription'
    });
  }
});

/**
 * @route   PUT /api/client/alert-subscriptions/:id
 * @desc    Update a specific alert subscription
 * @access  Client (authenticated)
 */
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const businessId = req.user.business?.id;
    const subscriptionId = req.params.id;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID not found in user profile'
      });
    }

    const {
      alertCategories,
      notifyEmail,
      notifySms,
      notifyPush,
      email,
      phoneNumber,
      preferredLanguage,
      digestMode,
      digestTime,
      digestTimezone,
      enabled
    } = req.body;

    // Verify ownership
    const ownerCheck = await query(
      `SELECT id FROM client_alert_subscriptions
       WHERE id = $1 AND user_id = $2 AND business_id = $3`,
      [subscriptionId, userId, businessId]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Subscription not found or access denied'
      });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (alertCategories !== undefined) {
      updates.push(`alert_categories = $${paramCount++}`);
      values.push(alertCategories);
    }
    if (notifyEmail !== undefined) {
      updates.push(`notify_email = $${paramCount++}`);
      values.push(notifyEmail);
    }
    if (notifySms !== undefined) {
      updates.push(`notify_sms = $${paramCount++}`);
      values.push(notifySms);
    }
    if (notifyPush !== undefined) {
      updates.push(`notify_push = $${paramCount++}`);
      values.push(notifyPush);
    }
    if (email !== undefined) {
      updates.push(`email = $${paramCount++}`);
      values.push(email);
    }
    if (phoneNumber !== undefined) {
      updates.push(`phone_number = $${paramCount++}`);
      values.push(phoneNumber);
    }
    if (preferredLanguage !== undefined) {
      updates.push(`preferred_language = $${paramCount++}`);
      values.push(preferredLanguage);
    }
    if (digestMode !== undefined) {
      updates.push(`digest_mode = $${paramCount++}`);
      values.push(digestMode);
    }
    if (digestTime !== undefined) {
      updates.push(`digest_time = $${paramCount++}`);
      values.push(digestTime);
    }
    if (digestTimezone !== undefined) {
      updates.push(`digest_timezone = $${paramCount++}`);
      values.push(digestTimezone);
    }
    if (enabled !== undefined) {
      updates.push(`enabled = $${paramCount++}`);
      values.push(enabled);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(subscriptionId);

    const result = await query(
      `UPDATE client_alert_subscriptions
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    res.json({
      success: true,
      subscription: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating client alert subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update alert subscription'
    });
  }
});

/**
 * @route   DELETE /api/client/alert-subscriptions/:id
 * @desc    Delete a specific alert subscription
 * @access  Client (authenticated)
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const businessId = req.user.business?.id;
    const subscriptionId = req.params.id;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID not found in user profile'
      });
    }

    // Verify ownership and delete
    const result = await query(
      `DELETE FROM client_alert_subscriptions
       WHERE id = $1 AND user_id = $2 AND business_id = $3
       RETURNING id`,
      [subscriptionId, userId, businessId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Subscription not found or access denied'
      });
    }

    res.json({
      success: true,
      message: 'Alert subscription deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting client alert subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete alert subscription'
    });
  }
});

/**
 * @route   POST /api/client/alert-subscriptions/bulk-enable
 * @desc    Enable alerts for all accessible agents
 * @access  Client (authenticated)
 */
router.post('/bulk-enable', async (req, res) => {
  try {
    const userId = req.user.id;
    const businessId = req.user.business?.id;
    const userEmail = req.user.email;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID not found in user profile'
      });
    }

    const {
      notifyEmail = true,
      notifySms = false,
      notifyPush = true,
      preferredLanguage = null,
      digestMode = false
    } = req.body;

    // Get all accessible agents
    const agentsResult = await query(
      `SELECT DISTINCT a.id
       FROM monitoring_agents a
       INNER JOIN service_locations sl ON a.service_location_id = sl.id
       WHERE sl.business_id = $1
         AND a.status IN ('active', 'trial')
         AND a.deleted_at IS NULL`,
      [businessId]
    );

    // Create subscriptions for all agents that don't already have one
    const subscriptions = [];
    for (const agent of agentsResult.rows) {
      // Check if subscription exists
      const exists = await query(
        `SELECT id FROM client_alert_subscriptions
         WHERE user_id = $1 AND business_id = $2 AND agent_id = $3`,
        [userId, businessId, agent.id]
      );

      if (exists.rows.length === 0) {
        const result = await query(
          `INSERT INTO client_alert_subscriptions (
             user_id,
             business_id,
             agent_id,
             notify_email,
             notify_sms,
             notify_push,
             email,
             preferred_language,
             digest_mode,
             enabled
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            userId,
            businessId,
            agent.id,
            notifyEmail,
            notifySms,
            notifyPush,
            userEmail,
            preferredLanguage,
            digestMode,
            true
          ]
        );
        subscriptions.push(result.rows[0]);
      }
    }

    res.json({
      success: true,
      message: `Enabled alerts for ${subscriptions.length} agent(s)`,
      subscriptions
    });
  } catch (error) {
    console.error('❌ Error bulk enabling alert subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to enable alert subscriptions'
    });
  }
});

/**
 * @route   POST /api/client/alert-subscriptions/bulk-disable
 * @desc    Disable all alert subscriptions
 * @access  Client (authenticated)
 */
router.post('/bulk-disable', async (req, res) => {
  try {
    const userId = req.user.id;
    const businessId = req.user.business?.id;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'Business ID not found in user profile'
      });
    }

    const result = await query(
      `UPDATE client_alert_subscriptions
       SET enabled = false,
           updated_at = NOW()
       WHERE user_id = $1 AND business_id = $2
       RETURNING id`,
      [userId, businessId]
    );

    res.json({
      success: true,
      message: `Disabled ${result.rows.length} alert subscription(s)`
    });
  } catch (error) {
    console.error('❌ Error bulk disabling alert subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disable alert subscriptions'
    });
  }
});

export default router;
