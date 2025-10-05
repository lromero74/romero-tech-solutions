-- Rollback Migration: Remove timezone support from service_requests table
-- Description: Revert the timezone-aware changes
-- Date: 2025-10-05

BEGIN;

-- Drop new columns
ALTER TABLE service_requests
  DROP COLUMN IF EXISTS requested_datetime,
  DROP COLUMN IF EXISTS scheduled_datetime,
  DROP COLUMN IF EXISTS requested_duration_minutes,
  DROP COLUMN IF EXISTS scheduled_duration_minutes;

-- Revert timestamp columns back to without time zone
ALTER TABLE service_requests
  ALTER COLUMN created_at TYPE timestamp without time zone,
  ALTER COLUMN updated_at TYPE timestamp without time zone,
  ALTER COLUMN last_status_change TYPE timestamp without time zone,
  ALTER COLUMN completed_date TYPE timestamp without time zone,
  ALTER COLUMN deleted_at TYPE timestamp without time zone;

-- Drop indexes
DROP INDEX IF EXISTS idx_service_requests_requested_datetime;
DROP INDEX IF EXISTS idx_service_requests_scheduled_datetime;

COMMIT;
