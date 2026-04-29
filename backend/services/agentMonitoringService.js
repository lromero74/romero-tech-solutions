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

// =============================================================================
// Stage 2 — Nightly trend / forecast / baseline computation
// =============================================================================

import { recomputeAllForecasts } from './diskForecastService.js';
import { recomputeAllBaselines } from './anomalyDetectionService.js';

let nightlyTrendsTimeout = null;

/**
 * Compute trends + baselines for ALL agents. Called once at boot
 * (delayed) and then nightly at 03:00 UTC.
 *
 * Idempotent — safe to call manually as well, e.g. by an admin
 * "Recompute now" button. Returns counts for logging.
 */
export async function computeNightlyTrends() {
  console.log('📈 Stage 2 nightly trends: starting...');
  let forecastResult = { computed: 0, upserted: 0 };
  let baselineResult = { upserted: 0 };
  try {
    forecastResult = await recomputeAllForecasts();
    console.log(`📈   disk forecasts: ${forecastResult.upserted} upserted (${forecastResult.computed} candidates)`);
  } catch (err) {
    console.error('❌ disk forecast computation failed:', err);
  }
  try {
    baselineResult = await recomputeAllBaselines();
    console.log(`📈   metric baselines: ${baselineResult.upserted} upserted across ${TRACKED_METRIC_COUNT} metric types`);
  } catch (err) {
    console.error('❌ baseline computation failed:', err);
  }
  return { forecast: forecastResult, baseline: baselineResult };
}

const TRACKED_METRIC_COUNT = 6; // matches anomalyDetectionService.TRACKED_METRICS.length

/**
 * Schedule the next nightly run at 03:00 UTC. Re-arms itself on each
 * fire (vs. a single setInterval) so we don't drift when the
 * computation overruns the interval.
 */
function scheduleNextNightlyRun() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(3, 0, 0, 0);
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  const delayMs = next.getTime() - now.getTime();
  console.log(`📈 Stage 2 nightly trends scheduled for ${next.toISOString()} (in ${Math.round(delayMs / 60000)} min)`);
  nightlyTrendsTimeout = setTimeout(async () => {
    await computeNightlyTrends().catch(err => console.error('❌ nightly trends failed:', err));
    scheduleNextNightlyRun();
  }, delayMs);
}

/**
 * Start the Stage 2 nightly job. Calls computeNightlyTrends once
 * after a 5-minute boot delay (so the backend isn't competing with
 * the boot work the rest of the system does at startup), then schedules
 * the next run at 03:00 UTC.
 */
export function startNightlyTrends() {
  if (nightlyTrendsTimeout) {
    console.log('⚠️  Stage 2 nightly trends already scheduled');
    return;
  }
  // Initial run after 5 min — gives boot a quiet window AND ensures
  // trends are populated soon after deploy without waiting until 3 AM UTC.
  setTimeout(() => {
    computeNightlyTrends().catch(err => console.error('❌ initial trends run failed:', err));
  }, 5 * 60 * 1000);
  scheduleNextNightlyRun();
}

export function stopNightlyTrends() {
  if (nightlyTrendsTimeout) {
    clearTimeout(nightlyTrendsTimeout);
    nightlyTrendsTimeout = null;
  }
}

// Export for use in other modules
export default {
  startAgentMonitoring,
  stopAgentMonitoring,
  getMonitoringStatus,
  checkAgentHeartbeats,
  startNightlyTrends,
  stopNightlyTrends,
  computeNightlyTrends
};
