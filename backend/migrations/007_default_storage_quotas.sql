-- Migration: Add default storage quotas for all businesses
-- Date: 2025-10-02
-- Description: Create default quotas for existing businesses and trigger for new businesses

-- Step 1: Create default quotas for all existing businesses that don't have one
INSERT INTO t_client_storage_quotas (
    business_id,
    quota_type,
    storage_limit_bytes,
    storage_soft_limit_bytes,
    warning_threshold_percentage,
    alert_threshold_percentage,
    set_by_admin_id,
    quota_notes
)
SELECT
    b.id AS business_id,
    'business' AS quota_type,
    10737418240 AS storage_limit_bytes,  -- 10 GB hard limit
    8589934592 AS storage_soft_limit_bytes,  -- 8 GB soft limit
    80 AS warning_threshold_percentage,
    90 AS alert_threshold_percentage,
    (SELECT id FROM users WHERE business_id = b.id LIMIT 1) AS set_by_admin_id,
    'Default quota created by system migration' AS quota_notes
FROM businesses b
WHERE NOT EXISTS (
    SELECT 1 FROM t_client_storage_quotas q
    WHERE q.business_id = b.id
    AND q.quota_type = 'business'
);

-- Step 2: Create function to automatically add quota for new businesses
CREATE OR REPLACE FUNCTION create_default_business_quota()
RETURNS TRIGGER AS $$
BEGIN
    -- Create default business quota
    INSERT INTO t_client_storage_quotas (
        business_id,
        quota_type,
        storage_limit_bytes,
        storage_soft_limit_bytes,
        warning_threshold_percentage,
        alert_threshold_percentage,
        set_by_admin_id,
        quota_notes
    ) VALUES (
        NEW.id,  -- businesses table uses 'id' column
        'business',
        10737418240,  -- 10 GB hard limit
        8589934592,   -- 8 GB soft limit
        80,
        90,
        NEW.id,  -- Use business id as placeholder for set_by_admin_id
        'Default quota created automatically for new business'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create trigger to execute function when new business is created
DROP TRIGGER IF EXISTS trigger_create_default_business_quota ON businesses;

CREATE TRIGGER trigger_create_default_business_quota
AFTER INSERT ON businesses
FOR EACH ROW
EXECUTE FUNCTION create_default_business_quota();

-- Step 4: Create function to clean up business data when deleted
CREATE OR REPLACE FUNCTION cleanup_business_on_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- Delete all file storage quotas for this business
    DELETE FROM t_client_storage_quotas WHERE business_id = OLD.id;

    -- Note: Physical file cleanup should be handled by a separate cleanup job
    -- The files in t_client_files will be marked with deleted_at timestamp
    -- and can be physically removed by a scheduled cleanup process

    -- Log the cleanup
    RAISE NOTICE 'Cleaned up storage quotas for business %', OLD.id;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create trigger for business deletion cleanup
DROP TRIGGER IF EXISTS trigger_cleanup_business_on_delete ON businesses;

CREATE TRIGGER trigger_cleanup_business_on_delete
BEFORE DELETE ON businesses
FOR EACH ROW
EXECUTE FUNCTION cleanup_business_on_delete();

-- Step 6: Display confirmation of created quotas
SELECT
    b.business_name,
    q.quota_type,
    ROUND(q.storage_limit_bytes / 1073741824.0, 2) AS limit_gb,
    ROUND(q.storage_soft_limit_bytes / 1073741824.0, 2) AS soft_limit_gb,
    q.storage_used_bytes,
    q.file_count,
    q.created_at
FROM t_client_storage_quotas q
JOIN businesses b ON q.business_id = b.id
WHERE q.quota_type = 'business'
ORDER BY q.created_at DESC;
