-- Migration: Fix check_available_quota function column ambiguity
-- Date: 2025-10-02
-- Description: Fix "column reference quota_type is ambiguous" error by qualifying column references

CREATE OR REPLACE FUNCTION check_available_quota(
    p_business_id UUID,
    p_file_size_bytes BIGINT,
    p_service_location_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
) RETURNS TABLE (
    can_upload BOOLEAN,
    quota_type VARCHAR(20),
    available_bytes BIGINT,
    reason TEXT,
    warning_level VARCHAR(20),  -- 'none', 'soft_exceeded', 'warning', 'alert'
    soft_limit_exceeded BOOLEAN,
    usage_percentage DECIMAL(5,2)
) AS $$
DECLARE
    business_quota RECORD;
    site_quota RECORD;
    user_quota RECORD;
    site_quota_found BOOLEAN := false;
    user_quota_found BOOLEAN := false;
    current_usage BIGINT;
    applicable_limit BIGINT;
    applicable_soft_limit BIGINT;
    usage_pct DECIMAL(5,2);
    warning_pct INTEGER;
    alert_pct INTEGER;
BEGIN
    -- Get business quota (FIX: qualify quota_type with table name)
    SELECT * INTO business_quota
    FROM t_client_storage_quotas
    WHERE business_id = p_business_id
    AND t_client_storage_quotas.quota_type = 'business';

    -- Check if business quota exists
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'business'::VARCHAR(20), 0::BIGINT,
                          'No business storage quota configured'::TEXT,
                          'none'::VARCHAR(20), false, 0::DECIMAL(5,2);
        RETURN;
    END IF;

    -- Check business hard limit (always enforced)
    IF business_quota.storage_used_bytes + p_file_size_bytes > business_quota.storage_limit_bytes THEN
        RETURN QUERY SELECT false, 'business'::VARCHAR(20),
                          (business_quota.storage_limit_bytes - business_quota.storage_used_bytes),
                          'Business storage quota exceeded (hard limit)'::TEXT,
                          'hard_limit'::VARCHAR(20), true,
                          ROUND((business_quota.storage_used_bytes::DECIMAL / business_quota.storage_limit_bytes) * 100, 2);
        RETURN;
    END IF;

    -- Check site quota if applicable (FIX: qualify quota_type with table name)
    IF p_service_location_id IS NOT NULL THEN
        SELECT * INTO site_quota
        FROM t_client_storage_quotas
        WHERE business_id = p_business_id
        AND service_location_id = p_service_location_id
        AND t_client_storage_quotas.quota_type = 'site';

        IF FOUND THEN
            site_quota_found := true;

            IF site_quota.storage_used_bytes + p_file_size_bytes > site_quota.storage_limit_bytes THEN
                RETURN QUERY SELECT false, 'site'::VARCHAR(20),
                                  (site_quota.storage_limit_bytes - site_quota.storage_used_bytes),
                                  'Site storage quota exceeded (hard limit)'::TEXT,
                                  'hard_limit'::VARCHAR(20), true,
                                  ROUND((site_quota.storage_used_bytes::DECIMAL / site_quota.storage_limit_bytes) * 100, 2);
                RETURN;
            END IF;
        END IF;
    END IF;

    -- Check user quota if applicable (FIX: qualify quota_type with table name)
    IF p_user_id IS NOT NULL THEN
        SELECT * INTO user_quota
        FROM t_client_storage_quotas
        WHERE business_id = p_business_id
        AND service_location_id = p_service_location_id
        AND user_id = p_user_id
        AND t_client_storage_quotas.quota_type = 'user';

        IF FOUND THEN
            user_quota_found := true;

            IF user_quota.storage_used_bytes + p_file_size_bytes > user_quota.storage_limit_bytes THEN
                RETURN QUERY SELECT false, 'user'::VARCHAR(20),
                                  (user_quota.storage_limit_bytes - user_quota.storage_used_bytes),
                                  'User storage quota exceeded (hard limit)'::TEXT,
                                  'hard_limit'::VARCHAR(20), true,
                                  ROUND((user_quota.storage_used_bytes::DECIMAL / user_quota.storage_limit_bytes) * 100, 2);
                RETURN;
            END IF;
        END IF;
    END IF;

    -- Determine which quota to check for soft limits and warnings (most restrictive)
    current_usage := business_quota.storage_used_bytes;
    applicable_limit := business_quota.storage_limit_bytes;
    applicable_soft_limit := business_quota.storage_soft_limit_bytes;
    warning_pct := business_quota.warning_threshold_percentage;
    alert_pct := business_quota.alert_threshold_percentage;

    -- Use site quota if more restrictive (nested IF to avoid accessing uninitialized RECORD)
    IF site_quota_found THEN
        IF site_quota.storage_limit_bytes < applicable_limit THEN
            current_usage := site_quota.storage_used_bytes;
            applicable_limit := site_quota.storage_limit_bytes;
            applicable_soft_limit := site_quota.storage_soft_limit_bytes;
            warning_pct := site_quota.warning_threshold_percentage;
            alert_pct := site_quota.alert_threshold_percentage;
        END IF;
    END IF;

    -- Use user quota if more restrictive (nested IF to avoid accessing uninitialized RECORD)
    IF user_quota_found THEN
        IF user_quota.storage_limit_bytes < applicable_limit THEN
            current_usage := user_quota.storage_used_bytes;
            applicable_limit := user_quota.storage_limit_bytes;
            applicable_soft_limit := user_quota.storage_soft_limit_bytes;
            warning_pct := user_quota.warning_threshold_percentage;
            alert_pct := user_quota.alert_threshold_percentage;
        END IF;
    END IF;

    -- Calculate usage percentage against soft limit (if exists) or hard limit
    IF applicable_soft_limit IS NOT NULL THEN
        usage_pct := ROUND(((current_usage + p_file_size_bytes)::DECIMAL / applicable_soft_limit) * 100, 2);

        -- Check if upload would exceed soft limit
        IF current_usage + p_file_size_bytes > applicable_soft_limit THEN
            RETURN QUERY SELECT true, 'user'::VARCHAR(20),
                              (applicable_limit - current_usage),
                              'Upload allowed but soft limit exceeded - consider reducing storage usage'::TEXT,
                              'soft_exceeded'::VARCHAR(20), true, usage_pct;
            RETURN;
        END IF;

        -- Check alert threshold (based on soft limit)
        IF usage_pct >= alert_pct THEN
            RETURN QUERY SELECT true, 'user'::VARCHAR(20),
                              (applicable_limit - current_usage),
                              'Upload allowed but approaching storage limit - please clean up files soon'::TEXT,
                              'alert'::VARCHAR(20), false, usage_pct;
            RETURN;
        END IF;

        -- Check warning threshold (based on soft limit)
        IF usage_pct >= warning_pct THEN
            RETURN QUERY SELECT true, 'user'::VARCHAR(20),
                              (applicable_limit - current_usage),
                              'Upload allowed but storage is getting full - consider cleaning up files'::TEXT,
                              'warning'::VARCHAR(20), false, usage_pct;
            RETURN;
        END IF;
    ELSE
        -- No soft limit, use hard limit for percentage calculations
        usage_pct := ROUND(((current_usage + p_file_size_bytes)::DECIMAL / applicable_limit) * 100, 2);

        -- Check alert threshold (based on hard limit)
        IF usage_pct >= alert_pct THEN
            RETURN QUERY SELECT true, 'user'::VARCHAR(20),
                              (applicable_limit - current_usage),
                              'Upload allowed but approaching storage limit - please clean up files soon'::TEXT,
                              'alert'::VARCHAR(20), false, usage_pct;
            RETURN;
        END IF;

        -- Check warning threshold (based on hard limit)
        IF usage_pct >= warning_pct THEN
            RETURN QUERY SELECT true, 'user'::VARCHAR(20),
                              (applicable_limit - current_usage),
                              'Upload allowed but storage is getting full - consider cleaning up files'::TEXT,
                              'warning'::VARCHAR(20), false, usage_pct;
            RETURN;
        END IF;
    END IF;

    -- All checks passed
    RETURN QUERY SELECT true, 'none'::VARCHAR(20),
                      (applicable_limit - current_usage),
                      'Upload allowed'::TEXT,
                      'none'::VARCHAR(20), false, usage_pct;
END;
$$ LANGUAGE plpgsql;
