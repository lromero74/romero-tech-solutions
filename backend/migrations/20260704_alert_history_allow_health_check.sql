-- Migration: allow 'health_check' in alert_history.alert_type
-- Created: 2026-07-04
--
-- Bug: alertEscalationService.processHealthCheckResult() inserts
-- alert_history rows with alert_type='health_check', but the
-- alert_history_alert_type_check constraint (from 040_rename_alert_types.sql)
-- only permits the technical-indicator types
-- {high_utilization, low_utilization, rising_trend, declining_trend,
-- volatility_spike}. Migration 20260428_health_check_alert_config.sql added
-- 'health_check' to the alert_CONFIGURATIONS constraint but overlooked the
-- alert_HISTORY constraint, so every Stage 1 health-check alert insert failed
-- with "new row for relation alert_history violates check constraint
-- alert_history_alert_type_check". This adds 'health_check' to the
-- alert_history constraint, parallel to what 20260428 did for
-- alert_configurations.
--
-- Idempotent: DROP IF EXISTS + ADD.

BEGIN;

ALTER TABLE alert_history
  DROP CONSTRAINT IF EXISTS alert_history_alert_type_check;

ALTER TABLE alert_history
  ADD CONSTRAINT alert_history_alert_type_check
  CHECK (alert_type::text = ANY (ARRAY[
    'high_utilization'::varchar::text,
    'low_utilization'::varchar::text,
    'rising_trend'::varchar::text,
    'declining_trend'::varchar::text,
    'volatility_spike'::varchar::text,
    'health_check'::varchar::text
  ]));

COMMIT;
