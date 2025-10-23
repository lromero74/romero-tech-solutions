/**
 * Alert Subscriptions Routes
 *
 * Manages alert notification subscriptions for employees and clients.
 * Allows users to configure custom alert preferences for specific agents, locations, or businesses.
 */

import express from 'express';
import { query } from '../config/database.js';
import { authMiddleware, requireEmployee } from '../middleware/authMiddleware.js';
import {
  convertLocalTimeToUTC,
  convertUTCToLocalTime,
  validateTimezone,
  getUserTimezone
} from '../utils/timezoneHelper.js';

const router = express.Router();

/**
 * Helper function to check if user is a technician
 * @param {object} user - req.user object from auth middleware
 * @returns {boolean} - True if user is a technician
 */
function isTechnician(user) {
  return user && user.role === 'technician';
}

/**
 * Helper function to validate scope access (placeholder for future RBAC integration)
 * TODO: Integrate with existing RBAC permission system
 * @param {string} employeeId - Employee UUID
 * @param {object} scope - { business_id, service_location_id, agent_id }
 * @returns {Promise<boolean>} - True if employee has access to the scope
 */
async function canAccessScope(employeeId, scope) {
  // For now, allow all non-technician employees to access all scopes
  // This will be enhanced with proper RBAC checks in future iterations
  // TODO: Check against employee_businesses, employee_locations, etc.
  return true;
}

/**
 * Get all alert subscriptions (Admin only)
 * GET /api/admin/alerts/subscriptions
 *
 * Returns all alert subscriptions with employee and scope details
 * Times are converted from UTC to the requesting user's timezone
 */
router.get('/subscriptions', authMiddleware, requireEmployee, async (req, res) => {
  try {
    // Get user's timezone preference
    const userTimezone = await getUserTimezone(req.user.id, 'employee');

    const queryText = `
      SELECT
        asub.id,
        asub.employee_id,
        e.first_name,
        e.last_name,
        e.email as employee_email,
        e.timezone_preference,
        asub.business_id,
        b.business_name,
        asub.service_location_id,
        sl.location_name,
        asub.agent_id,
        ad.device_name as agent_name,
        asub.min_severity,
        asub.alert_types,
        asub.metric_types,
        asub.notify_email,
        asub.notify_sms,
        asub.notify_websocket,
        asub.notify_browser,
        asub.email,
        asub.phone_number,
        asub.quiet_hours_start_utc,
        asub.quiet_hours_end_utc,
        asub.enabled,
        asub.created_at
      FROM alert_subscribers asub
      LEFT JOIN employees e ON asub.employee_id = e.id
      LEFT JOIN businesses b ON asub.business_id = b.id
      LEFT JOIN service_locations sl ON asub.service_location_id = sl.id
      LEFT JOIN agent_devices ad ON asub.agent_id = ad.id
      WHERE asub.employee_id IS NOT NULL
      ORDER BY asub.created_at DESC
    `;

    const result = await query(queryText);

    // Convert UTC times to user's local timezone for display
    const subscriptions = result.rows.map(sub => {
      const employeeTimezone = sub.timezone_preference || userTimezone;
      return {
        ...sub,
        quiet_hours_start: sub.quiet_hours_start_utc
          ? convertUTCToLocalTime(sub.quiet_hours_start_utc, employeeTimezone)
          : null,
        quiet_hours_end: sub.quiet_hours_end_utc
          ? convertUTCToLocalTime(sub.quiet_hours_end_utc, employeeTimezone)
          : null,
        quiet_hours_timezone: employeeTimezone,
        // Remove UTC fields from response (internal only)
        quiet_hours_start_utc: undefined,
        quiet_hours_end_utc: undefined
      };
    });

    res.json({
      success: true,
      data: subscriptions
    });
  } catch (error) {
    console.error('Get alert subscriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch alert subscriptions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get subscription statistics
 * GET /api/admin/alerts/subscription-stats
 *
 * Returns statistics about alert subscriptions
 */
router.get('/subscription-stats', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const statsQuery = `
      SELECT
        -- Employee subscriptions
        COUNT(*) FILTER (WHERE employee_id IS NOT NULL AND enabled = true) as active_employee_subs,
        COUNT(*) FILTER (WHERE employee_id IS NOT NULL AND enabled = false) as inactive_employee_subs,
        COUNT(DISTINCT employee_id) FILTER (WHERE employee_id IS NOT NULL) as subscribed_employees,

        -- Client subscriptions (from client_alert_subscriptions table)
        (SELECT COUNT(*) FROM client_alert_subscriptions WHERE enabled = true) as active_client_subs,
        (SELECT COUNT(*) FROM client_alert_subscriptions WHERE enabled = false) as inactive_client_subs,
        (SELECT COUNT(DISTINCT user_id) FROM client_alert_subscriptions) as subscribed_clients,

        -- Notification channels
        COUNT(*) FILTER (WHERE notify_email = true AND enabled = true) as email_enabled,
        COUNT(*) FILTER (WHERE notify_sms = true AND enabled = true) as sms_enabled,
        COUNT(*) FILTER (WHERE notify_websocket = true AND enabled = true) as websocket_enabled,
        COUNT(*) FILTER (WHERE notify_browser = true AND enabled = true) as browser_enabled,

        -- Scope breakdown
        COUNT(*) FILTER (WHERE agent_id IS NOT NULL AND enabled = true) as agent_specific,
        COUNT(*) FILTER (WHERE service_location_id IS NOT NULL AND agent_id IS NULL AND enabled = true) as location_wide,
        COUNT(*) FILTER (WHERE business_id IS NOT NULL AND service_location_id IS NULL AND agent_id IS NULL AND enabled = true) as business_wide,
        COUNT(*) FILTER (WHERE business_id IS NULL AND service_location_id IS NULL AND agent_id IS NULL AND enabled = true) as global_subs
      FROM alert_subscribers
      WHERE employee_id IS NOT NULL
    `;

    const result = await query(statsQuery);

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get subscription stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Create a new alert subscription
 * POST /api/admin/alerts/subscriptions
 *
 * Body:
 * - employee_id: UUID (optional - defaults to current user for self-service)
 * - business_id: UUID (optional - null means all businesses)
 * - service_location_id: UUID (optional - null means all locations)
 * - agent_id: UUID (optional - null means all agents)
 * - min_severity: string[] (e.g., ['critical', 'high'])
 * - alert_types: string[] (e.g., ['threshold', 'anomaly'])
 * - metric_types: string[] (e.g., ['cpu', 'memory', 'disk'])
 * - notify_email: boolean
 * - notify_sms: boolean
 * - notify_websocket: boolean
 * - notify_browser: boolean
 * - email: string (optional override)
 * - phone_number: string (optional override)
 * - quiet_hours_start: time in LOCAL timezone (e.g., '22:00')
 * - quiet_hours_end: time in LOCAL timezone (e.g., '06:00')
 * - quiet_hours_timezone: string (e.g., 'America/New_York') - defaults to user's preference
 * - enabled: boolean
 */
router.post('/subscriptions', authMiddleware, requireEmployee, async (req, res) => {
  try {
    // Block technicians from creating subscriptions
    if (isTechnician(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Technicians are not authorized to create alert subscriptions'
      });
    }

    const {
      employee_id,
      business_id,
      service_location_id,
      agent_id,
      min_severity,
      alert_types,
      metric_types,
      notify_email,
      notify_sms,
      notify_websocket,
      notify_browser,
      email,
      phone_number,
      quiet_hours_start,
      quiet_hours_end,
      quiet_hours_timezone,
      enabled
    } = req.body;

    // Default employee_id to current user for self-service
    const targetEmployeeId = employee_id || req.user.id;

    // Validation
    if (!targetEmployeeId) {
      return res.status(400).json({
        success: false,
        message: 'employee_id is required'
      });
    }

    if (!min_severity || !Array.isArray(min_severity) || min_severity.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'min_severity must be a non-empty array'
      });
    }

    if (!metric_types || !Array.isArray(metric_types) || metric_types.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'metric_types must be a non-empty array'
      });
    }

    // Validate timezone if provided
    const userTimezone = quiet_hours_timezone || await getUserTimezone(req.user.id, 'employee');
    if (!validateTimezone(userTimezone)) {
      return res.status(400).json({
        success: false,
        message: `Invalid timezone: ${userTimezone}`
      });
    }

    // Verify employee exists
    const employeeCheck = await query(
      'SELECT id FROM employees WHERE id = $1',
      [targetEmployeeId]
    );

    if (employeeCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Validate scope access (ensures employee can only subscribe to accessible resources)
    const scope = { business_id, service_location_id, agent_id };
    const hasAccess = await canAccessScope(req.user.id, scope);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to subscribe to this resource'
      });
    }

    // Convert local quiet hours to UTC before saving
    let quietHoursStartUTC = null;
    let quietHoursEndUTC = null;
    if (quiet_hours_start && quiet_hours_end) {
      quietHoursStartUTC = convertLocalTimeToUTC(quiet_hours_start, userTimezone);
      quietHoursEndUTC = convertLocalTimeToUTC(quiet_hours_end, userTimezone);
    }

    const insertQuery = `
      INSERT INTO alert_subscribers (
        employee_id,
        business_id,
        service_location_id,
        agent_id,
        min_severity,
        alert_types,
        metric_types,
        notify_email,
        notify_sms,
        notify_websocket,
        notify_browser,
        email,
        phone_number,
        quiet_hours_start_utc,
        quiet_hours_end_utc,
        enabled,
        created_by,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW()
      )
      RETURNING *
    `;

    const values = [
      targetEmployeeId,
      business_id || null,
      service_location_id || null,
      agent_id || null,
      min_severity,
      alert_types || [],
      metric_types,
      notify_email !== undefined ? notify_email : true,
      notify_sms !== undefined ? notify_sms : false,
      notify_websocket !== undefined ? notify_websocket : true,
      notify_browser !== undefined ? notify_browser : true,
      email || null,
      phone_number || null,
      quietHoursStartUTC,
      quietHoursEndUTC,
      enabled !== undefined ? enabled : true,
      req.user.id // created_by
    ];

    const result = await query(insertQuery, values);

    res.status(201).json({
      success: true,
      message: 'Alert subscription created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Create alert subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create alert subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Update an alert subscription
 * PUT /api/admin/alerts/subscriptions/:id
 */
router.put('/subscriptions/:id', authMiddleware, requireEmployee, async (req, res) => {
  try {
    // Block technicians from updating subscriptions
    if (isTechnician(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Technicians are not authorized to update alert subscriptions'
      });
    }

    const { id } = req.params;
    const {
      business_id,
      service_location_id,
      agent_id,
      min_severity,
      alert_types,
      metric_types,
      notify_email,
      notify_sms,
      notify_websocket,
      notify_browser,
      email,
      phone_number,
      quiet_hours_start,
      quiet_hours_end,
      quiet_hours_timezone,
      enabled
    } = req.body;

    // Check if subscription exists and verify ownership
    const checkQuery = 'SELECT id, employee_id FROM alert_subscribers WHERE id = $1';
    const checkResult = await query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alert subscription not found'
      });
    }

    // Verify user owns this subscription (or is admin)
    const subscription = checkResult.rows[0];
    const isOwner = subscription.employee_id === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'executive';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own subscriptions'
      });
    }

    // Validate scope access if changing scope
    const scope = { business_id, service_location_id, agent_id };
    const hasAccess = await canAccessScope(req.user.id, scope);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to subscribe to this resource'
      });
    }

    // Get user timezone and validate
    const userTimezone = quiet_hours_timezone || await getUserTimezone(req.user.id, 'employee');
    if (quiet_hours_timezone && !validateTimezone(quiet_hours_timezone)) {
      return res.status(400).json({
        success: false,
        message: `Invalid timezone: ${quiet_hours_timezone}`
      });
    }

    // Convert local quiet hours to UTC before saving
    let quietHoursStartUTC = null;
    let quietHoursEndUTC = null;
    if (quiet_hours_start && quiet_hours_end) {
      quietHoursStartUTC = convertLocalTimeToUTC(quiet_hours_start, userTimezone);
      quietHoursEndUTC = convertLocalTimeToUTC(quiet_hours_end, userTimezone);
    }

    const updateQuery = `
      UPDATE alert_subscribers
      SET
        business_id = $1,
        service_location_id = $2,
        agent_id = $3,
        min_severity = $4,
        alert_types = $5,
        metric_types = $6,
        notify_email = $7,
        notify_sms = $8,
        notify_websocket = $9,
        notify_browser = $10,
        email = $11,
        phone_number = $12,
        quiet_hours_start_utc = $13,
        quiet_hours_end_utc = $14,
        enabled = $15,
        updated_at = NOW()
      WHERE id = $16
      RETURNING *
    `;

    const values = [
      business_id !== undefined ? business_id : null,
      service_location_id !== undefined ? service_location_id : null,
      agent_id !== undefined ? agent_id : null,
      min_severity,
      alert_types || [],
      metric_types,
      notify_email,
      notify_sms,
      notify_websocket,
      notify_browser,
      email || null,
      phone_number || null,
      quietHoursStartUTC,
      quietHoursEndUTC,
      enabled !== undefined ? enabled : true,
      id
    ];

    const result = await query(updateQuery, values);

    res.json({
      success: true,
      message: 'Alert subscription updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update alert subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update alert subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Delete an alert subscription
 * DELETE /api/admin/alerts/subscriptions/:id
 */
router.delete('/subscriptions/:id', authMiddleware, requireEmployee, async (req, res) => {
  try {
    // Block technicians from deleting subscriptions
    if (isTechnician(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Technicians are not authorized to delete alert subscriptions'
      });
    }

    const { id } = req.params;

    // Check if subscription exists and verify ownership
    const checkQuery = 'SELECT id, employee_id FROM alert_subscribers WHERE id = $1';
    const checkResult = await query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alert subscription not found'
      });
    }

    // Verify user owns this subscription (or is admin)
    const subscription = checkResult.rows[0];
    const isOwner = subscription.employee_id === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'executive';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own subscriptions'
      });
    }

    await query('DELETE FROM alert_subscribers WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Alert subscription deleted successfully'
    });
  } catch (error) {
    console.error('Delete alert subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete alert subscription',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get my subscriptions (for the current user)
 * GET /api/admin/alerts/my-subscriptions
 *
 * Returns subscriptions for the authenticated employee with times in their timezone
 */
router.get('/my-subscriptions', authMiddleware, async (req, res) => {
  try {
    // Get user's timezone preference
    const userTimezone = await getUserTimezone(req.user.id, 'employee');

    const queryText = `
      SELECT
        asub.id,
        asub.business_id,
        b.business_name,
        asub.service_location_id,
        sl.location_name,
        asub.agent_id,
        ad.device_name as agent_name,
        asub.min_severity,
        asub.alert_types,
        asub.metric_types,
        asub.notify_email,
        asub.notify_sms,
        asub.notify_websocket,
        asub.notify_browser,
        asub.email,
        asub.phone_number,
        asub.quiet_hours_start_utc,
        asub.quiet_hours_end_utc,
        asub.enabled,
        asub.created_at
      FROM alert_subscribers asub
      LEFT JOIN businesses b ON asub.business_id = b.id
      LEFT JOIN service_locations sl ON asub.service_location_id = sl.id
      LEFT JOIN agent_devices ad ON asub.agent_id = ad.id
      WHERE asub.employee_id = $1
      ORDER BY asub.created_at DESC
    `;

    const result = await query(queryText, [req.user.id]);

    // Convert UTC times to user's local timezone for display
    const subscriptions = result.rows.map(sub => ({
      ...sub,
      quiet_hours_start: sub.quiet_hours_start_utc
        ? convertUTCToLocalTime(sub.quiet_hours_start_utc, userTimezone)
        : null,
      quiet_hours_end: sub.quiet_hours_end_utc
        ? convertUTCToLocalTime(sub.quiet_hours_end_utc, userTimezone)
        : null,
      quiet_hours_timezone: userTimezone,
      // Remove UTC fields from response (internal only)
      quiet_hours_start_utc: undefined,
      quiet_hours_end_utc: undefined
    }));

    res.json({
      success: true,
      data: subscriptions,
      timezone: userTimezone // Include timezone in response for frontend use
    });
  } catch (error) {
    console.error('Get my subscriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your subscriptions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
