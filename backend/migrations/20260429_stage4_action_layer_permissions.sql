-- =============================================================================
-- Migration: Stage 4 M1 — RBAC permissions seed
--
-- Adds the 4 net-new permission keys that don't already exist for the existing
-- automation/deployment infrastructure. After this migration the Stage 4
-- design is fully covered by:
--
--   Pre-existing (mig 053):
--     view.deployments.enable, manage.deployments.enable
--     view.software_packages.enable, manage.software_packages.enable
--     view.deployment_schedules.enable, manage.deployment_schedules.enable
--     view.automation_scripts.enable, manage.automation_scripts.enable
--     view.automation_policies.enable, manage.automation_policies.enable
--     view.policy_executions.enable
--
--   New here:
--     view.patch_approvals.enable    — see the human-in-the-loop approval queue
--     manage.patch_approvals.enable  — approve/defer/reject pending patches
--     sign.scripts.enable            — PGP-sign a script (gates is_builtin=true)
--     view.action_audit.enable       — read the hash-chained audit trail
--
-- Granting strategy follows mig 053:
--   * executive + admin: all 4 permissions granted
--   * manager:  view.* permissions only (read-only oversight)
--   * (sales, technician, customer roles get nothing — Stage 4 actions are
--     too high-blast-radius for those roles by default)
-- =============================================================================

BEGIN;

-- 1) Insert the new permission keys.
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('view.patch_approvals.enable',   'patch_approvals',  'view',   'View pending patch-approval queue',                 true),
  ('manage.patch_approvals.enable', 'patch_approvals',  'manage', 'Approve, defer, or reject pending patch approvals', true),
  ('sign.scripts.enable',           'automation_scripts', 'sign', 'PGP-sign automation scripts (gates is_builtin)',    true),
  ('view.action_audit.enable',      'agent_action_audit', 'view', 'View hash-chained Stage 4 action audit trail',      true)
ON CONFLICT (permission_key) DO NOTHING;

-- 2) Grant to roles.
DO $$
DECLARE
  admin_role_id     UUID;
  executive_role_id UUID;
  manager_role_id   UUID;
BEGIN
  SELECT id INTO admin_role_id     FROM roles WHERE name = 'admin';
  SELECT id INTO executive_role_id FROM roles WHERE name = 'executive';
  SELECT id INTO manager_role_id   FROM roles WHERE name = 'manager';

  -- Admin: all 4
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT admin_role_id, id, true
  FROM permissions
  WHERE permission_key IN (
    'view.patch_approvals.enable',
    'manage.patch_approvals.enable',
    'sign.scripts.enable',
    'view.action_audit.enable'
  )
  ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;

  -- Executive: all 4 (matches mig 053 pattern — executive gets everything
  -- explicitly, even though getUserPermissions has an executive shortcut,
  -- because _checkPermissionInDatabase does NOT have that shortcut)
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT executive_role_id, id, true
  FROM permissions
  WHERE permission_key IN (
    'view.patch_approvals.enable',
    'manage.patch_approvals.enable',
    'sign.scripts.enable',
    'view.action_audit.enable'
  )
  ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;

  -- Manager: read-only oversight
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT manager_role_id, id, true
  FROM permissions
  WHERE permission_key IN (
    'view.patch_approvals.enable',
    'view.action_audit.enable'
  )
  ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;
END $$;

COMMIT;
