/**
 * Alert Notification Service
 * Routes alerts to appropriate subscribers across multiple channels
 */

import { query } from '../config/database.js';
import { websocketService } from './websocketService.js';
import { emailService } from './emailService.js';
import { alertTranslationService } from './alertTranslationService.js';
import { twilioService } from './twilioService.js';
import {
  buildEmployeeAlertHTML,
  buildEmployeeAlertText,
  buildClientAlertHTML,
  buildClientAlertText
} from '../templates/alertEmailTemplates.js';

class AlertNotificationService {
  /**
   * Main entry point - route an alert to all appropriate subscribers
   * @param {number} alertHistoryId - ID from alert_history table
   */
  async routeAlert(alertHistoryId) {
    try {
      console.log(`📢 Routing alert notifications for alert_history_id: ${alertHistoryId}`);

      // Fetch alert details with agent and business info
      const alert = await this._fetchAlertDetails(alertHistoryId);
      if (!alert) {
        console.error(`❌ Alert not found: ${alertHistoryId}`);
        return { success: false, error: 'Alert not found' };
      }

      console.log(`📊 Alert details:`, {
        type: alert.alert_type,
        severity: alert.severity,
        agent: alert.agent_name,
        metric: alert.metric_type
      });

      // Find employee subscribers who should receive this alert
      const employeeSubscribers = await this._findEmployeeSubscribers(alert);
      console.log(`👥 Found ${employeeSubscribers.length} employee subscribers`);

      // Find client subscribers who should receive this alert
      const clientSubscribers = await this._findClientSubscribers(alert);
      console.log(`👤 Found ${clientSubscribers.length} client subscribers`);

      // Filter by quiet hours
      const activeEmployeeSubscribers = this._filterByQuietHours(employeeSubscribers);
      console.log(`✅ ${activeEmployeeSubscribers.length} employee subscribers active (after quiet hours filter)`);

      // Send notifications to employees
      const employeeResults = await this._sendEmployeeNotifications(alert, activeEmployeeSubscribers);

      // Send notifications to clients (with translations)
      const clientResults = await this._sendClientNotifications(alert, clientSubscribers);

      const totalSent = employeeResults.sent + clientResults.sent;
      const totalFailed = employeeResults.failed + clientResults.failed;

      console.log(`✅ Alert notification routing complete:`, {
        totalSubscribers: employeeSubscribers.length + clientSubscribers.length,
        sent: totalSent,
        failed: totalFailed
      });

      return {
        success: true,
        employees: employeeResults,
        clients: clientResults,
        total: { sent: totalSent, failed: totalFailed }
      };

    } catch (error) {
      console.error('❌ Error routing alert notifications:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fetch alert details with joins for agent and business info
   */
  async _fetchAlertDetails(alertHistoryId) {
    const sql = `
      SELECT
        ah.id,
        ah.alert_config_id,
        ah.agent_id,
        ah.metric_type,
        ah.alert_type,
        ah.severity,
        ah.indicator_count,
        ah.indicators_triggered,
        ah.metric_value,
        ah.alert_title,
        ah.alert_description,
        ah.triggered_at,
        ah.acknowledged_at,
        ah.resolved_at,
        ad.device_name as agent_name,
        ad.business_id,
        b.business_name,
        sl.location_name as service_location_name,
        ac.client_visible,
        ac.client_category,
        ac.client_display_name_en,
        ac.client_display_name_es,
        ac.client_description_en,
        ac.client_description_es,
        ac.escalation_policy_id
      FROM alert_history ah
      JOIN agent_devices ad ON ah.agent_id = ad.id
      LEFT JOIN businesses b ON ad.business_id = b.id
      LEFT JOIN service_locations sl ON ad.service_location_id = sl.id
      LEFT JOIN alert_configurations ac ON ah.alert_config_id = ac.id
      WHERE ah.id = $1
    `;

    const result = await query(sql, [alertHistoryId]);
    return result.rows[0] || null;
  }

  /**
   * Find employee subscribers who should receive this alert
   */
  async _findEmployeeSubscribers(alert) {
    const sql = `
      SELECT
        asub.id as subscription_id,
        asub.employee_id,
        asub.min_severity,
        asub.alert_types,
        asub.metric_types,
        asub.notify_email,
        asub.notify_sms,
        asub.notify_websocket,
        asub.notify_browser,
        asub.email as override_email,
        asub.phone_number,
        asub.quiet_hours_start,
        asub.quiet_hours_end,
        asub.quiet_hours_timezone,
        e.first_name,
        e.last_name,
        e.email as default_email,
        e.phone as default_phone
      FROM alert_subscribers asub
      JOIN employees e ON asub.employee_id = e.id
      WHERE asub.enabled = true
        AND e.is_active = true
        -- Scope filtering (null = all agents)
        AND (asub.agent_id IS NULL OR asub.agent_id = $1)
        AND (asub.business_id IS NULL OR asub.business_id = $2)
        -- Severity filtering
        AND $3 = ANY(asub.min_severity)
        -- Alert type filtering
        AND $4 = ANY(asub.alert_types)
        -- Metric type filtering
        AND $5 = ANY(asub.metric_types)
    `;

    const result = await query(sql, [
      alert.agent_id,
      alert.business_id,
      alert.severity,
      alert.alert_type,
      alert.metric_type
    ]);

    return result.rows;
  }

  /**
   * Find client subscribers who should receive this alert
   */
  async _findClientSubscribers(alert) {
    // Only send to clients if alert is marked client_visible
    if (!alert.client_visible) {
      console.log(`ℹ️ Alert type '${alert.alert_type}' not marked as client_visible - skipping client notifications`);
      return [];
    }

    const sql = `
      SELECT
        cas.id as subscription_id,
        cas.user_id,
        cas.notify_email,
        cas.notify_sms,
        cas.notify_push,
        cas.email as override_email,
        cas.phone_number,
        cas.preferred_language,
        cas.digest_mode,
        u.first_name,
        u.last_name,
        u.email as default_email,
        u.phone as default_phone,
        u.preferred_language as user_language
      FROM client_alert_subscriptions cas
      JOIN users u ON cas.user_id = u.id
      WHERE cas.enabled = true
        AND cas.business_id = $1
        -- Scope filtering (null = all agents for business)
        AND (cas.agent_id IS NULL OR cas.agent_id = $2)
        -- Category filtering
        AND $3 = ANY(cas.alert_categories)
        -- Skip digest mode subscribers (they get daily digest)
        AND cas.digest_mode = false
    `;

    const result = await query(sql, [
      alert.business_id,
      alert.agent_id,
      alert.client_category
    ]);

    return result.rows;
  }

  /**
   * Filter subscribers based on quiet hours
   */
  _filterByQuietHours(subscribers) {
    const now = new Date();

    return subscribers.filter(sub => {
      // If no quiet hours configured, always active
      if (!sub.quiet_hours_start || !sub.quiet_hours_end) {
        return true;
      }

      try {
        // Convert current time to subscriber's timezone
        const subscriberTime = new Date(now.toLocaleString('en-US', {
          timeZone: sub.quiet_hours_timezone || 'America/New_York'
        }));

        const currentHour = subscriberTime.getHours();
        const currentMinute = subscriberTime.getMinutes();
        const currentTimeMinutes = currentHour * 60 + currentMinute;

        // Parse quiet hours (format: "HH:MM")
        const [startHour, startMinute] = sub.quiet_hours_start.split(':').map(Number);
        const [endHour, endMinute] = sub.quiet_hours_end.split(':').map(Number);
        const startTimeMinutes = startHour * 60 + startMinute;
        const endTimeMinutes = endHour * 60 + endMinute;

        // Check if current time is within quiet hours
        if (startTimeMinutes <= endTimeMinutes) {
          // Normal range (e.g., 22:00 to 08:00 next day)
          const inQuietHours = currentTimeMinutes >= startTimeMinutes && currentTimeMinutes < endTimeMinutes;
          return !inQuietHours; // Return false if in quiet hours
        } else {
          // Spans midnight (e.g., 22:00 to 08:00)
          const inQuietHours = currentTimeMinutes >= startTimeMinutes || currentTimeMinutes < endTimeMinutes;
          return !inQuietHours;
        }
      } catch (error) {
        console.error(`⚠️ Error checking quiet hours for subscriber ${sub.subscription_id}:`, error);
        return true; // If error, allow notification
      }
    });
  }

  /**
   * Send notifications to employee subscribers
   */
  async _sendEmployeeNotifications(alert, subscribers) {
    let sent = 0;
    let failed = 0;

    for (const subscriber of subscribers) {
      const recipientEmail = subscriber.override_email || subscriber.default_email;
      const recipientPhone = subscriber.phone_number || subscriber.default_phone;
      const recipientName = `${subscriber.first_name} ${subscriber.last_name}`;

      // WebSocket notification (real-time)
      if (subscriber.notify_websocket) {
        try {
          await this._sendWebSocketNotification(alert, subscriber, 'employee');
          await this._logNotification(alert, subscriber, 'employee', 'websocket', 'sent', 'en');
          sent++;
        } catch (error) {
          console.error(`❌ WebSocket notification failed for ${recipientEmail}:`, error);
          await this._logNotification(alert, subscriber, 'employee', 'websocket', 'failed', 'en', error.message);
          failed++;
        }
      }

      // Email notification
      if (subscriber.notify_email && recipientEmail) {
        try {
          await this._sendEmailNotification(alert, subscriber, 'employee', recipientEmail, recipientName, 'en');
          await this._logNotification(alert, subscriber, 'employee', 'email', 'sent', 'en');
          sent++;
        } catch (error) {
          console.error(`❌ Email notification failed for ${recipientEmail}:`, error);
          await this._logNotification(alert, subscriber, 'employee', 'email', 'failed', 'en', error.message);
          failed++;
        }
      }

      // SMS notification
      if (subscriber.notify_sms && recipientPhone) {
        try {
          const smsMessage = alertTranslationService.getSMSTemplate('alert', 'en', {
            severity: alert.severity.toUpperCase(),
            agentName: alert.agent_name,
            alertType: alert.alert_type
          });
          await twilioService.sendAlertSMS(recipientPhone, smsMessage);
          await this._logNotification(alert, subscriber, 'employee', 'sms', 'sent', 'en');
          sent++;
        } catch (error) {
          console.error(`❌ SMS notification failed for ${recipientPhone}:`, error);
          await this._logNotification(alert, subscriber, 'employee', 'sms', 'failed', 'en', error.message || error.userMessage);
          failed++;
        }
      }

      // Browser push notification (future)
      if (subscriber.notify_browser) {
        console.log(`🔔 Browser push notification queued for ${recipientEmail} (not yet implemented)`);
        // TODO: Implement browser push notifications
      }
    }

    return { sent, failed };
  }

  /**
   * Send notifications to client subscribers (with i18n)
   */
  async _sendClientNotifications(alert, subscribers) {
    let sent = 0;
    let failed = 0;

    for (const subscriber of subscribers) {
      const recipientEmail = subscriber.override_email || subscriber.default_email;
      const recipientPhone = subscriber.phone_number || subscriber.default_phone;
      const recipientName = `${subscriber.first_name} ${subscriber.last_name}`;
      const language = subscriber.preferred_language || subscriber.user_language || 'en';

      // Email notification
      if (subscriber.notify_email && recipientEmail) {
        try {
          await this._sendEmailNotification(alert, subscriber, 'client', recipientEmail, recipientName, language);
          await this._logNotification(alert, subscriber, 'client', 'email', 'sent', language);
          sent++;
        } catch (error) {
          console.error(`❌ Client email notification failed for ${recipientEmail}:`, error);
          await this._logNotification(alert, subscriber, 'client', 'email', 'failed', language, error.message);
          failed++;
        }
      }

      // SMS notification
      if (subscriber.notify_sms && recipientPhone) {
        try {
          const smsMessage = alertTranslationService.getSMSTemplate('alert', language, {
            severity: alertTranslationService.getSeverity(alert.severity, language).toUpperCase(),
            agentName: alert.agent_name,
            alertType: language === 'es' ? alert.client_display_name_es : alert.client_display_name_en
          });
          await twilioService.sendAlertSMS(recipientPhone, smsMessage);
          await this._logNotification(alert, subscriber, 'client', 'sms', 'sent', language);
          sent++;
        } catch (error) {
          console.error(`❌ Client SMS notification failed for ${recipientPhone}:`, error);
          await this._logNotification(alert, subscriber, 'client', 'sms', 'failed', language, error.message || error.userMessage);
          failed++;
        }
      }

      // Push notification (future - PWA)
      if (subscriber.notify_push) {
        console.log(`📲 Client push notification queued for ${recipientEmail} (not yet implemented)`);
        // TODO: Implement PWA push notifications
      }
    }

    return { sent, failed };
  }

  /**
   * Send WebSocket notification to employee
   */
  async _sendWebSocketNotification(alert, subscriber, recipientType) {
    const notification = {
      type: 'alert:created',
      data: {
        alert: {
          id: alert.id,
          agent_name: alert.agent_name,
          alert_type: alert.alert_type,
          severity: alert.severity,
          metric_type: alert.metric_type,
          metric_value: alert.metric_value,
          triggered_at: alert.triggered_at
        }
      }
    };

    if (recipientType === 'employee') {
      // Broadcast to all admins (existing behavior)
      websocketService.broadcastToAdmins(notification);
    } else if (recipientType === 'client') {
      // Send to specific client user (future - requires clientSockets tracking)
      console.log(`📡 Client WebSocket notification for user ${subscriber.user_id} (not yet implemented)`);
      // TODO: websocketService.sendToClient(subscriber.user_id, notification);
    }
  }

  /**
   * Send email notification
   */
  async _sendEmailNotification(alert, subscriber, recipientType, recipientEmail, recipientName, language) {
    console.log(`📧 Sending ${language} ${recipientType} email to ${recipientEmail}`);

    let subject, htmlBody, textBody;

    if (recipientType === 'employee') {
      // Technical alert for employees (always English)
      const alertName = alert.alert_type.replace(/_/g, ' ').toUpperCase();
      subject = alertTranslationService.getEmailSubject('alert', 'en', {
        alertName,
        agentName: alert.agent_name
      });
      htmlBody = buildEmployeeAlertHTML(alert, recipientName);
      textBody = buildEmployeeAlertText(alert, recipientName);
    } else {
      // Simplified client-facing alert with i18n
      const alertName = language === 'es' ? alert.client_display_name_es : alert.client_display_name_en;
      subject = alertTranslationService.getEmailSubject('alert', language, {
        alertName,
        agentName: alert.agent_name
      });
      htmlBody = buildClientAlertHTML(alert, recipientName, language);
      textBody = buildClientAlertText(alert, recipientName, language);
    }

    // Send email via nodemailer
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || 'noreply@romerotechsolutions.com',
        to: recipientEmail,
        subject: subject,
        html: htmlBody,
        text: textBody
      };

      // Use the existing emailService's transporter
      await emailService.sendRawEmail(mailOptions);
      console.log(`✅ Email sent successfully to ${recipientEmail}`);
    } catch (error) {
      console.error(`❌ Failed to send email to ${recipientEmail}:`, error);
      throw error;
    }
  }


  /**
   * Log notification delivery attempt
   */
  async _logNotification(alert, subscriber, recipientType, channel, status, language, errorMessage = null) {
    const sql = `
      INSERT INTO alert_notifications (
        alert_history_id,
        recipient_type,
        recipient_id,
        recipient_email,
        recipient_phone,
        channel,
        status,
        language,
        sent_at,
        failed_at,
        error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `;

    const recipientId = recipientType === 'employee' ? subscriber.employee_id : subscriber.user_id;
    const recipientEmail = subscriber.override_email || subscriber.default_email;
    const recipientPhone = subscriber.phone_number || subscriber.default_phone;
    const now = new Date();

    await query(sql, [
      alert.id,
      recipientType,
      recipientId,
      recipientEmail,
      recipientPhone,
      channel,
      status,
      language,
      status === 'sent' ? now : null,
      status === 'failed' ? now : null,
      errorMessage
    ]);
  }
}

// Export singleton instance
export const alertNotificationService = new AlertNotificationService();
