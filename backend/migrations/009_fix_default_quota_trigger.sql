-- Migration: Fix create_default_business_quota trigger function
-- Issue: Trigger uses business ID (NEW.id) for set_by_admin_id, which violates
--        foreign key constraint because business IDs don't exist in users table
-- Solution: Use NULL for set_by_admin_id (made nullable in migration 008)

CREATE OR REPLACE FUNCTION public.create_default_business_quota()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
        NULL,  -- System-generated quota (not set by specific admin)
        'Default quota created automatically for new business'
    );

    RETURN NEW;
END;
$function$;
