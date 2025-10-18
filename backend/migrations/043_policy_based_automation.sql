-- Migration: Policy-Based Automation & Script Library
-- Purpose: Enable policy templates and automated remediation scripts
-- Phase: 1
-- Date: 2025-10-17

-- ============================================================================
-- SCRIPT CATEGORIES (Must be created first - referenced by automation_scripts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS script_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  category_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(50), -- Icon identifier for UI
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default categories
INSERT INTO script_categories (id, category_name, description, sort_order) VALUES
  (gen_random_uuid(), 'System Maintenance', 'Disk cleanup, log rotation, temp file removal', 1),
  (gen_random_uuid(), 'Service Management', 'Start, stop, restart services', 2),
  (gen_random_uuid(), 'Security', 'Security hardening, firewall rules, user management', 3),
  (gen_random_uuid(), 'Monitoring', 'Custom health checks and diagnostics', 4),
  (gen_random_uuid(), 'Backup & Recovery', 'Backup operations and restore procedures', 5),
  (gen_random_uuid(), 'Network', 'Network configuration and diagnostics', 6),
  (gen_random_uuid(), 'Software Management', 'Install, update, remove software', 7),
  (gen_random_uuid(), 'Reporting', 'Generate reports and export data', 8)
ON CONFLICT (category_name) DO NOTHING;

-- ============================================================================
-- AUTOMATION SCRIPT LIBRARY
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Script Identification
  script_name VARCHAR(255) NOT NULL,
  description TEXT,
  script_category_id UUID REFERENCES script_categories(id) ON DELETE SET NULL,

  -- Script Content
  script_type VARCHAR(50) NOT NULL, -- bash, powershell, python, node
  script_content TEXT NOT NULL,
  script_parameters JSONB, -- Expected parameters with validation rules

  -- Platform Support
  supported_os VARCHAR[] DEFAULT ARRAY['linux', 'macos', 'windows'],
  min_agent_version VARCHAR(20),

  -- Execution Settings
  timeout_seconds INTEGER DEFAULT 300,
  requires_elevated BOOLEAN DEFAULT false, -- Requires sudo/admin
  run_as_user VARCHAR(100), -- Specific user to run as (optional)

  -- Safety & Validation
  is_destructive BOOLEAN DEFAULT false, -- Marks dangerous scripts
  requires_approval BOOLEAN DEFAULT false,
  dry_run_supported BOOLEAN DEFAULT false,

  -- Visibility & Access
  is_builtin BOOLEAN DEFAULT false, -- Pre-built scripts vs custom
  is_public BOOLEAN DEFAULT true, -- Available to all MSP clients
  created_by UUID REFERENCES employees(id),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE, -- NULL for global scripts

  -- Version Control
  version VARCHAR(20) DEFAULT '1.0.0',
  changelog TEXT,

  -- Usage Statistics
  execution_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  average_runtime_seconds DECIMAL(10, 2),

  -- Metadata
  tags VARCHAR[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_scripts_category ON automation_scripts(script_category_id);
CREATE INDEX IF NOT EXISTS idx_automation_scripts_type ON automation_scripts(script_type);
CREATE INDEX IF NOT EXISTS idx_automation_scripts_builtin ON automation_scripts(is_builtin);
CREATE INDEX IF NOT EXISTS idx_automation_scripts_business ON automation_scripts(business_id);

-- ============================================================================
-- AUTOMATION POLICIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Policy Identification
  policy_name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,

  -- Policy Type
  policy_type VARCHAR(50) NOT NULL, -- script_execution, configuration, monitoring, compliance

  -- Scope
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  created_by UUID REFERENCES employees(id),

  -- Script-based Policies
  script_id UUID REFERENCES automation_scripts(id) ON DELETE SET NULL,
  script_parameters JSONB, -- Parameter values for script execution

  -- Configuration-based Policies
  configuration_settings JSONB, -- For non-script policies (firewall rules, security settings, etc.)

  -- Execution Schedule
  execution_mode VARCHAR(50) DEFAULT 'manual', -- manual, scheduled, event_triggered
  schedule_cron VARCHAR(100), -- Cron expression for scheduled execution
  trigger_events VARCHAR[], -- Events that trigger this policy (e.g., 'agent_registered', 'disk_low')

  -- Execution Options
  run_on_assignment BOOLEAN DEFAULT false, -- Run immediately when assigned to agent
  max_concurrent_executions INTEGER DEFAULT 10,
  execution_timeout_seconds INTEGER DEFAULT 600,

  -- Failure Handling
  retry_on_failure BOOLEAN DEFAULT false,
  max_retries INTEGER DEFAULT 3,
  retry_delay_seconds INTEGER DEFAULT 60,

  -- Notifications
  notify_on_success BOOLEAN DEFAULT false,
  notify_on_failure BOOLEAN DEFAULT true,
  notification_emails TEXT[],

  -- Compliance & Auditing
  compliance_category VARCHAR(100), -- HIPAA, SOC2, PCI-DSS, etc.
  audit_logging BOOLEAN DEFAULT true,

  -- Metadata
  tags VARCHAR[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_policies_business ON automation_policies(business_id);
CREATE INDEX IF NOT EXISTS idx_automation_policies_enabled ON automation_policies(enabled);
CREATE INDEX IF NOT EXISTS idx_automation_policies_type ON automation_policies(policy_type);
CREATE INDEX IF NOT EXISTS idx_automation_policies_script ON automation_policies(script_id);

-- ============================================================================
-- POLICY ASSIGNMENTS (Which policies apply to which agents)
-- ============================================================================

CREATE TABLE IF NOT EXISTS policy_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  policy_id UUID NOT NULL REFERENCES automation_policies(id) ON DELETE CASCADE,

  -- Assignment Target (either agent or business-wide)
  agent_device_id UUID REFERENCES agent_devices(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,

  -- Assignment Details
  assigned_by UUID REFERENCES employees(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_executed_at TIMESTAMPTZ,
  next_execution_at TIMESTAMPTZ,

  -- Execution Override
  override_schedule BOOLEAN DEFAULT false,
  override_cron VARCHAR(100),

  -- Statistics
  execution_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,

  CONSTRAINT check_assignment_target CHECK (
    (agent_device_id IS NOT NULL AND business_id IS NULL) OR
    (agent_device_id IS NULL AND business_id IS NOT NULL)
  ),
  CONSTRAINT unique_policy_assignment UNIQUE (policy_id, agent_device_id, business_id)
);

CREATE INDEX IF NOT EXISTS idx_policy_assignments_policy ON policy_assignments(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_assignments_agent ON policy_assignments(agent_device_id);
CREATE INDEX IF NOT EXISTS idx_policy_assignments_business ON policy_assignments(business_id);
CREATE INDEX IF NOT EXISTS idx_policy_assignments_next_execution ON policy_assignments(next_execution_at);

-- ============================================================================
-- POLICY EXECUTION HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS policy_execution_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  policy_id UUID NOT NULL REFERENCES automation_policies(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES policy_assignments(id) ON DELETE SET NULL,
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,

  -- Execution Details
  execution_type VARCHAR(50) DEFAULT 'scheduled', -- scheduled, manual, event_triggered
  triggered_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  triggered_by_event VARCHAR(100),

  -- Script Execution (if applicable)
  script_id UUID REFERENCES automation_scripts(id) ON DELETE SET NULL,
  script_parameters JSONB,

  -- Execution Status
  status VARCHAR(50) NOT NULL, -- pending, running, completed, failed, timeout
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  runtime_seconds DECIMAL(10, 2),

  -- Results
  exit_code INTEGER,
  stdout TEXT,
  stderr TEXT,
  error_message TEXT,

  -- Compliance & Audit
  compliance_check_passed BOOLEAN,
  compliance_violations JSONB,

  -- Metadata
  raw_output JSONB
);

CREATE INDEX IF NOT EXISTS idx_policy_execution_policy ON policy_execution_history(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_execution_agent ON policy_execution_history(agent_device_id);
CREATE INDEX IF NOT EXISTS idx_policy_execution_status ON policy_execution_history(status);
CREATE INDEX IF NOT EXISTS idx_policy_execution_started ON policy_execution_history(started_at);

-- ============================================================================
-- POLICY TEMPLATES (Pre-built policy configurations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS policy_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template Identification
  template_name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100), -- Security, Maintenance, Compliance, etc.

  -- Template Content
  policy_config JSONB NOT NULL, -- Complete policy configuration
  script_ids UUID[], -- Scripts included in this template

  -- Visibility
  is_builtin BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT true,

  -- Usage Statistics
  usage_count INTEGER DEFAULT 0,

  -- Metadata
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_templates_category ON policy_templates(category);
CREATE INDEX IF NOT EXISTS idx_policy_templates_builtin ON policy_templates(is_builtin);

-- ============================================================================
-- TRIGGER: Update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_automation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS automation_scripts_updated_at ON automation_scripts;
CREATE TRIGGER automation_scripts_updated_at
BEFORE UPDATE ON automation_scripts
FOR EACH ROW EXECUTE FUNCTION update_automation_updated_at();

DROP TRIGGER IF EXISTS automation_policies_updated_at ON automation_policies;
CREATE TRIGGER automation_policies_updated_at
BEFORE UPDATE ON automation_policies
FOR EACH ROW EXECUTE FUNCTION update_automation_updated_at();

DROP TRIGGER IF EXISTS policy_templates_updated_at ON policy_templates;
CREATE TRIGGER policy_templates_updated_at
BEFORE UPDATE ON policy_templates
FOR EACH ROW EXECUTE FUNCTION update_automation_updated_at();

-- ============================================================================
-- TRIGGER: Update script statistics
-- ============================================================================

CREATE OR REPLACE FUNCTION update_script_statistics()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' OR NEW.status = 'failed' THEN
    UPDATE automation_scripts
    SET
      execution_count = execution_count + 1,
      success_count = success_count + CASE WHEN NEW.status = 'completed' THEN 1 ELSE 0 END,
      failure_count = failure_count + CASE WHEN NEW.status = 'failed' THEN 1 ELSE 0 END,
      average_runtime_seconds = COALESCE(
        (average_runtime_seconds * execution_count + COALESCE(NEW.runtime_seconds, 0)) / (execution_count + 1),
        NEW.runtime_seconds
      )
    WHERE id = NEW.script_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_script_statistics ON policy_execution_history;
CREATE TRIGGER trigger_update_script_statistics
AFTER INSERT OR UPDATE ON policy_execution_history
FOR EACH ROW
EXECUTE FUNCTION update_script_statistics();

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON
  automation_scripts,
  script_categories,
  automation_policies,
  policy_assignments,
  policy_execution_history,
  policy_templates
TO postgres;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE automation_scripts IS 'Library of automation scripts for policy execution';
COMMENT ON TABLE script_categories IS 'Categories for organizing automation scripts';
COMMENT ON TABLE automation_policies IS 'Policy definitions for automated actions';
COMMENT ON TABLE policy_assignments IS 'Assigns policies to agents or businesses';
COMMENT ON TABLE policy_execution_history IS 'Audit trail of policy executions';
COMMENT ON TABLE policy_templates IS 'Pre-built policy configurations for common use cases';
