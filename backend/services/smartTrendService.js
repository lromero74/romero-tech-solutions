/**
 * SMART pre-fail trend service (Stage 2.3).
 *
 * Surfaces "your disk is dying" warnings before SMART hard-fails by
 * trending `agent_metrics.disk_reallocated_sectors_total` over 30 days.
 * A growing reallocated-sector count is the canonical pre-fail
 * indicator on every consumer SSD/HDD spec sheet — once a drive starts
 * reallocating sectors, the rate-of-growth predicts the time-to-fail.
 *
 * Three signals (any one fires elevation):
 *   1. agent_metrics.disk_failures_predicted > 0       → critical
 *   2. reallocated_sectors growing AND current > 0     → warning
 *   3. max disk temperature > 60°C                     → warning
 *   else info.
 *
 * Stores one row per agent in agent_smart_trends (upserted nightly).
 *
 * See docs/PRPs/STAGE2_TRENDS.md.
 */
import { query } from '../config/database.js';

export const SMART_WINDOW_DAYS = 30;
export const MIN_SMART_SAMPLES = 24;
export const HIGH_TEMPERATURE_C = 60;

/**
 * Pure decision: classify an agent's SMART signals into a severity.
 *
 * Exported so unit tests pin the threshold logic without a DB.
 *
 * @param {{ failures_predicted_current: number|null,
 *           reallocated_sectors_current: number|null,
 *           reallocated_growth_per_day: number|null,
 *           max_temperature_c: number|null }} input
 * @returns {'info'|'warning'|'critical'}
 */
export function severityFor(input) {
  const failures = num(input?.failures_predicted_current);
  const realloc = num(input?.reallocated_sectors_current);
  const growth = num(input?.reallocated_growth_per_day);
  const temp = num(input?.max_temperature_c);

  // Critical: SMART self-test or vendor-predicted failure.
  if (failures !== null && failures > 0) return 'critical';

  // Warning: reallocated sectors are growing AND non-zero. (Sectors
  // sitting at the same non-zero count for 30 days isn't getting
  // worse — those are old reallocations the drive recovered from.)
  if (realloc !== null && realloc > 0 && growth !== null && growth > 0) {
    return 'warning';
  }

  // Warning: sustained high temperature shortens drive life.
  if (temp !== null && temp > HIGH_TEMPERATURE_C) return 'warning';

  return 'info';
}

function num(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Recompute SMART trends for ALL agents that have enough samples.
 * Single SQL pass via Postgres regr_slope; one row per agent in the
 * result set.
 */
export async function recomputeAllSmartTrends() {
  const sql = `
    WITH samples AS (
      SELECT
        am.agent_device_id,
        am.disk_reallocated_sectors_total,
        am.disk_failures_predicted,
        am.disk_temperature_max,
        EXTRACT(EPOCH FROM am.collected_at) AS epoch_seconds,
        am.collected_at
      FROM agent_metrics am
      WHERE am.collected_at >= now() - INTERVAL '${SMART_WINDOW_DAYS} days'
    ),
    latest AS (
      SELECT DISTINCT ON (agent_device_id)
        agent_device_id,
        disk_reallocated_sectors_total AS reallocated_current,
        disk_failures_predicted AS failures_current,
        collected_at
      FROM samples
      ORDER BY agent_device_id, collected_at DESC
    )
    SELECT
      s.agent_device_id,
      ad.business_id,
      l.reallocated_current,
      l.failures_current,
      max(s.disk_temperature_max) AS max_temperature_c,
      regr_slope(s.disk_reallocated_sectors_total, s.epoch_seconds) AS slope_per_sec,
      count(*) AS sample_count
    FROM samples s
    JOIN latest l USING (agent_device_id)
    JOIN agent_devices ad ON ad.id = s.agent_device_id
    GROUP BY s.agent_device_id, ad.business_id, l.reallocated_current, l.failures_current
    HAVING count(*) >= $1
  `;

  const result = await query(sql, [MIN_SMART_SAMPLES]);
  let upserted = 0;
  for (const row of result.rows) {
    const slope = row.slope_per_sec === null ? null : Number(row.slope_per_sec);
    const growthPerDay = slope === null ? null : round4(slope * 86400);

    const severity = severityFor({
      failures_predicted_current: row.failures_current,
      reallocated_sectors_current: row.reallocated_current,
      reallocated_growth_per_day: growthPerDay,
      max_temperature_c: row.max_temperature_c,
    });

    await query(`
      INSERT INTO agent_smart_trends
        (agent_device_id, business_id, reallocated_sectors_current,
         failures_predicted_current, max_temperature_c,
         reallocated_growth_per_day, severity, sample_count, computed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
      ON CONFLICT (agent_device_id) DO UPDATE
        SET business_id                = EXCLUDED.business_id,
            reallocated_sectors_current = EXCLUDED.reallocated_sectors_current,
            failures_predicted_current = EXCLUDED.failures_predicted_current,
            max_temperature_c          = EXCLUDED.max_temperature_c,
            reallocated_growth_per_day = EXCLUDED.reallocated_growth_per_day,
            severity                   = EXCLUDED.severity,
            sample_count               = EXCLUDED.sample_count,
            computed_at                = now()
    `, [
      row.agent_device_id,
      row.business_id,
      row.reallocated_current,
      row.failures_current,
      row.max_temperature_c,
      growthPerDay,
      severity,
      row.sample_count,
    ]);
    upserted++;
  }
  return { upserted };
}

/**
 * Read latest SMART trend for one agent. Returns null if not computed.
 */
export async function getSmartTrend(agentDeviceId) {
  const { rows } = await query(`
    SELECT * FROM agent_smart_trends WHERE agent_device_id = $1
  `, [agentDeviceId]);
  return rows[0] || null;
}

function round4(n) { return Math.round(n * 10000) / 10000; }
