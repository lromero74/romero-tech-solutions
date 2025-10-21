/**
 * Alert Escalation Service
 * Monitors unacknowledged alerts and automatically escalates them according to escalation policies
 */

import { query } from '../config/database.js';
import { emailService } from './emailService.js';
import { twilioService } from './twilioService.js';
import { websocketService } from './websocketService.js';
import { buildEmployeeAlertHTML, buildEmployeeAlertText } from '../templates/alertEmailTemplates.js';

class AlertEscalationService {
  /**
   * Main entry point - check for alerts that need escalation
   * Called by scheduled job every 5 minutes
   */
  async checkForEscalation() {
    try {
      console.log('🔍 Checking for alerts needing escalation...');

      // Get all enabled escalation policies
      const policies = await this._getActivePolicies();

      if (policies.length === 0) {
        console.log('ℹ️  No active escalation policies configured');
        return { checked: 0, escalated: 0 };
      }

      console.log(`📋 Found ${policies.length} active escalation policies`);

      let totalChecked = 0;
      let totalEscalated = 0;

      // Process each policy
      for (const policy of policies) {
        const result = await this._processPolicyEscalations(policy);
        totalChecked += result.checked;
        totalEscalated += result.escalated;
      }

      console.log(`✅ Escalation check complete: ${totalChecked} alerts checked, ${totalEscalated} escalations triggered`);

      return { checked: totalChecked, escalated: totalEscalated };
    } catch (error) {
      console.error('❌ Error during escalation check:', error);
      throw error;
    }
  }

  /**
   * Get all active escalation policies
   */
  async _getActivePolicies() {
    try {
      const sql = `
        SELECT * FROM alert_escalation_policies
        WHERE enabled = true
        ORDER BY trigger_after_minutes ASC
      `;

      const result = await query(sql);
      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching active policies:', error);
      throw error;
    }
  }

  /**
   * Process escalations for a single policy
   */
  async _processPolicyEscalations(policy) {
    try {
      console.log(`📝 Processing policy: "${policy.policy_name}"`);

      // Find alerts that need escalation for this policy
      const alerts = await this._findAlertsNeedingEscalation(policy);

      if (alerts.length === 0) {
        return { checked: 0, escalated: 0 };
      }

      console.log(`⚠️  Found ${alerts.length} alerts needing escalation`);

      let escalatedCount = 0;

      for (const alert of alerts) {
        const escalated = await this._escalateAlert(alert, policy);
        if (escalated) {
          escalatedCount++;
        }
      }

      return { checked: alerts.length, escalated: escalatedCount };
    } catch (error) {
      console.error(`❌ Error processing policy "${policy.policy_name}":`, error);
      return { checked: 0, escalated: 0 };
    }
  }

  /**
   * Find alerts that meet escalation criteria for this policy
   */
  async _findAlertsNeedingEscalation(policy) {
    try {
      // Build severity filter
      const severityPlaceholders = policy.trigger_severity.map((_, i) => `$${i + 2}`).join(', ');

      const sql = `
        SELECT
          ah.*,
          ad.device_name as agent_name,
          ad.os_type as agent_os,
          EXTRACT(EPOCH FROM (NOW() - ah.triggered_at)) / 60 as minutes_unacknowledged
        FROM alert_history ah
        LEFT JOIN agent_devices ad ON ah.agent_id = ad.id
        WHERE ah.acknowledged_at IS NULL
          AND ah.resolved_at IS NULL
          AND ah.severity = ANY($1::text[])
          AND EXTRACT(EPOCH FROM (NOW() - ah.triggered_at)) / 60 >= $${policy.trigger_severity.length + 2}
        ORDER BY ah.triggered_at ASC
      `;

      const values = [policy.trigger_severity, policy.trigger_after_minutes];

      const result = await query(sql, values);
      return result.rows;
    } catch (error) {
      console.error('❌ Error finding alerts needing escalation:', error);
      throw error;
    }
  }

  /**
   * Escalate a single alert according to policy
   */
  async _escalateAlert(alert, policy) {
    try {
      console.log(`📢 Escalating alert ${alert.id}: ${alert.alert_title}`);

      const minutesElapsed = Math.floor(alert.minutes_unacknowledged);

      // Determine which escalation step to execute
      const step = this._determineEscalationStep(policy.escalation_steps, minutesElapsed, policy.trigger_after_minutes);

      if (!step) {
        console.log(`ℹ️  No escalation step applicable for alert ${alert.id} (${minutesElapsed} minutes elapsed)`);
        return false;
      }

      console.log(`📊 Executing escalation step ${step.order} for alert ${alert.id}`);

      // Check if this step was already executed
      const alreadyEscalated = await this._wasStepAlreadyExecuted(alert.id, step.order, policy.id);

      if (alreadyEscalated) {
        console.log(`ℹ️  Step ${step.order} already executed for alert ${alert.id}`);
        return false;
      }

      // Find employees with target roles
      const employees = await this._findEmployeesWithRoles(step.escalate_to_roles);

      if (employees.length === 0) {
        console.log(`⚠️  No employees found with roles: ${step.escalate_to_roles.join(', ')}`);
        return false;
      }

      console.log(`👥 Found ${employees.length} employees to notify`);

      // Send notifications to each employee
      let notificationsSent = 0;

      for (const employee of employees) {
        const sent = await this._sendEscalationNotification(
          alert,
          employee,
          step,
          policy,
          minutesElapsed
        );

        if (sent > 0) {
          notificationsSent += sent;
        }
      }

      console.log(`✅ Sent ${notificationsSent} escalation notifications for alert ${alert.id}`);

      return true;
    } catch (error) {
      console.error(`❌ Error escalating alert ${alert.id}:`, error);
      return false;
    }
  }

  /**
   * Determine which escalation step should be executed based on time elapsed
   */
  _determineEscalationStep(steps, minutesElapsed, triggerAfterMinutes) {
    // Sort steps by order
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

    // Calculate cumulative time for each step
    let cumulativeTime = triggerAfterMinutes;

    for (const step of sortedSteps) {
      if (step.order > 1) {
        cumulativeTime += step.wait_minutes;
      }

      // If we haven't reached this step's time yet, return the previous step
      if (minutesElapsed < cumulativeTime) {
        return null; // Not time for any step yet
      }

      // Check if it's time for this step
      const nextStep = sortedSteps.find(s => s.order === step.order + 1);
      if (!nextStep) {
        // This is the last step, execute it if we've passed its time
        return step;
      }

      const nextStepTime = cumulativeTime + nextStep.wait_minutes;
      if (minutesElapsed < nextStepTime) {
        // We're in the window for this step
        return step;
      }
    }

    // Return the last step if we've exceeded all times
    return sortedSteps[sortedSteps.length - 1];
  }

  /**
   * Check if an escalation step was already executed for this alert
   */
  async _wasStepAlreadyExecuted(alertId, stepOrder, policyId) {
    try {
      const sql = `
        SELECT COUNT(*) as count
        FROM alert_notifications
        WHERE alert_id = $1
          AND metadata->>'escalation_step' = $2
          AND metadata->>'escalation_policy_id' = $3
      `;

      const result = await query(sql, [alertId, stepOrder.toString(), policyId.toString()]);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      console.error('❌ Error checking if step was executed:', error);
      return false; // Assume not executed on error to avoid missing escalations
    }
  }

  /**
   * Find employees with specified roles
   */
  async _findEmployeesWithRoles(roles) {
    try {
      const rolePlaceholders = roles.map((_, i) => `$${i + 1}`).join(', ');

      const sql = `
        SELECT DISTINCT
          e.id,
          e.email,
          e.phone_number,
          e.first_name,
          e.last_name,
          r.name as role_name
        FROM employees e
        JOIN employee_roles er ON e.id = er.employee_id
        JOIN roles r ON er.role_id = r.id
        WHERE r.name = ANY($1::text[])
          AND e.is_active = true
          AND e.email IS NOT NULL
      `;

      const result = await query(sql, [roles]);
      return result.rows;
    } catch (error) {
      console.error('❌ Error finding employees with roles:', error);
      throw error;
    }
  }

  /**
   * Send escalation notification to an employee
   */
  async _sendEscalationNotification(alert, employee, step, policy, minutesElapsed) {
    try {
      let notificationsSent = 0;

      const dashboardUrl = process.env.FRONTEND_URL || 'https://romerotechsolutions.com';

      // Prepare alert data with escalation context
      const alertData = {
        id: alert.id,
        alert_name: alert.alert_title,
        agent_name: alert.agent_name,
        severity: alert.severity,
        triggered_at: alert.triggered_at,
        description: alert.alert_description,
        metric_type: alert.metric_type,
        escalation_info: {
          policy_name: policy.policy_name,
          step_number: step.order,
          minutes_unacknowledged: minutesElapsed,
        },
      };

      // Email notification
      if (step.notify_email && employee.email) {
        const sent = await this._sendEscalationEmail(alert, employee, alertData, dashboardUrl, policy, step);
        if (sent) notificationsSent++;
      }

      // SMS notification
      if (step.notify_sms && employee.phone_number) {
        const sent = await this._sendEscalationSMS(alert, employee, alertData, policy, step);
        if (sent) notificationsSent++;
      }

      // WebSocket notification
      if (step.notify_websocket) {
        const sent = await this._sendEscalationWebSocket(alert, employee, alertData, policy, step);
        if (sent) notificationsSent++;
      }

      return notificationsSent;
    } catch (error) {
      console.error(`❌ Error sending escalation notification to ${employee.email}:`, error);
      return 0;
    }
  }

  /**
   * Send escalation email
   */
  async _sendEscalationEmail(alert, employee, alertData, dashboardUrl, policy, step) {
    try {
      const recipientName = `${employee.first_name} ${employee.last_name}`;

      // Build email with escalation context
      const htmlContent = buildEmployeeAlertHTML(alertData, recipientName, dashboardUrl);
      const textContent = buildEmployeeAlertText(alertData, recipientName, dashboardUrl);

      // Add escalation notice to subject
      const subject = `[ESCALATED] Alert: ${alert.alert_title} - ${alert.severity.toUpperCase()}`;

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'alerts@romerotechsolutions.com',
        to: employee.email,
        subject: subject,
        text: textContent,
        html: htmlContent,
      };

      await emailService.sendRawEmail(mailOptions);

      // Log notification
      await this._logNotification(
        alert.id,
        'employee',
        employee.id,
        recipientName,
        employee.email,
        null,
        'email',
        'sent',
        null,
        policy.id,
        step.order
      );

      console.log(`📧 Escalation email sent to ${employee.email}`);
      return true;
    } catch (error) {
      console.error(`❌ Error sending escalation email to ${employee.email}:`, error);

      // Log failed notification
      await this._logNotification(
        alert.id,
        'employee',
        employee.id,
        `${employee.first_name} ${employee.last_name}`,
        employee.email,
        null,
        'email',
        'failed',
        error.message,
        policy.id,
        step.order
      );

      return false;
    }
  }

  /**
   * Send escalation SMS
   */
  async _sendEscalationSMS(alert, employee, alertData, policy, step) {
    try {
      const message = `[ESCALATED] ${alert.severity.toUpperCase()} Alert: ${alert.alert_title} on ${alert.agent_name}. Unacknowledged for ${alertData.escalation_info.minutes_unacknowledged} minutes. Please check dashboard.`;

      await twilioService.sendSMS(employee.phone_number, message);

      // Log notification
      await this._logNotification(
        alert.id,
        'employee',
        employee.id,
        `${employee.first_name} ${employee.last_name}`,
        null,
        employee.phone_number,
        'sms',
        'sent',
        null,
        policy.id,
        step.order
      );

      console.log(`📱 Escalation SMS sent to ${employee.phone_number}`);
      return true;
    } catch (error) {
      console.error(`❌ Error sending escalation SMS to ${employee.phone_number}:`, error);

      // Log failed notification
      await this._logNotification(
        alert.id,
        'employee',
        employee.id,
        `${employee.first_name} ${employee.last_name}`,
        null,
        employee.phone_number,
        'sms',
        'failed',
        error.message,
        policy.id,
        step.order
      );

      return false;
    }
  }

  /**
   * Send escalation WebSocket notification
   */
  async _sendEscalationWebSocket(alert, employee, alertData, policy, step) {
    try {
      websocketService.broadcastToEmployee(employee.id, {
        type: 'alert:escalated',
        data: {
          alert: alertData,
          escalation: {
            policy_name: policy.policy_name,
            step_number: step.order,
            minutes_unacknowledged: alertData.escalation_info.minutes_unacknowledged,
          },
        },
      });

      // Log notification
      await this._logNotification(
        alert.id,
        'employee',
        employee.id,
        `${employee.first_name} ${employee.last_name}`,
        null,
        null,
        'websocket',
        'sent',
        null,
        policy.id,
        step.order
      );

      console.log(`🌐 Escalation WebSocket sent to employee ${employee.id}`);
      return true;
    } catch (error) {
      console.error(`❌ Error sending escalation WebSocket to employee ${employee.id}:`, error);

      // Log failed notification
      await this._logNotification(
        alert.id,
        'employee',
        employee.id,
        `${employee.first_name} ${employee.last_name}`,
        null,
        null,
        'websocket',
        'failed',
        error.message,
        policy.id,
        step.order
      );

      return false;
    }
  }

  /**
   * Log notification to database
   */
  async _logNotification(
    alertId,
    subscriberType,
    subscriberId,
    recipientName,
    recipientEmail,
    recipientPhone,
    channel,
    status,
    errorMessage,
    policyId,
    stepOrder
  ) {
    try {
      const sql = `
        INSERT INTO alert_notifications (
          alert_id,
          subscriber_type,
          subscriber_id,
          recipient_name,
          recipient_email,
          recipient_phone,
          channel,
          status,
          error_message,
          sent_at,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
      `;

      const metadata = {
        escalation_policy_id: policyId,
        escalation_step: stepOrder,
        is_escalation: true,
      };

      const values = [
        alertId,
        subscriberType,
        subscriberId,
        recipientName,
        recipientEmail,
        recipientPhone,
        channel,
        status,
        errorMessage,
        JSON.stringify(metadata),
      ];

      await query(sql, values);
    } catch (error) {
      console.error('❌ Error logging escalation notification:', error);
      // Don't throw - logging failure shouldn't stop escalation
    }
  }

  /**
   * Get escalation statistics
   */
  async getEscalationStats(startDate = null, endDate = null) {
    try {
      const conditions = ["metadata->>'is_escalation' = 'true'"];
      const values = [];
      let paramCount = 1;

      if (startDate) {
        conditions.push(`sent_at >= $${paramCount}`);
        values.push(startDate);
        paramCount++;
      }

      if (endDate) {
        conditions.push(`sent_at <= $${paramCount}`);
        values.push(endDate);
        paramCount++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const sql = `
        SELECT
          COUNT(*) as total_escalations,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as successful_escalations,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_escalations,
          COUNT(DISTINCT alert_id) as unique_alerts_escalated,
          COUNT(CASE WHEN channel = 'email' THEN 1 END) as email_escalations,
          COUNT(CASE WHEN channel = 'sms' THEN 1 END) as sms_escalations,
          COUNT(CASE WHEN channel = 'websocket' THEN 1 END) as websocket_escalations
        FROM alert_notifications
        ${whereClause}
      `;

      const result = await query(sql, values);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error fetching escalation stats:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const alertEscalationService = new AlertEscalationService();
