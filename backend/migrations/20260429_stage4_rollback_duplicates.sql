-- =============================================================================
-- Migration: Stage 4 M1 — roll back the duplicate tables from 20260429
--
-- Discovery (post-application of 20260429_stage4_action_layer_schema.sql)
-- showed that migrations 043 (policy_based_automation) and 044 (software_
-- deployment), shipped 2025-10-17, already provide:
--
--   * software_packages (catalog with checksums, signatures, install cmds, …)
--   * package_deployments (deployment jobs with scope, schedule, approval, rollback)
--   * deployment_schedules (maintenance windows: one_time/recurring, cron, exclude_dates)
--   * deployment_history (per-agent install results)
--   * automation_scripts (script library with type, OS support, timeout, exec stats)
--   * automation_policies (cron, trigger_events, retry, audit_logging)
--   * policy_assignments (with OS-compat dynamic expansion across business agents)
--   * policy_execution_history
--
-- …plus working routes (automation.js, deployment.js) and a cron scheduler
-- (policySchedulerService.js). Stage 4 M1 was duplicating all of that.
--
-- This rollback drops the 5 tables I added that duplicate existing ones, plus
-- the FK constraint patch_approvals → patch_deployments (since patch_deployments
-- is going away). KEPT:
--   * patch_approvals — genuinely new (per-device-per-patch approval queue;
--     existing flow has policy-level auto-approve but no human-in-the-loop inbox)
--   * agent_action_audit — genuinely new (hash-chained tamper-evident trail;
--     policy_execution_history is per-execution, not chained)
--   * patch_policies — was a no-op when created (existing 044 schema preserved)
--
-- Drop targets are EMPTY on prod (verified row counts = 0). Safe to drop.
-- =============================================================================

BEGIN;

-- Drop the FK that links patch_approvals.patch_deployment_id → patch_deployments
-- (we're dropping patch_deployments, but keeping patch_approvals).
ALTER TABLE patch_approvals
  DROP CONSTRAINT IF EXISTS patch_approvals_deployment_fkey;

-- Repurpose patch_approvals.patch_deployment_id → reference existing
-- package_deployments(id) instead, since that's the live deployment table.
ALTER TABLE patch_approvals
  DROP COLUMN IF EXISTS patch_deployment_id;

ALTER TABLE patch_approvals
  ADD COLUMN package_deployment_id UUID
    REFERENCES package_deployments(id) ON DELETE SET NULL;

-- Now drop the duplicate tables.
DROP TABLE IF EXISTS agent_software_installs;
DROP TABLE IF EXISTS agent_scripts;
DROP TABLE IF EXISTS software_catalog;
DROP TABLE IF EXISTS patch_deployments;
DROP TABLE IF EXISTS maintenance_windows;

COMMIT;
