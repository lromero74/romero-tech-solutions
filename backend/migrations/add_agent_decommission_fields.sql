-- Migration: Add decommission tracking fields to agent_devices table
-- Purpose: Track when agents are uninstalled and the reason
-- Date: 2025-10-10

-- Add decommissioned_at timestamp field
ALTER TABLE agent_devices
ADD COLUMN IF NOT EXISTS decommissioned_at TIMESTAMP DEFAULT NULL;

-- Add decommission_reason field
ALTER TABLE agent_devices
ADD COLUMN IF NOT EXISTS decommission_reason TEXT;

-- Add last_status_change timestamp field (useful for tracking when status changes occur)
ALTER TABLE agent_devices
ADD COLUMN IF NOT EXISTS last_status_change TIMESTAMP DEFAULT NULL;

-- Create index on decommissioned_at for efficient querying
CREATE INDEX IF NOT EXISTS idx_agent_devices_decommissioned_at
ON agent_devices(decommissioned_at)
WHERE decommissioned_at IS NOT NULL;

-- Create index on last_status_change
CREATE INDEX IF NOT EXISTS idx_agent_devices_last_status_change
ON agent_devices(last_status_change);

-- Add comment to columns
COMMENT ON COLUMN agent_devices.decommissioned_at IS 'Timestamp when agent was uninstalled/decommissioned';
COMMENT ON COLUMN agent_devices.decommission_reason IS 'Reason for decommissioning (e.g., user_uninstall, expired_subscription, system_failure)';
COMMENT ON COLUMN agent_devices.last_status_change IS 'Timestamp of the last status change';
