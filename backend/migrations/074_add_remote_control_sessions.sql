-- Migration 074: remote_control_sessions audit table + permission
--
-- Pairs with the MeshCentral remote-control feature (PRP
-- 2026.04.26.02-remote-control-meshcentral-PRP.md, Phase 2 §16.1).
--
-- The table is the authoritative audit record for who connected to
-- which device and when. Append-only by design — no DELETE
-- permission for any role. Disconnect reasons distinguish
-- user-driven, admin-forced, timeout, and agent-died endings so the
-- compliance log shows intent.
--
-- The permission `manage.remote_control.enable` follows the
-- existing <verb>.<resource>.enable naming convention from
-- migration 053 (NOT the placeholder `agent:remote_control` from
-- the PRP — convention wins).

-- =====================================================================
-- PART 1: remote_control_sessions audit table
-- =====================================================================

CREATE TABLE IF NOT EXISTS remote_control_sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_device_id    UUID NOT NULL REFERENCES agent_devices(id),
    initiated_by_user  UUID NOT NULL REFERENCES users(id),
    started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at           TIMESTAMPTZ,
    relay_used         TEXT,                  -- 'p2p' or relay-host string from MeshCentral session metadata
    technician_ip      INET,
    disconnect_reason  TEXT,                  -- 'user_disconnect','timeout','admin_force','agent_died','session_cap'
    duration_seconds   INTEGER,
    meshcentral_session_id TEXT,              -- the session ID from MeshCentral, for cross-referencing its logs
    metadata           JSONB                  -- forward-compatible bag for future fields
);

CREATE INDEX IF NOT EXISTS idx_rcs_agent_started ON remote_control_sessions(agent_device_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_rcs_user_started  ON remote_control_sessions(initiated_by_user, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_rcs_ended         ON remote_control_sessions(ended_at) WHERE ended_at IS NULL;  -- partial index for "active sessions" lookup

COMMENT ON TABLE remote_control_sessions IS
  'Audit record of MeshCentral-driven remote-control sessions initiated from the dashboard. Append-only — no DELETE permission for any role.';
COMMENT ON COLUMN remote_control_sessions.disconnect_reason IS
  'How the session ended: user_disconnect (technician closed) | timeout (idle) | admin_force (admin force-end) | agent_died (host disconnected) | session_cap (4h max hit)';
COMMENT ON COLUMN remote_control_sessions.meshcentral_session_id IS
  'Cross-reference to the MeshCentral-side session id so admins can correlate audit rows with mesh server logs.';

-- =====================================================================
-- PART 2: Permission
-- =====================================================================

INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('manage.remote_control.enable', 'remote_control', 'manage', 'Initiate and manage remote-control sessions to agent hosts (full screen control + lock-screen access)', true)
ON CONFLICT (permission_key) DO NOTHING;

-- =====================================================================
-- PART 3: Grant the permission to admin + executive roles
-- =====================================================================

-- Following migration 053's pattern: admins and executives get full,
-- managers do not (this is a high-privilege capability — equivalent
-- to "give me physical-console access to the customer's laptop").
DO $$
DECLARE
  admin_role_id     UUID;
  executive_role_id UUID;
BEGIN
  SELECT id INTO admin_role_id     FROM roles WHERE name = 'admin';
  SELECT id INTO executive_role_id FROM roles WHERE name = 'executive';

  IF admin_role_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id, is_granted)
    SELECT admin_role_id, id, true
    FROM permissions WHERE permission_key = 'manage.remote_control.enable'
    ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;
  END IF;

  IF executive_role_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id, is_granted)
    SELECT executive_role_id, id, true
    FROM permissions WHERE permission_key = 'manage.remote_control.enable'
    ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;
  END IF;
END $$;
