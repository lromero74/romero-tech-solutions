-- Migration: Alert-to-Ticket Integration
-- Purpose: Automatically create service requests from agent alerts
-- Phase: 1
-- Date: 2025-10-17

-- ============================================================================
-- ALERT-TO-TICKET CONVERSION RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS alert_ticket_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule Identification
  rule_name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,

  -- Matching Criteria
  alert_type VARCHAR(100), -- Match specific alert types (can be NULL for all)
  severity_filter VARCHAR[] DEFAULT ARRAY['critical', 'high'], -- Only create tickets for these severities
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE, -- Rule scope (NULL = all businesses)

  -- Service Request Creation Settings
  -- Note: service_requests uses status_id, priority_level_id, assigned_technician_id
  priority_level VARCHAR(50) DEFAULT 'medium', -- high, medium, low (will lookup ID on creation)
  auto_assign BOOLEAN DEFAULT false,
  assigned_technician_id UUID REFERENCES employees(id) ON DELETE SET NULL,

  -- Title & Description Templates (supports tokens)
  ticket_title_template VARCHAR(500) DEFAULT 'Alert: {{alert_name}} - {{device_name}}',
  ticket_description_template TEXT DEFAULT E'An alert was triggered on {{device_name}}.\n\nAlert: {{alert_name}}\nSeverity: {{severity}}\nTriggered At: {{triggered_at}}\n\nMetric Values:\n{{metric_details}}',

  -- Deduplication
  prevent_duplicates BOOLEAN DEFAULT true,
  duplicate_check_window_minutes INTEGER DEFAULT 60, -- Don't create ticket if similar alert within this window

  -- Escalation
  auto_escalate BOOLEAN DEFAULT false,
  escalate_after_minutes INTEGER,
  escalate_to_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,

  -- Notifications
  notify_on_creation BOOLEAN DEFAULT true,
  notify_emails TEXT[], -- Additional email addresses to notify

  -- Metadata
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_ticket_rules_enabled ON alert_ticket_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_alert_ticket_rules_business ON alert_ticket_rules(business_id);
CREATE INDEX IF NOT EXISTS idx_alert_ticket_rules_alert_type ON alert_ticket_rules(alert_type);

-- ============================================================================
-- ALERT-TICKET MAPPINGS (Track which alerts created which tickets)
-- ============================================================================

CREATE TABLE IF NOT EXISTS alert_ticket_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  alert_history_id UUID NOT NULL REFERENCES agent_alert_history(id) ON DELETE CASCADE,
  service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES alert_ticket_rules(id) ON DELETE SET NULL,

  -- Creation Details
  created_automatically BOOLEAN DEFAULT true,
  created_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Resolution Tracking
  alert_resolved_at TIMESTAMPTZ,
  ticket_resolved_at TIMESTAMPTZ,

  CONSTRAINT unique_alert_ticket UNIQUE (alert_history_id, service_request_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_ticket_mappings_alert ON alert_ticket_mappings(alert_history_id);
CREATE INDEX IF NOT EXISTS idx_alert_ticket_mappings_ticket ON alert_ticket_mappings(service_request_id);
CREATE INDEX IF NOT EXISTS idx_alert_ticket_mappings_rule ON alert_ticket_mappings(rule_id);

-- ============================================================================
-- TICKET ESCALATION RULES
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Rule Identification
  rule_name VARCHAR(255) NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,

  -- Scope
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  service_type_id UUID REFERENCES service_types(id) ON DELETE CASCADE,

  -- Escalation Triggers
  escalate_after_minutes INTEGER NOT NULL,
  escalate_on_severity VARCHAR[] DEFAULT ARRAY['critical', 'high'],
  escalate_on_status VARCHAR[] DEFAULT ARRAY['open', 'in_progress'],

  -- Escalation Actions
  escalate_to_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  change_priority_to VARCHAR(50), -- Bump priority to 'high' or 'critical'
  send_notification BOOLEAN DEFAULT true,
  notification_template TEXT,

  -- Metadata
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escalation_rules_enabled ON ticket_escalation_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_escalation_rules_business ON ticket_escalation_rules(business_id);
CREATE INDEX IF NOT EXISTS idx_escalation_rules_service_type ON ticket_escalation_rules(service_type_id);

-- ============================================================================
-- TICKET ESCALATION HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS ticket_escalation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  escalation_rule_id UUID REFERENCES ticket_escalation_rules(id) ON DELETE SET NULL,

  -- Escalation Details
  escalated_from_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  escalated_to_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  previous_priority VARCHAR(50),
  new_priority VARCHAR(50),

  escalation_reason TEXT,
  escalated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Notification
  notification_sent BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_escalation_history_ticket ON ticket_escalation_history(service_request_id);
CREATE INDEX IF NOT EXISTS idx_escalation_history_rule ON ticket_escalation_history(escalation_rule_id);
CREATE INDEX IF NOT EXISTS idx_escalation_history_escalated_at ON ticket_escalation_history(escalated_at);

-- ============================================================================
-- EXTEND EXISTING TABLES
-- ============================================================================

-- Note: agent_alert_history already has service_request_created column
-- We'll use that instead of adding a new column
-- Verify it exists:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_alert_history'
    AND column_name = 'service_request_created'
  ) THEN
    ALTER TABLE agent_alert_history
    ADD COLUMN service_request_created UUID REFERENCES service_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key to service_requests to track source alert
ALTER TABLE service_requests
ADD COLUMN IF NOT EXISTS source_alert_id UUID REFERENCES agent_alert_history(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_requests_source_alert
ON service_requests(source_alert_id);

-- ============================================================================
-- TRIGGER: Auto-create tickets from alerts
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_ticket_from_alert()
RETURNS TRIGGER AS $$
DECLARE
  matching_rule RECORD;
  new_ticket_id UUID;
  ticket_title TEXT;
  ticket_description TEXT;
  recent_similar_alert UUID;
BEGIN
  -- Only process triggered alerts (not resolved)
  IF NEW.status != 'triggered' THEN
    RETURN NEW;
  END IF;

  -- Find matching alert-to-ticket rules
  FOR matching_rule IN
    SELECT * FROM alert_ticket_rules
    WHERE enabled = true
      AND (alert_type IS NULL OR alert_type = NEW.alert_type)
      AND (business_id IS NULL OR business_id = (
        SELECT business_id FROM agent_devices WHERE id = NEW.agent_device_id
      ))
      AND NEW.severity = ANY(severity_filter)
  LOOP
    -- Check for duplicate alerts if rule requires it
    IF matching_rule.prevent_duplicates THEN
      SELECT id INTO recent_similar_alert
      FROM agent_alert_history
      WHERE agent_device_id = NEW.agent_device_id
        AND alert_type = NEW.alert_type
        AND id != NEW.id
        AND triggered_at > NOW() - (matching_rule.duplicate_check_window_minutes || ' minutes')::INTERVAL
        AND service_request_created IS NOT NULL
      LIMIT 1;

      -- Skip if recent similar alert with ticket exists
      IF recent_similar_alert IS NOT NULL THEN
        RAISE NOTICE 'Skipping ticket creation - duplicate alert within window';
        CONTINUE;
      END IF;
    END IF;

    -- Replace tokens in title template
    ticket_title := matching_rule.ticket_title_template;
    ticket_title := REPLACE(ticket_title, '{{alert_name}}', NEW.alert_name);
    ticket_title := REPLACE(ticket_title, '{{device_name}}', (
      SELECT device_name FROM agent_devices WHERE id = NEW.agent_device_id
    ));
    ticket_title := REPLACE(ticket_title, '{{severity}}', NEW.severity);

    -- Replace tokens in description template
    ticket_description := matching_rule.ticket_description_template;
    ticket_description := REPLACE(ticket_description, '{{alert_name}}', NEW.alert_name);
    ticket_description := REPLACE(ticket_description, '{{device_name}}', (
      SELECT device_name FROM agent_devices WHERE id = NEW.agent_device_id
    ));
    ticket_description := REPLACE(ticket_description, '{{severity}}', NEW.severity);
    ticket_description := REPLACE(ticket_description, '{{triggered_at}}', NEW.triggered_at::TEXT);
    ticket_description := REPLACE(ticket_description, '{{metric_details}}', NEW.metric_values::TEXT);

    -- Create service request
    -- Note: Using description field and will need to set status_id, priority_level_id appropriately
    INSERT INTO service_requests (
      id,
      business_id,
      description,
      assigned_technician_id,
      source_alert_id,
      created_at
    )
    SELECT
      gen_random_uuid(),
      ad.business_id,
      ticket_description,
      matching_rule.assigned_technician_id,
      NEW.id,
      NOW()
    FROM agent_devices ad
    WHERE ad.id = NEW.agent_device_id
    RETURNING id INTO new_ticket_id;

    -- Update alert with service request reference
    NEW.service_request_created := new_ticket_id;

    -- Create mapping record
    INSERT INTO alert_ticket_mappings (
      alert_history_id,
      service_request_id,
      rule_id,
      created_automatically,
      created_at
    ) VALUES (
      NEW.id,
      new_ticket_id,
      matching_rule.id,
      true,
      NOW()
    );

    RAISE NOTICE 'Auto-created service request % from alert %', new_ticket_id, NEW.id;

    -- Only create one ticket per alert (first matching rule wins)
    EXIT;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto ticket creation
DROP TRIGGER IF EXISTS trigger_auto_create_ticket ON agent_alert_history;
CREATE TRIGGER trigger_auto_create_ticket
AFTER INSERT ON agent_alert_history
FOR EACH ROW
EXECUTE FUNCTION auto_create_ticket_from_alert();

-- ============================================================================
-- TRIGGER: Update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_alert_ticket_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS alert_ticket_rules_updated_at ON alert_ticket_rules;
CREATE TRIGGER alert_ticket_rules_updated_at
BEFORE UPDATE ON alert_ticket_rules
FOR EACH ROW EXECUTE FUNCTION update_alert_ticket_updated_at();

DROP TRIGGER IF EXISTS escalation_rules_updated_at ON ticket_escalation_rules;
CREATE TRIGGER escalation_rules_updated_at
BEFORE UPDATE ON ticket_escalation_rules
FOR EACH ROW EXECUTE FUNCTION update_alert_ticket_updated_at();

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON
  alert_ticket_rules,
  alert_ticket_mappings,
  ticket_escalation_rules,
  ticket_escalation_history
TO postgres;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE alert_ticket_rules IS 'Rules for automatically converting alerts into service requests';
COMMENT ON TABLE alert_ticket_mappings IS 'Tracks which alerts created which service requests';
COMMENT ON TABLE ticket_escalation_rules IS 'Rules for escalating unresolved tickets based on time/severity';
COMMENT ON TABLE ticket_escalation_history IS 'Audit trail of ticket escalations';
COMMENT ON TRIGGER trigger_auto_create_ticket ON agent_alert_history IS 'Automatically creates service requests from triggered alerts based on rules';
