/**
 * Subscriber Management Service
 * Handles CRUD operations for alert subscriptions (employee and client)
 */

import { query } from '../config/database.js';

class SubscriberManagementService {
  // ====================================
  // EMPLOYEE SUBSCRIPTIONS
  // ====================================

  /**
   * Create employee alert subscription
   * @param {object} subscriptionData - Subscription details
   * @returns {Promise<object>}
   */
  async createEmployeeSubscription(subscriptionData) {
    const {
      employee_id,
      business_id = null,
      service_location_id = null,
      agent_id = null,
      alert_config_id = null,
      min_severity = ['medium', 'high', 'critical'],
      alert_types = ['high_utilization', 'low_utilization', 'rising_trend', 'declining_trend', 'volatility_spike'],
      metric_types = ['cpu', 'memory', 'disk'],
      notify_email = true,
      notify_sms = false,
      notify_websocket = true,
      notify_browser = true,
      email = null,
      phone_number = null,
      quiet_hours_start = null,
      quiet_hours_end = null,
      quiet_hours_timezone = 'America/New_York',
      enabled = true,
      created_by
    } = subscriptionData;

    const sql = `
      INSERT INTO alert_subscribers (
        employee_id, business_id, service_location_id, agent_id,
        alert_config_id, min_severity, alert_types, metric_types,
        notify_email, notify_sms, notify_websocket, notify_browser,
        email, phone_number, quiet_hours_start, quiet_hours_end,
        quiet_hours_timezone, enabled, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `;

    const values = [
      employee_id, business_id, service_location_id, agent_id,
      alert_config_id, min_severity, alert_types, metric_types,
      notify_email, notify_sms, notify_websocket, notify_browser,
      email, phone_number, quiet_hours_start, quiet_hours_end,
      quiet_hours_timezone, enabled, created_by
    ];

    try {
      const result = await query(sql, values);
      console.log(`✅ Created employee subscription for employee_id: ${employee_id}`);
      return { success: true, subscription: result.rows[0] };
    } catch (error) {
      console.error('❌ Error creating employee subscription:', error);
      throw error;
    }
  }

  /**
   * Get employee subscriptions
   * @param {string} employeeId - Employee UUID (optional - if not provided, returns all)
   * @param {boolean} includeInactive - Include disabled subscriptions
   * @returns {Promise<Array>}
   */
  async getEmployeeSubscriptions(employeeId = null, includeInactive = false) {
    let sql = `
      SELECT
        asub.*,
        e.first_name,
        e.last_name,
        e.email as employee_email,
        b.business_name,
        sl.location_name,
        ad.device_name as agent_name
      FROM alert_subscribers asub
      JOIN employees e ON asub.employee_id = e.id
      LEFT JOIN businesses b ON asub.business_id = b.id
      LEFT JOIN service_locations sl ON asub.service_location_id = sl.id
      LEFT JOIN agent_devices ad ON asub.agent_id = ad.id
      WHERE 1=1
    `;

    const values = [];
    let paramCount = 1;

    if (employeeId) {
      sql += ` AND asub.employee_id = $${paramCount}`;
      values.push(employeeId);
      paramCount++;
    }

    if (!includeInactive) {
      sql += ` AND asub.enabled = true AND e.is_active = true`;
    }

    sql += ` ORDER BY asub.created_at DESC`;

    try {
      const result = await query(sql, values);
      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching employee subscriptions:', error);
      throw error;
    }
  }

  /**
   * Update employee subscription
   * @param {number} subscriptionId - Subscription ID
   * @param {object} updates - Fields to update
   * @returns {Promise<object>}
   */
  async updateEmployeeSubscription(subscriptionId, updates) {
    const allowedFields = [
      'business_id', 'service_location_id', 'agent_id', 'alert_config_id',
      'min_severity', 'alert_types', 'metric_types',
      'notify_email', 'notify_sms', 'notify_websocket', 'notify_browser',
      'email', 'phone_number', 'quiet_hours_start', 'quiet_hours_end',
      'quiet_hours_timezone', 'enabled'
    ];

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field)) {
        setClauses.push(`${field} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Add updated_at timestamp
    setClauses.push(`updated_at = NOW()`);

    // Add subscription ID as last parameter
    values.push(subscriptionId);

    const sql = `
      UPDATE alert_subscribers
      SET ${setClauses.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    try {
      const result = await query(sql, values);
      if (result.rows.length === 0) {
        throw new Error('Subscription not found');
      }
      console.log(`✅ Updated employee subscription ID: ${subscriptionId}`);
      return { success: true, subscription: result.rows[0] };
    } catch (error) {
      console.error('❌ Error updating employee subscription:', error);
      throw error;
    }
  }

  /**
   * Delete employee subscription
   * @param {number} subscriptionId - Subscription ID
   * @returns {Promise<object>}
   */
  async deleteEmployeeSubscription(subscriptionId) {
    const sql = `DELETE FROM alert_subscribers WHERE id = $1 RETURNING id`;

    try {
      const result = await query(sql, [subscriptionId]);
      if (result.rows.length === 0) {
        throw new Error('Subscription not found');
      }
      console.log(`✅ Deleted employee subscription ID: ${subscriptionId}`);
      return { success: true, deletedId: subscriptionId };
    } catch (error) {
      console.error('❌ Error deleting employee subscription:', error);
      throw error;
    }
  }

  // ====================================
  // CLIENT SUBSCRIPTIONS
  // ====================================

  /**
   * Create client alert subscription
   * @param {object} subscriptionData - Subscription details
   * @returns {Promise<object>}
   */
  async createClientSubscription(subscriptionData) {
    const {
      user_id,
      business_id,
      agent_id = null,
      alert_categories = ['critical_issue', 'performance_degradation', 'security_alert'],
      notify_email = true,
      notify_sms = false,
      notify_push = true,
      email = null,
      phone_number = null,
      preferred_language = null,
      digest_mode = false,
      digest_time = '08:00:00',
      digest_timezone = 'America/New_York',
      enabled = true
    } = subscriptionData;

    const sql = `
      INSERT INTO client_alert_subscriptions (
        user_id, business_id, agent_id, alert_categories,
        notify_email, notify_sms, notify_push,
        email, phone_number, preferred_language,
        digest_mode, digest_time, digest_timezone, enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const values = [
      user_id, business_id, agent_id, alert_categories,
      notify_email, notify_sms, notify_push,
      email, phone_number, preferred_language,
      digest_mode, digest_time, digest_timezone, enabled
    ];

    try {
      const result = await query(sql, values);
      console.log(`✅ Created client subscription for user_id: ${user_id}`);
      return { success: true, subscription: result.rows[0] };
    } catch (error) {
      console.error('❌ Error creating client subscription:', error);
      throw error;
    }
  }

  /**
   * Get client subscriptions
   * @param {string} userId - User UUID (optional)
   * @param {string} businessId - Business UUID (optional)
   * @returns {Promise<Array>}
   */
  async getClientSubscriptions(userId = null, businessId = null) {
    let sql = `
      SELECT
        cas.*,
        u.first_name,
        u.last_name,
        u.email as user_email,
        u.preferred_language as user_preferred_language,
        b.business_name,
        ad.device_name as agent_name
      FROM client_alert_subscriptions cas
      JOIN users u ON cas.user_id = u.id
      JOIN businesses b ON cas.business_id = b.id
      LEFT JOIN agent_devices ad ON cas.agent_id = ad.id
      WHERE 1=1
    `;

    const values = [];
    let paramCount = 1;

    if (userId) {
      sql += ` AND cas.user_id = $${paramCount}`;
      values.push(userId);
      paramCount++;
    }

    if (businessId) {
      sql += ` AND cas.business_id = $${paramCount}`;
      values.push(businessId);
      paramCount++;
    }

    sql += ` AND cas.enabled = true ORDER BY cas.created_at DESC`;

    try {
      const result = await query(sql, values);
      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching client subscriptions:', error);
      throw error;
    }
  }

  /**
   * Update client subscription
   * @param {number} subscriptionId - Subscription ID
   * @param {object} updates - Fields to update
   * @returns {Promise<object>}
   */
  async updateClientSubscription(subscriptionId, updates) {
    const allowedFields = [
      'agent_id', 'alert_categories', 'notify_email', 'notify_sms',
      'notify_push', 'email', 'phone_number', 'preferred_language',
      'digest_mode', 'digest_time', 'digest_timezone', 'enabled'
    ];

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field)) {
        setClauses.push(`${field} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Add updated_at timestamp
    setClauses.push(`updated_at = NOW()`);

    // Add subscription ID as last parameter
    values.push(subscriptionId);

    const sql = `
      UPDATE client_alert_subscriptions
      SET ${setClauses.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    try {
      const result = await query(sql, values);
      if (result.rows.length === 0) {
        throw new Error('Subscription not found');
      }
      console.log(`✅ Updated client subscription ID: ${subscriptionId}`);
      return { success: true, subscription: result.rows[0] };
    } catch (error) {
      console.error('❌ Error updating client subscription:', error);
      throw error;
    }
  }

  /**
   * Delete client subscription
   * @param {number} subscriptionId - Subscription ID
   * @returns {Promise<object>}
   */
  async deleteClientSubscription(subscriptionId) {
    const sql = `DELETE FROM client_alert_subscriptions WHERE id = $1 RETURNING id`;

    try {
      const result = await query(sql, [subscriptionId]);
      if (result.rows.length === 0) {
        throw new Error('Subscription not found');
      }
      console.log(`✅ Deleted client subscription ID: ${subscriptionId}`);
      return { success: true, deletedId: subscriptionId };
    } catch (error) {
      console.error('❌ Error deleting client subscription:', error);
      throw error;
    }
  }

  // ====================================
  // UTILITY METHODS
  // ====================================

  /**
   * Check if employee has permission to manage subscription
   * @param {string} employeeId - Employee UUID
   * @param {number} subscriptionId - Subscription ID
   * @param {Array<string>} permissions - Required permissions
   * @returns {Promise<boolean>}
   */
  async canManageSubscription(employeeId, subscriptionId, permissions) {
    // If employee has 'alert_subscriptions.manage_all', they can manage any subscription
    if (permissions.includes('alert_subscriptions.manage_all')) {
      return true;
    }

    // Otherwise, check if it's their own subscription
    const sql = `SELECT employee_id FROM alert_subscribers WHERE id = $1`;
    const result = await query(sql, [subscriptionId]);

    if (result.rows.length === 0) {
      return false;
    }

    return result.rows[0].employee_id === employeeId;
  }

  /**
   * Get subscription statistics
   * @returns {Promise<object>}
   */
  async getSubscriptionStats() {
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM alert_subscribers WHERE enabled = true) as active_employee_subs,
        (SELECT COUNT(*) FROM alert_subscribers WHERE enabled = false) as inactive_employee_subs,
        (SELECT COUNT(*) FROM client_alert_subscriptions WHERE enabled = true) as active_client_subs,
        (SELECT COUNT(*) FROM client_alert_subscriptions WHERE enabled = false) as inactive_client_subs,
        (SELECT COUNT(DISTINCT employee_id) FROM alert_subscribers WHERE enabled = true) as subscribed_employees,
        (SELECT COUNT(DISTINCT user_id) FROM client_alert_subscriptions WHERE enabled = true) as subscribed_clients
    `;

    try {
      const result = await query(sql);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error fetching subscription stats:', error);
      throw error;
    }
  }

  /**
   * Get notification delivery statistics
   * @param {Date} startDate - Start date for statistics
   * @param {Date} endDate - End date for statistics
   * @returns {Promise<object>}
   */
  async getNotificationStats(startDate, endDate) {
    const sql = `
      SELECT
        channel,
        status,
        COUNT(*) as count,
        recipient_type
      FROM alert_notifications
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY channel, status, recipient_type
      ORDER BY channel, status
    `;

    try {
      const result = await query(sql, [startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching notification stats:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const subscriberManagementService = new SubscriberManagementService();
