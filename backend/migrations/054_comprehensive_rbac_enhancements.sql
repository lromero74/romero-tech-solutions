-- Migration 054: Comprehensive RBAC Enhancements
-- Purpose: Add 60+ new permissions for granular access control across all business functions
-- Created: 2025-10-22
-- Context: MSP best practices - financial controls, audit trails, data protection, operational efficiency

-- =====================================================================
-- PHASE 1: FINANCIAL CONTROLS
-- =====================================================================

-- Invoice Management Permissions
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('create.invoices.enable', 'invoices', 'create', 'Generate invoices from service requests', true),
  ('modify.invoices.enable', 'invoices', 'modify', 'Edit invoice details (amounts, descriptions)', true),
  ('void.invoices.enable', 'invoices', 'void', 'Void or cancel invoices', true),
  ('send.invoices.enable', 'invoices', 'send', 'Send invoices to clients via email', true),
  ('export.invoices.enable', 'invoices', 'export', 'Export invoice data (PDF, CSV)', true)
ON CONFLICT (permission_key) DO NOTHING;

-- =====================================================================
-- PHASE 1: REPORT & ANALYTICS ACCESS
-- =====================================================================

-- Reporting Permissions
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('export.reports.enable', 'reports', 'export', 'Export business reports and analytics', true),
  ('view.financial_reports.enable', 'reports', 'view', 'View P&L, revenue, and financial reports', true),
  ('view.technical_reports.enable', 'reports', 'view', 'View technical metrics and SLA compliance reports', true),
  ('view.client_analytics.enable', 'reports', 'view', 'View client usage patterns and health analytics', true)
ON CONFLICT (permission_key) DO NOTHING;

-- =====================================================================
-- PHASE 1: SERVICE REQUEST GRANULARITY
-- =====================================================================

-- Service Request Management Permissions
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('assign.service_requests.enable', 'service_requests', 'assign', 'Assign service requests to technicians', true),
  ('reassign.service_requests.enable', 'service_requests', 'reassign', 'Reassign service requests from one technician to another', true),
  ('escalate.service_requests.enable', 'service_requests', 'escalate', 'Escalate service requests to higher priority or management', true),
  ('close.service_requests.enable', 'service_requests', 'close', 'Close or resolve service requests', true),
  ('reopen.service_requests.enable', 'service_requests', 'reopen', 'Reopen closed service requests', true),
  ('modify.service_requests.enable', 'service_requests', 'modify', 'Edit service request details (title, description, priority)', true),
  ('delete.service_requests.enable', 'service_requests', 'delete', 'Delete service requests (restricted operation)', true)
ON CONFLICT (permission_key) DO NOTHING;

-- =====================================================================
-- PHASE 1: TIME TRACKING CONTROLS
-- =====================================================================

-- Time Entry Permissions
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('create.service_request_time_entries.enable', 'service_request_time_entries', 'create', 'Log time entries for service requests', true),
  ('modify.service_request_time_entries.enable', 'service_request_time_entries', 'modify', 'Edit time entries (own or others)', true),
  ('approve.service_request_time_entries.enable', 'service_request_time_entries', 'approve', 'Approve time entries for billing', true),
  ('export.service_request_time_entries.enable', 'service_request_time_entries', 'export', 'Export time entry reports', true)
ON CONFLICT (permission_key) DO NOTHING;

-- =====================================================================
-- PHASE 1: EMPLOYEE MANAGEMENT GRANULARITY
-- =====================================================================

-- Employee Management Permissions
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('add.employees.enable', 'employees', 'add', 'Create new employee accounts', true),
  ('modify.employees.enable', 'employees', 'modify', 'Edit employee details (profile, contact info)', true),
  ('deactivate.employees.enable', 'employees', 'deactivate', 'Soft delete or deactivate employees', true),
  ('hardDelete.employees.enable', 'employees', 'hardDelete', 'Permanently delete employee accounts', true),
  ('view.employee_sensitive_data.enable', 'employees', 'view', 'View sensitive employee data (SSN, salary, emergency contacts)', true),
  ('modify.employee_roles.enable', 'employees', 'modify', 'Change employee roles and permissions', true),
  ('reset.employee_passwords.enable', 'employees', 'reset', 'Force password reset for employees', true)
ON CONFLICT (permission_key) DO NOTHING;

-- =====================================================================
-- PHASE 1: AGENT/RMM SECURITY
-- =====================================================================

-- Agent Security Permissions
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('install.agents.enable', 'agents', 'install', 'Deploy new monitoring agents to client systems', true),
  ('uninstall.agents.enable', 'agents', 'uninstall', 'Remove monitoring agents from client systems', true),
  ('view.agent_sensitive_data.enable', 'agents', 'view', 'View agent secrets, API keys, and credentials', true),
  ('modify.agent_alerts_thresholds.enable', 'agent_alerts', 'modify', 'Change alert thresholds and conditions', true),
  ('execute.agent_scripts.enable', 'agents', 'execute', 'Run custom scripts on client systems via agents', true),
  ('access.agent_remote_shell.enable', 'agents', 'access', 'Remote shell access to client systems via agent', true),
  ('view.agent_audit_trail.enable', 'agents', 'view', 'View agent command execution history and audit logs', true)
ON CONFLICT (permission_key) DO NOTHING;

-- =====================================================================
-- PHASE 2: AUTOMATION SECURITY
-- =====================================================================

-- Automation Permissions
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('execute.automation_policies.enable', 'automation_policies', 'execute', 'Manually trigger automation policies', true),
  ('approve.automation_policies.enable', 'automation_policies', 'approve', 'Approve automation policies before activation', true),
  ('test.automation_scripts.enable', 'automation_scripts', 'test', 'Test automation scripts in sandbox environment', true),
  ('view.automation_audit_log.enable', 'automation_policies', 'view', 'View automation execution history and logs', true)
ON CONFLICT (permission_key) DO NOTHING;

-- =====================================================================
-- PHASE 2: CLIENT DATA PROTECTION (COMPLIANCE)
-- =====================================================================

-- Client Data Protection Permissions
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('export.client_data.enable', 'clients', 'export', 'Export client information (GDPR data portability)', true),
  ('delete.client_data.enable', 'clients', 'delete', 'Delete client data (GDPR right to deletion)', true),
  ('view.client_audit_log.enable', 'clients', 'view', 'View client data access logs and history', true),
  ('mask.client_sensitive_data.enable', 'clients', 'mask', 'View clients with PII masked for privacy', true)
ON CONFLICT (permission_key) DO NOTHING;

-- =====================================================================
-- PHASE 2: COMMUNICATION PERMISSIONS
-- =====================================================================

-- Communication Permissions
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('send.client_emails.enable', 'communication', 'send', 'Send emails to clients', true),
  ('send.sms_notifications.enable', 'communication', 'send', 'Send SMS notifications to clients', true),
  ('view.communication_history.enable', 'communication', 'view', 'View email and SMS communication logs', true),
  ('manage.email_templates.enable', 'communication', 'manage', 'Create and edit email templates', true)
ON CONFLICT (permission_key) DO NOTHING;

-- =====================================================================
-- PHASE 3: SUBSCRIPTION & BILLING
-- =====================================================================

-- Subscription and Billing Permissions
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('modify.client_subscriptions.enable', 'subscriptions', 'modify', 'Change client subscription plans and tiers', true),
  ('view.payment_methods.enable', 'payments', 'view', 'View stored payment methods and billing information', true),
  ('process.refunds.enable', 'payments', 'process', 'Issue refunds to clients', true),
  ('manage.billing_settings.enable', 'billing', 'manage', 'Configure billing rules, terms, and settings', true)
ON CONFLICT (permission_key) DO NOTHING;

-- =====================================================================
-- PHASE 3: ASSET MANAGEMENT
-- =====================================================================

-- Asset Management Permissions
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('create.assets.enable', 'assets', 'create', 'Add hardware and software assets to inventory', true),
  ('modify.assets.enable', 'assets', 'modify', 'Update asset information and details', true),
  ('delete.assets.enable', 'assets', 'delete', 'Remove assets from inventory', true),
  ('transfer.assets.enable', 'assets', 'transfer', 'Transfer assets between clients or locations', true),
  ('view.asset_financial_data.enable', 'assets', 'view', 'View asset costs, depreciation, and financial data', true),
  ('manage.asset_warranties.enable', 'assets', 'manage', 'Track and manage asset warranty information', true),
  ('manage.asset_licenses.enable', 'assets', 'manage', 'Track and manage software licenses', true)
ON CONFLICT (permission_key) DO NOTHING;

-- =====================================================================
-- PHASE 3: AUDIT & COMPLIANCE
-- =====================================================================

-- Audit and Compliance Permissions
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('view.system_audit_log.enable', 'audit_logs', 'view', 'View all system changes and audit trail', true),
  ('export.audit_logs.enable', 'audit_logs', 'export', 'Export audit data for compliance and reporting', true),
  ('view.login_history.enable', 'security', 'view', 'View employee and client login history', true),
  ('view.failed_login_attempts.enable', 'security', 'view', 'View failed login attempts and security incidents', true),
  ('manage.data_retention.enable', 'compliance', 'manage', 'Configure data retention policies', true)
ON CONFLICT (permission_key) DO NOTHING;

-- =====================================================================
-- PART 2: GRANT PERMISSIONS TO ROLES
-- =====================================================================

DO $$
DECLARE
  admin_role_id UUID;
  executive_role_id UUID;
  manager_role_id UUID;
  sales_role_id UUID;
  technician_role_id UUID;
BEGIN
  -- Get role IDs
  SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
  SELECT id INTO executive_role_id FROM roles WHERE name = 'executive';
  SELECT id INTO manager_role_id FROM roles WHERE name = 'manager';
  SELECT id INTO sales_role_id FROM roles WHERE name = 'sales';
  SELECT id INTO technician_role_id FROM roles WHERE name = 'technician';

  -- ============================================================
  -- ADMIN ROLE: Grant ALL new permissions
  -- ============================================================
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT admin_role_id, id, true
  FROM permissions
  WHERE permission_key IN (
    -- Financial Controls
    'create.invoices.enable', 'modify.invoices.enable', 'void.invoices.enable',
    'send.invoices.enable', 'export.invoices.enable',
    -- Reports & Analytics
    'export.reports.enable', 'view.financial_reports.enable',
    'view.technical_reports.enable', 'view.client_analytics.enable',
    -- Service Requests
    'assign.service_requests.enable', 'reassign.service_requests.enable',
    'escalate.service_requests.enable', 'close.service_requests.enable',
    'reopen.service_requests.enable', 'modify.service_requests.enable',
    'delete.service_requests.enable',
    -- Time Tracking
    'create.service_request_time_entries.enable', 'modify.service_request_time_entries.enable',
    'approve.service_request_time_entries.enable', 'export.service_request_time_entries.enable',
    -- Employee Management
    'add.employees.enable', 'modify.employees.enable', 'deactivate.employees.enable',
    'hardDelete.employees.enable', 'view.employee_sensitive_data.enable',
    'modify.employee_roles.enable', 'reset.employee_passwords.enable',
    -- Agent Security
    'install.agents.enable', 'uninstall.agents.enable', 'view.agent_sensitive_data.enable',
    'modify.agent_alerts_thresholds.enable', 'execute.agent_scripts.enable',
    'access.agent_remote_shell.enable', 'view.agent_audit_trail.enable',
    -- Automation Security
    'execute.automation_policies.enable', 'approve.automation_policies.enable',
    'test.automation_scripts.enable', 'view.automation_audit_log.enable',
    -- Client Data Protection
    'export.client_data.enable', 'delete.client_data.enable',
    'view.client_audit_log.enable', 'mask.client_sensitive_data.enable',
    -- Communication
    'send.client_emails.enable', 'send.sms_notifications.enable',
    'view.communication_history.enable', 'manage.email_templates.enable',
    -- Subscription & Billing
    'modify.client_subscriptions.enable', 'view.payment_methods.enable',
    'process.refunds.enable', 'manage.billing_settings.enable',
    -- Asset Management
    'create.assets.enable', 'modify.assets.enable', 'delete.assets.enable',
    'transfer.assets.enable', 'view.asset_financial_data.enable',
    'manage.asset_warranties.enable', 'manage.asset_licenses.enable',
    -- Audit & Compliance
    'view.system_audit_log.enable', 'export.audit_logs.enable',
    'view.login_history.enable', 'view.failed_login_attempts.enable',
    'manage.data_retention.enable'
  )
  ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;

  -- ============================================================
  -- EXECUTIVE ROLE: Grant ALL new permissions (same as admin)
  -- ============================================================
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT executive_role_id, id, true
  FROM permissions
  WHERE permission_key IN (
    -- Financial Controls
    'create.invoices.enable', 'modify.invoices.enable', 'void.invoices.enable',
    'send.invoices.enable', 'export.invoices.enable',
    -- Reports & Analytics
    'export.reports.enable', 'view.financial_reports.enable',
    'view.technical_reports.enable', 'view.client_analytics.enable',
    -- Service Requests
    'assign.service_requests.enable', 'reassign.service_requests.enable',
    'escalate.service_requests.enable', 'close.service_requests.enable',
    'reopen.service_requests.enable', 'modify.service_requests.enable',
    'delete.service_requests.enable',
    -- Time Tracking
    'create.service_request_time_entries.enable', 'modify.service_request_time_entries.enable',
    'approve.service_request_time_entries.enable', 'export.service_request_time_entries.enable',
    -- Employee Management
    'add.employees.enable', 'modify.employees.enable', 'deactivate.employees.enable',
    'hardDelete.employees.enable', 'view.employee_sensitive_data.enable',
    'modify.employee_roles.enable', 'reset.employee_passwords.enable',
    -- Agent Security
    'install.agents.enable', 'uninstall.agents.enable', 'view.agent_sensitive_data.enable',
    'modify.agent_alerts_thresholds.enable', 'execute.agent_scripts.enable',
    'access.agent_remote_shell.enable', 'view.agent_audit_trail.enable',
    -- Automation Security
    'execute.automation_policies.enable', 'approve.automation_policies.enable',
    'test.automation_scripts.enable', 'view.automation_audit_log.enable',
    -- Client Data Protection
    'export.client_data.enable', 'delete.client_data.enable',
    'view.client_audit_log.enable', 'mask.client_sensitive_data.enable',
    -- Communication
    'send.client_emails.enable', 'send.sms_notifications.enable',
    'view.communication_history.enable', 'manage.email_templates.enable',
    -- Subscription & Billing
    'modify.client_subscriptions.enable', 'view.payment_methods.enable',
    'process.refunds.enable', 'manage.billing_settings.enable',
    -- Asset Management
    'create.assets.enable', 'modify.assets.enable', 'delete.assets.enable',
    'transfer.assets.enable', 'view.asset_financial_data.enable',
    'manage.asset_warranties.enable', 'manage.asset_licenses.enable',
    -- Audit & Compliance
    'view.system_audit_log.enable', 'export.audit_logs.enable',
    'view.login_history.enable', 'view.failed_login_attempts.enable',
    'manage.data_retention.enable'
  )
  ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;

  -- ============================================================
  -- MANAGER ROLE: Operational permissions (view/export focus)
  -- ============================================================
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT manager_role_id, id, true
  FROM permissions
  WHERE permission_key IN (
    -- Financial Controls (view/export only)
    'export.invoices.enable',
    -- Reports & Analytics (all reports)
    'export.reports.enable', 'view.financial_reports.enable',
    'view.technical_reports.enable', 'view.client_analytics.enable',
    -- Service Requests (all except delete)
    'assign.service_requests.enable', 'reassign.service_requests.enable',
    'escalate.service_requests.enable', 'close.service_requests.enable',
    'reopen.service_requests.enable', 'modify.service_requests.enable',
    -- Time Tracking (all)
    'create.service_request_time_entries.enable', 'modify.service_request_time_entries.enable',
    'approve.service_request_time_entries.enable', 'export.service_request_time_entries.enable',
    -- Employee Management (no sensitive data, no hard delete)
    'add.employees.enable', 'modify.employees.enable', 'deactivate.employees.enable',
    'reset.employee_passwords.enable',
    -- Agent Security (view and monitoring only)
    'view.agent_audit_trail.enable', 'modify.agent_alerts_thresholds.enable',
    -- Automation Security (view, approve, execute)
    'execute.automation_policies.enable', 'approve.automation_policies.enable',
    'view.automation_audit_log.enable',
    -- Client Data Protection (view audit, mask sensitive)
    'view.client_audit_log.enable', 'mask.client_sensitive_data.enable',
    -- Communication (all except template management)
    'send.client_emails.enable', 'send.sms_notifications.enable',
    'view.communication_history.enable',
    -- Subscription & Billing (view only)
    'view.payment_methods.enable',
    -- Asset Management (all)
    'create.assets.enable', 'modify.assets.enable', 'delete.assets.enable',
    'transfer.assets.enable', 'view.asset_financial_data.enable',
    'manage.asset_warranties.enable', 'manage.asset_licenses.enable',
    -- Audit & Compliance (view only)
    'view.system_audit_log.enable', 'view.login_history.enable',
    'view.failed_login_attempts.enable'
  )
  ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;

  -- ============================================================
  -- SALES ROLE: Client-facing permissions
  -- ============================================================
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT sales_role_id, id, true
  FROM permissions
  WHERE permission_key IN (
    -- Reports & Analytics (client analytics only)
    'view.client_analytics.enable',
    -- Service Requests (assign, modify, escalate)
    'assign.service_requests.enable', 'escalate.service_requests.enable',
    'modify.service_requests.enable',
    -- Time Tracking (view and export only)
    'export.service_request_time_entries.enable',
    -- Client Data Protection (mask sensitive)
    'mask.client_sensitive_data.enable',
    -- Communication (send emails/SMS, view history)
    'send.client_emails.enable', 'send.sms_notifications.enable',
    'view.communication_history.enable',
    -- Subscription & Billing (view and modify subscriptions)
    'modify.client_subscriptions.enable', 'view.payment_methods.enable'
  )
  ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;

  -- ============================================================
  -- TECHNICIAN ROLE: Technical operations only
  -- ============================================================
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT technician_role_id, id, true
  FROM permissions
  WHERE permission_key IN (
    -- Reports & Analytics (technical reports only)
    'view.technical_reports.enable',
    -- Service Requests (complete own, escalate)
    'escalate.service_requests.enable', 'close.service_requests.enable',
    -- Time Tracking (create and view own)
    'create.service_request_time_entries.enable',
    -- Agent Security (execute approved scripts only, view audit)
    'view.agent_audit_trail.enable',
    -- Client Data Protection (mask sensitive)
    'mask.client_sensitive_data.enable',
    -- Communication (view history only)
    'view.communication_history.enable',
    -- Asset Management (create, modify, view - not delete, not financial)
    'create.assets.enable', 'modify.assets.enable',
    'manage.asset_warranties.enable', 'manage.asset_licenses.enable'
  )
  ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;

  RAISE NOTICE 'Permissions successfully granted to all roles';
END $$;

-- =====================================================================
-- PART 3: MIGRATION SUMMARY
-- =====================================================================

DO $$
DECLARE
  permission_count INT;
  admin_count INT;
  executive_count INT;
  manager_count INT;
  sales_count INT;
  technician_count INT;
BEGIN
  -- Count newly added permissions
  SELECT COUNT(*) INTO permission_count
  FROM permissions
  WHERE permission_key IN (
    'create.invoices.enable', 'modify.invoices.enable', 'void.invoices.enable',
    'send.invoices.enable', 'export.invoices.enable',
    'export.reports.enable', 'view.financial_reports.enable',
    'view.technical_reports.enable', 'view.client_analytics.enable',
    'assign.service_requests.enable', 'reassign.service_requests.enable',
    'escalate.service_requests.enable', 'close.service_requests.enable',
    'reopen.service_requests.enable', 'modify.service_requests.enable',
    'delete.service_requests.enable',
    'create.service_request_time_entries.enable', 'modify.service_request_time_entries.enable',
    'approve.service_request_time_entries.enable', 'export.service_request_time_entries.enable',
    'add.employees.enable', 'modify.employees.enable', 'deactivate.employees.enable',
    'hardDelete.employees.enable', 'view.employee_sensitive_data.enable',
    'modify.employee_roles.enable', 'reset.employee_passwords.enable',
    'install.agents.enable', 'uninstall.agents.enable', 'view.agent_sensitive_data.enable',
    'modify.agent_alerts_thresholds.enable', 'execute.agent_scripts.enable',
    'access.agent_remote_shell.enable', 'view.agent_audit_trail.enable',
    'execute.automation_policies.enable', 'approve.automation_policies.enable',
    'test.automation_scripts.enable', 'view.automation_audit_log.enable',
    'export.client_data.enable', 'delete.client_data.enable',
    'view.client_audit_log.enable', 'mask.client_sensitive_data.enable',
    'send.client_emails.enable', 'send.sms_notifications.enable',
    'view.communication_history.enable', 'manage.email_templates.enable',
    'modify.client_subscriptions.enable', 'view.payment_methods.enable',
    'process.refunds.enable', 'manage.billing_settings.enable',
    'create.assets.enable', 'modify.assets.enable', 'delete.assets.enable',
    'transfer.assets.enable', 'view.asset_financial_data.enable',
    'manage.asset_warranties.enable', 'manage.asset_licenses.enable',
    'view.system_audit_log.enable', 'export.audit_logs.enable',
    'view.login_history.enable', 'view.failed_login_attempts.enable',
    'manage.data_retention.enable'
  );

  -- Count role permissions granted
  SELECT COUNT(DISTINCT p.permission_key) INTO admin_count
  FROM role_permissions rp
  JOIN permissions p ON p.id = rp.permission_id
  JOIN roles r ON r.id = rp.role_id
  WHERE r.name = 'admin' AND rp.is_granted = true;

  SELECT COUNT(DISTINCT p.permission_key) INTO executive_count
  FROM role_permissions rp
  JOIN permissions p ON p.id = rp.permission_id
  JOIN roles r ON r.id = rp.role_id
  WHERE r.name = 'executive' AND rp.is_granted = true;

  SELECT COUNT(DISTINCT p.permission_key) INTO manager_count
  FROM role_permissions rp
  JOIN permissions p ON p.id = rp.permission_id
  JOIN roles r ON r.id = rp.role_id
  WHERE r.name = 'manager' AND rp.is_granted = true;

  SELECT COUNT(DISTINCT p.permission_key) INTO sales_count
  FROM role_permissions rp
  JOIN permissions p ON p.id = rp.permission_id
  JOIN roles r ON r.id = rp.role_id
  WHERE r.name = 'sales' AND rp.is_granted = true;

  SELECT COUNT(DISTINCT p.permission_key) INTO technician_count
  FROM role_permissions rp
  JOIN permissions p ON p.id = rp.permission_id
  JOIN roles r ON r.id = rp.role_id
  WHERE r.name = 'technician' AND rp.is_granted = true;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 054 Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'New permissions added: %', permission_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Total permissions per role:';
  RAISE NOTICE '  Admin:       % permissions', admin_count;
  RAISE NOTICE '  Executive:   % permissions', executive_count;
  RAISE NOTICE '  Manager:     % permissions', manager_count;
  RAISE NOTICE '  Sales:       % permissions', sales_count;
  RAISE NOTICE '  Technician:  % permissions', technician_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Permission Categories Added:';
  RAISE NOTICE '  ✓ Financial Controls (5 permissions)';
  RAISE NOTICE '  ✓ Report & Analytics (4 permissions)';
  RAISE NOTICE '  ✓ Service Request Granularity (7 permissions)';
  RAISE NOTICE '  ✓ Time Tracking Controls (4 permissions)';
  RAISE NOTICE '  ✓ Employee Management (7 permissions)';
  RAISE NOTICE '  ✓ Agent/RMM Security (7 permissions)';
  RAISE NOTICE '  ✓ Automation Security (4 permissions)';
  RAISE NOTICE '  ✓ Client Data Protection (4 permissions)';
  RAISE NOTICE '  ✓ Communication (4 permissions)';
  RAISE NOTICE '  ✓ Subscription & Billing (4 permissions)';
  RAISE NOTICE '  ✓ Asset Management (7 permissions)';
  RAISE NOTICE '  ✓ Audit & Compliance (5 permissions)';
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT STEPS:';
  RAISE NOTICE '  1. Review role permission assignments';
  RAISE NOTICE '  2. Update frontend components to use new permissions';
  RAISE NOTICE '  3. Update backend routes to enforce new permissions';
  RAISE NOTICE '  4. Test permission checks for each role';
  RAISE NOTICE '========================================';
END $$;
