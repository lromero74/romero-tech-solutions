-- Migration: Fix storage quota admin ID constraint for client registration
-- Issue: Client registration fails because trigger tries to create storage quota
--        with set_by_admin_id that doesn't exist in users table
-- Solution: Make set_by_admin_id nullable for system-generated quotas

ALTER TABLE t_client_storage_quotas
ALTER COLUMN set_by_admin_id DROP NOT NULL;

-- Add comment explaining the nullable field
COMMENT ON COLUMN t_client_storage_quotas.set_by_admin_id IS
'Admin user ID who set/modified the quota. NULL for system-generated default quotas.';
