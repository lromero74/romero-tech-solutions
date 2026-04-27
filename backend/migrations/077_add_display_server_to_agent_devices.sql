-- Migration 077: Track Linux display-server type per agent device
--
-- Why: MeshCentral's KVM helper only works on X11. Wayland hosts get
-- a black session or "configure to use Xorg" error in the
-- Remote Control iframe. The dashboard needs to know each Linux
-- agent's display server up-front so it can either explain the
-- limitation (until v1.19's portal+PipeWire bridge ships) or, post
-- v1.19, route through the Wayland-native client instead of the
-- MeshCentral KVM iframe.
--
-- Columns are nullable so the agent's heartbeat can omit them on
-- non-Linux hosts and so older agents (pre-v1.18.6) don't break.

ALTER TABLE agent_devices
  ADD COLUMN IF NOT EXISTS display_server TEXT
    CHECK (display_server IS NULL OR display_server IN ('x11', 'wayland', 'headless', 'unknown')),
  ADD COLUMN IF NOT EXISTS xauth_status TEXT
    CHECK (xauth_status IS NULL OR xauth_status IN ('ok', 'missing', 'unknown')),
  ADD COLUMN IF NOT EXISTS compositor TEXT;

COMMENT ON COLUMN agent_devices.display_server IS
  'Linux graphical session type: x11 / wayland / headless / unknown. NULL on non-Linux. Used by dashboard Remote Control modal to surface Wayland limitation.';
COMMENT ON COLUMN agent_devices.xauth_status IS
  'On X11 hosts only: whether root can read the user X auth cookie. ok / missing / unknown. NULL on Wayland/macOS/Windows.';
COMMENT ON COLUMN agent_devices.compositor IS
  'On Wayland hosts only: canonical compositor name (gnome, kde-plasma, sway, hyprland, river, wayfire). NULL otherwise.';
