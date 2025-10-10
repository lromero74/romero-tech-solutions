-- Migration 036: Add Package Manager Tracking
-- Phase 10: Track outdated packages from Homebrew, npm, and pip

-- Add package manager fields to agent_metrics table
ALTER TABLE agent_metrics
ADD COLUMN package_managers_outdated INTEGER DEFAULT 0,
ADD COLUMN homebrew_outdated INTEGER DEFAULT 0,
ADD COLUMN npm_outdated INTEGER DEFAULT 0,
ADD COLUMN pip_outdated INTEGER DEFAULT 0,
ADD COLUMN outdated_packages_data JSONB;

-- Create index for querying agents with outdated packages
CREATE INDEX idx_agent_metrics_outdated_packages
ON agent_metrics(agent_device_id, package_managers_outdated DESC)
WHERE package_managers_outdated > 0;

-- Create index for JSONB package data queries
CREATE INDEX idx_agent_metrics_outdated_packages_data
ON agent_metrics USING gin(outdated_packages_data);

-- Create view for package manager summary across all agents
CREATE OR REPLACE VIEW agent_package_manager_summary AS
SELECT
    ad.id as agent_device_id,
    ad.hostname,
    ad.os_type,
    am.package_managers_outdated as total_outdated,
    am.homebrew_outdated,
    am.npm_outdated,
    am.pip_outdated,
    am.outdated_packages_data,
    am.collected_at as last_check
FROM agent_devices ad
LEFT JOIN agent_metrics am ON ad.id = am.agent_device_id
WHERE ad.is_active = true
  AND am.package_managers_outdated > 0
ORDER BY am.package_managers_outdated DESC;

-- Add comments to new columns
COMMENT ON COLUMN agent_metrics.package_managers_outdated IS 'Total count of outdated packages across all package managers';
COMMENT ON COLUMN agent_metrics.homebrew_outdated IS 'Count of outdated Homebrew formulae and casks (macOS/Linux)';
COMMENT ON COLUMN agent_metrics.npm_outdated IS 'Count of outdated npm global packages';
COMMENT ON COLUMN agent_metrics.pip_outdated IS 'Count of outdated pip packages';
COMMENT ON COLUMN agent_metrics.outdated_packages_data IS 'Array of outdated package details: name, installed_version, latest_version, package_manager';
