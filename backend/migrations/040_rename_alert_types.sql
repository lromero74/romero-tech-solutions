-- Migration 040: Rename Alert Types from Financial to Resource Monitoring Terms
-- Purpose: Update alert type terminology from trading terms to computer resource monitoring terms
-- Created: 2025-01-15

-- Drop old constraint first to allow updates
ALTER TABLE alert_configurations DROP CONSTRAINT IF EXISTS alert_configurations_alert_type_check;

-- Update alert_type values in existing configurations
UPDATE alert_configurations SET alert_type = 'high_utilization' WHERE alert_type = 'overbought';
UPDATE alert_configurations SET alert_type = 'low_utilization' WHERE alert_type = 'oversold';
UPDATE alert_configurations SET alert_type = 'rising_trend' WHERE alert_type = 'bullish';
UPDATE alert_configurations SET alert_type = 'declining_trend' WHERE alert_type = 'bearish';

-- Update alert names to reflect resource monitoring context
UPDATE alert_configurations SET alert_name = 'High Utilization Alert' WHERE alert_name = 'Overbought Confluence';
UPDATE alert_configurations SET alert_name = 'Low Utilization Alert' WHERE alert_name = 'Oversold Confluence';
UPDATE alert_configurations SET alert_name = 'Rising Trend Alert' WHERE alert_name = 'Bullish Momentum';
UPDATE alert_configurations SET alert_name = 'Declining Trend Alert' WHERE alert_name = 'Bearish Momentum';
UPDATE alert_configurations SET alert_name = 'Volatility Spike Alert' WHERE alert_name = 'Volatility Spike';

-- Update RSI threshold keys
UPDATE alert_configurations SET rsi_thresholds = jsonb_build_object(
  'low_moderate', (rsi_thresholds->>'oversold_moderate')::numeric,
  'low_extreme', (rsi_thresholds->>'oversold_extreme')::numeric,
  'high_moderate', (rsi_thresholds->>'overbought_moderate')::numeric,
  'high_extreme', (rsi_thresholds->>'overbought_extreme')::numeric,
  'enabled', COALESCE((rsi_thresholds->>'enabled')::boolean, true)
) WHERE rsi_thresholds ? 'overbought_moderate';

-- Update Stochastic threshold keys
UPDATE alert_configurations SET stochastic_thresholds = jsonb_build_object(
  'low_moderate', (stochastic_thresholds->>'oversold_moderate')::numeric,
  'low_extreme', (stochastic_thresholds->>'oversold_extreme')::numeric,
  'high_moderate', (stochastic_thresholds->>'overbought_moderate')::numeric,
  'high_extreme', (stochastic_thresholds->>'overbought_extreme')::numeric,
  'detect_crossovers', COALESCE((stochastic_thresholds->>'detect_crossovers')::boolean, true),
  'enabled', COALESCE((stochastic_thresholds->>'enabled')::boolean, true)
) WHERE stochastic_thresholds ? 'overbought_moderate';

-- Update Williams %R threshold keys
UPDATE alert_configurations SET williams_r_thresholds = jsonb_build_object(
  'low_moderate', (williams_r_thresholds->>'oversold_moderate')::numeric,
  'low_extreme', (williams_r_thresholds->>'oversold_extreme')::numeric,
  'high_moderate', (williams_r_thresholds->>'overbought_moderate')::numeric,
  'high_extreme', (williams_r_thresholds->>'overbought_extreme')::numeric,
  'enabled', COALESCE((williams_r_thresholds->>'enabled')::boolean, true)
) WHERE williams_r_thresholds ? 'overbought_moderate';

-- Add new constraint with updated alert types
ALTER TABLE alert_configurations ADD CONSTRAINT alert_configurations_alert_type_check
  CHECK (alert_type IN ('high_utilization', 'low_utilization', 'rising_trend', 'declining_trend', 'volatility_spike'));

-- Update alert_history table alert_type values if the table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'alert_history') THEN
    UPDATE alert_history SET alert_type = 'high_utilization' WHERE alert_type = 'overbought';
    UPDATE alert_history SET alert_type = 'low_utilization' WHERE alert_type = 'oversold';
    UPDATE alert_history SET alert_type = 'rising_trend' WHERE alert_type = 'bullish';
    UPDATE alert_history SET alert_type = 'declining_trend' WHERE alert_type = 'bearish';

    -- Update constraint on alert_history if it exists
    ALTER TABLE alert_history DROP CONSTRAINT IF EXISTS alert_history_alert_type_check;
    ALTER TABLE alert_history ADD CONSTRAINT alert_history_alert_type_check
      CHECK (alert_type IN ('high_utilization', 'low_utilization', 'rising_trend', 'declining_trend', 'volatility_spike'));
  END IF;
END $$;

-- Add comment
COMMENT ON TABLE alert_configurations IS 'Alert configurations using resource monitoring terminology (high/low utilization, rising/declining trends)';
