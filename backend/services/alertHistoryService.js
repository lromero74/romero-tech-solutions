/**
 * Alert History Service
 * Manages alert history and lifecycle
 */

import { query } from '../config/database.js';
import { websocketService } from './websocketService.js';

class AlertHistoryService {
  /**
   * Save a triggered alert to history
   */
  async saveAlert(alertData) {
    try {
      const {
        agent_id,
        configuration_id,
        alert_name,
        alert_type,
        severity,
        indicator_count,
        contributing_indicators,
        metric_values,
        notify_email,
        notify_dashboard,
        notify_websocket,
      } = alertData;

      // Determine metric_type from metric_values
      const metricType = this._determineMetricType(metric_values);

      const sql = `
        INSERT INTO alert_history (
          alert_config_id, agent_id, metric_type,
          alert_type, severity, indicator_count,
          indicators_triggered, metric_value,
          alert_title, alert_description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const values = [
        configuration_id || null,
        agent_id,
        metricType,
        alert_type,
        severity,
        indicator_count,
        JSON.stringify(contributing_indicators),
        metric_values.cpu_percent || metric_values.memory_percent || metric_values.disk_percent || 0,
        alert_name,
        this._generateAlertDescription(alert_type, severity, indicator_count, contributing_indicators),
      ];

      const result = await query(sql, values);
      const savedAlert = result.rows[0];

      // Get agent name for notification
      const agentResult = await query(
        'SELECT device_name FROM agent_devices WHERE id = $1',
        [agent_id]
      );
      const agentName = agentResult.rows[0]?.device_name || 'Unknown Agent';

      // Send WebSocket notification if enabled
      if (notify_websocket) {
        await this._sendWebSocketNotification(savedAlert, agentName, alert_name);
      }

      console.log(`✅ Alert saved: ${alert_name} (${severity}) - ID: ${savedAlert.id}`);
      return savedAlert;
    } catch (error) {
      console.error('❌ Error saving alert to history:', error);
      throw error;
    }
  }

  /**
   * Determine primary metric type from metric values
   */
  _determineMetricType(metricValues) {
    if (!metricValues) return 'cpu';

    const cpu = metricValues.cpu_percent || 0;
    const memory = metricValues.memory_percent || 0;
    const disk = metricValues.disk_percent || 0;

    // Return the metric with highest value
    if (cpu >= memory && cpu >= disk) return 'cpu';
    if (memory >= disk) return 'memory';
    return 'disk';
  }

  /**
   * Generate human-readable alert description
   */
  _generateAlertDescription(alertType, severity, indicatorCount, contributingIndicators) {
    const indicators = Object.keys(contributingIndicators || {}).join(', ');
    return `${severity.toUpperCase()} alert: ${alertType.replace(/_/g, ' ')} detected with ${indicatorCount} indicator(s) in confluence (${indicators})`;
  }

  /**
   * Send WebSocket notification to all admins
   */
  async _sendWebSocketNotification(alert, agentName, alertName) {
    try {
      console.log('📡 Broadcasting alert via WebSocket:', alert.id);

      websocketService.broadcastToAdmins({
        type: 'alert:created',
        data: {
          alert: {
            id: alert.id,
            agent_id: alert.agent_id,
            agent_name: agentName,
            configuration_id: alert.alert_config_id,
            alert_name: alertName,
            alert_type: alert.alert_type,
            severity: alert.severity,
            indicator_count: alert.indicator_count,
            contributing_indicators: alert.indicators_triggered,
            triggered_at: alert.triggered_at,
            acknowledged_at: alert.acknowledged_at,
            resolved_at: alert.resolved_at,
          }
        }
      });

      console.log('✅ WebSocket alert notification sent');
    } catch (error) {
      console.error('❌ Error sending WebSocket alert notification:', error);
      // Don't throw - alert is already saved, notification failure shouldn't break the flow
    }
  }

  /**
   * Get alert history with filters
   */
  async getAlertHistory(filters = {}) {
    try {
      const {
        agentId,
        metricType,
        alertType,
        severity,
        startDate,
        endDate,
        acknowledged,
        resolved,
        limit = 100,
        offset = 0,
      } = filters;

      const conditions = [];
      const values = [];
      let paramCount = 1;

      if (agentId) {
        conditions.push(`agent_id = $${paramCount}`);
        values.push(agentId);
        paramCount++;
      }

      if (metricType) {
        conditions.push(`metric_type = $${paramCount}`);
        values.push(metricType);
        paramCount++;
      }

      if (alertType) {
        conditions.push(`alert_type = $${paramCount}`);
        values.push(alertType);
        paramCount++;
      }

      if (severity) {
        conditions.push(`severity = $${paramCount}`);
        values.push(severity);
        paramCount++;
      }

      if (startDate) {
        conditions.push(`triggered_at >= $${paramCount}`);
        values.push(startDate);
        paramCount++;
      }

      if (endDate) {
        conditions.push(`triggered_at <= $${paramCount}`);
        values.push(endDate);
        paramCount++;
      }

      if (acknowledged === true) {
        conditions.push('acknowledged_at IS NOT NULL');
      } else if (acknowledged === false) {
        conditions.push('acknowledged_at IS NULL');
      }

      if (resolved === true) {
        conditions.push('resolved_at IS NOT NULL');
      } else if (resolved === false) {
        conditions.push('resolved_at IS NULL');
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      values.push(limit, offset);

      const sql = `
        SELECT
          ah.*,
          ah.alert_title as alert_name,
          ah.indicators_triggered as contributing_indicators,
          ad.device_name as agent_name,
          ad.os_type as agent_os,
          ac.alert_name as config_name
        FROM alert_history ah
        LEFT JOIN agent_devices ad ON ah.agent_id = ad.id
        LEFT JOIN alert_configurations ac ON ah.alert_config_id = ac.id
        ${whereClause}
        ORDER BY ah.triggered_at DESC
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `;

      const result = await query(sql, values);
      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching alert history:', error);
      throw error;
    }
  }

  /**
   * Get active (unresolved) alerts
   */
  async getActiveAlerts(agentId = null) {
    try {
      let sql = 'SELECT * FROM active_alerts';
      const values = [];

      if (agentId) {
        sql += ' WHERE agent_id = $1';
        values.push(agentId);
      }

      const result = await query(sql, values);
      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching active alerts:', error);
      throw error;
    }
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId, employeeId) {
    try {
      const result = await query(
        `UPDATE alert_history
         SET acknowledged_at = NOW(),
             acknowledged_by = $2,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [alertId, employeeId]
      );

      return result.rows[0];
    } catch (error) {
      console.error('❌ Error acknowledging alert:', error);
      throw error;
    }
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId, employeeId, notes = null) {
    try {
      const result = await query(
        `UPDATE alert_history
         SET resolved_at = NOW(),
             resolved_by = $2,
             notes = COALESCE($3, notes),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [alertId, employeeId, notes]
      );

      return result.rows[0];
    } catch (error) {
      console.error('❌ Error resolving alert:', error);
      throw error;
    }
  }

  /**
   * Get alert statistics
   */
  async getAlertStats(startDate = null, endDate = null) {
    try {
      const conditions = [];
      const values = [];
      let paramCount = 1;

      if (startDate) {
        conditions.push(`triggered_at >= $${paramCount}`);
        values.push(startDate);
        paramCount++;
      }

      if (endDate) {
        conditions.push(`triggered_at <= $${paramCount}`);
        values.push(endDate);
        paramCount++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const sql = `
        SELECT
          COUNT(*) as total_alerts,
          COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_count,
          COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_count,
          COUNT(CASE WHEN severity = 'medium' THEN 1 END) as medium_count,
          COUNT(CASE WHEN severity = 'low' THEN 1 END) as low_count,
          COUNT(CASE WHEN acknowledged_at IS NOT NULL THEN 1 END) as acknowledged_count,
          COUNT(CASE WHEN resolved_at IS NOT NULL THEN 1 END) as resolved_count,
          AVG(EXTRACT(EPOCH FROM (COALESCE(acknowledged_at, NOW()) - triggered_at))) as avg_acknowledge_time_seconds,
          AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - triggered_at))) as avg_resolution_time_seconds
        FROM alert_history
        ${whereClause}
      `;

      const result = await query(sql, values);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error fetching alert statistics:', error);
      throw error;
    }
  }

  /**
   * Check if similar alert exists recently (for debouncing)
   */
  async hasRecentSimilarAlert(agentId, metricType, alertType, minutesAgo = 15) {
    try {
      const result = await query(
        `SELECT id FROM alert_history
         WHERE agent_id = $1
           AND metric_type = $2
           AND alert_type = $3
           AND triggered_at > NOW() - INTERVAL '${minutesAgo} minutes'
           AND resolved_at IS NULL
         LIMIT 1`,
        [agentId, metricType, alertType]
      );

      return result.rows.length > 0;
    } catch (error) {
      console.error('❌ Error checking for recent similar alert:', error);
      return false; // Assume no recent alert on error
    }
  }
}

// Export singleton instance
export const alertHistoryService = new AlertHistoryService();
