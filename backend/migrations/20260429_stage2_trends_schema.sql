-- =============================================================================
-- Migration: Stage 2 — Trend / forecast / anomaly schema
--
-- Adds four narrow time-series tables for Stage 2.1 (disk-space forecasting),
-- 2.2 (rolling baselines + sustained anomaly tracking) and 2.7 (WAN IP change
-- history). Permissions are seeded by the companion .js migration.
--
-- See docs/PRPs/STAGE2_TRENDS.md and docs/PRPs/RMM_GAP_CLOSURE_MASTER.md.
--
-- Companion code:
--   backend/services/diskForecastService.js
--   backend/services/anomalyDetectionService.js
--   backend/services/agentMonitoringService.js  (extended)
--   backend/middleware/agentAuthMiddleware.js   (WAN IP record-on-auth)
-- =============================================================================

BEGIN;

-- 1) Disk-space forecast — one row per device, upserted nightly.
--    growth_gb_per_day is the linear-regression slope over the last 30 days
--    of agent_metrics.disk_used_gb samples. days_until_full is computed
--    server-side as ((total - used) / growth) and stored alongside for
--    fast reads. forecast_full_at is the absolute timestamp of "the disk
--    will be full at this moment" — null when growth is non-positive
--    (disk is shrinking or steady) or capacity is unknown.
CREATE TABLE IF NOT EXISTS agent_disk_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  growth_gb_per_day NUMERIC(12, 4),
  days_until_full NUMERIC(10, 2),
  forecast_full_at TIMESTAMPTZ,
  current_used_gb NUMERIC(10, 2),
  current_total_gb NUMERIC(10, 2),
  current_percent NUMERIC(5, 2),
  sample_count INT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_disk_forecasts_unique UNIQUE (agent_device_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_disk_forecasts_business
  ON agent_disk_forecasts(business_id)
  WHERE business_id IS NOT NULL;

-- Index for the alert-firing query: "disks projected to fill within N days".
CREATE INDEX IF NOT EXISTS idx_agent_disk_forecasts_critical
  ON agent_disk_forecasts(forecast_full_at)
  WHERE forecast_full_at IS NOT NULL;

-- 2) Per-(device, metric) rolling baselines. Updated nightly. Six metric
--    types per device max → ~6× device count rows. Cheap to query.
CREATE TABLE IF NOT EXISTS agent_metric_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  metric_type VARCHAR(50) NOT NULL,
  mean NUMERIC(12, 4) NOT NULL,
  stddev NUMERIC(12, 4) NOT NULL,
  sample_count INT NOT NULL,
  window_days INT NOT NULL DEFAULT 7,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_metric_baselines_unique UNIQUE (agent_device_id, metric_type),
  CONSTRAINT agent_metric_baselines_metric_check
    CHECK (metric_type IN ('cpu_percent','memory_percent','disk_percent',
                           'load_average_1m','network_rx_bytes','network_tx_bytes'))
);

CREATE INDEX IF NOT EXISTS idx_agent_metric_baselines_lookup
  ON agent_metric_baselines(agent_device_id, metric_type);

-- 3) Per-(device, metric) anomaly state. Single row per (agent, metric) so
--    the metric ingest path can flag "this anomaly has been sustained for
--    N minutes" without scanning history. anomaly_started_at is null when
--    the metric is currently within tolerance.
CREATE TABLE IF NOT EXISTS agent_anomaly_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  metric_type VARCHAR(50) NOT NULL,
  anomaly_started_at TIMESTAMPTZ,        -- null when currently within tolerance
  last_value NUMERIC(12, 4),
  last_observed_at TIMESTAMPTZ,
  alert_fired_at TIMESTAMPTZ,            -- non-null after the 15-min sustained alert fired
  CONSTRAINT agent_anomaly_state_unique UNIQUE (agent_device_id, metric_type)
);

-- Index used to find anomalies that just crossed the 15-min sustained threshold.
CREATE INDEX IF NOT EXISTS idx_agent_anomaly_state_active
  ON agent_anomaly_state(anomaly_started_at)
  WHERE anomaly_started_at IS NOT NULL AND alert_fired_at IS NULL;

-- 4) WAN IP change history — append-only on detected change. Most rows
--    are sparse for stationary devices; nomadic laptops will accumulate
--    one row per network change.
CREATE TABLE IF NOT EXISTS agent_wan_ip_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  public_ip INET NOT NULL,
  previous_ip INET,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_wan_ip_history_device
  ON agent_wan_ip_history(agent_device_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_wan_ip_history_business
  ON agent_wan_ip_history(business_id, observed_at DESC)
  WHERE business_id IS NOT NULL;

COMMIT;
