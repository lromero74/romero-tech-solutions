-- Add unique constraint to business_name in businesses table
-- This ensures no duplicate business names can exist in the system

-- First, let's check if there are any existing duplicates and handle them
-- (This is a safety measure in case there's existing data)
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    -- Check for existing duplicate business names
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT business_name
        FROM businesses
        WHERE business_name IS NOT NULL
        GROUP BY LOWER(business_name)
        HAVING COUNT(*) > 1
    ) duplicates;

    IF duplicate_count > 0 THEN
        RAISE NOTICE 'Found % duplicate business name(s). Please resolve duplicates manually before applying unique constraint.', duplicate_count;
        -- Uncomment the next line if you want to fail the migration when duplicates exist
        -- RAISE EXCEPTION 'Cannot add unique constraint: duplicate business names exist';
    ELSE
        RAISE NOTICE 'No duplicate business names found. Safe to add unique constraint.';
    END IF;
END $$;

-- Add the unique constraint on business_name (case-insensitive)
-- Using a unique index with LOWER() to ensure case-insensitive uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_name_unique
ON businesses(LOWER(business_name))
WHERE business_name IS NOT NULL;

-- Add a comment to document the constraint
COMMENT ON INDEX idx_businesses_name_unique IS 'Ensures business names are unique (case-insensitive)';