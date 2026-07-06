-- Migration: allow health-check severities in alert_history.severity
-- Created: 2026-07-05
--
-- Bug: alertEscalationService.processHealthCheckResult() inserts alert_history
-- rows with severity in {'info','warning','critical'} (only 'warning'/'critical'
-- actually fire; 'info' is skipped). But alert_history_severity_check only
-- permitted the technical-indicator severities {'low','medium','high','critical'}.
-- So every Stage 1 health-check alert insert failed with "violates check
-- constraint alert_history_severity_check" — the SECOND stacked schema mismatch
-- behind the alert_type one (20260704_alert_history_allow_health_check.sql).
-- Postgres reports the first failing constraint, so this only surfaced once the
-- alert_type constraint was widened. This adds 'warning' and 'info' so the
-- health-check severity domain ({info,warning,critical}) is fully representable.
--
-- Idempotent: DROP IF EXISTS + ADD.

BEGIN;

ALTER TABLE alert_history
  DROP CONSTRAINT IF EXISTS alert_history_severity_check;

ALTER TABLE alert_history
  ADD CONSTRAINT alert_history_severity_check
  CHECK (severity::text = ANY (ARRAY[
    'low'::varchar::text,
    'medium'::varchar::text,
    'high'::varchar::text,
    'critical'::varchar::text,
    'warning'::varchar::text,
    'info'::varchar::text
  ]));

COMMIT;
