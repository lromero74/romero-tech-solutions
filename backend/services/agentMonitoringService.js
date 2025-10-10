/**
 * Agent Monitoring Service
 *
 * Monitors agent heartbeats and automatically updates agent status based on
 * last heartbeat timestamp. Implements industry-standard offline detection.
 *
 * Thresholds:
 * - Warning: > 3 minutes since last heartbeat (3 missed heartbeats @ 60s interval)
 * - Offline: > 10 minutes since last heartbeat (10 missed heartbeats)
 */

import { query } from '../config/database.js';

// Thresholds in minutes
const WARNING_THRESHOLD_MINUTES = 3;
const OFFLINE_THRESHOLD_MINUTES = 10;

// Monitoring interval (check every minute)
const MONITORING_INTERVAL_MS = 60 * 1000;

let monitoringInterval = null;

/**
 * Check all agent heartbeats and update status accordingly
 */
async function checkAgentHeartbeats() {
  try {
    const now = new Date();

    // Get all active agents with their last heartbeat
    const agentsResult = await query(
      `SELECT
        id,
        device_name,
        status,
        last_heartbeat,
        EXTRACT(EPOCH FROM (NOW() - last_heartbeat)) / 60 as minutes_since_heartbeat
      FROM agent_devices
      WHERE is_active = true
        AND soft_delete = false
        AND monitoring_enabled = true`,
      []
    );

    if (agentsResult.rows.length === 0) {
      return; // No agents to monitor
    }

    let warningCount = 0;
    let offlineCount = 0;
    let onlineCount = 0;

    for (const agent of agentsResult.rows) {
      const minutesSinceHeartbeat = agent.minutes_since_heartbeat;
      const currentStatus = agent.status;
      let newStatus = currentStatus;

      // Determine new status based on heartbeat age
      if (minutesSinceHeartbeat === null) {
        // No heartbeat ever received - mark as offline
        newStatus = 'offline';
      } else if (minutesSinceHeartbeat >= OFFLINE_THRESHOLD_MINUTES) {
        newStatus = 'offline';
        offlineCount++;
      } else if (minutesSinceHeartbeat >= WARNING_THRESHOLD_MINUTES) {
        newStatus = 'warning';
        warningCount++;
      } else {
        // Heartbeat is recent - should be online
        // Only set to online if not already in a critical state
        if (currentStatus === 'warning' || currentStatus === 'offline') {
          newStatus = 'online';
        }
        onlineCount++;
      }

      // Update status if it changed
      if (newStatus !== currentStatus) {
        await query(
          `UPDATE agent_devices
           SET status = $1, updated_at = NOW()
           WHERE id = $2`,
          [newStatus, agent.id]
        );

        console.log(
          `📊 Agent status changed: ${agent.device_name} (${agent.id.substring(0, 8)}) ` +
          `${currentStatus} → ${newStatus} ` +
          `(${parseFloat(minutesSinceHeartbeat).toFixed(1)}m since heartbeat)`
        );

        // TODO: Optionally create an alert for offline agents
        // This would integrate with the agent_alert_history table
      }
    }

    // Log summary only if there are status changes
    if (warningCount > 0 || offlineCount > 0) {
      console.log(
        `🔍 Agent status check: ${onlineCount} online, ${warningCount} warning, ${offlineCount} offline ` +
        `(${agentsResult.rows.length} total monitored)`
      );
    }

  } catch (error) {
    console.error('❌ Error checking agent heartbeats:', error);
  }
}

/**
 * Start the agent monitoring service
 */
export function startAgentMonitoring() {
  if (monitoringInterval) {
    console.log('⚠️  Agent monitoring service is already running');
    return;
  }

  console.log('🚀 Starting agent heartbeat monitoring service...');
  console.log(`   - Warning threshold: ${WARNING_THRESHOLD_MINUTES} minutes`);
  console.log(`   - Offline threshold: ${OFFLINE_THRESHOLD_MINUTES} minutes`);
  console.log(`   - Check interval: ${MONITORING_INTERVAL_MS / 1000} seconds`);

  // Run initial check
  checkAgentHeartbeats()
    .then(() => console.log('✅ Initial agent heartbeat check completed'))
    .catch(error => console.error('❌ Initial agent heartbeat check failed:', error));

  // Set up recurring checks
  monitoringInterval = setInterval(checkAgentHeartbeats, MONITORING_INTERVAL_MS);

  console.log('✅ Agent monitoring service started');
}

/**
 * Stop the agent monitoring service
 */
export function stopAgentMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    console.log('🛑 Agent monitoring service stopped');
  }
}

/**
 * Get current monitoring status
 */
export function getMonitoringStatus() {
  return {
    isRunning: monitoringInterval !== null,
    warningThresholdMinutes: WARNING_THRESHOLD_MINUTES,
    offlineThresholdMinutes: OFFLINE_THRESHOLD_MINUTES,
    checkIntervalSeconds: MONITORING_INTERVAL_MS / 1000
  };
}

// Export for use in other modules
export default {
  startAgentMonitoring,
  stopAgentMonitoring,
  getMonitoringStatus,
  checkAgentHeartbeats
};
