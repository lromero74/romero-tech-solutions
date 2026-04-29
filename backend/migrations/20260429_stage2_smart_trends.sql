-- =============================================================================
-- Migration: Stage 2.3 — SMART pre-fail trend
--
-- Adds agent_smart_trends, one row per agent, upserted nightly by
-- agentMonitoringService.computeNightlyTrends. The columns derive from
-- agent_metrics history (disk_reallocated_sectors_total, disk_failures_predicted,
-- disk_temperature_max) and surface "this disk is degrading" signals to the
-- dashboard before SMART hard-fails.
--
-- See docs/PRPs/STAGE2_TRENDS.md.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS agent_smart_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  -- Latest observed values from agent_metrics.
  reallocated_sectors_current INT,
  failures_predicted_current INT,
  max_temperature_c INT,
  -- Linear-regression slope of reallocated_sectors_total over the last 30 days,
  -- expressed per-day. Positive → disk is reallocating new sectors → failing.
  reallocated_growth_per_day NUMERIC(12, 4),
  -- Aggregated severity per-row so the dashboard doesn't have to reproduce
  -- the threshold rules. Computed by smartTrendService.severityFor().
  severity VARCHAR(16) NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','warning','critical')),
  -- Number of metric samples used in the regression.
  sample_count INT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_smart_trends_unique UNIQUE (agent_device_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_smart_trends_severity
  ON agent_smart_trends(severity)
  WHERE severity != 'info';

CREATE INDEX IF NOT EXISTS idx_agent_smart_trends_business
  ON agent_smart_trends(business_id)
  WHERE business_id IS NOT NULL;

COMMIT;
