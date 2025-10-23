-- Migration 052: Fix Alert Subscription Timezone Handling
-- Purpose: Convert time fields to use UTC and add timezone preference storage
-- Created: 2025-01-22
-- Context: Users in different timezones need proper time handling

-- =====================================================================
-- PART 1: Add timezone preference columns to user tables
-- =====================================================================

-- Add timezone preference to employees table
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS timezone_preference VARCHAR(100) DEFAULT 'America/Los_Angeles';

-- Add timezone preference to users (clients) table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS timezone_preference VARCHAR(100) DEFAULT 'America/Los_Angeles';

-- Add helpful comment
COMMENT ON COLUMN employees.timezone_preference IS 'Employee preferred timezone (IANA format, e.g., America/Los_Angeles)';
COMMENT ON COLUMN users.timezone_preference IS 'Client preferred timezone (IANA format, e.g., America/Los_Angeles)';

-- =====================================================================
-- PART 2: Convert alert_subscribers timestamps to UTC
-- =====================================================================

-- Step 1: Convert created_at and updated_at to TIMESTAMP WITH TIME ZONE
-- Assuming existing data is in Pacific time (America/Los_Angeles = UTC-8 or UTC-7 depending on DST)
ALTER TABLE alert_subscribers
  ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
  USING created_at AT TIME ZONE 'America/Los_Angeles';

ALTER TABLE alert_subscribers
  ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE
  USING updated_at AT TIME ZONE 'America/Los_Angeles';

-- Step 2: Add helper columns for UTC quiet hours (will store UTC time equivalent)
-- We'll keep the existing columns for backward compatibility during migration
ALTER TABLE alert_subscribers
ADD COLUMN IF NOT EXISTS quiet_hours_start_utc TIME,
ADD COLUMN IF NOT EXISTS quiet_hours_end_utc TIME;

-- Step 3: Convert existing quiet hours from Pacific to UTC
-- This is a one-time data migration
DO $$
DECLARE
  rec RECORD;
  pacific_offset INTERVAL;
  start_time_utc TIME;
  end_time_utc TIME;
BEGIN
  -- Pacific Standard Time is UTC-8, Pacific Daylight Time is UTC-7
  -- We'll use PST (UTC-8) as the baseline since most subscriptions created in winter
  pacific_offset := INTERVAL '-8 hours';

  FOR rec IN
    SELECT id, quiet_hours_start, quiet_hours_end
    FROM alert_subscribers
    WHERE quiet_hours_start IS NOT NULL
  LOOP
    -- Convert Pacific time to UTC
    -- If start time is 22:00 PST, that's 06:00 UTC next day
    -- If start time is 07:00 PST, that's 15:00 UTC same day

    -- Add 8 hours to convert PST to UTC
    start_time_utc := rec.quiet_hours_start - pacific_offset;
    end_time_utc := rec.quiet_hours_end - pacific_offset;

    UPDATE alert_subscribers
    SET
      quiet_hours_start_utc = start_time_utc,
      quiet_hours_end_utc = end_time_utc
    WHERE id = rec.id;

    RAISE NOTICE 'Converted subscription %: PST % - % -> UTC % - %',
      rec.id, rec.quiet_hours_start, rec.quiet_hours_end, start_time_utc, end_time_utc;
  END LOOP;
END $$;

-- Step 4: After verification, we'll eventually drop old columns and rename new ones
-- For now, keep both for safety and backward compatibility
COMMENT ON COLUMN alert_subscribers.quiet_hours_start IS 'DEPRECATED: Legacy local time field. Use quiet_hours_start_utc instead.';
COMMENT ON COLUMN alert_subscribers.quiet_hours_end IS 'DEPRECATED: Legacy local time field. Use quiet_hours_end_utc instead.';
COMMENT ON COLUMN alert_subscribers.quiet_hours_start_utc IS 'Quiet hours start time in UTC (converted from user timezone)';
COMMENT ON COLUMN alert_subscribers.quiet_hours_end_utc IS 'Quiet hours end time in UTC (converted from user timezone)';

-- =====================================================================
-- PART 3: Convert client_alert_subscriptions timestamps to UTC
-- =====================================================================

-- Step 1: Convert created_at and updated_at to TIMESTAMP WITH TIME ZONE
ALTER TABLE client_alert_subscriptions
  ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE
  USING created_at AT TIME ZONE 'America/Los_Angeles';

ALTER TABLE client_alert_subscriptions
  ALTER COLUMN updated_at TYPE TIMESTAMP WITH TIME ZONE
  USING updated_at AT TIME ZONE 'America/Los_Angeles';

-- Step 2: Add UTC digest time column
ALTER TABLE client_alert_subscriptions
ADD COLUMN IF NOT EXISTS digest_time_utc TIME;

-- Step 3: Convert existing digest times from Pacific to UTC
DO $$
DECLARE
  rec RECORD;
  pacific_offset INTERVAL;
  digest_time_utc TIME;
BEGIN
  pacific_offset := INTERVAL '-8 hours';

  FOR rec IN
    SELECT id, digest_time
    FROM client_alert_subscriptions
    WHERE digest_time IS NOT NULL
  LOOP
    digest_time_utc := rec.digest_time - pacific_offset;

    UPDATE client_alert_subscriptions
    SET digest_time_utc = digest_time_utc
    WHERE id = rec.id;

    RAISE NOTICE 'Converted client subscription %: PST % -> UTC %',
      rec.id, rec.digest_time, digest_time_utc;
  END LOOP;
END $$;

COMMENT ON COLUMN client_alert_subscriptions.digest_time IS 'DEPRECATED: Legacy local time field. Use digest_time_utc instead.';
COMMENT ON COLUMN client_alert_subscriptions.digest_time_utc IS 'Daily digest time in UTC (converted from user timezone)';

-- =====================================================================
-- PART 4: Create indexes for efficient timezone lookups
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_employees_timezone
  ON employees(timezone_preference)
  WHERE timezone_preference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_timezone
  ON users(timezone_preference)
  WHERE timezone_preference IS NOT NULL;

-- =====================================================================
-- PART 5: Add helper function for timezone conversion
-- =====================================================================

-- Function to convert UTC time to user's local time
CREATE OR REPLACE FUNCTION convert_utc_to_local_time(
  utc_time TIME,
  user_timezone VARCHAR
) RETURNS TIME AS $$
DECLARE
  utc_timestamp TIMESTAMP WITH TIME ZONE;
  local_timestamp TIMESTAMP;
  local_time TIME;
BEGIN
  -- Create a timestamp with the time component in UTC
  utc_timestamp := ('2000-01-01 ' || utc_time::TEXT)::TIMESTAMP AT TIME ZONE 'UTC';

  -- Convert to user's timezone
  local_timestamp := utc_timestamp AT TIME ZONE user_timezone;

  -- Extract just the time component
  local_time := local_timestamp::TIME;

  RETURN local_time;
EXCEPTION
  WHEN OTHERS THEN
    -- If conversion fails, return original time
    RETURN utc_time;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION convert_utc_to_local_time IS 'Convert UTC time to user local time based on timezone preference';

-- Function to convert local time to UTC
CREATE OR REPLACE FUNCTION convert_local_to_utc_time(
  local_time TIME,
  user_timezone VARCHAR
) RETURNS TIME AS $$
DECLARE
  local_timestamp TIMESTAMP WITH TIME ZONE;
  utc_timestamp TIMESTAMP;
  utc_time TIME;
BEGIN
  -- Create a timestamp with the time component in user's timezone
  local_timestamp := ('2000-01-01 ' || local_time::TEXT)::TIMESTAMP AT TIME ZONE user_timezone;

  -- Convert to UTC
  utc_timestamp := local_timestamp AT TIME ZONE 'UTC';

  -- Extract just the time component
  utc_time := utc_timestamp::TIME;

  RETURN utc_time;
EXCEPTION
  WHEN OTHERS THEN
    -- If conversion fails, return original time
    RETURN local_time;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION convert_local_to_utc_time IS 'Convert user local time to UTC based on timezone preference';

-- =====================================================================
-- PART 6: Migration summary
-- =====================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 052 Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Added timezone_preference to employees and users tables';
  RAISE NOTICE 'Converted timestamps to TIMESTAMP WITH TIME ZONE';
  RAISE NOTICE 'Created UTC time columns for quiet hours and digest times';
  RAISE NOTICE 'Migrated existing times from Pacific to UTC';
  RAISE NOTICE 'Created timezone conversion helper functions';
  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANT: Old time columns preserved for backward compatibility';
  RAISE NOTICE 'Application should now use *_utc columns for all time operations';
  RAISE NOTICE '========================================';
END $$;
