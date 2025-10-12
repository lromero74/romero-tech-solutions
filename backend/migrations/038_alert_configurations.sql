-- Migration 038: Alert Configurations Table
-- Purpose: Store configurable alert rules for indicator confluence detection
-- Created: 2025-01-15

-- Create alert_configurations table
CREATE TABLE IF NOT EXISTS alert_configurations (
  id SERIAL PRIMARY KEY,

  -- Alert identification
  alert_name VARCHAR(100) NOT NULL,
  alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('overbought', 'oversold', 'bullish', 'bearish', 'volatility_spike')),
  enabled BOOLEAN DEFAULT true,

  -- Confluence settings
  min_indicator_count INTEGER DEFAULT 2 CHECK (min_indicator_count >= 1),
  require_extreme_for_single BOOLEAN DEFAULT true,

  -- Indicator-specific thresholds (JSON)
  rsi_thresholds JSONB DEFAULT '{
    "oversold_moderate": 30,
    "oversold_extreme": 20,
    "overbought_moderate": 70,
    "overbought_extreme": 80,
    "enabled": true
  }'::jsonb,

  stochastic_thresholds JSONB DEFAULT '{
    "oversold_moderate": 20,
    "oversold_extreme": 10,
    "overbought_moderate": 80,
    "overbought_extreme": 90,
    "detect_crossovers": true,
    "enabled": true
  }'::jsonb,

  williams_r_thresholds JSONB DEFAULT '{
    "oversold_moderate": -80,
    "oversold_extreme": -90,
    "overbought_moderate": -20,
    "overbought_extreme": -10,
    "enabled": true
  }'::jsonb,

  macd_settings JSONB DEFAULT '{
    "detect_crossovers": true,
    "momentum_threshold_multiplier": 0.5,
    "enabled": true
  }'::jsonb,

  roc_settings JSONB DEFAULT '{
    "extreme_multiplier": 2.0,
    "lookback_periods": 20,
    "enabled": true
  }'::jsonb,

  atr_settings JSONB DEFAULT '{
    "volatility_multiplier": 1.5,
    "lookback_periods": 20,
    "enabled": true
  }'::jsonb,

  -- Notification settings
  notify_email BOOLEAN DEFAULT false,
  notify_dashboard BOOLEAN DEFAULT true,
  notify_websocket BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES employees(id) ON DELETE SET NULL,

  -- Indexes
  CONSTRAINT unique_alert_name UNIQUE (alert_name)
);

CREATE INDEX idx_alert_configurations_type ON alert_configurations(alert_type);
CREATE INDEX idx_alert_configurations_enabled ON alert_configurations(enabled);

-- Insert default alert configurations
INSERT INTO alert_configurations (alert_name, alert_type, enabled) VALUES
  ('Overbought Confluence', 'overbought', true),
  ('Oversold Confluence', 'oversold', true),
  ('Bullish Momentum', 'bullish', true),
  ('Bearish Momentum', 'bearish', true),
  ('Volatility Spike', 'volatility_spike', true);

-- Add comment
COMMENT ON TABLE alert_configurations IS 'Configurable alert rules for indicator confluence detection';
COMMENT ON COLUMN alert_configurations.rsi_thresholds IS 'RSI indicator thresholds and settings (JSON)';
COMMENT ON COLUMN alert_configurations.stochastic_thresholds IS 'Stochastic oscillator thresholds and settings (JSON)';
COMMENT ON COLUMN alert_configurations.williams_r_thresholds IS 'Williams %R thresholds and settings (JSON)';
COMMENT ON COLUMN alert_configurations.macd_settings IS 'MACD indicator settings (JSON)';
COMMENT ON COLUMN alert_configurations.roc_settings IS 'Rate of Change indicator settings (JSON)';
COMMENT ON COLUMN alert_configurations.atr_settings IS 'Average True Range indicator settings (JSON)';
