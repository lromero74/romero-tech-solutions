-- Migration 039: Alert History Table
-- Purpose: Track triggered alerts and their lifecycle
-- Created: 2025-01-15

-- Create alert_history table
CREATE TABLE IF NOT EXISTS alert_history (
  id SERIAL PRIMARY KEY,

  -- Alert details
  alert_config_id INTEGER REFERENCES alert_configurations(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES agent_devices(id) ON DELETE CASCADE,
  metric_type VARCHAR(50) NOT NULL, -- 'cpu', 'memory', 'disk', 'network'

  -- Detection details
  alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('overbought', 'oversold', 'bullish', 'bearish', 'volatility_spike')),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  indicator_count INTEGER NOT NULL CHECK (indicator_count >= 1),
  indicators_triggered JSONB NOT NULL, -- Array of {indicator, value, threshold, description}

  -- Alert state
  triggered_at TIMESTAMP DEFAULT NOW(),
  acknowledged_at TIMESTAMP,
  acknowledged_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  resolved_at TIMESTAMP,
  resolved_by UUID REFERENCES employees(id) ON DELETE SET NULL,

  -- Additional context
  metric_value NUMERIC,
  alert_title TEXT NOT NULL,
  alert_description TEXT NOT NULL,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_alert_history_agent_metric ON alert_history(agent_id, metric_type);
CREATE INDEX idx_alert_history_triggered_at ON alert_history(triggered_at DESC);
CREATE INDEX idx_alert_history_severity ON alert_history(severity);
CREATE INDEX idx_alert_history_type ON alert_history(alert_type);
CREATE INDEX idx_alert_history_acknowledged ON alert_history(acknowledged_at) WHERE acknowledged_at IS NULL;
CREATE INDEX idx_alert_history_resolved ON alert_history(resolved_at) WHERE resolved_at IS NULL;

-- Add comments
COMMENT ON TABLE alert_history IS 'Historical record of triggered indicator confluence alerts';
COMMENT ON COLUMN alert_history.indicators_triggered IS 'Array of indicator signals that triggered the alert (JSON)';
COMMENT ON COLUMN alert_history.acknowledged_at IS 'When an admin acknowledged seeing the alert';
COMMENT ON COLUMN alert_history.resolved_at IS 'When the alert condition was resolved';

-- Create view for active (unresolved) alerts
CREATE OR REPLACE VIEW active_alerts AS
SELECT
  ah.*,
  a.hostname as agent_hostname,
  a.os_type as agent_os,
  ac.alert_name as config_name
FROM alert_history ah
LEFT JOIN agent_devices a ON ah.agent_id = a.id
LEFT JOIN alert_configurations ac ON ah.alert_config_id = ac.id
WHERE ah.resolved_at IS NULL
ORDER BY ah.triggered_at DESC;

COMMENT ON VIEW active_alerts IS 'Currently active (unresolved) alerts with agent context';
