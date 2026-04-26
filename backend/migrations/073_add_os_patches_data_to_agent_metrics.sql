-- Migration 073: agent_metrics.os_patches_data + distro_upgrade columns
--
-- The agent (v1.16.49+) reports a structured per-patch list in
-- addition to the raw counts: OSPatch{name, current_version,
-- available_version, security, source, package_manager}. The
-- dashboard's OS Patch Status panel renders this as a browsable table
-- with clickable version links and (where the package manager is
-- supported) Update buttons that route through update_packages.
--
-- distro_upgrade carries an optional banner-level signal — Ubuntu
-- 22.04 → 24.04, Fedora 41 → 42, etc. — surfaced separately because
-- the user-facing action (a release upgrade replacing thousands of
-- packages) is much weightier than per-package updates.

ALTER TABLE agent_metrics
ADD COLUMN IF NOT EXISTS os_patches_data JSONB,
ADD COLUMN IF NOT EXISTS distro_upgrade JSONB;

COMMENT ON COLUMN agent_metrics.os_patches_data IS
  'Structured list of OS-level updates: [{name, current_version, available_version, security, source, package_manager}]. Populated by the agent v1.16.49+. NULL means either the agent is older than v1.16.49 or no updates are pending.';

COMMENT ON COLUMN agent_metrics.distro_upgrade IS
  'Linux release upgrade descriptor: {current_release, available_release, upgrade_command, distro}. NULL when no major-version upgrade is pending or the OS does not expose a CLI upgrade path. macOS major-version upgrades surface separately via OS Patch list entries.';
