-- Migration 047: Time-Aggregated Alerting System
-- Purpose: Implement OHLC candle aggregation for metrics with configurable granularity
-- Created: 2025-10-19
-- Description: Allows users to balance alert sensitivity vs reliability by choosing
--              time aggregation levels (raw, 15min, 30min, 1hr, 4hr, 1day)

-- ==============================================================================
-- 1. Create agent_metrics_candles table for pre-aggregated OHLC data
-- ==============================================================================

CREATE TABLE IF NOT EXISTS agent_metrics_candles (
  id SERIAL PRIMARY KEY,

  -- Identification
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  aggregation_level VARCHAR(20) NOT NULL CHECK (aggregation_level IN ('15min', '30min', '1hour', '4hour', '1day')),

  -- Time window
  candle_start TIMESTAMP WITH TIME ZONE NOT NULL,
  candle_end TIMESTAMP WITH TIME ZONE NOT NULL,

  -- CPU OHLC (Open, High, Low, Close)
  cpu_open NUMERIC,
  cpu_high NUMERIC,
  cpu_low NUMERIC,
  cpu_close NUMERIC,

  -- Memory OHLC
  memory_open NUMERIC,
  memory_high NUMERIC,
  memory_low NUMERIC,
  memory_close NUMERIC,

  -- Disk OHLC
  disk_open NUMERIC,
  disk_high NUMERIC,
  disk_low NUMERIC,
  disk_close NUMERIC,

  -- Metadata
  data_points_count INTEGER NOT NULL, -- Number of raw points aggregated
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure uniqueness per agent, level, and time window
  CONSTRAINT unique_candle UNIQUE (agent_device_id, aggregation_level, candle_start)
);

-- Indexes for efficient querying
CREATE INDEX idx_candles_agent_level_time ON agent_metrics_candles(agent_device_id, aggregation_level, candle_start DESC);
CREATE INDEX idx_candles_time ON agent_metrics_candles(candle_start DESC);
CREATE INDEX idx_candles_level ON agent_metrics_candles(aggregation_level);

-- Comments
COMMENT ON TABLE agent_metrics_candles IS 'Time-aggregated OHLC candles from raw agent_metrics for smoother alerting';
COMMENT ON COLUMN agent_metrics_candles.aggregation_level IS 'Time window: 15min, 30min, 1hour, 4hour, 1day';
COMMENT ON COLUMN agent_metrics_candles.cpu_open IS 'First CPU value in time window';
COMMENT ON COLUMN agent_metrics_candles.cpu_high IS 'Maximum CPU value in time window';
COMMENT ON COLUMN agent_metrics_candles.cpu_low IS 'Minimum CPU value in time window';
COMMENT ON COLUMN agent_metrics_candles.cpu_close IS 'Last CPU value in time window';
COMMENT ON COLUMN agent_metrics_candles.data_points_count IS 'Number of raw agent_metrics points aggregated into this candle';

-- ==============================================================================
-- 2. Add aggregation level configuration fields
-- ==============================================================================

-- Add per-device alert aggregation level override
ALTER TABLE agent_devices
  ADD COLUMN IF NOT EXISTS alert_aggregation_level VARCHAR(20)
  CHECK (alert_aggregation_level IN ('raw', '15min', '30min', '1hour', '4hour', '1day'));

COMMENT ON COLUMN agent_devices.alert_aggregation_level IS
  'Device-specific alert time aggregation override (null = use user default). Trade-off: finer = more sensitive but more false alarms, coarser = fewer false alarms but slower notification';

-- Add default aggregation level for users (account-wide setting)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_alert_aggregation_level VARCHAR(20)
  DEFAULT 'raw'
  CHECK (default_alert_aggregation_level IN ('raw', '15min', '30min', '1hour', '4hour', '1day'));

COMMENT ON COLUMN users.default_alert_aggregation_level IS
  'Account-wide default alert time aggregation level. Devices without override use this setting. Default: raw (current behavior)';

-- Add per-alert configuration aggregation level (advanced feature)
ALTER TABLE alert_configurations
  ADD COLUMN IF NOT EXISTS aggregation_level VARCHAR(20)
  CHECK (aggregation_level IN ('raw', '15min', '30min', '1hour', '4hour', '1day'));

COMMENT ON COLUMN alert_configurations.aggregation_level IS
  'Optional per-alert aggregation override. Resolution order: alert config → device config → user default → raw';

-- ==============================================================================
-- 3. Create function to generate candles from raw metrics
-- ==============================================================================

CREATE OR REPLACE FUNCTION generate_metric_candles(
  p_agent_id UUID,
  p_aggregation_level VARCHAR(20),
  p_start_time TIMESTAMP WITH TIME ZONE,
  p_end_time TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE(
  candles_created INTEGER
) AS $$
DECLARE
  v_interval INTERVAL;
  v_window_start TIMESTAMP WITH TIME ZONE;
  v_window_end TIMESTAMP WITH TIME ZONE;
  v_candles_created INTEGER := 0;
BEGIN
  -- Determine interval size
  CASE p_aggregation_level
    WHEN '15min' THEN v_interval := INTERVAL '15 minutes';
    WHEN '30min' THEN v_interval := INTERVAL '30 minutes';
    WHEN '1hour' THEN v_interval := INTERVAL '1 hour';
    WHEN '4hour' THEN v_interval := INTERVAL '4 hours';
    WHEN '1day' THEN v_interval := INTERVAL '1 day';
    ELSE RAISE EXCEPTION 'Invalid aggregation level: %', p_aggregation_level;
  END CASE;

  -- Generate candles for each time window
  v_window_start := date_trunc('hour', p_start_time);

  WHILE v_window_start < p_end_time LOOP
    v_window_end := v_window_start + v_interval;

    -- Insert candle if we have data in this window
    INSERT INTO agent_metrics_candles (
      agent_device_id,
      aggregation_level,
      candle_start,
      candle_end,
      cpu_open,
      cpu_high,
      cpu_low,
      cpu_close,
      memory_open,
      memory_high,
      memory_low,
      memory_close,
      disk_open,
      disk_high,
      disk_low,
      disk_close,
      data_points_count
    )
    SELECT
      p_agent_id,
      p_aggregation_level,
      v_window_start,
      v_window_end,
      -- CPU OHLC
      (SELECT cpu_percent FROM agent_metrics
       WHERE agent_device_id = p_agent_id
         AND collected_at >= v_window_start
         AND collected_at < v_window_end
       ORDER BY collected_at ASC LIMIT 1) as cpu_open,
      MAX(cpu_percent) as cpu_high,
      MIN(cpu_percent) as cpu_low,
      (SELECT cpu_percent FROM agent_metrics
       WHERE agent_device_id = p_agent_id
         AND collected_at >= v_window_start
         AND collected_at < v_window_end
       ORDER BY collected_at DESC LIMIT 1) as cpu_close,
      -- Memory OHLC
      (SELECT memory_percent FROM agent_metrics
       WHERE agent_device_id = p_agent_id
         AND collected_at >= v_window_start
         AND collected_at < v_window_end
       ORDER BY collected_at ASC LIMIT 1) as memory_open,
      MAX(memory_percent) as memory_high,
      MIN(memory_percent) as memory_low,
      (SELECT memory_percent FROM agent_metrics
       WHERE agent_device_id = p_agent_id
         AND collected_at >= v_window_start
         AND collected_at < v_window_end
       ORDER BY collected_at DESC LIMIT 1) as memory_close,
      -- Disk OHLC
      (SELECT disk_percent FROM agent_metrics
       WHERE agent_device_id = p_agent_id
         AND collected_at >= v_window_start
         AND collected_at < v_window_end
       ORDER BY collected_at ASC LIMIT 1) as disk_open,
      MAX(disk_percent) as disk_high,
      MIN(disk_percent) as disk_low,
      (SELECT disk_percent FROM agent_metrics
       WHERE agent_device_id = p_agent_id
         AND collected_at >= v_window_start
         AND collected_at < v_window_end
       ORDER BY collected_at DESC LIMIT 1) as disk_close,
      COUNT(*) as data_points_count
    FROM agent_metrics
    WHERE agent_device_id = p_agent_id
      AND collected_at >= v_window_start
      AND collected_at < v_window_end
    HAVING COUNT(*) > 0
    ON CONFLICT (agent_device_id, aggregation_level, candle_start)
    DO UPDATE SET
      candle_end = EXCLUDED.candle_end,
      cpu_open = EXCLUDED.cpu_open,
      cpu_high = EXCLUDED.cpu_high,
      cpu_low = EXCLUDED.cpu_low,
      cpu_close = EXCLUDED.cpu_close,
      memory_open = EXCLUDED.memory_open,
      memory_high = EXCLUDED.memory_high,
      memory_low = EXCLUDED.memory_low,
      memory_close = EXCLUDED.memory_close,
      disk_open = EXCLUDED.disk_open,
      disk_high = EXCLUDED.disk_high,
      disk_low = EXCLUDED.disk_low,
      disk_close = EXCLUDED.disk_close,
      data_points_count = EXCLUDED.data_points_count;

    GET DIAGNOSTICS v_candles_created = ROW_COUNT;

    v_window_start := v_window_end;
  END LOOP;

  RETURN QUERY SELECT v_candles_created;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_metric_candles IS
  'Generate OHLC candles from raw agent_metrics for specified time range and aggregation level. Uses ON CONFLICT to update existing candles.';

-- ==============================================================================
-- 4. Create helper view for current aggregation settings
-- ==============================================================================

CREATE OR REPLACE VIEW agent_aggregation_settings AS
SELECT
  ad.id as agent_id,
  ad.hostname,
  ad.business_id,
  u.id as user_id,
  u.email as user_email,
  -- Resolved aggregation level (device override → user default → 'raw')
  COALESCE(ad.alert_aggregation_level, u.default_alert_aggregation_level, 'raw') as effective_aggregation_level,
  ad.alert_aggregation_level as device_override,
  u.default_alert_aggregation_level as user_default
FROM agent_devices ad
LEFT JOIN users u ON ad.business_id = u.business_id AND u.is_primary_contact = true
WHERE ad.is_active = true;

COMMENT ON VIEW agent_aggregation_settings IS
  'Shows effective alert aggregation level for each active agent (resolution: device → user → raw)';

-- ==============================================================================
-- 5. Create function to get latest candle or raw metric
-- ==============================================================================

CREATE OR REPLACE FUNCTION get_metric_for_aggregation(
  p_agent_id UUID,
  p_aggregation_level VARCHAR(20),
  p_metric_type VARCHAR(20), -- 'cpu', 'memory', 'disk'
  p_lookback_periods INTEGER DEFAULT 50
)
RETURNS TABLE(
  metric_value NUMERIC,
  metric_timestamp TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  IF p_aggregation_level = 'raw' THEN
    -- Return raw metrics
    RETURN QUERY
    SELECT
      CASE p_metric_type
        WHEN 'cpu' THEN cpu_percent
        WHEN 'memory' THEN memory_percent
        WHEN 'disk' THEN disk_percent
      END as metric_value,
      collected_at as metric_timestamp
    FROM agent_metrics
    WHERE agent_device_id = p_agent_id
    ORDER BY collected_at DESC
    LIMIT p_lookback_periods;
  ELSE
    -- Return candle close prices
    RETURN QUERY
    SELECT
      CASE p_metric_type
        WHEN 'cpu' THEN cpu_close
        WHEN 'memory' THEN memory_close
        WHEN 'disk' THEN disk_close
      END as metric_value,
      candle_start as metric_timestamp
    FROM agent_metrics_candles
    WHERE agent_device_id = p_agent_id
      AND aggregation_level = p_aggregation_level
    ORDER BY candle_start DESC
    LIMIT p_lookback_periods;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_metric_for_aggregation IS
  'Fetch metrics (raw or candle close prices) for specified aggregation level. Used by confluence detection service.';

-- ==============================================================================
-- 6. Initial data setup
-- ==============================================================================

-- Set default aggregation level to 'raw' for all existing users (preserve current behavior)
UPDATE users
SET default_alert_aggregation_level = 'raw'
WHERE default_alert_aggregation_level IS NULL;

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 047 completed successfully';
  RAISE NOTICE '- Created agent_metrics_candles table';
  RAISE NOTICE '- Added aggregation level configuration fields';
  RAISE NOTICE '- Created candle generation functions';
  RAISE NOTICE '- Created helper views';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Implement candleAggregationService.js';
  RAISE NOTICE '2. Update confluenceDetectionService.js';
  RAISE NOTICE '3. Create API routes for configuration';
  RAISE NOTICE '4. Build UI components for aggregation settings';
END $$;
