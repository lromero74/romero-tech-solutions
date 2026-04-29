-- =============================================================================
-- Migration: Stage 4 M1 — Action Layer schema
--
-- Foundation tables for the patch deployment + scripts + software + WoL +
-- config-viewer effort. NO ROUTES OR UI in this milestone — just the data
-- model + audit trail. Stage 4 is gated by STAGE_4_ENABLED env var; without
-- it, no code paths touch these tables.
--
-- See docs/PRPs/STAGE4_ACTION_LAYER.md for the full design spec.
--
-- Companion code (M1):
--   backend/services/actionAuditService.js       — hash-chained audit writer
--   backend/middleware/stage4FeatureGate.js      — env-var route gate
--   backend/migrations/20260429_stage4_action_layer_permissions.js
--                                                 — 16 RBAC permission keys
-- =============================================================================

BEGIN;

-- 1) Patch approvals — one row per (device, patch) pending operator decision.
CREATE TABLE IF NOT EXISTS patch_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  patch_name VARCHAR(255) NOT NULL,
  patch_version VARCHAR(100),
  package_manager VARCHAR(50) NOT NULL,
  is_security_patch BOOLEAN DEFAULT false,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','deferred','rejected','expired')),
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  approval_notes TEXT,
  patch_deployment_id UUID,
  CONSTRAINT patch_approvals_unique UNIQUE (agent_device_id, patch_name, package_manager)
);

CREATE INDEX IF NOT EXISTS idx_patch_approvals_pending
  ON patch_approvals(business_id, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_patch_approvals_device
  ON patch_approvals(agent_device_id, status);

-- 2) Maintenance windows — Pacific wall-clock per the project DST rule.
CREATE TABLE IF NOT EXISTS maintenance_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  recurrence VARCHAR(20) NOT NULL CHECK (recurrence IN ('weekly','monthly','one_shot')),
  -- For weekly: bitmask Sunday=bit 0 ... Saturday=bit 6 (e.g., M-F = 0b0111110 = 62)
  -- For monthly: day-of-month integer 1-31
  -- For one_shot: NULL (date stored separately)
  day_spec INTEGER,
  start_local_time TIME NOT NULL,
  end_local_time TIME NOT NULL,
  one_shot_date DATE,
  device_group_id UUID,
  enabled BOOLEAN DEFAULT true,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT maintenance_windows_one_shot_check
    CHECK ((recurrence = 'one_shot' AND one_shot_date IS NOT NULL) OR
           (recurrence != 'one_shot' AND one_shot_date IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_maintenance_windows_business
  ON maintenance_windows(business_id, enabled)
  WHERE enabled = true;

-- 3) Patch deployments — materialized rows when a window approaches.
CREATE TABLE IF NOT EXISTS patch_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patch_approval_id UUID NOT NULL REFERENCES patch_approvals(id) ON DELETE CASCADE,
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  reboot_policy VARCHAR(32) NOT NULL DEFAULT 'prompt'
    CHECK (reboot_policy IN ('force','defer_4h','prompt','no_reboot')),
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','installing','installed','failed','reboot_pending','complete','aborted')),
  agent_command_id UUID,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_message TEXT,
  rollback_supported BOOLEAN DEFAULT false,
  rollback_command_id UUID
);

CREATE INDEX IF NOT EXISTS idx_patch_deployments_active
  ON patch_deployments(scheduled_for)
  WHERE status NOT IN ('complete','aborted','failed');

CREATE INDEX IF NOT EXISTS idx_patch_deployments_device
  ON patch_deployments(agent_device_id, status);

-- Now that patch_deployments exists, link the approval row's pointer.
ALTER TABLE patch_approvals
  ADD CONSTRAINT patch_approvals_deployment_fkey
  FOREIGN KEY (patch_deployment_id) REFERENCES patch_deployments(id) ON DELETE SET NULL;

-- 4) Per-business patch policies (defaults).
CREATE TABLE IF NOT EXISTS patch_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  auto_approve_security BOOLEAN DEFAULT false,
  default_reboot_policy VARCHAR(32) DEFAULT 'prompt'
    CHECK (default_reboot_policy IN ('force','defer_4h','prompt','no_reboot')),
  max_patches_per_window INT DEFAULT 10 CHECK (max_patches_per_window > 0),
  large_deploy_approver_count INT DEFAULT 2 CHECK (large_deploy_approver_count >= 1),
  large_deploy_threshold INT DEFAULT 10 CHECK (large_deploy_threshold > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5) Curated software catalog.
CREATE TABLE IF NOT EXISTS software_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  vendor VARCHAR(120),
  -- Per-OS package identifier — at least one must be set.
  winget_id VARCHAR(255),
  brew_formula VARCHAR(120),
  apt_package VARCHAR(120),
  dnf_package VARCHAR(120),
  pacman_package VARCHAR(120),
  parameters_schema JSONB,
  is_active BOOLEAN DEFAULT true,
  added_by UUID REFERENCES employees(id),
  added_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT software_catalog_at_least_one_pkg_id
    CHECK (winget_id IS NOT NULL OR brew_formula IS NOT NULL OR
           apt_package IS NOT NULL OR dnf_package IS NOT NULL OR
           pacman_package IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_software_catalog_active
  ON software_catalog(is_active, display_name)
  WHERE is_active = true;

-- 6) Per-device install history.
CREATE TABLE IF NOT EXISTS agent_software_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  software_catalog_id UUID REFERENCES software_catalog(id) ON DELETE SET NULL,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  installed_version VARCHAR(120),
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','installing','installed','failed','uninstalled')),
  agent_command_id UUID,
  triggered_by UUID REFERENCES employees(id),
  triggered_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  result_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_software_installs_device
  ON agent_software_installs(agent_device_id, status);

-- 7) Versioned scripting library — PGP-signed before execute-eligible.
CREATE TABLE IF NOT EXISTS agent_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  description TEXT,
  language VARCHAR(20) NOT NULL CHECK (language IN ('powershell','bash','python')),
  os_compat VARCHAR(50)[] NOT NULL,
  -- Versioning: each save is a new row, with parent_id → previous version.
  parent_id UUID REFERENCES agent_scripts(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  body TEXT NOT NULL,
  body_sha256 CHAR(64) NOT NULL,         -- precomputed for fast equality + audit
  signature_pgp TEXT,                    -- detached PGP sig over body
  signed_by UUID REFERENCES employees(id),
  signed_at TIMESTAMPTZ,
  parameters_schema JSONB,
  -- Triggers (multiple allowed per script):
  trigger_on_demand BOOLEAN DEFAULT true,
  trigger_schedule_cron VARCHAR(120),
  trigger_event VARCHAR(120),
  is_active BOOLEAN DEFAULT false,        -- requires signature_pgp NOT NULL
  default_timeout_seconds INT DEFAULT 300 CHECK (default_timeout_seconds BETWEEN 5 AND 7200),
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT agent_scripts_active_requires_sig
    CHECK (is_active = false OR (signature_pgp IS NOT NULL AND signed_by IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_agent_scripts_active
  ON agent_scripts(is_active, name)
  WHERE is_active = true;

-- 8) Append-only, hash-chained audit trail. EVERY Stage 4 state transition
--    writes here. row_hash is SHA-256 of (prev_hash + canonical-JSON of
--    {action_type, actor_employee_id, actor_business_id, agent_device_id,
--    payload, occurred_at}). Tampering is detectable: walk the chain and
--    recompute each row's hash; the first mismatch is the tamper site.
--
--    7-year retention (regulatory). Daily cleanup job will run at 04:00 UTC.
CREATE TABLE IF NOT EXISTS agent_action_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prev_hash CHAR(64),
  row_hash CHAR(64) NOT NULL,
  action_type VARCHAR(64) NOT NULL,
  actor_employee_id UUID REFERENCES employees(id),
  actor_business_id UUID REFERENCES businesses(id),
  agent_device_id UUID REFERENCES agent_devices(id),
  payload JSONB NOT NULL,
  source_ip INET,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_audit_chain
  ON agent_action_audit(occurred_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_action_audit_actor
  ON agent_action_audit(actor_employee_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_audit_device
  ON agent_action_audit(agent_device_id, occurred_at DESC)
  WHERE agent_device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_action_audit_action_type
  ON agent_action_audit(action_type, occurred_at DESC);

COMMIT;
