-- Migration: Software Deployment Engine
-- Purpose: Remote software package deployment and patch management
-- Phase: 1
-- Date: 2025-10-17

-- ============================================================================
-- SOFTWARE PACKAGE CATALOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS software_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Package Identification
  package_name VARCHAR(255) NOT NULL,
  package_version VARCHAR(100),
  publisher VARCHAR(255),
  description TEXT,

  -- Package Type
  package_type VARCHAR(50) NOT NULL, -- msi, exe, deb, rpm, pkg, dmg, app_bundle
  package_category VARCHAR(100), -- Security, Productivity, Development, etc.

  -- Platform Support
  supported_os VARCHAR[] DEFAULT ARRAY['windows', 'linux', 'macos'],
  architecture VARCHAR[] DEFAULT ARRAY['x86_64', 'arm64'],
  min_os_version VARCHAR(50),

  -- Package Source
  source_type VARCHAR(50) NOT NULL, -- url, repository, local_upload
  source_url VARCHAR(1000), -- Download URL
  source_repository VARCHAR(255), -- apt, yum, brew, choco, etc.
  source_package_name VARCHAR(255), -- Package name in repository

  -- Security & Verification
  checksum_type VARCHAR(20) DEFAULT 'sha256', -- md5, sha1, sha256
  checksum_value VARCHAR(128),
  signature VARCHAR(1000), -- Digital signature for verification
  requires_signature_verification BOOLEAN DEFAULT true,

  -- Installation Details
  install_command TEXT, -- Custom install command (if not standard)
  install_arguments VARCHAR(500), -- Additional install arguments
  silent_install_supported BOOLEAN DEFAULT true,
  requires_reboot BOOLEAN DEFAULT false,
  requires_elevated BOOLEAN DEFAULT true,

  -- Uninstallation
  uninstall_command TEXT,
  uninstall_arguments VARCHAR(500),

  -- Prerequisites & Dependencies
  prerequisites JSONB, -- Required software/conditions
  conflicts_with VARCHAR[], -- Software that conflicts with this package

  -- Size & Resources
  package_size_mb DECIMAL(10, 2),
  disk_space_required_mb DECIMAL(10, 2),
  estimated_install_time_minutes INTEGER DEFAULT 10,

  -- License
  license_type VARCHAR(100), -- Commercial, Open Source, Freeware, etc.
  license_required BOOLEAN DEFAULT false,

  -- Visibility & Access
  is_approved BOOLEAN DEFAULT false, -- Approval for deployment
  is_public BOOLEAN DEFAULT false, -- Available to all businesses
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE, -- NULL for public packages
  created_by UUID REFERENCES employees(id),

  -- Version Control
  release_date DATE,
  is_latest_version BOOLEAN DEFAULT true,
  superseded_by_version_id UUID REFERENCES software_packages(id) ON DELETE SET NULL,

  -- Usage Statistics
  deployment_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,

  -- Metadata
  tags VARCHAR[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_software_packages_name ON software_packages(package_name);
CREATE INDEX IF NOT EXISTS idx_software_packages_type ON software_packages(package_type);
CREATE INDEX IF NOT EXISTS idx_software_packages_os ON software_packages USING GIN(supported_os);
CREATE INDEX IF NOT EXISTS idx_software_packages_approved ON software_packages(is_approved);
CREATE INDEX IF NOT EXISTS idx_software_packages_business ON software_packages(business_id);

-- ============================================================================
-- DEPLOYMENT SCHEDULES (Maintenance Windows) - Must be created before package_deployments
-- ============================================================================

CREATE TABLE IF NOT EXISTS deployment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Schedule Identification
  schedule_name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Schedule Owner
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,

  -- Schedule Type
  schedule_type VARCHAR(50) DEFAULT 'recurring', -- one_time, recurring

  -- One-time Schedule
  scheduled_date DATE,
  start_time TIME,
  end_time TIME,

  -- Recurring Schedule
  recurring_pattern VARCHAR(50), -- daily, weekly, monthly
  day_of_week INTEGER[], -- 0=Sunday, 6=Saturday
  day_of_month INTEGER[], -- 1-31
  recurrence_cron VARCHAR(100), -- Cron expression for complex schedules

  -- Window Settings
  window_duration_minutes INTEGER DEFAULT 120,
  timezone VARCHAR(50) DEFAULT 'UTC',

  -- Restrictions
  exclude_dates DATE[], -- Dates to skip (holidays, etc.)
  only_outside_business_hours BOOLEAN DEFAULT true,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deployment_schedules_business ON deployment_schedules(business_id);
CREATE INDEX IF NOT EXISTS idx_deployment_schedules_active ON deployment_schedules(is_active);

-- ============================================================================
-- DEPLOYMENT JOBS
-- ============================================================================

CREATE TABLE IF NOT EXISTS package_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Deployment Identification
  deployment_name VARCHAR(255),
  package_id UUID NOT NULL REFERENCES software_packages(id) ON DELETE CASCADE,

  -- Target Scope
  deployment_scope VARCHAR(50) NOT NULL, -- single_agent, business, all_agents
  agent_device_id UUID REFERENCES agent_devices(id) ON DELETE CASCADE, -- For single agent deployments
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE, -- For business-wide deployments

  -- Deployment Configuration
  install_mode VARCHAR(50) DEFAULT 'silent', -- silent, interactive, unattended
  install_options JSONB, -- Custom installation options
  allow_reboot BOOLEAN DEFAULT false,
  force_install BOOLEAN DEFAULT false, -- Install even if already installed

  -- Scheduling
  deployment_status VARCHAR(50) DEFAULT 'pending', -- pending, scheduled, in_progress, completed, failed, cancelled
  scheduled_for TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Maintenance Window
  maintenance_window_id UUID REFERENCES deployment_schedules(id) ON DELETE SET NULL,
  respect_maintenance_window BOOLEAN DEFAULT true,

  -- Execution Options
  max_concurrent_deployments INTEGER DEFAULT 10,
  deployment_timeout_minutes INTEGER DEFAULT 60,
  retry_on_failure BOOLEAN DEFAULT true,
  max_retries INTEGER DEFAULT 3,

  -- Rollback
  rollback_on_failure BOOLEAN DEFAULT false,
  previous_version_id UUID REFERENCES software_packages(id) ON DELETE SET NULL,

  -- Approval
  requires_approval BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,

  -- Notifications
  notify_on_completion BOOLEAN DEFAULT true,
  notification_emails TEXT[],

  -- Metadata
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT check_deployment_scope CHECK (
    (deployment_scope = 'single_agent' AND agent_device_id IS NOT NULL) OR
    (deployment_scope = 'business' AND business_id IS NOT NULL) OR
    (deployment_scope = 'all_agents')
  )
);

CREATE INDEX IF NOT EXISTS idx_package_deployments_package ON package_deployments(package_id);
CREATE INDEX IF NOT EXISTS idx_package_deployments_agent ON package_deployments(agent_device_id);
CREATE INDEX IF NOT EXISTS idx_package_deployments_business ON package_deployments(business_id);
CREATE INDEX IF NOT EXISTS idx_package_deployments_status ON package_deployments(deployment_status);
CREATE INDEX IF NOT EXISTS idx_package_deployments_scheduled ON package_deployments(scheduled_for);

-- ============================================================================
-- DEPLOYMENT HISTORY (Per-agent deployment results)
-- ============================================================================

CREATE TABLE IF NOT EXISTS deployment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  deployment_id UUID NOT NULL REFERENCES package_deployments(id) ON DELETE CASCADE,
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES software_packages(id) ON DELETE CASCADE,

  -- Deployment Execution
  status VARCHAR(50) NOT NULL, -- pending, downloading, installing, completed, failed, rolled_back
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  runtime_minutes DECIMAL(10, 2),

  -- Download Phase
  download_started_at TIMESTAMPTZ,
  download_completed_at TIMESTAMPTZ,
  download_size_mb DECIMAL(10, 2),
  download_speed_mbps DECIMAL(10, 2),

  -- Installation Phase
  install_started_at TIMESTAMPTZ,
  install_completed_at TIMESTAMPTZ,

  -- Results
  exit_code INTEGER,
  stdout TEXT,
  stderr TEXT,
  error_message TEXT,

  -- Verification
  checksum_verified BOOLEAN,
  signature_verified BOOLEAN,
  post_install_verification BOOLEAN,

  -- Rollback
  rolled_back BOOLEAN DEFAULT false,
  rollback_reason TEXT,
  rollback_at TIMESTAMPTZ,

  -- System State
  reboot_required BOOLEAN DEFAULT false,
  reboot_performed BOOLEAN DEFAULT false,
  reboot_at TIMESTAMPTZ,

  -- Retry Tracking
  retry_count INTEGER DEFAULT 0,
  is_retry BOOLEAN DEFAULT false,

  -- Metadata
  agent_version VARCHAR(20), -- Agent version at deployment time
  raw_output JSONB
);

CREATE INDEX IF NOT EXISTS idx_deployment_history_deployment ON deployment_history(deployment_id);
CREATE INDEX IF NOT EXISTS idx_deployment_history_agent ON deployment_history(agent_device_id);
CREATE INDEX IF NOT EXISTS idx_deployment_history_package ON deployment_history(package_id);
CREATE INDEX IF NOT EXISTS idx_deployment_history_status ON deployment_history(status);
CREATE INDEX IF NOT EXISTS idx_deployment_history_started ON deployment_history(started_at);

-- ============================================================================
-- PATCH MANAGEMENT (Extends software deployment for OS patches)
-- ============================================================================

CREATE TABLE IF NOT EXISTS patch_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Policy Identification
  policy_name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,

  -- Scope
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,

  -- Patch Types
  include_security_patches BOOLEAN DEFAULT true,
  include_critical_patches BOOLEAN DEFAULT true,
  include_recommended_patches BOOLEAN DEFAULT false,
  include_optional_patches BOOLEAN DEFAULT false,

  -- Approval Workflow
  auto_approve_security BOOLEAN DEFAULT true,
  auto_approve_critical BOOLEAN DEFAULT false,
  require_manual_approval BOOLEAN DEFAULT true,

  -- Deployment Schedule
  schedule_id UUID REFERENCES deployment_schedules(id) ON DELETE SET NULL,
  auto_deploy BOOLEAN DEFAULT false,
  deploy_delay_days INTEGER DEFAULT 7, -- Wait X days before deploying

  -- Reboot Settings
  allow_auto_reboot BOOLEAN DEFAULT false,
  reboot_delay_minutes INTEGER DEFAULT 15,
  reboot_notification_minutes INTEGER DEFAULT 5,

  -- Exclusions
  excluded_patches VARCHAR[], -- KB numbers or patch IDs to exclude
  excluded_categories VARCHAR[], -- Categories to exclude

  -- Notifications
  notify_on_available BOOLEAN DEFAULT true,
  notify_on_deployed BOOLEAN DEFAULT true,
  notification_emails TEXT[],

  -- Metadata
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patch_policies_business ON patch_policies(business_id);
CREATE INDEX IF NOT EXISTS idx_patch_policies_enabled ON patch_policies(enabled);

-- ============================================================================
-- TRIGGER: Update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_deployment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS software_packages_updated_at ON software_packages;
CREATE TRIGGER software_packages_updated_at
BEFORE UPDATE ON software_packages
FOR EACH ROW EXECUTE FUNCTION update_deployment_updated_at();

DROP TRIGGER IF EXISTS package_deployments_updated_at ON package_deployments;
CREATE TRIGGER package_deployments_updated_at
BEFORE UPDATE ON package_deployments
FOR EACH ROW EXECUTE FUNCTION update_deployment_updated_at();

DROP TRIGGER IF EXISTS deployment_schedules_updated_at ON deployment_schedules;
CREATE TRIGGER deployment_schedules_updated_at
BEFORE UPDATE ON deployment_schedules
FOR EACH ROW EXECUTE FUNCTION update_deployment_updated_at();

DROP TRIGGER IF EXISTS patch_policies_updated_at ON patch_policies;
CREATE TRIGGER patch_policies_updated_at
BEFORE UPDATE ON patch_policies
FOR EACH ROW EXECUTE FUNCTION update_deployment_updated_at();

-- ============================================================================
-- TRIGGER: Update deployment statistics
-- ============================================================================

CREATE OR REPLACE FUNCTION update_deployment_statistics()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('completed', 'failed') THEN
    UPDATE software_packages
    SET
      deployment_count = deployment_count + 1,
      success_count = success_count + CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
      failure_count = failure_count + CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END
    WHERE id = NEW.package_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_deployment_stats ON deployment_history;
CREATE TRIGGER trigger_update_deployment_stats
AFTER INSERT OR UPDATE ON deployment_history
FOR EACH ROW
EXECUTE FUNCTION update_deployment_statistics();

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON
  software_packages,
  package_deployments,
  deployment_schedules,
  deployment_history,
  patch_policies
TO postgres;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE software_packages IS 'Catalog of deployable software packages';
COMMENT ON TABLE package_deployments IS 'Deployment jobs for software packages';
COMMENT ON TABLE deployment_schedules IS 'Maintenance windows for deployments';
COMMENT ON TABLE deployment_history IS 'Per-agent deployment execution results';
COMMENT ON TABLE patch_policies IS 'Automated patch management policies';
