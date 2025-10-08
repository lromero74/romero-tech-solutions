-- Migration: Add timezone_preference column to users and employees tables
-- Date: 2025-10-07
-- Description: Allow users and employees to store their timezone preference for displaying dates/times
--              Defaults to NULL which will fall back to auto-detection or America/Los_Angeles
--              Uses IANA timezone identifiers (e.g., 'America/New_York', 'Europe/London')

BEGIN;

-- Add timezone_preference column to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS timezone_preference VARCHAR(255);

-- Add timezone_preference column to employees table
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS timezone_preference VARCHAR(255);

-- Add comments for documentation
COMMENT ON COLUMN users.timezone_preference IS 'User preferred timezone using IANA timezone identifier (e.g., America/New_York). NULL defaults to auto-detection.';
COMMENT ON COLUMN employees.timezone_preference IS 'Employee preferred timezone using IANA timezone identifier (e.g., America/New_York). NULL defaults to auto-detection.';

-- Optional: Backfill existing users with Pacific timezone to preserve current behavior
-- Uncomment if you want to set explicit default for existing users
-- UPDATE users SET timezone_preference = 'America/Los_Angeles' WHERE timezone_preference IS NULL;
-- UPDATE employees SET timezone_preference = 'America/Los_Angeles' WHERE timezone_preference IS NULL;

-- Add indexes for potential future queries (optional but good practice)
CREATE INDEX IF NOT EXISTS idx_users_timezone_preference
ON users(timezone_preference)
WHERE timezone_preference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employees_timezone_preference
ON employees(timezone_preference)
WHERE timezone_preference IS NOT NULL;

COMMIT;

-- Verification queries (run these after migration)
-- SELECT column_name, is_nullable, data_type, character_maximum_length
-- FROM information_schema.columns
-- WHERE table_name IN ('users', 'employees')
-- AND column_name = 'timezone_preference';
--
-- SELECT COUNT(*), timezone_preference FROM users GROUP BY timezone_preference;
-- SELECT COUNT(*), timezone_preference FROM employees GROUP BY timezone_preference;
