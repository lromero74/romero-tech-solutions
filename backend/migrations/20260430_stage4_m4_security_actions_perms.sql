-- =============================================================================
-- Migration: Stage 4 M4 — security action RBAC permission
--
-- Adds one new permission key (`manage.security_actions.enable`) for the
-- /api/agents/:id/security-action endpoint that issues install/uninstall
-- ClamAV, enable/disable native AV (Windows Defender), and enable/disable
-- the OS firewall via the existing agent_commands pipeline.
--
-- The same `view.security_status.enable` (used to render the security tab)
-- already exists; viewing remains separate from acting.
-- =============================================================================

BEGIN;

INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('manage.security_actions.enable', 'security_actions', 'manage',
   'Issue security-related agent actions (install/enable/disable AV + firewall)', true)
ON CONFLICT (permission_key) DO NOTHING;

DO $$
DECLARE
  admin_role_id     UUID;
  executive_role_id UUID;
BEGIN
  SELECT id INTO admin_role_id     FROM roles WHERE name = 'admin';
  SELECT id INTO executive_role_id FROM roles WHERE name = 'executive';

  -- Admin + executive only — security actions are write-class actions on
  -- customer endpoints. Manager / sales / technician can request but not
  -- self-approve until M5+ design is finalized.
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT admin_role_id, id, true
  FROM permissions WHERE permission_key = 'manage.security_actions.enable'
  ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;

  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT executive_role_id, id, true
  FROM permissions WHERE permission_key = 'manage.security_actions.enable'
  ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;
END $$;

COMMIT;
