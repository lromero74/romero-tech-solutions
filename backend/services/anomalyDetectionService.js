/**
 * Anomaly detection service (Stage 2.2).
 *
 * Maintains rolling baselines (mean ± stddev) per (agent, metric) and
 * fires "metric_anomaly" alerts when a metric stays > 2σ above (or
 * below) its baseline for 15+ minutes sustained. The transient-spike
 * filter is the whole point — without it CPU bursts during compile or
 * disk-percent jitter from log rotation would page operators every
 * other minute.
 *
 * Two entry points:
 *   - recomputeAllBaselines()         nightly, from agentMonitoringService
 *   - evaluateMetricsForAnomalies()   on every metrics POST, from agents.js
 *
 * See docs/PRPs/STAGE2_TRENDS.md.
 */
import { query } from '../config/database.js';

// Metrics we baseline. Must match the CHECK constraint on
// agent_metric_baselines.metric_type.
export const TRACKED_METRICS = Object.freeze([
  'cpu_percent',
  'memory_percent',
  'disk_percent',
  'load_average_1m',
  'network_rx_bytes',
  'network_tx_bytes',
]);

// Standard-deviation multiplier for the anomaly threshold. 2σ is the
// PRP's choice — covers ~95% of normal variation, so a sustained 2σ
// excursion is genuinely unusual.
export const ANOMALY_SIGMA = 2;

// How long a 2σ excursion must persist before we fire an alert.
// 15 minutes filters out compile bursts, log-rotation IO spikes, etc.
export const SUSTAINED_MINUTES = 15;

// Rolling window for the baseline. 7 days matches the PRP and gives
// the average a chance to absorb day-of-week patterns (a workstation
// is busier 9-5 than at 3 AM).
export const BASELINE_WINDOW_DAYS = 7;

// Minimum sample count to consider a baseline valid. With 1-minute
// metric ticks and 7 days, a fully-active agent has 10,080 samples;
// require at least 1000 (~17 hours) to avoid baselining a freshly-
// enrolled device on a tiny noisy sample.
export const MIN_BASELINE_SAMPLES = 1000;

// Re-fire alert cooldown. After firing, the same anomaly won't re-fire
// until the metric crosses back to normal AND then re-crosses sustained.
// This is enforced via agent_anomaly_state.alert_fired_at — clearing
// the row on a normal reading resets the next-fire eligibility.

/**
 * Pure decision: is `value` anomalous given the baseline?
 *
 * Returns null when the baseline is absent or has zero stddev (constant
 * metric — anomaly detection isn't meaningful). Returns true when
 * |value - mean| > sigma * stddev.
 */
export function isAnomalous(value, baseline, sigma = ANOMALY_SIGMA) {
  if (value === null || value === undefined || Number.isNaN(value)) return false;
  if (!baseline) return false;
  const mean = Number(baseline.mean);
  const stddev = Number(baseline.stddev);
  if (!Number.isFinite(stddev) || stddev <= 0) return false;
  return Math.abs(Number(value) - mean) > sigma * stddev;
}

/**
 * Pure decision: given a current state row and a fresh observation,
 * return what the new state should be AND whether to fire an alert.
 *
 * State machine:
 *   - normal observation while no anomaly tracked  → state cleared (idempotent)
 *   - normal observation while anomaly tracked     → clear anomaly_started_at, clear alert_fired_at
 *   - anomalous obs while no anomaly tracked       → start tracking (anomaly_started_at = now)
 *   - anomalous obs while anomaly tracked          → keep tracking; FIRE if ≥ SUSTAINED_MINUTES
 *                                                    AND alert_fired_at is null
 *
 * The "alert_fired_at is null" guard prevents re-fire while the
 * anomaly is ongoing. A separate normal-then-anomalous cycle is
 * required to re-fire.
 */
export function nextAnomalyState(currentState, value, anomalous, now = new Date()) {
  const fresh = {
    last_value: value,
    last_observed_at: now,
    anomaly_started_at: null,
    alert_fired_at: null,
  };

  if (!anomalous) {
    // Reset on normal reading.
    return { state: fresh, fire: false };
  }

  // Anomalous reading — preserve started-at if we were already tracking.
  const startedAt = currentState && currentState.anomaly_started_at
    ? new Date(currentState.anomaly_started_at)
    : now;
  const sustainedMs = now.getTime() - startedAt.getTime();
  const alreadyFired = currentState && currentState.alert_fired_at;

  const shouldFire = !alreadyFired && sustainedMs >= SUSTAINED_MINUTES * 60 * 1000;

  return {
    state: {
      last_value: value,
      last_observed_at: now,
      anomaly_started_at: startedAt,
      alert_fired_at: shouldFire ? now : (alreadyFired ? new Date(alreadyFired) : null),
    },
    fire: shouldFire,
  };
}

/**
 * Recompute baselines for ALL agents over the rolling window. One row
 * per (agent, metric). Cheap when run nightly; runs as part of
 * agentMonitoringService.computeNightlyTrends().
 */
export async function recomputeAllBaselines() {
  let upserted = 0;
  // Run one query per metric — Postgres' avg/stddev_samp are simple
  // aggregates, and per-metric NULL handling is easier this way.
  for (const metric of TRACKED_METRICS) {
    const sql = `
      SELECT agent_device_id,
             avg(${metric}::numeric) AS mean,
             coalesce(stddev_samp(${metric}::numeric), 0) AS stddev,
             count(${metric}) AS sample_count
        FROM agent_metrics
       WHERE collected_at >= now() - INTERVAL '${BASELINE_WINDOW_DAYS} days'
         AND ${metric} IS NOT NULL
       GROUP BY agent_device_id
      HAVING count(${metric}) >= $1
    `;
    const result = await query(sql, [MIN_BASELINE_SAMPLES]);
    for (const row of result.rows) {
      await query(`
        INSERT INTO agent_metric_baselines
          (agent_device_id, metric_type, mean, stddev, sample_count, window_days, computed_at)
        VALUES ($1, $2, $3, $4, $5, $6, now())
        ON CONFLICT (agent_device_id, metric_type) DO UPDATE
          SET mean = EXCLUDED.mean,
              stddev = EXCLUDED.stddev,
              sample_count = EXCLUDED.sample_count,
              window_days = EXCLUDED.window_days,
              computed_at = now()
      `, [
        row.agent_device_id,
        metric,
        row.mean,
        row.stddev,
        row.sample_count,
        BASELINE_WINDOW_DAYS,
      ]);
      upserted++;
    }
  }
  return { upserted };
}

/**
 * Read all baselines for one agent. Returns array of rows.
 */
export async function getBaselines(agentDeviceId) {
  const { rows } = await query(`
    SELECT metric_type, mean, stddev, sample_count, window_days, computed_at
      FROM agent_metric_baselines
     WHERE agent_device_id = $1
     ORDER BY metric_type
  `, [agentDeviceId]);
  return rows;
}

/**
 * Evaluate a single fresh metrics row against the baselines and
 * advance the anomaly state. Returns the list of metric_types that
 * triggered an alert (will fire) so the caller can dispatch via the
 * alert pipeline.
 *
 * Called from inside the agents.js metrics-POST handler.
 */
export async function evaluateMetricsForAnomalies(agentDeviceId, metricsRow, now = new Date()) {
  const fired = [];

  // Pre-fetch baselines + state in a single round-trip.
  const baselinesResult = await query(
    `SELECT metric_type, mean, stddev FROM agent_metric_baselines WHERE agent_device_id = $1`,
    [agentDeviceId]
  );
  const baselines = Object.fromEntries(baselinesResult.rows.map(r => [r.metric_type, r]));

  const stateResult = await query(
    `SELECT metric_type, anomaly_started_at, alert_fired_at FROM agent_anomaly_state WHERE agent_device_id = $1`,
    [agentDeviceId]
  );
  const states = Object.fromEntries(stateResult.rows.map(r => [r.metric_type, r]));

  for (const metric of TRACKED_METRICS) {
    const value = metricsRow[metric];
    if (value === null || value === undefined) continue;
    const baseline = baselines[metric];
    if (!baseline) continue;

    const anomalous = isAnomalous(value, baseline);
    const { state, fire } = nextAnomalyState(states[metric] || null, Number(value), anomalous, now);

    await query(`
      INSERT INTO agent_anomaly_state
        (agent_device_id, metric_type, anomaly_started_at, last_value, last_observed_at, alert_fired_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (agent_device_id, metric_type) DO UPDATE
        SET anomaly_started_at = EXCLUDED.anomaly_started_at,
            last_value = EXCLUDED.last_value,
            last_observed_at = EXCLUDED.last_observed_at,
            alert_fired_at = EXCLUDED.alert_fired_at
    `, [
      agentDeviceId,
      metric,
      state.anomaly_started_at,
      state.last_value,
      state.last_observed_at,
      state.alert_fired_at,
    ]);

    if (fire) {
      fired.push({
        metric_type: metric,
        value: state.last_value,
        baseline_mean: Number(baseline.mean),
        baseline_stddev: Number(baseline.stddev),
        sustained_minutes: SUSTAINED_MINUTES,
      });
    }
  }
  return fired;
}
