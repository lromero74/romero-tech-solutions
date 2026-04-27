-- Migration 076: agent_devices.remote_control_enabled — per-host
-- toggle, surfaced in the dashboard so the Remote Control button
-- can be greyed out when the end-user has opted out of remote
-- control on this device.
--
-- True by default for all NEW columns and NEW agents — remote
-- control is a table-stakes RMM feature, customers opted in by
-- installing the agent. The end-user can flip this OFF via the
-- agent's tray menu (which writes the config + the daemon's
-- next heartbeat propagates the new state).
--
-- BACKFILL existing rows to true so the dashboard's gray-out
-- doesn't accidentally hide the button on currently-active
-- hosts that just upgraded to v1.18.1+ — they default to ON
-- the same as fresh installs.
--
-- Free-tier business hosts ignore this entirely; the agent's
-- supervisor refuses to enable when subscription.tier='free'.

ALTER TABLE agent_devices
  ADD COLUMN IF NOT EXISTS remote_control_enabled BOOLEAN NOT NULL DEFAULT true;

-- Backfill is implicit via the DEFAULT — but make it explicit so
-- a re-run doesn't surprise anyone.
UPDATE agent_devices
   SET remote_control_enabled = true
 WHERE remote_control_enabled IS NULL;

COMMENT ON COLUMN agent_devices.remote_control_enabled IS
  'End-user toggle for per-host MeshCentral remote control (set via the agent tray menu). When false, the dashboard greys out the Remote Control button. Heartbeat-COALESCEd from the agent. Free-tier business hosts: agent-side supervisor refuses regardless of this flag.';
