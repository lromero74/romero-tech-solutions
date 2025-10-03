-- Fix timezone handling for service_request_time_entries
-- Issue: timestamp without time zone causes pg library to misinterpret values as UTC
-- Solution: Convert to timestamp with time zone to properly store and retrieve UTC times

BEGIN;

-- Add new columns with correct timezone-aware type
ALTER TABLE service_request_time_entries
  ADD COLUMN start_time_tz TIMESTAMP WITH TIME ZONE,
  ADD COLUMN end_time_tz TIMESTAMP WITH TIME ZONE;

-- Copy data, treating existing timestamps as UTC
-- (Since database timezone is UTC, this preserves the actual moment in time)
UPDATE service_request_time_entries
SET
  start_time_tz = start_time AT TIME ZONE 'UTC',
  end_time_tz = end_time AT TIME ZONE 'UTC';

-- Drop old columns
ALTER TABLE service_request_time_entries
  DROP COLUMN start_time,
  DROP COLUMN end_time;

-- Rename new columns to original names
ALTER TABLE service_request_time_entries
  RENAME COLUMN start_time_tz TO start_time;

ALTER TABLE service_request_time_entries
  RENAME COLUMN end_time_tz TO end_time;

-- Recalculate duration_minutes for all entries with end_time
UPDATE service_request_time_entries
SET duration_minutes = EXTRACT(EPOCH FROM (end_time - start_time)) / 60
WHERE end_time IS NOT NULL;

COMMIT;
