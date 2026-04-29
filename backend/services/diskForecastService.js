/**
 * Disk-space forecast service (Stage 2.1).
 *
 * Computes per-device disk-usage trends from agent_metrics.disk_used_gb
 * and writes the result to agent_disk_forecasts. Designed for nightly
 * invocation by agentMonitoringService.computeNightlyTrends().
 *
 * The math: Postgres' `regr_slope(y, x)` returns the slope of a least-
 * squares linear regression where y is the dependent variable
 * (disk_used_gb) and x is the independent (epoch seconds). We convert
 * the resulting GB-per-second into GB-per-day for human-readable
 * storage. days_until_full = (total - used) / growth, only when growth
 * is positive.
 *
 * See docs/PRPs/STAGE2_TRENDS.md.
 */
import { query } from '../config/database.js';

// Minimum number of metric samples required to produce a forecast.
// A device that just enrolled and only has a handful of samples
// would otherwise produce nonsense (huge slope from noise).
export const MIN_SAMPLES_FOR_FORECAST = 24;

// Window of historical metrics to regress over. 30 days matches the
// PRP and is short enough that recent trend changes (e.g., "last
// week we started accumulating logs") show up in the slope.
export const FORECAST_WINDOW_DAYS = 30;

/**
 * Pure decision function — given a slope (GB/sec), current usage, and
 * total capacity, return the human-friendly forecast row fields.
 *
 * Exported so unit tests can pin the math without needing a DB.
 *
 * @param {number} slopeGBPerSecond  regr_slope output
 * @param {number|null} currentUsedGb
 * @param {number|null} currentTotalGb
 * @returns {{growth_gb_per_day: number|null, days_until_full: number|null, forecast_full_at: Date|null}}
 */
export function computeForecast(slopeGBPerSecond, currentUsedGb, currentTotalGb) {
  if (slopeGBPerSecond === null || slopeGBPerSecond === undefined || Number.isNaN(slopeGBPerSecond)) {
    return { growth_gb_per_day: null, days_until_full: null, forecast_full_at: null };
  }
  const growthPerDay = slopeGBPerSecond * 86400;

  // Non-positive slope → don't project a fill date; the disk is steady or shrinking.
  if (growthPerDay <= 0) {
    return { growth_gb_per_day: round4(growthPerDay), days_until_full: null, forecast_full_at: null };
  }

  // Capacity unknown → growth is informational only.
  if (currentUsedGb === null || currentUsedGb === undefined ||
      currentTotalGb === null || currentTotalGb === undefined) {
    return { growth_gb_per_day: round4(growthPerDay), days_until_full: null, forecast_full_at: null };
  }

  const remainingGb = Number(currentTotalGb) - Number(currentUsedGb);
  if (remainingGb <= 0) {
    // Already full (or over-reported). Report 0 days.
    return {
      growth_gb_per_day: round4(growthPerDay),
      days_until_full: 0,
      forecast_full_at: new Date(),
    };
  }

  const daysUntilFull = remainingGb / growthPerDay;
  const forecastAt = new Date(Date.now() + daysUntilFull * 86400 * 1000);

  return {
    growth_gb_per_day: round4(growthPerDay),
    days_until_full: round2(daysUntilFull),
    forecast_full_at: forecastAt,
  };
}

/**
 * Severity helper: which alert (if any) should fire for a given forecast.
 *
 * Boundaries match the PRP:
 *   - days_until_full < 14 → 'critical'
 *   - days_until_full < 30 → 'warning'
 *   - else (or null) → null (no alert)
 */
export function forecastSeverity(daysUntilFull) {
  if (daysUntilFull === null || daysUntilFull === undefined) return null;
  const d = Number(daysUntilFull);
  if (Number.isNaN(d)) return null;
  if (d < 14) return 'critical';
  if (d < 30) return 'warning';
  return null;
}

function round4(n) { return Math.round(n * 10000) / 10000; }
function round2(n) { return Math.round(n * 100) / 100; }

/**
 * Compute and upsert disk forecasts for ALL agents that have enough
 * recent metric samples. Returns counts for logging.
 *
 * Called by agentMonitoringService.computeNightlyTrends().
 */
export async function recomputeAllForecasts() {
  // Single SQL query — much faster than per-device round-trips. Postgres
  // does the regression in-database; we read back one row per agent.
  const sql = `
    WITH samples AS (
      SELECT
        am.agent_device_id,
        am.disk_used_gb,
        EXTRACT(EPOCH FROM am.collected_at) AS epoch_seconds,
        am.collected_at
      FROM agent_metrics am
      WHERE am.collected_at >= now() - INTERVAL '${FORECAST_WINDOW_DAYS} days'
        AND am.disk_used_gb IS NOT NULL
    ),
    latest AS (
      SELECT DISTINCT ON (agent_device_id)
        agent_device_id, disk_used_gb, collected_at
      FROM samples
      ORDER BY agent_device_id, collected_at DESC
    ),
    capacity AS (
      SELECT id AS agent_device_id, business_id, total_disk_gb
      FROM agent_devices
    )
    SELECT
      s.agent_device_id,
      c.business_id,
      regr_slope(s.disk_used_gb, s.epoch_seconds) AS slope_gb_per_sec,
      l.disk_used_gb AS current_used_gb,
      c.total_disk_gb AS current_total_gb,
      CASE WHEN c.total_disk_gb IS NULL OR c.total_disk_gb = 0 THEN NULL
           ELSE round((l.disk_used_gb / c.total_disk_gb * 100)::numeric, 2) END AS current_percent,
      count(*) AS sample_count
    FROM samples s
    JOIN latest l USING (agent_device_id)
    JOIN capacity c USING (agent_device_id)
    GROUP BY s.agent_device_id, c.business_id, l.disk_used_gb, c.total_disk_gb
    HAVING count(*) >= $1
  `;

  const result = await query(sql, [MIN_SAMPLES_FOR_FORECAST]);
  let upserted = 0;
  for (const row of result.rows) {
    const forecast = computeForecast(
      Number(row.slope_gb_per_sec),
      row.current_used_gb,
      row.current_total_gb
    );

    await query(`
      INSERT INTO agent_disk_forecasts
        (agent_device_id, business_id, growth_gb_per_day, days_until_full, forecast_full_at,
         current_used_gb, current_total_gb, current_percent, sample_count, computed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
      ON CONFLICT (agent_device_id) DO UPDATE
        SET business_id       = EXCLUDED.business_id,
            growth_gb_per_day = EXCLUDED.growth_gb_per_day,
            days_until_full   = EXCLUDED.days_until_full,
            forecast_full_at  = EXCLUDED.forecast_full_at,
            current_used_gb   = EXCLUDED.current_used_gb,
            current_total_gb  = EXCLUDED.current_total_gb,
            current_percent   = EXCLUDED.current_percent,
            sample_count      = EXCLUDED.sample_count,
            computed_at       = now()
    `, [
      row.agent_device_id,
      row.business_id,
      forecast.growth_gb_per_day,
      forecast.days_until_full,
      forecast.forecast_full_at,
      row.current_used_gb,
      row.current_total_gb,
      row.current_percent,
      row.sample_count,
    ]);
    upserted++;
  }
  return { computed: result.rows.length, upserted };
}

/**
 * Read latest forecast for one agent. Returns null if no forecast yet.
 */
export async function getLatestForecast(agentDeviceId) {
  const { rows } = await query(`
    SELECT * FROM agent_disk_forecasts WHERE agent_device_id = $1
  `, [agentDeviceId]);
  return rows[0] || null;
}

/**
 * Read sparkline data — last N days of disk_used_gb samples for the
 * Trends-tab chart. Down-samples server-side so the client doesn't
 * receive 30 days × 1440 samples = 43k points.
 */
export async function getDiskHistory(agentDeviceId, days = FORECAST_WINDOW_DAYS) {
  const safeDays = Math.min(Math.max(parseInt(days, 10) || FORECAST_WINDOW_DAYS, 1), 90);
  // Bucket to one sample per hour (max 24 × 90 = 2160 points).
  const { rows } = await query(`
    SELECT date_trunc('hour', collected_at) AS bucket,
           avg(disk_used_gb) AS used_gb,
           avg(disk_percent) AS percent
      FROM agent_metrics
     WHERE agent_device_id = $1
       AND collected_at >= now() - ($2::int || ' days')::interval
       AND disk_used_gb IS NOT NULL
     GROUP BY bucket
     ORDER BY bucket
  `, [agentDeviceId, safeDays]);
  return rows;
}
