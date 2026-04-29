-- =============================================================================
-- Migration: Stage 1 — agent_check_results + agent_check_history tables
--
-- Generic latest-state storage for agent-reported health checks (pending-reboot,
-- time-drift, crashdumps, top-processes, listening-ports, update-history,
-- domain-status, mapped-drives). One row per (agent_device_id, check_type)
-- in agent_check_results, upserted on each report. Append-only history in
-- agent_check_history, written only when payload changes (so it stays bounded
-- by churn rate, not by reporting frequency).
--
-- Companion code:
--   backend/routes/agents.js                  POST /:agent_id/check-result
--                                             GET  /:agent_id/health-checks
--                                             GET  /:agent_id/health-checks/:check_type/history
--   backend/routes/client/agents.js           GET  /agents/:agent_id/transparency-report
--   backend/services/alertEscalationService.js processCheckResult()
--   backend/services/freetierGate.js          isCheckAllowedForBusiness()
--   src/components/admin/agent-details/HealthChecksTab.tsx
--   internal/<rebootpending|timedrift|crashdumps|topprocesses|listeningports|
--            updatehistory|domainstatus|mappeddrives>/ in rts-monitoring-agent
--
-- See docs/PRPs/STAGE1_HEALTH_CHECKS.md and docs/PRPs/RMM_GAP_CLOSURE_MASTER.md.
--
-- Permission keys + role grants are seeded by the companion .js migration
-- 20260428_stage1_health_check_permissions.js (run separately, idempotent).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS agent_check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  -- Nullable to mirror agent_devices.business_id (trial agents have no business
  -- until conversion). Tenant-isolation queries must treat NULL as "no business
  -- match" — never as a wildcard.
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  check_type VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','warning','critical')),
  passed BOOLEAN NOT NULL DEFAULT true,
  payload JSONB NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_check_results_unique UNIQUE (agent_device_id, check_type)
);

CREATE INDEX IF NOT EXISTS idx_agent_check_results_business
  ON agent_check_results(business_id, check_type)
  WHERE business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_check_results_severity
  ON agent_check_results(severity, reported_at DESC)
  WHERE severity != 'info';

CREATE INDEX IF NOT EXISTS idx_agent_check_results_reported
  ON agent_check_results(reported_at DESC);

CREATE TABLE IF NOT EXISTS agent_check_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  check_type VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  passed BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_check_history_lookup
  ON agent_check_history(agent_device_id, check_type, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_check_history_retention
  ON agent_check_history(collected_at);

COMMIT;
