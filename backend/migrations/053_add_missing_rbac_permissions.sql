-- Migration 053: Add Missing RBAC Permissions
-- Purpose: Add 15 permissions that are used in code but missing from database
-- Created: 2025-10-22
-- Context: RBAC audit discovered permissions referenced in code but not in database

-- =====================================================================
-- PART 1: Create Missing Permissions
-- =====================================================================

-- Client Files Management Permissions (delete and download)
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('delete.client_files.enable', 'client_files', 'delete', 'Delete client files', true),
  ('download.client_files.enable', 'client_files', 'download', 'Download client files', true)
ON CONFLICT (permission_key) DO NOTHING;

-- Agent Management Permissions (modify - standardizing on modify.agents.enable)
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('modify.agents.enable', 'agents', 'modify', 'Modify and configure monitoring agents', true)
ON CONFLICT (permission_key) DO NOTHING;

-- Automation Policies Permissions
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('view.automation_policies.enable', 'automation_policies', 'view', 'View automation policies', true),
  ('manage.automation_policies.enable', 'automation_policies', 'manage', 'Create, edit, and delete automation policies', true),
  ('view.automation_scripts.enable', 'automation_scripts', 'view', 'View automation scripts', true),
  ('manage.automation_scripts.enable', 'automation_scripts', 'manage', 'Create, edit, and delete automation scripts', true),
  ('view.policy_executions.enable', 'policy_executions', 'view', 'View policy execution history', true)
ON CONFLICT (permission_key) DO NOTHING;

-- Software Deployment Permissions
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('view.software_packages.enable', 'software_packages', 'view', 'View software packages', true),
  ('manage.software_packages.enable', 'software_packages', 'manage', 'Create, edit, and delete software packages', true),
  ('view.deployments.enable', 'deployments', 'view', 'View software deployments', true),
  ('manage.deployments.enable', 'deployments', 'manage', 'Create, execute, and manage software deployments', true),
  ('view.deployment_schedules.enable', 'deployment_schedules', 'view', 'View deployment schedules', true),
  ('manage.deployment_schedules.enable', 'deployment_schedules', 'manage', 'Create and manage deployment schedules', true)
ON CONFLICT (permission_key) DO NOTHING;

-- =====================================================================
-- PART 2: Grant Permissions to Roles
-- =====================================================================

-- Get role IDs
DO $$
DECLARE
  admin_role_id UUID;
  executive_role_id UUID;
  manager_role_id UUID;
BEGIN
  -- Get role IDs
  SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
  SELECT id INTO executive_role_id FROM roles WHERE name = 'executive';
  SELECT id INTO manager_role_id FROM roles WHERE name = 'manager';

  -- Grant ALL permissions to Admin role
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT admin_role_id, id, true
  FROM permissions
  WHERE permission_key IN (
    'delete.client_files.enable',
    'download.client_files.enable',
    'modify.agents.enable',
    'view.automation_policies.enable',
    'manage.automation_policies.enable',
    'view.automation_scripts.enable',
    'manage.automation_scripts.enable',
    'view.policy_executions.enable',
    'view.software_packages.enable',
    'manage.software_packages.enable',
    'view.deployments.enable',
    'manage.deployments.enable',
    'view.deployment_schedules.enable',
    'manage.deployment_schedules.enable'
  )
  ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;

  -- Grant ALL permissions to Executive role
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT executive_role_id, id, true
  FROM permissions
  WHERE permission_key IN (
    'delete.client_files.enable',
    'download.client_files.enable',
    'modify.agents.enable',
    'view.automation_policies.enable',
    'manage.automation_policies.enable',
    'view.automation_scripts.enable',
    'manage.automation_scripts.enable',
    'view.policy_executions.enable',
    'view.software_packages.enable',
    'manage.software_packages.enable',
    'view.deployments.enable',
    'manage.deployments.enable',
    'view.deployment_schedules.enable',
    'manage.deployment_schedules.enable'
  )
  ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;

  -- Grant VIEW-ONLY permissions to Manager role (per Louis's requirements)
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT manager_role_id, id, true
  FROM permissions
  WHERE permission_key IN (
    'download.client_files.enable',  -- Managers can download client files
    'view.automation_policies.enable',  -- Managers can view automation policies
    'view.automation_scripts.enable',   -- Managers can view automation scripts
    'view.policy_executions.enable',    -- Managers can view policy executions
    'view.software_packages.enable',    -- Managers can view software packages
    'view.deployments.enable',          -- Managers can view deployments
    'view.deployment_schedules.enable'  -- Managers can view deployment schedules
  )
  ON CONFLICT (role_id, permission_id) DO UPDATE SET is_granted = true;

  RAISE NOTICE 'Permissions successfully granted to Admin, Executive, and Manager roles';
END $$;

-- =====================================================================
-- PART 3: Migration Summary
-- =====================================================================

DO $$
DECLARE
  permission_count INT;
  admin_count INT;
  executive_count INT;
  manager_count INT;
BEGIN
  -- Count newly added permissions
  SELECT COUNT(*) INTO permission_count
  FROM permissions
  WHERE permission_key IN (
    'delete.client_files.enable',
    'download.client_files.enable',
    'modify.agents.enable',
    'view.automation_policies.enable',
    'manage.automation_policies.enable',
    'view.automation_scripts.enable',
    'manage.automation_scripts.enable',
    'view.policy_executions.enable',
    'view.software_packages.enable',
    'manage.software_packages.enable',
    'view.deployments.enable',
    'manage.deployments.enable',
    'view.deployment_schedules.enable',
    'manage.deployment_schedules.enable'
  );

  -- Count role permissions
  SELECT COUNT(*) INTO admin_count
  FROM role_permissions rp
  JOIN permissions p ON p.id = rp.permission_id
  JOIN roles r ON r.id = rp.role_id
  WHERE r.name = 'admin'
    AND p.permission_key IN (
      'delete.client_files.enable', 'download.client_files.enable', 'modify.agents.enable',
      'view.automation_policies.enable', 'manage.automation_policies.enable',
      'view.automation_scripts.enable', 'manage.automation_scripts.enable',
      'view.policy_executions.enable', 'view.software_packages.enable',
      'manage.software_packages.enable', 'view.deployments.enable', 'manage.deployments.enable',
      'view.deployment_schedules.enable', 'manage.deployment_schedules.enable'
    )
    AND rp.is_granted = true;

  SELECT COUNT(*) INTO executive_count
  FROM role_permissions rp
  JOIN permissions p ON p.id = rp.permission_id
  JOIN roles r ON r.id = rp.role_id
  WHERE r.name = 'executive'
    AND p.permission_key IN (
      'delete.client_files.enable', 'download.client_files.enable', 'modify.agents.enable',
      'view.automation_policies.enable', 'manage.automation_policies.enable',
      'view.automation_scripts.enable', 'manage.automation_scripts.enable',
      'view.policy_executions.enable', 'view.software_packages.enable',
      'manage.software_packages.enable', 'view.deployments.enable', 'manage.deployments.enable',
      'view.deployment_schedules.enable', 'manage.deployment_schedules.enable'
    )
    AND rp.is_granted = true;

  SELECT COUNT(*) INTO manager_count
  FROM role_permissions rp
  JOIN permissions p ON p.id = rp.permission_id
  JOIN roles r ON r.id = rp.role_id
  WHERE r.name = 'manager'
    AND p.permission_key IN (
      'download.client_files.enable', 'view.automation_policies.enable',
      'view.automation_scripts.enable', 'view.policy_executions.enable',
      'view.software_packages.enable', 'view.deployments.enable', 'view.deployment_schedules.enable'
    )
    AND rp.is_granted = true;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration 053 Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Permissions added: %', permission_count;
  RAISE NOTICE 'Admin role granted: % permissions', admin_count;
  RAISE NOTICE 'Executive role granted: % permissions', executive_count;
  RAISE NOTICE 'Manager role granted: % permissions (view-only)', manager_count;
  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANT: Frontend code must be updated to use modify.agents.enable';
  RAISE NOTICE 'instead of edit.agents.enable (see src/components/admin/AgentDashboard.tsx)';
  RAISE NOTICE '========================================';
END $$;
