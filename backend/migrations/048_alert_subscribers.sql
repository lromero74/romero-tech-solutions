-- Migration 048: Alert Notification Subscribers
-- Purpose: Track who receives which alerts via which channels
-- Created: 2025-10-20

-- ====================================
-- EMPLOYEE ALERT SUBSCRIPTIONS
-- ====================================
CREATE TABLE IF NOT EXISTS alert_subscribers (
  id SERIAL PRIMARY KEY,

  -- Subscriber identity
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- Subscription scope (null = all agents)
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  service_location_id UUID REFERENCES service_locations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agent_devices(id) ON DELETE CASCADE,

  -- Alert filtering
  alert_config_id INTEGER REFERENCES alert_configurations(id) ON DELETE CASCADE,
  min_severity VARCHAR(20)[] DEFAULT '{medium,high,critical}',
  alert_types VARCHAR(50)[] DEFAULT '{high_utilization,low_utilization,rising_trend,declining_trend,volatility_spike}',
  metric_types VARCHAR(50)[] DEFAULT '{cpu,memory,disk}',

  -- Notification channels
  notify_email BOOLEAN DEFAULT true,
  notify_sms BOOLEAN DEFAULT false,
  notify_websocket BOOLEAN DEFAULT true,
  notify_browser BOOLEAN DEFAULT true,

  -- Contact information
  email VARCHAR(255), -- Override employee email
  phone_number VARCHAR(20), -- For SMS notifications

  -- Quiet hours (24-hour format HH:MM)
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  quiet_hours_timezone VARCHAR(50) DEFAULT 'America/New_York',

  -- Status
  enabled BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL,

  -- Ensure at least one notification channel is enabled
  CONSTRAINT at_least_one_channel CHECK (
    notify_email = true OR
    notify_sms = true OR
    notify_websocket = true OR
    notify_browser = true
  )
);

CREATE INDEX idx_alert_subscribers_employee ON alert_subscribers(employee_id) WHERE enabled = true;
CREATE INDEX idx_alert_subscribers_business ON alert_subscribers(business_id) WHERE enabled = true;
CREATE INDEX idx_alert_subscribers_agent ON alert_subscribers(agent_id) WHERE enabled = true;
CREATE INDEX idx_alert_subscribers_severity ON alert_subscribers USING GIN(min_severity);

COMMENT ON TABLE alert_subscribers IS 'Employee subscriptions to system alerts with channel and filtering preferences';
COMMENT ON COLUMN alert_subscribers.min_severity IS 'Array of severity levels to receive: low, medium, high, critical';
COMMENT ON COLUMN alert_subscribers.quiet_hours_start IS 'Do not send notifications during quiet hours (null = no quiet hours)';

-- ====================================
-- CLIENT ALERT SUBSCRIPTIONS
-- ====================================
CREATE TABLE IF NOT EXISTS client_alert_subscriptions (
  id SERIAL PRIMARY KEY,

  -- Client identity
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Subscription scope (null = all agents for business)
  agent_id UUID REFERENCES agent_devices(id) ON DELETE CASCADE,

  -- Alert filtering (clients see simplified categories)
  alert_categories VARCHAR(50)[] DEFAULT '{critical_issue,performance_degradation,security_alert}',

  -- Notification preferences
  notify_email BOOLEAN DEFAULT true,
  notify_sms BOOLEAN DEFAULT false,
  notify_push BOOLEAN DEFAULT true, -- Push notifications via PWA

  -- Contact information
  email VARCHAR(255), -- Override user email
  phone_number VARCHAR(20), -- For SMS

  -- Language preference (overrides user default)
  preferred_language VARCHAR(10), -- 'en' or 'es'

  -- Notification frequency control
  digest_mode BOOLEAN DEFAULT false, -- Send daily digest instead of real-time
  digest_time TIME DEFAULT '08:00:00', -- When to send digest
  digest_timezone VARCHAR(50) DEFAULT 'America/New_York',

  -- Status
  enabled BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT at_least_one_client_channel CHECK (
    notify_email = true OR
    notify_sms = true OR
    notify_push = true
  )
);

CREATE INDEX idx_client_alert_subs_user ON client_alert_subscriptions(user_id) WHERE enabled = true;
CREATE INDEX idx_client_alert_subs_business ON client_alert_subscriptions(business_id) WHERE enabled = true;
CREATE INDEX idx_client_alert_subs_agent ON client_alert_subscriptions(agent_id) WHERE enabled = true;

COMMENT ON TABLE client_alert_subscriptions IS 'Client subscriptions to agent alerts with simplified categories';
COMMENT ON COLUMN client_alert_subscriptions.digest_mode IS 'Send daily digest email instead of real-time notifications';

-- ====================================
-- ALERT ESCALATION POLICIES
-- ====================================
CREATE TABLE IF NOT EXISTS alert_escalation_policies (
  id SERIAL PRIMARY KEY,

  -- Policy identification
  policy_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,

  -- Escalation trigger
  trigger_after_minutes INTEGER NOT NULL DEFAULT 30,
  severity_levels VARCHAR(20)[] DEFAULT '{high,critical}', -- Which severities trigger escalation

  -- Escalation targets
  escalate_to_role_ids UUID[] NOT NULL, -- Array of role IDs to escalate to
  escalate_to_employee_ids UUID[], -- Specific employees (optional)

  -- Notification channels for escalation
  use_email BOOLEAN DEFAULT true,
  use_sms BOOLEAN DEFAULT true,
  use_phone_call BOOLEAN DEFAULT false, -- Future: PagerDuty/Twilio call

  -- Escalation chain (can escalate multiple times)
  max_escalations INTEGER DEFAULT 1,
  escalation_interval_minutes INTEGER DEFAULT 30,

  -- Status
  enabled BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX idx_escalation_policies_enabled ON alert_escalation_policies(enabled);

COMMENT ON TABLE alert_escalation_policies IS 'Define escalation rules for unacknowledged critical alerts';
COMMENT ON COLUMN alert_escalation_policies.escalate_to_role_ids IS 'Array of role UUIDs to notify on escalation';

-- ====================================
-- NOTIFICATION DELIVERY LOG
-- ====================================
CREATE TABLE IF NOT EXISTS alert_notifications (
  id SERIAL PRIMARY KEY,

  -- Alert reference
  alert_history_id INTEGER NOT NULL REFERENCES alert_history(id) ON DELETE CASCADE,

  -- Recipient
  recipient_type VARCHAR(20) NOT NULL CHECK (recipient_type IN ('employee', 'client')),
  recipient_id UUID NOT NULL, -- employee_id or user_id
  recipient_email VARCHAR(255),
  recipient_phone VARCHAR(20),

  -- Delivery details
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'sms', 'websocket', 'browser', 'push')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),

  -- Content
  subject TEXT,
  message_body TEXT,
  language VARCHAR(10), -- 'en' or 'es'

  -- External references
  ses_message_id VARCHAR(255), -- AWS SES message ID
  twilio_sid VARCHAR(255), -- Twilio SMS SID

  -- Delivery tracking
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  failed_at TIMESTAMP,
  error_message TEXT,

  -- Escalation tracking
  is_escalation BOOLEAN DEFAULT false,
  escalation_level INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_alert_notifications_history ON alert_notifications(alert_history_id);
CREATE INDEX idx_alert_notifications_recipient ON alert_notifications(recipient_type, recipient_id);
CREATE INDEX idx_alert_notifications_status ON alert_notifications(status);
CREATE INDEX idx_alert_notifications_sent ON alert_notifications(sent_at DESC);

COMMENT ON TABLE alert_notifications IS 'Log of all alert notification deliveries across all channels';

-- ====================================
-- DEFAULT ESCALATION POLICY
-- ====================================
INSERT INTO alert_escalation_policies (
  policy_name,
  description,
  trigger_after_minutes,
  severity_levels,
  escalate_to_role_ids,
  use_email,
  use_sms,
  max_escalations,
  escalation_interval_minutes,
  enabled
) VALUES (
  'Default Critical Alert Escalation',
  'Escalate critical and high severity alerts to managers and executives if not acknowledged within 30 minutes',
  30,
  '{high,critical}',
  ARRAY[
    (SELECT id FROM roles WHERE name = 'manager'),
    (SELECT id FROM roles WHERE name = 'executive')
  ],
  true,
  true,
  2,
  30,
  true
);

-- ====================================
-- CREATE DEFAULT SUBSCRIPTIONS
-- ====================================
-- Auto-subscribe executives and admins to critical/high alerts
INSERT INTO alert_subscribers (
  employee_id,
  min_severity,
  alert_types,
  metric_types,
  notify_email,
  notify_sms,
  notify_websocket,
  notify_browser,
  enabled,
  created_by
)
SELECT
  e.id as employee_id,
  '{high,critical}' as min_severity,
  '{high_utilization,low_utilization,rising_trend,declining_trend,volatility_spike}' as alert_types,
  '{cpu,memory,disk}' as metric_types,
  true as notify_email,
  true as notify_sms,
  true as notify_websocket,
  true as notify_browser,
  true as enabled,
  e.id as created_by
FROM employees e
JOIN employee_roles er ON e.id = er.employee_id
JOIN roles r ON er.role_id = r.id
WHERE r.name IN ('executive', 'admin')
  AND e.is_active = true
ON CONFLICT DO NOTHING;

COMMENT ON TABLE alert_subscribers IS 'Executives and admins auto-subscribed to critical/high alerts';
