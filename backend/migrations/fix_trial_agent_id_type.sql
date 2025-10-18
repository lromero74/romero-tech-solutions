-- Migration: Fix Trial Agent ID Type
-- Purpose: Change agent_devices.id from UUID to VARCHAR to support trial IDs like "trial-{timestamp}"
-- Date: 2025-10-18

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Change agent_devices.id from UUID to VARCHAR(255)
-- ═══════════════════════════════════════════════════════════════════════════

-- Step 1: Drop foreign key constraints referencing agent_devices.id
ALTER TABLE agent_metrics DROP CONSTRAINT IF EXISTS agent_metrics_agent_device_id_fkey;
ALTER TABLE agent_alerts DROP CONSTRAINT IF EXISTS agent_alerts_agent_device_id_fkey;
ALTER TABLE agent_event_logs DROP CONSTRAINT IF EXISTS agent_event_logs_agent_device_id_fkey;
ALTER TABLE agent_commands DROP CONSTRAINT IF EXISTS agent_commands_agent_device_id_fkey;
ALTER TABLE agent_software_inventory DROP CONSTRAINT IF EXISTS agent_software_inventory_agent_device_id_fkey;
ALTER TABLE agent_monitored_services DROP CONSTRAINT IF EXISTS agent_monitored_services_agent_device_id_fkey;
ALTER TABLE agent_devices DROP CONSTRAINT IF EXISTS agent_devices_trial_converted_to_agent_id_fkey;
ALTER TABLE policy_assignments DROP CONSTRAINT IF EXISTS policy_assignments_agent_device_id_fkey;
ALTER TABLE alert_history DROP CONSTRAINT IF EXISTS alert_history_agent_device_id_fkey;
ALTER TABLE agent_alert_history DROP CONSTRAINT IF EXISTS agent_alert_history_agent_device_id_fkey;

-- Step 2: Change column types to VARCHAR(255)
ALTER TABLE agent_devices ALTER COLUMN id TYPE VARCHAR(255) USING id::TEXT;
ALTER TABLE agent_devices ALTER COLUMN trial_converted_to_agent_id TYPE VARCHAR(255) USING trial_converted_to_agent_id::TEXT;

-- Step 3: Change foreign key columns to VARCHAR(255)
ALTER TABLE agent_metrics ALTER COLUMN agent_device_id TYPE VARCHAR(255) USING agent_device_id::TEXT;
ALTER TABLE agent_alerts ALTER COLUMN agent_device_id TYPE VARCHAR(255) USING agent_device_id::TEXT;
ALTER TABLE agent_event_logs ALTER COLUMN agent_device_id TYPE VARCHAR(255) USING agent_device_id::TEXT;
ALTER TABLE agent_commands ALTER COLUMN agent_device_id TYPE VARCHAR(255) USING agent_device_id::TEXT;
ALTER TABLE agent_software_inventory ALTER COLUMN agent_device_id TYPE VARCHAR(255) USING agent_device_id::TEXT;
ALTER TABLE agent_monitored_services ALTER COLUMN agent_device_id TYPE VARCHAR(255) USING agent_device_id::TEXT;
ALTER TABLE policy_assignments ALTER COLUMN agent_device_id TYPE VARCHAR(255) USING agent_device_id::TEXT;
ALTER TABLE alert_history ALTER COLUMN agent_device_id TYPE VARCHAR(255) USING agent_device_id::TEXT;
ALTER TABLE agent_alert_history ALTER COLUMN agent_device_id TYPE VARCHAR(255) USING agent_device_id::TEXT;

-- Step 4: Recreate foreign key constraints
ALTER TABLE agent_metrics
ADD CONSTRAINT agent_metrics_agent_device_id_fkey
FOREIGN KEY (agent_device_id) REFERENCES agent_devices(id) ON DELETE CASCADE;

ALTER TABLE agent_alerts
ADD CONSTRAINT agent_alerts_agent_device_id_fkey
FOREIGN KEY (agent_device_id) REFERENCES agent_devices(id) ON DELETE CASCADE;

ALTER TABLE agent_event_logs
ADD CONSTRAINT agent_event_logs_agent_device_id_fkey
FOREIGN KEY (agent_device_id) REFERENCES agent_devices(id) ON DELETE CASCADE;

ALTER TABLE agent_commands
ADD CONSTRAINT agent_commands_agent_device_id_fkey
FOREIGN KEY (agent_device_id) REFERENCES agent_devices(id) ON DELETE CASCADE;

ALTER TABLE agent_software_inventory
ADD CONSTRAINT agent_software_inventory_agent_device_id_fkey
FOREIGN KEY (agent_device_id) REFERENCES agent_devices(id) ON DELETE CASCADE;

ALTER TABLE agent_monitored_services
ADD CONSTRAINT agent_monitored_services_agent_device_id_fkey
FOREIGN KEY (agent_device_id) REFERENCES agent_devices(id) ON DELETE CASCADE;

ALTER TABLE agent_devices
ADD CONSTRAINT agent_devices_trial_converted_to_agent_id_fkey
FOREIGN KEY (trial_converted_to_agent_id) REFERENCES agent_devices(id);

ALTER TABLE policy_assignments
ADD CONSTRAINT policy_assignments_agent_device_id_fkey
FOREIGN KEY (agent_device_id) REFERENCES agent_devices(id) ON DELETE CASCADE;

ALTER TABLE alert_history
ADD CONSTRAINT alert_history_agent_device_id_fkey
FOREIGN KEY (agent_device_id) REFERENCES agent_devices(id) ON DELETE CASCADE;

ALTER TABLE agent_alert_history
ADD CONSTRAINT agent_alert_history_agent_device_id_fkey
FOREIGN KEY (agent_device_id) REFERENCES agent_devices(id) ON DELETE CASCADE;

-- Step 5: Add comment for documentation
COMMENT ON COLUMN agent_devices.id IS 'Agent device ID - UUID for registered agents, "trial-{timestamp}" for trial agents';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration complete!
-- ═══════════════════════════════════════════════════════════════════════════

-- Verification queries:
--
-- 1. Check column type changed:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'agent_devices' AND column_name = 'id';
--
-- 2. Check foreign keys recreated:
--    SELECT constraint_name, table_name FROM information_schema.table_constraints
--    WHERE constraint_type = 'FOREIGN KEY' AND constraint_name LIKE '%agent_device%';
