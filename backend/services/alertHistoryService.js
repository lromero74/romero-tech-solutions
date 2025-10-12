/**
 * Alert History Service
 * Manages alert history and lifecycle
 */

const db = require('../config/database');

class AlertHistoryService {
  /**
   * Save a triggered alert to history
   */
  async saveAlert(alertData) {
    try {
      const {
        alertConfigId,
        agentId,
        metricType,
        alertType,
        severity,
        indicatorCount,
        indicatorsTriggered,
        metricValue,
        alertTitle,
        alertDescription,
      } = alertData;

      const query = `
        INSERT INTO alert_history (
          alert_config_id, agent_id, metric_type,
          alert_type, severity, indicator_count,
          indicators_triggered, metric_value,
          alert_title, alert_description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const values = [
        alertConfigId || null,
        agentId,
        metricType,
        alertType,
        severity,
        indicatorCount,
        JSON.stringify(indicatorsTriggered),
        metricValue,
        alertTitle,
        alertDescription,
      ];

      const result = await db.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Error saving alert to history:', error);
      throw error;
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

      const query = `
        SELECT
          ah.*,
          a.hostname as agent_hostname,
          a.os_type as agent_os,
          ac.alert_name as config_name
        FROM alert_history ah
        LEFT JOIN agents a ON ah.agent_id = a.id
        LEFT JOIN alert_configurations ac ON ah.alert_config_id = ac.id
        ${whereClause}
        ORDER BY ah.triggered_at DESC
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `;

      const result = await db.query(query, values);
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
      let query = 'SELECT * FROM active_alerts';
      const values = [];

      if (agentId) {
        query += ' WHERE agent_id = $1';
        values.push(agentId);
      }

      const result = await db.query(query, values);
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
      const result = await db.query(
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
      const result = await db.query(
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

      const query = `
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

      const result = await db.query(query, values);
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
      const result = await db.query(
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
module.exports = new AlertHistoryService();
