-- Migration 050: Alert Notification Permissions
-- Purpose: Add RBAC permissions for alert notification features
-- Created: 2025-10-20

-- Alert Subscription Permissions (Employees)
INSERT INTO permissions (permission_key, resource_type, action_type, description, is_active)
VALUES
  ('alert_subscriptions.view_own', 'alert_subscriptions', 'view', 'View own alert subscriptions', true),
  ('alert_subscriptions.manage_own', 'alert_subscriptions', 'manage', 'Create and manage own alert subscriptions', true),
  ('alert_subscriptions.view_team', 'alert_subscriptions', 'view', 'View team member alert subscriptions', true),
  ('alert_subscriptions.view_all', 'alert_subscriptions', 'view', 'View all employee alert subscriptions', true),
  ('alert_subscriptions.manage_all', 'alert_subscriptions', 'manage', 'Manage all employee alert subscriptions', true),

  -- Escalation Policy Permissions
  ('escalation_policies.view', 'escalation_policies', 'view', 'View alert escalation policies', true),
  ('escalation_policies.manage', 'escalation_policies', 'manage', 'Create and manage escalation policies', true),

  -- Notification Log Permissions
  ('alert_notifications.view_own', 'alert_notifications', 'view', 'View notifications sent to self', true),
  ('alert_notifications.view_all', 'alert_notifications', 'view', 'View all notification delivery logs', true),
  ('alert_notifications.retry', 'alert_notifications', 'manage', 'Retry failed notification deliveries', true),

  -- Client Alert Configuration (for admins managing client visibility)
  ('alert_configs.manage_client_visibility', 'alert_configurations', 'manage', 'Configure which alerts clients can see', true)
ON CONFLICT (permission_key) DO NOTHING;

-- Grant permissions to roles
DO $$
DECLARE
  v_executive_id UUID := (SELECT id FROM roles WHERE name = 'executive');
  v_admin_id UUID := (SELECT id FROM roles WHERE name = 'admin');
  v_manager_id UUID := (SELECT id FROM roles WHERE name = 'manager');
  v_sales_id UUID := (SELECT id FROM roles WHERE name = 'sales');
  v_tech_id UUID := (SELECT id FROM roles WHERE name = 'technician');
BEGIN
  -- EXECUTIVE: Full access to everything
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT v_executive_id, id, true FROM permissions
  WHERE permission_key LIKE 'alert_%' OR permission_key LIKE 'escalation_%'
  ON CONFLICT DO NOTHING;

  -- ADMIN: Full access to everything
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT v_admin_id, id, true FROM permissions
  WHERE permission_key LIKE 'alert_%' OR permission_key LIKE 'escalation_%'
  ON CONFLICT DO NOTHING;

  -- MANAGER: View team, manage own, view all logs
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT v_manager_id, id, true FROM permissions
  WHERE permission_key IN (
    'alert_subscriptions.view_own',
    'alert_subscriptions.manage_own',
    'alert_subscriptions.view_team',
    'escalation_policies.view',
    'alert_notifications.view_own',
    'alert_notifications.view_all'
  )
  ON CONFLICT DO NOTHING;

  -- SALES: Manage own subscriptions
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT v_sales_id, id, true FROM permissions
  WHERE permission_key IN (
    'alert_subscriptions.view_own',
    'alert_subscriptions.manage_own',
    'alert_notifications.view_own'
  )
  ON CONFLICT DO NOTHING;

  -- TECHNICIAN: Manage own subscriptions
  INSERT INTO role_permissions (role_id, permission_id, is_granted)
  SELECT v_tech_id, id, true FROM permissions
  WHERE permission_key IN (
    'alert_subscriptions.view_own',
    'alert_subscriptions.manage_own',
    'alert_notifications.view_own'
  )
  ON CONFLICT DO NOTHING;
END $$;

COMMENT ON TABLE permissions IS 'Updated with alert notification and escalation permissions';
