-- Migration: Add trigger to auto-sync old and new datetime fields
-- This ensures backward compatibility during the transition period

BEGIN;

-- Create function to sync datetime fields
CREATE OR REPLACE FUNCTION sync_service_request_datetime()
RETURNS TRIGGER AS $$
BEGIN
  -- If new datetime provided but old fields empty, populate old fields
  IF NEW.requested_datetime IS NOT NULL AND NEW.requested_date IS NULL THEN
    NEW.requested_date := NEW.requested_datetime::date;
    NEW.requested_time_start := NEW.requested_datetime::time;
  END IF;

  -- If old fields provided but new datetime empty, populate new datetime
  IF NEW.requested_datetime IS NULL AND NEW.requested_date IS NOT NULL AND NEW.requested_time_start IS NOT NULL THEN
    NEW.requested_datetime := (NEW.requested_date || ' ' || NEW.requested_time_start)::timestamp AT TIME ZONE 'UTC';
  END IF;

  -- Same for scheduled datetime
  IF NEW.scheduled_datetime IS NOT NULL AND NEW.scheduled_date IS NULL THEN
    NEW.scheduled_date := NEW.scheduled_datetime::date;
    NEW.scheduled_time_start := NEW.scheduled_datetime::time;
  END IF;

  IF NEW.scheduled_datetime IS NULL AND NEW.scheduled_date IS NOT NULL AND NEW.scheduled_time_start IS NOT NULL THEN
    NEW.scheduled_datetime := (NEW.scheduled_date || ' ' || NEW.scheduled_time_start)::timestamp AT TIME ZONE 'UTC';
  END IF;

  -- Auto-calculate requested duration if not provided
  IF NEW.requested_duration_minutes IS NULL AND NEW.requested_time_start IS NOT NULL AND NEW.requested_time_end IS NOT NULL THEN
    NEW.requested_duration_minutes :=
      CASE
        WHEN NEW.requested_time_end < NEW.requested_time_start
        THEN 1440 + EXTRACT(EPOCH FROM (NEW.requested_time_end - NEW.requested_time_start)) / 60
        ELSE EXTRACT(EPOCH FROM (NEW.requested_time_end - NEW.requested_time_start)) / 60
      END;
  END IF;

  -- Auto-calculate scheduled duration if not provided
  IF NEW.scheduled_duration_minutes IS NULL AND NEW.scheduled_time_start IS NOT NULL AND NEW.scheduled_time_end IS NOT NULL THEN
    NEW.scheduled_duration_minutes :=
      CASE
        WHEN NEW.scheduled_time_end < NEW.scheduled_time_start
        THEN 1440 + EXTRACT(EPOCH FROM (NEW.scheduled_time_end - NEW.scheduled_time_start)) / 60
        ELSE EXTRACT(EPOCH FROM (NEW.scheduled_time_end - NEW.scheduled_time_start)) / 60
      END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_sync_service_request_datetime ON service_requests;

CREATE TRIGGER trigger_sync_service_request_datetime
  BEFORE INSERT OR UPDATE ON service_requests
  FOR EACH ROW
  EXECUTE FUNCTION sync_service_request_datetime();

COMMENT ON FUNCTION sync_service_request_datetime() IS 'Auto-syncs old datetime fields (requested_date, requested_time_start) with new datetime fields (requested_datetime, requested_duration_minutes) for backward compatibility';

COMMIT;
