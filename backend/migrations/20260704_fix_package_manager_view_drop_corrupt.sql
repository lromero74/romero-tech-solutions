-- Migration: repoint agent_package_manager_summary at the live agent_metrics
-- table and drop the quarantined, disk-corrupt agent_metrics_corrupted copy.
-- Created: 2026-07-04
--
-- Background: agent_metrics_corrupted has unreadable disk blocks on fedora
-- (pg_dump: "could not read block ... Input/output error"). The live table
-- is agent_metrics (healthy). The agent_package_manager_summary view (from
-- migration 036_add_package_manager_tracking.sql) was defined against the
-- CORRUPT copy -- almost certainly a rename mistake during quarantine. This
-- repoints the view at the live table (identical semantics, only the table
-- name changes) and drops the corrupt copy, so a clean pg_dump is possible
-- (prerequisite for the Lightsail migration -- docs/PRPs/MIGRATE_TO_LIGHTSAIL.md).
--
-- No incoming FKs reference agent_metrics_corrupted; the view is its only
-- live dependency. Idempotent: CREATE OR REPLACE + DROP TABLE IF EXISTS.

CREATE OR REPLACE VIEW agent_package_manager_summary AS
 SELECT ad.id AS agent_device_id,
    ad.hostname,
    ad.os_type,
    am.package_managers_outdated AS total_outdated,
    am.homebrew_outdated,
    am.npm_outdated,
    am.pip_outdated,
    am.outdated_packages_data,
    am.collected_at AS last_check
   FROM agent_devices ad
     LEFT JOIN agent_metrics am ON ad.id = am.agent_device_id
  WHERE ad.is_active = true AND am.package_managers_outdated > 0
  ORDER BY am.package_managers_outdated DESC;

DROP TABLE IF EXISTS agent_metrics_corrupted;
