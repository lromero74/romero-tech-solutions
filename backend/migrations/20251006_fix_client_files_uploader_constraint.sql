-- Migration: Fix t_client_files uploader tracking to support both employees and clients
-- Date: 2025-10-06
-- Description: Add uploaded_by_employee_id column and make uploaded_by_user_id nullable
--              to properly track uploads from both employees (via employees table)
--              and clients (via users table)

BEGIN;

-- Add new column for employee uploads
ALTER TABLE t_client_files
ADD COLUMN IF NOT EXISTS uploaded_by_employee_id UUID;

-- Add foreign key constraint for employee uploads
ALTER TABLE t_client_files
ADD CONSTRAINT t_client_files_uploaded_by_employee_id_fkey
FOREIGN KEY (uploaded_by_employee_id)
REFERENCES employees(id)
ON DELETE SET NULL;

-- Make uploaded_by_user_id nullable (for client uploads only)
ALTER TABLE t_client_files
ALTER COLUMN uploaded_by_user_id DROP NOT NULL;

-- Add indexes for query performance
CREATE INDEX IF NOT EXISTS idx_client_files_uploaded_by_user_id
ON t_client_files(uploaded_by_user_id);

CREATE INDEX IF NOT EXISTS idx_client_files_uploaded_by_employee_id
ON t_client_files(uploaded_by_employee_id);

-- Add check constraint to ensure at least one uploader is set
ALTER TABLE t_client_files
ADD CONSTRAINT t_client_files_uploader_check
CHECK (uploaded_by_user_id IS NOT NULL OR uploaded_by_employee_id IS NOT NULL);

COMMIT;

-- Verification queries (run these after migration)
-- SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name = 't_client_files' AND column_name LIKE '%uploaded_by%';
-- SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_name = 't_client_files' AND constraint_name LIKE '%uploaded%';
