-- Convert service_hour_rate_tiers from Pacific Time to UTC
-- This ensures all timestamps in the database are unambiguously UTC

BEGIN;

-- Update all rate tiers to convert Pacific Time to UTC
-- Pacific Time is UTC-8 (PST) or UTC-7 (PDT)
-- We'll use UTC-7 for the conversion since most of the year is PDT

-- For each tier, add 7 hours to convert Pacific to UTC
-- Handle day-of-week rollover (e.g., Mon 22:00 PT = Tue 05:00 UTC)

-- Step 1: Add temporary columns for UTC times and adjusted day
ALTER TABLE service_hour_rate_tiers
  ADD COLUMN time_start_utc TIME,
  ADD COLUMN time_end_utc TIME,
  ADD COLUMN day_of_week_utc INTEGER;

-- Step 2: Convert times to UTC (add 7 hours for PDT)
-- Handle cases where adding hours crosses midnight
UPDATE service_hour_rate_tiers
SET
  time_start_utc = (time_start::TIME + INTERVAL '7 hours')::TIME,
  time_end_utc = (time_end::TIME + INTERVAL '7 hours')::TIME,
  -- Adjust day if start time crosses midnight
  day_of_week_utc = CASE
    WHEN (time_start::TIME + INTERVAL '7 hours') >= '24:00:00'::TIME
    THEN (day_of_week + 1) % 7
    ELSE day_of_week
  END;

-- Step 3: Handle entries that span across midnight in UTC
-- If time_end_utc < time_start_utc, it means we crossed midnight
-- We need to split these into two entries

-- First, update existing entries that don't cross midnight
UPDATE service_hour_rate_tiers
SET
  time_start = time_start_utc,
  time_end = CASE
    WHEN time_end_utc < time_start_utc THEN '23:59:59'::TIME
    ELSE time_end_utc
  END,
  day_of_week = day_of_week_utc
WHERE time_end_utc >= time_start_utc;

-- For entries that cross midnight, insert continuation entries for next day
INSERT INTO service_hour_rate_tiers (
  tier_name,
  tier_level,
  rate_multiplier,
  day_of_week,
  time_start,
  time_end,
  description,
  is_active,
  created_at,
  updated_at
)
SELECT
  tier_name,
  tier_level,
  rate_multiplier,
  (day_of_week_utc + 1) % 7,  -- Next day
  '00:00:00'::TIME,            -- Start at midnight
  time_end_utc,                -- End at original UTC end time
  description || ' (UTC continuation)',
  is_active,
  NOW(),
  NOW()
FROM service_hour_rate_tiers
WHERE time_end_utc < time_start_utc;

-- Update the original entries that crossed midnight to end at 23:59:59
UPDATE service_hour_rate_tiers
SET
  time_start = time_start_utc,
  time_end = '23:59:59'::TIME,
  day_of_week = day_of_week_utc
WHERE time_end_utc < time_start_utc
  AND description NOT LIKE '% (UTC continuation)';

-- Step 4: Drop temporary columns
ALTER TABLE service_hour_rate_tiers
  DROP COLUMN time_start_utc,
  DROP COLUMN time_end_utc,
  DROP COLUMN day_of_week_utc;

COMMIT;
