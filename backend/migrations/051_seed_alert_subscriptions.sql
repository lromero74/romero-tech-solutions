-- Migration 051: Seed Alert Subscriptions
-- Purpose: Create intelligent default alert subscriptions for MSP operations
-- Created: 2025-01-22

-- This migration creates practical alert subscriptions that an MSP would want:
-- 1. Critical alerts for all agents (immediate notification needed)
-- 2. High/Critical resource alerts (performance monitoring)
-- 3. Security alerts (failed logins, security issues)
-- 4. Disk health warnings (prevent data loss)
-- 5. EOL/Patch alerts (compliance and security)

-- Note: This seeds subscriptions for existing employees
-- If you want to customize these, you can edit them via the Alert Subscriptions UI

DO $$
DECLARE
  v_employee_id UUID;
  v_employee_email VARCHAR(255);
  v_employee_first_name VARCHAR(100);
BEGIN
  -- Loop through each active employee and create their default subscriptions
  FOR v_employee_id, v_employee_email, v_employee_first_name IN
    SELECT id, email, first_name
    FROM employees
    WHERE soft_delete = false
  LOOP
    RAISE NOTICE 'Creating default alert subscriptions for %  (%)', v_employee_first_name, v_employee_email;

    -- Subscription 1: Critical Alerts Only (All Agents)
    -- Purpose: Get immediate notifications for critical issues across all managed devices
    INSERT INTO alert_subscribers (
      employee_id,
      business_id,
      service_location_id,
      agent_id,
      min_severity,
      alert_types,
      metric_types,
      notify_email,
      notify_sms,
      notify_websocket,
      notify_browser,
      email,
      phone_number,
      quiet_hours_start,
      quiet_hours_end,
      quiet_hours_timezone,
      enabled,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      v_employee_id,
      NULL, -- All businesses
      NULL, -- All locations
      NULL, -- All agents
      ARRAY['critical']::VARCHAR[], -- Critical only
      ARRAY[]::VARCHAR[], -- All alert types
      ARRAY['cpu', 'memory', 'disk', 'network']::VARCHAR[], -- All metrics
      true, -- Email notifications
      false, -- No SMS (can enable later)
      true, -- WebSocket (in-app)
      true, -- Browser push
      NULL, -- Use employee's default email
      NULL, -- No phone number
      '22:00'::TIME, -- Quiet hours start at 10 PM
      '07:00'::TIME, -- Quiet hours end at 7 AM
      'America/New_York', -- Default timezone (adjust as needed)
      true, -- Enabled
      v_employee_id,
      NOW(),
      NOW()
    )
    ON CONFLICT DO NOTHING;

    -- Subscription 2: High Resource Usage Alerts
    -- Purpose: Monitor CPU/Memory/Disk usage to prevent performance issues
    INSERT INTO alert_subscribers (
      employee_id,
      business_id,
      service_location_id,
      agent_id,
      min_severity,
      alert_types,
      metric_types,
      notify_email,
      notify_sms,
      notify_websocket,
      notify_browser,
      email,
      phone_number,
      quiet_hours_start,
      quiet_hours_end,
      quiet_hours_timezone,
      enabled,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      v_employee_id,
      NULL,
      NULL,
      NULL,
      ARRAY['critical', 'warning']::VARCHAR[], -- Critical and Warning
      ARRAY[]::VARCHAR[],
      ARRAY['cpu', 'memory', 'disk']::VARCHAR[], -- Resource metrics
      true,
      false,
      true,
      true,
      NULL,
      NULL,
      '22:00'::TIME,
      '07:00'::TIME,
      'America/New_York',
      true,
      v_employee_id,
      NOW(),
      NOW()
    )
    ON CONFLICT DO NOTHING;

    -- Subscription 3: Disk Health & EOL Alerts
    -- Purpose: Prevent data loss and stay ahead of hardware/software failures
    INSERT INTO alert_subscribers (
      employee_id,
      business_id,
      service_location_id,
      agent_id,
      min_severity,
      alert_types,
      metric_types,
      notify_email,
      notify_sms,
      notify_websocket,
      notify_browser,
      email,
      phone_number,
      quiet_hours_start,
      quiet_hours_end,
      quiet_hours_timezone,
      enabled,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      v_employee_id,
      NULL,
      NULL,
      NULL,
      ARRAY['critical', 'warning']::VARCHAR[],
      ARRAY[]::VARCHAR[],
      ARRAY['disk_health', 'eol_status', 'patches']::VARCHAR[], -- Proactive monitoring
      true,
      false,
      true,
      false, -- Browser push disabled for less urgent alerts
      NULL,
      NULL,
      NULL, -- No quiet hours for critical maintenance alerts
      NULL,
      'America/New_York',
      true,
      v_employee_id,
      NOW(),
      NOW()
    )
    ON CONFLICT DO NOTHING;

    -- Subscription 4: Security Alerts
    -- Purpose: Monitor for security incidents (failed logins, vulnerabilities)
    INSERT INTO alert_subscribers (
      employee_id,
      business_id,
      service_location_id,
      agent_id,
      min_severity,
      alert_types,
      metric_types,
      notify_email,
      notify_sms,
      notify_websocket,
      notify_browser,
      email,
      phone_number,
      quiet_hours_start,
      quiet_hours_end,
      quiet_hours_timezone,
      enabled,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      v_employee_id,
      NULL,
      NULL,
      NULL,
      ARRAY['critical', 'warning']::VARCHAR[],
      ARRAY[]::VARCHAR[],
      ARRAY['security', 'failed_logins']::VARCHAR[], -- Security-focused
      true,
      false,
      true,
      true,
      NULL,
      NULL,
      NULL, -- Security alerts 24/7 (no quiet hours)
      NULL,
      'America/New_York',
      true,
      v_employee_id,
      NOW(),
      NOW()
    )
    ON CONFLICT DO NOTHING;

    -- Subscription 5: Service Monitoring Alerts
    -- Purpose: Know when critical services stop running
    INSERT INTO alert_subscribers (
      employee_id,
      business_id,
      service_location_id,
      agent_id,
      min_severity,
      alert_types,
      metric_types,
      notify_email,
      notify_sms,
      notify_websocket,
      notify_browser,
      email,
      phone_number,
      quiet_hours_start,
      quiet_hours_end,
      quiet_hours_timezone,
      enabled,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      v_employee_id,
      NULL,
      NULL,
      NULL,
      ARRAY['critical']::VARCHAR[], -- Only critical service failures
      ARRAY[]::VARCHAR[],
      ARRAY['services', 'backups']::VARCHAR[], -- Service and backup monitoring
      true,
      false,
      true,
      true,
      NULL,
      NULL,
      NULL, -- Critical services 24/7
      NULL,
      'America/New_York',
      true,
      v_employee_id,
      NOW(),
      NOW()
    )
    ON CONFLICT DO NOTHING;

  END LOOP;

  RAISE NOTICE 'Default alert subscriptions created successfully!';
END $$;

-- Add comment
COMMENT ON TABLE alert_subscribers IS 'Alert notification subscriptions - allows employees and clients to customize their alert preferences';

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_alert_subscribers_employee_enabled
  ON alert_subscribers(employee_id, enabled)
  WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alert_subscribers_scope
  ON alert_subscribers(business_id, service_location_id, agent_id)
  WHERE enabled = true;
