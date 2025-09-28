-- File Storage & Quota Management Database Schema Migration
-- Created: 2025-09-27
-- Purpose: Hierarchical file storage with business/site/user quota management

-- ===================================
-- 1. FILE CATEGORIES (Organization)
-- ===================================

CREATE TABLE t_file_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Category Details
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    icon_name VARCHAR(50),
    color_code VARCHAR(7),

    -- Business Rules
    allowed_file_types TEXT[],
    max_file_size_bytes BIGINT,
    requires_virus_scan BOOLEAN DEFAULT true,

    -- Display & Organization
    display_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===================================
-- 2. HIERARCHICAL QUOTA MANAGEMENT
-- ===================================

CREATE TABLE t_client_storage_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Hierarchy Identification
    business_id UUID NOT NULL REFERENCES businesses(id),
    service_location_id UUID REFERENCES service_locations(id), -- NULL for business-level quota
    user_id UUID REFERENCES users(id),                         -- NULL for business/site-level quotas

    -- Quota Configuration
    quota_type VARCHAR(20) NOT NULL CHECK (quota_type IN ('business', 'site', 'user')),
    storage_limit_bytes BIGINT NOT NULL,                       -- Hard limit (upload rejection)
    storage_soft_limit_bytes BIGINT,                           -- Soft limit (warning threshold)
    storage_used_bytes BIGINT DEFAULT 0,

    -- Warning & Alert Configuration
    warning_threshold_percentage INTEGER DEFAULT 80,           -- Warn at 80% of soft limit
    alert_threshold_percentage INTEGER DEFAULT 95,             -- Alert at 95% of soft limit

    -- Usage Tracking
    file_count INTEGER DEFAULT 0,
    last_usage_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_warning_sent TIMESTAMP,                               -- Track when warnings were sent
    last_alert_sent TIMESTAMP,                                 -- Track when alerts were sent

    -- Administrative Control
    set_by_admin_id UUID NOT NULL REFERENCES users(id),
    quota_notes TEXT,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraints for hierarchy integrity
    UNIQUE(business_id, service_location_id, user_id),
    CHECK (
        (quota_type = 'business' AND service_location_id IS NULL AND user_id IS NULL) OR
        (quota_type = 'site' AND service_location_id IS NOT NULL AND user_id IS NULL) OR
        (quota_type = 'user' AND service_location_id IS NOT NULL AND user_id IS NOT NULL)
    )
);

-- ===================================
-- 3. CLIENT FILES (File Metadata)
-- ===================================

CREATE TABLE t_client_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- File Identity
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL UNIQUE,
    file_path VARCHAR(500) NOT NULL,
    content_type VARCHAR(100),
    file_size_bytes BIGINT NOT NULL,

    -- Ownership & Business Isolation
    business_id UUID NOT NULL REFERENCES businesses(id),
    service_location_id UUID REFERENCES service_locations(id),
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id),

    -- File Organization
    file_category_id UUID REFERENCES t_file_categories(id),
    file_description TEXT,
    tags TEXT[],

    -- Virus Scanning & Security
    virus_scan_status VARCHAR(20) DEFAULT 'pending' CHECK (virus_scan_status IN ('pending', 'scanning', 'clean', 'infected', 'quarantined', 'deleted')),
    virus_scan_result TEXT,
    virus_scan_date TIMESTAMP,
    quarantine_reason TEXT,

    -- Access Control
    is_public_to_business BOOLEAN DEFAULT true,
    is_public_to_site BOOLEAN DEFAULT true,
    access_restricted_to_uploader BOOLEAN DEFAULT false,

    -- File Lifecycle
    download_count INTEGER DEFAULT 0,
    last_downloaded_at TIMESTAMP,
    last_downloaded_by_user_id UUID REFERENCES users(id),

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Soft Delete
    soft_delete BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP,
    deleted_by_user_id UUID REFERENCES users(id),
    deletion_reason TEXT
);

-- ===================================
-- 4. VIRUS SCANNING AUDIT TRAIL
-- ===================================

CREATE TABLE t_file_virus_scan_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_file_id UUID NOT NULL REFERENCES t_client_files(id) ON DELETE CASCADE,

    -- Scan Details
    scan_engine VARCHAR(50) NOT NULL,
    scan_version VARCHAR(50),
    scan_started_at TIMESTAMP NOT NULL,
    scan_completed_at TIMESTAMP,
    scan_duration_ms INTEGER,

    -- Results
    scan_status VARCHAR(20) NOT NULL,
    threats_found INTEGER DEFAULT 0,
    threat_names TEXT[],
    scan_raw_output TEXT,

    -- Actions Taken
    action_taken VARCHAR(50),
    action_reason TEXT,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===================================
-- 5. FILE ACCESS AUDIT TRAIL
-- ===================================

CREATE TABLE t_client_file_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_file_id UUID NOT NULL REFERENCES t_client_files(id) ON DELETE CASCADE,

    -- Access Details
    accessed_by_user_id UUID NOT NULL REFERENCES users(id),
    access_type VARCHAR(20) NOT NULL,
    access_granted BOOLEAN NOT NULL,
    denial_reason TEXT,

    -- Technical Details
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===================================
-- 6. INDEXES FOR PERFORMANCE
-- ===================================

-- Client Files Indexes
CREATE INDEX idx_t_client_files_business_id ON t_client_files(business_id);
CREATE INDEX idx_t_client_files_service_location_id ON t_client_files(service_location_id);
CREATE INDEX idx_t_client_files_uploaded_by_user_id ON t_client_files(uploaded_by_user_id);
CREATE INDEX idx_t_client_files_virus_scan_status ON t_client_files(virus_scan_status);
CREATE INDEX idx_t_client_files_file_category_id ON t_client_files(file_category_id);
CREATE INDEX idx_t_client_files_created_at ON t_client_files(created_at);
CREATE INDEX idx_t_client_files_soft_delete ON t_client_files(soft_delete);

-- Quota Management Indexes
CREATE INDEX idx_t_client_storage_quotas_business_id ON t_client_storage_quotas(business_id);
CREATE INDEX idx_t_client_storage_quotas_service_location_id ON t_client_storage_quotas(service_location_id);
CREATE INDEX idx_t_client_storage_quotas_user_id ON t_client_storage_quotas(user_id);
CREATE INDEX idx_t_client_storage_quotas_quota_type ON t_client_storage_quotas(quota_type);

-- Audit Trail Indexes
CREATE INDEX idx_t_file_virus_scan_log_client_file_id ON t_file_virus_scan_log(client_file_id);
CREATE INDEX idx_t_file_virus_scan_log_scan_started_at ON t_file_virus_scan_log(scan_started_at);
CREATE INDEX idx_t_client_file_access_log_client_file_id ON t_client_file_access_log(client_file_id);
CREATE INDEX idx_t_client_file_access_log_accessed_by_user_id ON t_client_file_access_log(accessed_by_user_id);
CREATE INDEX idx_t_client_file_access_log_created_at ON t_client_file_access_log(created_at);

-- ===================================
-- 7. QUOTA ENFORCEMENT FUNCTIONS
-- ===================================

-- Function: Check Available Quota Before Upload (Enhanced with Soft/Hard Limits)
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
    current_usage BIGINT;
    applicable_limit BIGINT;
    applicable_soft_limit BIGINT;
    usage_pct DECIMAL(5,2);
    warning_pct INTEGER;
    alert_pct INTEGER;
BEGIN
    -- Get business quota
    SELECT * INTO business_quota
    FROM t_client_storage_quotas
    WHERE business_id = p_business_id
    AND quota_type = 'business';

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

    -- Check site quota if applicable
    IF p_service_location_id IS NOT NULL THEN
        SELECT * INTO site_quota
        FROM t_client_storage_quotas
        WHERE business_id = p_business_id
        AND service_location_id = p_service_location_id
        AND quota_type = 'site';

        IF FOUND AND site_quota.storage_used_bytes + p_file_size_bytes > site_quota.storage_limit_bytes THEN
            RETURN QUERY SELECT false, 'site'::VARCHAR(20),
                              (site_quota.storage_limit_bytes - site_quota.storage_used_bytes),
                              'Site storage quota exceeded (hard limit)'::TEXT,
                              'hard_limit'::VARCHAR(20), true,
                              ROUND((site_quota.storage_used_bytes::DECIMAL / site_quota.storage_limit_bytes) * 100, 2);
            RETURN;
        END IF;
    END IF;

    -- Check user quota if applicable
    IF p_user_id IS NOT NULL THEN
        SELECT * INTO user_quota
        FROM t_client_storage_quotas
        WHERE business_id = p_business_id
        AND service_location_id = p_service_location_id
        AND user_id = p_user_id
        AND quota_type = 'user';

        IF FOUND AND user_quota.storage_used_bytes + p_file_size_bytes > user_quota.storage_limit_bytes THEN
            RETURN QUERY SELECT false, 'user'::VARCHAR(20),
                              (user_quota.storage_limit_bytes - user_quota.storage_used_bytes),
                              'User storage quota exceeded (hard limit)'::TEXT,
                              'hard_limit'::VARCHAR(20), true,
                              ROUND((user_quota.storage_used_bytes::DECIMAL / user_quota.storage_limit_bytes) * 100, 2);
            RETURN;
        END IF;
    END IF;

    -- Determine which quota to check for soft limits and warnings (most restrictive)
    current_usage := business_quota.storage_used_bytes;
    applicable_limit := business_quota.storage_limit_bytes;
    applicable_soft_limit := business_quota.storage_soft_limit_bytes;
    warning_pct := business_quota.warning_threshold_percentage;
    alert_pct := business_quota.alert_threshold_percentage;

    -- Use site quota if more restrictive
    IF site_quota IS NOT NULL AND site_quota.storage_limit_bytes < applicable_limit THEN
        current_usage := site_quota.storage_used_bytes;
        applicable_limit := site_quota.storage_limit_bytes;
        applicable_soft_limit := site_quota.storage_soft_limit_bytes;
        warning_pct := site_quota.warning_threshold_percentage;
        alert_pct := site_quota.alert_threshold_percentage;
    END IF;

    -- Use user quota if more restrictive
    IF user_quota IS NOT NULL AND user_quota.storage_limit_bytes < applicable_limit THEN
        current_usage := user_quota.storage_used_bytes;
        applicable_limit := user_quota.storage_limit_bytes;
        applicable_soft_limit := user_quota.storage_soft_limit_bytes;
        warning_pct := user_quota.warning_threshold_percentage;
        alert_pct := user_quota.alert_threshold_percentage;
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
                              'Upload allowed but approaching storage limit'::TEXT,
                              'alert'::VARCHAR(20), false, usage_pct;
            RETURN;
        END IF;

        -- Check warning threshold (based on hard limit)
        IF usage_pct >= warning_pct THEN
            RETURN QUERY SELECT true, 'user'::VARCHAR(20),
                              (applicable_limit - current_usage),
                              'Upload allowed but storage is getting full'::TEXT,
                              'warning'::VARCHAR(20), false, usage_pct;
            RETURN;
        END IF;
    END IF;

    -- All checks passed - upload allowed with no warnings
    RETURN QUERY SELECT true, 'none'::VARCHAR(20),
                      (applicable_limit - current_usage),
                      'Upload allowed'::TEXT,
                      'none'::VARCHAR(20), false, usage_pct;
END;
$$ LANGUAGE plpgsql;

-- Function: Update Quota Usage After File Operations
CREATE OR REPLACE FUNCTION update_quota_usage()
RETURNS TRIGGER AS $$
DECLARE
    file_business_id UUID;
    file_location_id UUID;
    file_user_id UUID;
    file_size_change BIGINT;
    file_count_change INTEGER;
BEGIN
    -- Handle INSERT/UPDATE/DELETE operations
    IF TG_OP = 'INSERT' THEN
        file_business_id := NEW.business_id;
        file_location_id := NEW.service_location_id;
        file_user_id := NEW.uploaded_by_user_id;
        file_size_change := NEW.file_size_bytes;
        file_count_change := 1;
    ELSIF TG_OP = 'UPDATE' THEN
        file_business_id := NEW.business_id;
        file_location_id := NEW.service_location_id;
        file_user_id := NEW.uploaded_by_user_id;
        file_size_change := NEW.file_size_bytes - OLD.file_size_bytes;
        file_count_change := 0; -- File count doesn't change on update
    ELSIF TG_OP = 'DELETE' THEN
        file_business_id := OLD.business_id;
        file_location_id := OLD.service_location_id;
        file_user_id := OLD.uploaded_by_user_id;
        file_size_change := -OLD.file_size_bytes;
        file_count_change := -1;
    END IF;

    -- Update business quota usage
    UPDATE t_client_storage_quotas
    SET storage_used_bytes = storage_used_bytes + file_size_change,
        file_count = file_count + file_count_change,
        last_usage_update = CURRENT_TIMESTAMP
    WHERE business_id = file_business_id
    AND quota_type = 'business';

    -- Update site quota usage if applicable
    IF file_location_id IS NOT NULL THEN
        UPDATE t_client_storage_quotas
        SET storage_used_bytes = storage_used_bytes + file_size_change,
            file_count = file_count + file_count_change,
            last_usage_update = CURRENT_TIMESTAMP
        WHERE business_id = file_business_id
        AND service_location_id = file_location_id
        AND quota_type = 'site';
    END IF;

    -- Update user quota usage if applicable
    IF file_user_id IS NOT NULL AND file_location_id IS NOT NULL THEN
        UPDATE t_client_storage_quotas
        SET storage_used_bytes = storage_used_bytes + file_size_change,
            file_count = file_count + file_count_change,
            last_usage_update = CURRENT_TIMESTAMP
        WHERE business_id = file_business_id
        AND service_location_id = file_location_id
        AND user_id = file_user_id
        AND quota_type = 'user';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic quota usage updates
CREATE TRIGGER trigger_update_quota_usage
    AFTER INSERT OR UPDATE OR DELETE ON t_client_files
    FOR EACH ROW
    EXECUTE FUNCTION update_quota_usage();

-- ===================================
-- 8. BUSINESS ISOLATION VIEWS
-- ===================================

-- Quota Usage Summary View
CREATE VIEW v_quota_usage_summary AS
SELECT
    q.id,
    q.business_id,
    q.service_location_id,
    q.user_id,
    q.quota_type,
    q.storage_limit_bytes,
    q.storage_soft_limit_bytes,
    q.storage_used_bytes,
    q.file_count,
    q.warning_threshold_percentage,
    q.alert_threshold_percentage,
    ROUND((q.storage_used_bytes::DECIMAL / COALESCE(q.storage_soft_limit_bytes, q.storage_limit_bytes)) * 100, 2) as usage_percentage,
    (q.storage_limit_bytes - q.storage_used_bytes) as available_bytes,
    (COALESCE(q.storage_soft_limit_bytes, q.storage_limit_bytes) - q.storage_used_bytes) as available_soft_bytes,
    b.business_name,
    sl.address_label as location_name,
    CONCAT(u.first_name, ' ', u.last_name) as user_name,
    CONCAT(admin.first_name, ' ', admin.last_name) as set_by_admin_name
FROM t_client_storage_quotas q
LEFT JOIN businesses b ON q.business_id = b.id
LEFT JOIN service_locations sl ON q.service_location_id = sl.id
LEFT JOIN users u ON q.user_id = u.id
LEFT JOIN users admin ON q.set_by_admin_id = admin.id
WHERE q.business_id IS NOT NULL
ORDER BY q.business_id, q.quota_type, q.service_location_id, q.user_id;

-- File Storage by Business View
CREATE VIEW v_file_storage_by_business AS
SELECT
    cf.business_id,
    b.business_name,
    COUNT(*) as total_files,
    SUM(cf.file_size_bytes) as total_storage_used,
    COUNT(CASE WHEN cf.virus_scan_status = 'clean' THEN 1 END) as clean_files,
    COUNT(CASE WHEN cf.virus_scan_status = 'infected' THEN 1 END) as infected_files,
    COUNT(CASE WHEN cf.virus_scan_status = 'pending' THEN 1 END) as pending_scan_files
FROM t_client_files cf
LEFT JOIN businesses b ON cf.business_id = b.id
WHERE cf.soft_delete = false
GROUP BY cf.business_id, b.business_name
ORDER BY total_storage_used DESC;

-- Client Files View (Business Isolated)
CREATE VIEW v_client_files AS
SELECT
    cf.*,
    fc.name as category_name,
    fc.icon_name as category_icon,
    fc.color_code as category_color,
    b.business_name,
    sl.address_label as location_name,
    CONCAT(uploader.first_name, ' ', uploader.last_name) as uploader_name,
    CONCAT(downloader.first_name, ' ', downloader.last_name) as last_downloader_name
FROM t_client_files cf
LEFT JOIN t_file_categories fc ON cf.file_category_id = fc.id
LEFT JOIN businesses b ON cf.business_id = b.id
LEFT JOIN service_locations sl ON cf.service_location_id = sl.id
LEFT JOIN users uploader ON cf.uploaded_by_user_id = uploader.id
LEFT JOIN users downloader ON cf.last_downloaded_by_user_id = downloader.id
WHERE cf.soft_delete = false;

-- ===================================
-- 9. DEFAULT DATA INSERTION
-- ===================================

-- Insert Default File Categories
INSERT INTO t_file_categories (name, description, icon_name, color_code, allowed_file_types, max_file_size_bytes, display_order) VALUES
('site_documentation', 'Site plans, network diagrams, and technical documentation', 'FileText', '#3b82f6',
 ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
 104857600, 1), -- 100MB

('issue_photos', 'Photos documenting technical issues and site conditions', 'Camera', '#10b981',
 ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
 52428800, 2), -- 50MB

('contracts', 'Service agreements, contracts, and legal documents', 'FileContract', '#f59e0b',
 ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
 52428800, 3), -- 50MB

('reports', 'Generated reports, analyses, and technical assessments', 'BarChart', '#8b5cf6',
 ARRAY['application/pdf', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
 104857600, 4), -- 100MB

('general', 'General files and miscellaneous documents', 'File', '#6b7280',
 ARRAY['application/pdf', 'image/jpeg', 'image/png', 'text/plain', 'application/zip'],
 26214400, 5); -- 25MB