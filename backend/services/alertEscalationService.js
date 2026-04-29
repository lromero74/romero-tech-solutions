/**
 * Alert Escalation Service
 * Monitors unacknowledged alerts and automatically escalates them according to escalation policies
 */

import { query } from '../config/database.js';
import { emailService } from './emailService.js';
import { twilioService } from './twilioService.js';
import { websocketService } from './websocketService.js';
import { alertNotificationService } from './alertNotificationService.js';
import { buildEmployeeAlertHTML, buildEmployeeAlertText } from '../templates/alertEmailTemplates.js';

// Severity → channel default for health-check alerts. The actual delivery is
// driven by per-subscriber preferences (alert_subscribers / client_alert_subscriptions);
// this map only decides whether to FIRE at all from a check_result.
const HEALTH_CHECK_FIRE_SEVERITIES = new Set(['warning', 'critical']);

// Dedupe window — don't fire the same (agent, check_type, severity) twice
// inside this period unless the prior alert was resolved.
const HEALTH_CHECK_DEDUPE_HOURS = 4;

// Friendly labels for the alert message body. New check_types added in later
// stages must extend this map (or fall back to a humanized snake_case).
const HEALTH_CHECK_LABELS = Object.freeze({
  reboot_pending: 'Reboot pending',
  time_drift: 'System clock drift',
  crashdumps: 'Crash dumps detected',
  top_processes: 'Top resource consumers',
  listening_ports: 'Listening ports changed',
  update_history_failures: 'OS update failure',
  domain_status: 'Domain join status',
  mapped_drives: 'Mapped drive issue',
});

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
      // The schema column is `severity_levels` (a TEXT[]). Two original bugs
      // here: (1) read `policy.trigger_severity` which doesn't exist, throwing
      // `Cannot read properties of undefined (reading 'map')`. (2) Even after
      // the rename, the prior code built `severityPlaceholders` (never used)
      // and used `$${severity_levels.length + 2}` for the duration filter,
      // which produced wrong placeholder numbers — the array goes through as
      // $1 (a single bound value, not unfolded), so the duration is just $2.
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
          AND EXTRACT(EPOCH FROM (NOW() - ah.triggered_at)) / 60 >= $2
        ORDER BY ah.triggered_at ASC
      `;

      const values = [policy.severity_levels, policy.trigger_after_minutes];

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

// =============================================================================
// Stage 1 Health-Check alert hookup
// =============================================================================

/**
 * Pure decision: should a check_result fire an alert at all?
 * Exported for unit testing.
 */
export function shouldFireHealthCheckAlert(severity) {
  return HEALTH_CHECK_FIRE_SEVERITIES.has(severity);
}

/**
 * Pure mapping: check_type → human-readable label.
 * Exported for unit testing.
 */
export function healthCheckLabel(checkType) {
  if (HEALTH_CHECK_LABELS[checkType]) return HEALTH_CHECK_LABELS[checkType];
  // Fallback: humanize snake_case for unknown future check types.
  return String(checkType || 'Health check')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Cached config_id for the seeded 'health_check' alert_configurations row.
// Lazy-loaded once per process; refreshed if a query returns null (in case
// migrations get re-run in a long-lived dev process).
let _healthCheckConfigId = null;
async function _getHealthCheckConfigId() {
  if (_healthCheckConfigId !== null) return _healthCheckConfigId;
  const { rows } = await query(
    `SELECT id FROM alert_configurations
      WHERE alert_type = 'health_check' AND alert_name = 'Stage 1 Health Check'
      LIMIT 1`
  );
  if (rows.length === 0) {
    console.warn('⚠️ Stage 1 Health Check alert_configurations row missing — health-check alerts will not reach client subscribers until migration 20260428_health_check_alert_config.sql is applied');
    return null;
  }
  _healthCheckConfigId = rows[0].id;
  return _healthCheckConfigId;
}

/**
 * Process a single agent_check_result and fire an alert if it crosses severity
 * threshold and isn't deduped.
 *
 * Hooks the existing alert_history → alertNotificationService.routeAlert() pipeline:
 *   - Skips silently for severity='info'.
 *   - Dedupes by (agent_id, check_type, severity) within HEALTH_CHECK_DEDUPE_HOURS.
 *     If a prior unresolved alert exists, no new row is inserted.
 *   - Inserts an alert_history row referencing the seeded 'health_check' config.
 *   - Calls alertNotificationService.routeAlert(insertedId) for delivery.
 *
 * @param {object} input
 * @param {string} input.agent_device_id
 * @param {string|null} input.business_id
 * @param {string} input.check_type
 * @param {string} input.severity         'info' | 'warning' | 'critical'
 * @param {object} input.payload          Original check_result payload
 * @param {string} [input.device_name]    For human-readable alert_title
 * @returns {{ fired: boolean, alertHistoryId: number|null, reason?: string }}
 */
async function processHealthCheckResult(input) {
  const { agent_device_id, business_id, check_type, severity, payload, device_name } = input;

  if (!shouldFireHealthCheckAlert(severity)) {
    return { fired: false, alertHistoryId: null, reason: 'severity below threshold' };
  }

  // Dedupe: any unresolved health_check alert for the same (agent, check_type, severity)
  // inside the dedupe window?
  const dedupe = await query(
    `SELECT id
       FROM alert_history
      WHERE agent_id = $1
        AND alert_type = 'health_check'
        AND severity = $2
        AND (indicators_triggered ->> 'check_type') = $3
        AND triggered_at >= now() - ($4 || ' hours')::interval
        AND resolved_at IS NULL
      LIMIT 1`,
    [agent_device_id, severity, check_type, String(HEALTH_CHECK_DEDUPE_HOURS)]
  );
  if (dedupe.rows.length > 0) {
    return { fired: false, alertHistoryId: dedupe.rows[0].id, reason: 'deduped within window' };
  }

  const configId = await _getHealthCheckConfigId();
  const label = healthCheckLabel(check_type);
  const deviceLabel = device_name || agent_device_id;
  const alertTitle = `${label} — ${severity}`;
  const alertDescription = `Stage 1 health check "${check_type}" reported severity=${severity} on device ${deviceLabel}.`;

  const insert = await query(
    `INSERT INTO alert_history (
        alert_config_id, agent_id, metric_type, alert_type, severity,
        indicator_count, indicators_triggered, alert_title, alert_description,
        triggered_at
      ) VALUES ($1, $2, 'health_check', 'health_check', $3,
                1, $4::jsonb, $5, $6, now())
      RETURNING id`,
    [
      configId,
      agent_device_id,
      severity,
      JSON.stringify({ check_type, payload, business_id }),
      alertTitle,
      alertDescription,
    ]
  );
  const alertHistoryId = insert.rows[0].id;

  // Fire-and-forget routing — failures inside notification dispatch shouldn't
  // block the original check_result write path. Errors are logged inside the
  // notification service.
  alertNotificationService.routeAlert(alertHistoryId).catch(err => {
    console.error(`❌ routeAlert failed for health_check alert ${alertHistoryId}:`, err);
  });

  return { fired: true, alertHistoryId };
}

// Attach to the singleton AFTER the class is instantiated below, so the method
// is reachable as alertEscalationService.processHealthCheckResult(...).
AlertEscalationService.prototype.processHealthCheckResult = processHealthCheckResult;

// Export singleton instance
export const alertEscalationService = new AlertEscalationService();
