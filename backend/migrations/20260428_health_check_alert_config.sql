-- =============================================================================
-- Migration: Stage 1 — alert_configurations seed for 'health_check' alert_type
--
-- Problem: alert_configurations.alert_type has a CHECK constraint locking values
-- to the set {high_utilization, low_utilization, rising_trend, declining_trend,
-- volatility_spike}. Stage 1 health-checks fire as a new conceptual alert type;
-- without an alert_configurations row, alertNotificationService cannot reach
-- client subscribers (the LEFT JOIN to alert_configurations returns null on
-- client_visible/client_category, so _findClientSubscribers short-circuits).
--
-- This migration:
--   1. Drops the alert_type CHECK constraint and re-adds it with 'health_check'.
--   2. Seeds one alert_configurations row that the runtime
--      alertEscalationService.processHealthCheckResult() can attach
--      alert_history rows to.
--
-- Companion code:
--   backend/services/alertEscalationService.js processHealthCheckResult()
--   backend/routes/agents.js                  POST /:agent_id/check-result
--
-- See docs/PRPs/STAGE1_HEALTH_CHECKS.md.
-- =============================================================================

BEGIN;

ALTER TABLE alert_configurations
  DROP CONSTRAINT IF EXISTS alert_configurations_alert_type_check;

ALTER TABLE alert_configurations
  ADD CONSTRAINT alert_configurations_alert_type_check
  CHECK (alert_type::text = ANY (ARRAY[
    'high_utilization'::varchar::text,
    'low_utilization'::varchar::text,
    'rising_trend'::varchar::text,
    'declining_trend'::varchar::text,
    'volatility_spike'::varchar::text,
    'health_check'::varchar::text
  ]));

-- Seed the canonical Stage 1 alert config. notify_websocket=true (admins see
-- it live), notify_dashboard=true. notify_email defaults false — operators
-- explicitly opt-in via alert_subscribers (no surprise spam from the rollout).
-- client_visible=true with client_category='critical_issue' means clients on
-- the default alert_categories subscription DO receive health_check alerts.
INSERT INTO alert_configurations (
  alert_name,
  alert_type,
  enabled,
  min_indicator_count,
  require_extreme_for_single,
  notify_email,
  notify_dashboard,
  notify_websocket,
  client_visible,
  client_category,
  client_display_name_en,
  client_display_name_es,
  client_description_en,
  client_description_es
) VALUES (
  'Stage 1 Health Check',
  'health_check',
  true,
  1,
  false,
  false,
  true,
  true,
  true,
  'critical_issue',
  'Device Health Check',
  'Verificación de salud del dispositivo',
  'A periodic health check on your device flagged something worth a look.',
  'Una verificación periódica del estado de su dispositivo detectó algo a revisar.'
)
ON CONFLICT (alert_name) DO NOTHING;

COMMIT;
