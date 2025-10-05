-- Migration: Add timezone support to service_requests table
-- Description: Convert timestamp/date/time columns to timezone-aware types
-- Date: 2025-10-05
-- IMPORTANT: This migration assumes all existing data is stored in UTC

BEGIN;

-- Step 0: Drop dependent views temporarily
DROP VIEW IF EXISTS v_client_service_requests;

-- Step 1: Convert timestamp without time zone → timestamp with time zone
-- These columns already store UTC times, we're just making it explicit

ALTER TABLE service_requests
  ALTER COLUMN created_at TYPE timestamp with time zone USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamp with time zone USING updated_at AT TIME ZONE 'UTC',
  ALTER COLUMN last_status_change TYPE timestamp with time zone USING last_status_change AT TIME ZONE 'UTC',
  ALTER COLUMN completed_date TYPE timestamp with time zone USING completed_date AT TIME ZONE 'UTC',
  ALTER COLUMN deleted_at TYPE timestamp with time zone USING deleted_at AT TIME ZONE 'UTC';

-- Step 2: For date fields, we need to decide whether to:
-- Option A: Keep as date (simpler, but loses time component)
-- Option B: Convert to timestamptz (more flexible, but changes data model)
--
-- Decision: Keep requested_date, scheduled_date, follow_up_date as DATE
-- These are intentionally date-only fields representing "what day" not "what moment"
-- The time components are stored separately in the time fields

-- Step 3: For time fields, PostgreSQL doesn't have "time with time zone" that's useful
-- because time without date + timezone is ambiguous
-- Best practice: Combine date + time into a single timestamptz column
--
-- We'll create new combined columns for requested and scheduled datetimes

-- Add new combined datetime columns
ALTER TABLE service_requests
  ADD COLUMN requested_datetime timestamp with time zone,
  ADD COLUMN scheduled_datetime timestamp with time zone;

-- Migrate existing data: Combine date + time_start into datetime (treating as UTC)
UPDATE service_requests
SET requested_datetime = (requested_date || ' ' || requested_time_start)::timestamp AT TIME ZONE 'UTC'
WHERE requested_date IS NOT NULL AND requested_time_start IS NOT NULL;

UPDATE service_requests
SET scheduled_datetime = (scheduled_date || ' ' || scheduled_time_start)::timestamp AT TIME ZONE 'UTC'
WHERE scheduled_date IS NOT NULL AND scheduled_time_start IS NOT NULL;

-- Step 4: Add duration column to replace time_start/time_end pattern
ALTER TABLE service_requests
  ADD COLUMN requested_duration_minutes integer,
  ADD COLUMN scheduled_duration_minutes integer;

-- Calculate duration from existing time fields
-- Handle midnight crossover: if end < start, add 24 hours (1440 minutes)
UPDATE service_requests
SET requested_duration_minutes =
  CASE
    WHEN requested_time_end < requested_time_start
    THEN 1440 + EXTRACT(EPOCH FROM (requested_time_end - requested_time_start)) / 60
    ELSE EXTRACT(EPOCH FROM (requested_time_end - requested_time_start)) / 60
  END
WHERE requested_time_start IS NOT NULL AND requested_time_end IS NOT NULL;

UPDATE service_requests
SET scheduled_duration_minutes =
  CASE
    WHEN scheduled_time_end < scheduled_time_start
    THEN 1440 + EXTRACT(EPOCH FROM (scheduled_time_end - scheduled_time_start)) / 60
    ELSE EXTRACT(EPOCH FROM (scheduled_time_end - scheduled_time_start)) / 60
  END
WHERE scheduled_time_start IS NOT NULL AND scheduled_time_end IS NOT NULL;

-- Step 5: Add comments for documentation
COMMENT ON COLUMN service_requests.requested_datetime IS 'UTC timestamp when client requested service to start';
COMMENT ON COLUMN service_requests.scheduled_datetime IS 'UTC timestamp when service is scheduled to start';
COMMENT ON COLUMN service_requests.requested_duration_minutes IS 'Requested service duration in minutes';
COMMENT ON COLUMN service_requests.scheduled_duration_minutes IS 'Scheduled service duration in minutes';

-- Step 6: Create indexes for new columns
CREATE INDEX idx_service_requests_requested_datetime ON service_requests(requested_datetime);
CREATE INDEX idx_service_requests_scheduled_datetime ON service_requests(scheduled_datetime);

-- NOTE: Do NOT drop old columns yet - keep them for backwards compatibility during transition
-- They can be dropped in a future migration after confirming everything works

-- Step 7: Recreate the dependent view
CREATE VIEW v_client_service_requests AS
SELECT
    sr.*,
    ul.name as urgency_level_name,
    ul.color_code as urgency_color,
    pl.name as priority_level_name,
    pl.color_code as priority_color,
    srs.name as status_name,
    srs.color_code as status_color,
    st.name as service_type_name,
    st.category as service_category,
    sl.address_label as location_name,
    sl.street as location_street,
    sl.city as location_city,
    sl.state as location_state,
    b.business_name,
    CONCAT(e.first_name, ' ', e.last_name) as technician_name
FROM service_requests sr
LEFT JOIN urgency_levels ul ON sr.urgency_level_id = ul.id
LEFT JOIN priority_levels pl ON sr.priority_level_id = pl.id
LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
LEFT JOIN service_types st ON sr.service_type_id = st.id
LEFT JOIN service_locations sl ON sr.service_location_id = sl.id
LEFT JOIN businesses b ON sr.business_id = b.id
LEFT JOIN employees e ON sr.assigned_technician_id = e.id
WHERE sr.soft_delete = false;

-- Verification queries (run these after migration):
-- SELECT requested_date, requested_time_start, requested_datetime FROM service_requests WHERE requested_datetime IS NOT NULL LIMIT 5;
-- SELECT scheduled_date, scheduled_time_start, scheduled_datetime FROM service_requests WHERE scheduled_datetime IS NOT NULL LIMIT 5;

COMMIT;
