-- Migration: Add trial_access_code column for passwordless trial dashboard access
-- Date: 2025-10-18
-- Purpose: Store access code for trial users to view their dashboard without login

-- Add trial_access_code column to agent_devices
ALTER TABLE agent_devices
ADD COLUMN IF NOT EXISTS trial_access_code VARCHAR(10);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_agent_devices_trial_access_code
ON agent_devices(trial_access_code)
WHERE is_trial = true AND trial_access_code IS NOT NULL;

-- Add comment
COMMENT ON COLUMN agent_devices.trial_access_code IS 'Access code for trial users to view dashboard without authentication (6-digit code)';
