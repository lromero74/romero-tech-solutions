/**
 * Push Notification Routes
 * Handles PWA push notification subscriptions and sending notifications
 */

import express from 'express';
import webpush from 'web-push';
import { getPool } from '../config/database.js';
import { unifiedAuthMiddleware as authenticateSession } from '../middleware/unifiedAuthMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Configure web-push with VAPID keys
// Generate these with: npx web-push generate-vapid-keys
// IMPORTANT: VAPID keys MUST be set in environment variables (.env file)
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@romerotechsolutions.com';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('❌ VAPID keys are not configured. Push notifications will not work.');
  console.error('   Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in your .env file');
  console.error('   Generate keys with: npx web-push generate-vapid-keys');
}

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

/**
 * GET /api/push/vapid-public-key
 * Returns the VAPID public key for the client to use
 */
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

/**
 * POST /api/push/subscribe
 * Subscribe a user/employee to push notifications
 * Note: No additional permission required - users can manage their own subscriptions
 */
router.post('/subscribe', authenticateSession, async (req, res) => {
  const pool = await getPool();
  const client = await pool.connect();

  try {
    const { subscription, deviceInfo } = req.body;
    const { authUser, sessionType } = req;

    if (!authUser || !authUser.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subscription object'
      });
    }

    await client.query('BEGIN');

    // Determine if it's a user or employee
    const isEmployee = sessionType === 'employee';
    const userColumn = isEmployee ? 'employee_id' : 'user_id';
    const userId = authUser.id;

    // Check if this endpoint already exists
    const existingCheck = await client.query(
      'SELECT id FROM push_subscriptions WHERE endpoint = $1',
      [subscription.endpoint]
    );

    if (existingCheck.rows.length > 0) {
      // Update existing subscription
      await client.query(`
        UPDATE push_subscriptions
        SET ${userColumn} = $1,
            keys = $2,
            device_info = $3,
            is_active = true,
            updated_at = CURRENT_TIMESTAMP
        WHERE endpoint = $4
      `, [userId, subscription.keys, deviceInfo, subscription.endpoint]);
    } else {
      // Insert new subscription
      await client.query(`
        INSERT INTO push_subscriptions (${userColumn}, endpoint, keys, device_info, is_active)
        VALUES ($1, $2, $3, $4, true)
      `, [userId, subscription.endpoint, subscription.keys, deviceInfo]);
    }

    // Ensure user has notification preferences
    const prefsColumn = isEmployee ? 'employee_id' : 'user_id';
    await client.query(`
      INSERT INTO push_notification_preferences (${prefsColumn})
      VALUES ($1)
      ON CONFLICT (user_id, employee_id) DO NOTHING
    `, [userId]);

    await client.query('COMMIT');

    // Send a welcome notification
    try {
      await webpush.sendNotification(subscription, JSON.stringify({
        title: '🔔 Notifications Enabled!',
        body: 'You will now receive alerts for new clients and service requests.',
        icon: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
        badge: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
        data: {
          type: 'welcome',
          timestamp: Date.now()
        }
      }));
    } catch (error) {
      // Don't fail the subscription if welcome notification fails
      console.log('Welcome notification could not be sent');
    }

    res.json({
      success: true,
      message: 'Push subscription registered successfully'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error subscribing to push notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register push subscription'
    });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/push/unsubscribe
 * Unsubscribe from push notifications
 * Note: No additional permission required - users can manage their own subscriptions
 */
router.delete('/unsubscribe', authenticateSession, async (req, res) => {
  const pool = await getPool();

  try {
    const { endpoint } = req.body;
    const { authUser, sessionType } = req;

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: 'Endpoint is required'
      });
    }

    const isEmployee = sessionType === 'employee';
    const userColumn = isEmployee ? 'employee_id' : 'user_id';

    const result = await pool.query(`
      UPDATE push_subscriptions
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE endpoint = $1 AND ${userColumn} = $2
      RETURNING id
    `, [endpoint, authUser.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found'
      });
    }

    res.json({
      success: true,
      message: 'Successfully unsubscribed from push notifications'
    });

  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unsubscribe from push notifications'
    });
  }
});

/**
 * GET /api/push/preferences
 * Get notification preferences for the current user (requires push_notifications.view_preferences permission)
 */
router.get('/preferences', authenticateSession, requirePermission('push_notifications.view_preferences'), async (req, res) => {
  const pool = await getPool();

  try {
    const { authUser, sessionType } = req;
    const isEmployee = sessionType === 'employee';
    const userColumn = isEmployee ? 'employee_id' : 'user_id';

    const result = await pool.query(`
      SELECT
        new_client_signup,
        new_service_request,
        service_request_updated,
        invoice_created,
        invoice_paid
      FROM push_notification_preferences
      WHERE ${userColumn} = $1
    `, [authUser.id]);

    if (result.rows.length === 0) {
      // Return default preferences
      return res.json({
        new_client_signup: true,
        new_service_request: true,
        service_request_updated: true,
        invoice_created: true,
        invoice_paid: true
      });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notification preferences'
    });
  }
});

/**
 * PUT /api/push/preferences
 * Update notification preferences for the current user (requires push_notifications.update_preferences permission)
 */
router.put('/preferences', authenticateSession, requirePermission('push_notifications.update_preferences'), async (req, res) => {
  const pool = await getPool();

  try {
    const { authUser, sessionType } = req;
    const {
      new_client_signup,
      new_service_request,
      service_request_updated,
      invoice_created,
      invoice_paid
    } = req.body;

    const isEmployee = sessionType === 'employee';
    const userColumn = isEmployee ? 'employee_id' : 'user_id';

    await pool.query(`
      INSERT INTO push_notification_preferences (
        ${userColumn},
        new_client_signup,
        new_service_request,
        service_request_updated,
        invoice_created,
        invoice_paid
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, employee_id)
      DO UPDATE SET
        new_client_signup = $2,
        new_service_request = $3,
        service_request_updated = $4,
        invoice_created = $5,
        invoice_paid = $6,
        updated_at = CURRENT_TIMESTAMP
    `, [
      authUser.id,
      new_client_signup !== false,
      new_service_request !== false,
      service_request_updated !== false,
      invoice_created !== false,
      invoice_paid !== false
    ]);

    res.json({
      success: true,
      message: 'Notification preferences updated successfully'
    });

  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update notification preferences'
    });
  }
});

/**
 * POST /api/push/test
 * Send a test notification (requires push_notifications.send_test permission)
 */
router.post('/test', authenticateSession, requirePermission('push_notifications.send_test'), async (req, res) => {
  const pool = await getPool();

  try {
    const { authUser } = req;

    // Get all active push subscriptions for the current user
    const result = await pool.query(`
      SELECT endpoint, keys
      FROM push_subscriptions
      WHERE employee_id = $1 AND is_active = true
    `, [authUser.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active push subscriptions found. Please enable notifications first.'
      });
    }

    const notification = {
      title: '🧪 Test Notification',
      body: 'This is a test notification from Romero Tech Solutions',
      icon: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
      badge: '/D629A5B3-F368-455F-9D3E-4EBDC4222F46.png',
      vibrate: [200, 100, 200],
      data: {
        type: 'test',
        timestamp: Date.now()
      }
    };

    let successCount = 0;
    let failCount = 0;

    // Send notification to all subscriptions
    for (const subscription of result.rows) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys
          },
          JSON.stringify(notification)
        );
        successCount++;
      } catch (error) {
        console.error('Failed to send test notification:', error.message);
        failCount++;

        // Mark subscription as inactive if it's expired
        if (error.statusCode === 410) {
          await pool.query(`
            UPDATE push_subscriptions
            SET is_active = false
            WHERE endpoint = $1
          `, [subscription.endpoint]);
        }
      }
    }

    res.json({
      success: true,
      message: `Test notification sent to ${successCount} device(s)`,
      details: { successCount, failCount }
    });

  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test notification'
    });
  }
});

/**
 * Helper function to send notifications to employees with specific permissions
 * Used by other parts of the application
 * @param {string} notificationType - Type of notification (e.g., 'new_client_signup')
 * @param {object} notificationData - The notification payload
 * @param {string} permissionRequired - The permission key required to receive this notification (optional)
 */
export async function sendNotificationToEmployees(notificationType, notificationData, permissionRequired = null) {
  const pool = await getPool();

  try {
    console.log(`📢 [sendNotificationToEmployees] Called with type: ${notificationType}, permission: ${permissionRequired}`);

    // Build query to get employees with proper permissions
    let query = `
      SELECT DISTINCT ps.endpoint, ps.keys
      FROM push_subscriptions ps
      JOIN employees e ON ps.employee_id = e.id
      JOIN push_notification_preferences pnp ON pnp.employee_id = e.id
      WHERE ps.is_active = true
    `;

    const params = [];

    // Add permission check if specified using RBAC
    if (permissionRequired) {
      query = `
        SELECT DISTINCT ps.endpoint, ps.keys
        FROM push_subscriptions ps
        JOIN employees e ON ps.employee_id = e.id
        JOIN push_notification_preferences pnp ON pnp.employee_id = e.id
        JOIN employee_roles er ON e.id = er.employee_id
        JOIN role_permissions rp ON er.role_id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ps.is_active = true
          AND rp.is_granted = true
          AND p.permission_key = $1
          AND p.is_active = true
      `;
      params.push(permissionRequired);
    }

    // Add notification type preference check
    switch (notificationType) {
      case 'new_client_signup':
        query += params.length > 0 ? ' AND pnp.new_client_signup = true' : ' AND pnp.new_client_signup = true';
        break;
      case 'new_service_request':
        query += params.length > 0 ? ' AND pnp.new_service_request = true' : ' AND pnp.new_service_request = true';
        break;
      case 'service_request_updated':
        query += params.length > 0 ? ' AND pnp.service_request_updated = true' : ' AND pnp.service_request_updated = true';
        break;
      case 'invoice_created':
        query += params.length > 0 ? ' AND pnp.invoice_created = true' : ' AND pnp.invoice_created = true';
        break;
      case 'invoice_paid':
        query += params.length > 0 ? ' AND pnp.invoice_paid = true' : ' AND pnp.invoice_paid = true';
        break;
    }

    console.log(`🔍 [sendNotificationToEmployees] Executing query with params:`, params);
    console.log(`🔍 [sendNotificationToEmployees] Query:`, query);

    const result = await pool.query(query, params);

    console.log(`📊 [sendNotificationToEmployees] Found ${result.rows.length} subscription(s)`);

    if (result.rows.length === 0) {
      console.log('⚠️ No active subscriptions found for notification type:', notificationType);
      return { sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    // Send notifications
    for (const subscription of result.rows) {
      try {
        console.log(`📤 [sendNotificationToEmployees] Sending to endpoint: ${subscription.endpoint.substring(0, 50)}...`);
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys
          },
          JSON.stringify(notificationData)
        );
        sent++;
        console.log(`✅ [sendNotificationToEmployees] Successfully sent notification`);
      } catch (error) {
        console.error('❌ [sendNotificationToEmployees] Failed to send notification:', error.message);
        failed++;

        // Mark subscription as inactive if it's expired
        if (error.statusCode === 410) {
          await pool.query(`
            UPDATE push_subscriptions
            SET is_active = false
            WHERE endpoint = $1
          `, [subscription.endpoint]);
        }
      }
    }

    console.log(`📊 [sendNotificationToEmployees] Summary: ${sent} sent, ${failed} failed`);
    return { sent, failed };

  } catch (error) {
    console.error('Error sending notifications to employees:', error);
    throw error;
  }
}

/**
 * Helper function to send notification to a specific user
 */
export async function sendNotificationToUser(userId, notificationData, isEmployee = false) {
  const pool = await getPool();

  try {
    const userColumn = isEmployee ? 'employee_id' : 'user_id';

    const result = await pool.query(`
      SELECT endpoint, keys
      FROM push_subscriptions
      WHERE ${userColumn} = $1 AND is_active = true
    `, [userId]);

    if (result.rows.length === 0) {
      console.log('No active subscriptions found for user:', userId);
      return { sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    for (const subscription of result.rows) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys
          },
          JSON.stringify(notificationData)
        );
        sent++;
      } catch (error) {
        console.error('Failed to send notification to user:', error.message);
        failed++;

        if (error.statusCode === 410) {
          await pool.query(`
            UPDATE push_subscriptions
            SET is_active = false
            WHERE endpoint = $1
          `, [subscription.endpoint]);
        }
      }
    }

    return { sent, failed };

  } catch (error) {
    console.error('Error sending notification to user:', error);
    throw error;
  }
}

export default router;