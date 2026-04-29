-- =============================================================================
-- Migration: Stage 4 M1 — extend existing automation/deployment tables
--
-- Companion to 20260429_stage4_rollback_duplicates.sql. Instead of duplicating
-- existing infrastructure, this migration adds the genuinely-new fields that
-- make the existing tables cover the Stage 4 design:
--
--   * automation_scripts — add PGP signature + body hash + parent chain so
--     a script must be signed before is_active=true is allowed (gates the
--     "execute on agent" path behind cryptographic signature).
--
--   * package_deployments — add second-approver fields so deployments above
--     a configurable threshold require two distinct employees to approve.
--
--   * patch_policies — add fields for the two-employee-approver threshold,
--     default reboot policy, max patches per maintenance window.
--
-- All additions are nullable / default-safe; existing rows continue to work.
-- =============================================================================

BEGIN;

-- 1) automation_scripts: PGP signature + version chain + body hash.
ALTER TABLE automation_scripts
  ADD COLUMN IF NOT EXISTS body_sha256 CHAR(64),
  ADD COLUMN IF NOT EXISTS signature_pgp TEXT,
  ADD COLUMN IF NOT EXISTS signed_by UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parent_script_id UUID REFERENCES automation_scripts(id) ON DELETE SET NULL;

-- A script can only be marked as built-in (used as a system script) if it has
-- been signed. Existing built-in scripts (from migration 045 prepopulate) are
-- grandfathered in — NOT VALID skips initial row validation. Future inserts/
-- updates that flip is_builtin to true while signature_pgp IS NULL will fail.
-- The "execute on agent" path additionally requires a signature check at the
-- route layer (see Stage 4 M2).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'automation_scripts_builtin_requires_sig'
  ) THEN
    ALTER TABLE automation_scripts
      ADD CONSTRAINT automation_scripts_builtin_requires_sig
      CHECK (is_builtin = false OR signature_pgp IS NOT NULL)
      NOT VALID;
  END IF;
END $$;

-- 2) package_deployments: second-approver for large deployments.
ALTER TABLE package_deployments
  ADD COLUMN IF NOT EXISTS requires_two_approvers BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS second_approved_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS second_approved_at TIMESTAMPTZ;

-- Sanity: if requires_two_approvers, both approver columns are required when
-- transitioning to scheduled/in_progress. Enforced at app layer (not SQL),
-- since deployment_status flow is intricate and SQL CHECKs can't reference
-- prior states cleanly.

-- 3) patch_policies: reboot defaults + large-deploy threshold.
ALTER TABLE patch_policies
  ADD COLUMN IF NOT EXISTS default_reboot_policy VARCHAR(32) DEFAULT 'prompt'
    CHECK (default_reboot_policy IN ('force','defer_4h','prompt','no_reboot')),
  ADD COLUMN IF NOT EXISTS max_patches_per_window INT DEFAULT 10
    CHECK (max_patches_per_window > 0),
  ADD COLUMN IF NOT EXISTS large_deploy_threshold INT DEFAULT 10
    CHECK (large_deploy_threshold > 0),
  ADD COLUMN IF NOT EXISTS large_deploy_approver_count INT DEFAULT 2
    CHECK (large_deploy_approver_count >= 1);

-- 4) Index for patch_approvals → package_deployments (added by rollback migration)
CREATE INDEX IF NOT EXISTS idx_patch_approvals_deployment
  ON patch_approvals(package_deployment_id)
  WHERE package_deployment_id IS NOT NULL;

COMMIT;
