-- Service Request Workflow & Notification System
-- Created: 2025-10-02
-- Implements automated workflow with email notifications, acknowledgments, and timeouts

-- ===================================
-- SERVICE REQUEST WORKFLOW STATE
-- ===================================
-- Tracks the current state of each service request in the workflow

CREATE TABLE service_request_workflow_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference to service request
    service_request_id UUID NOT NULL UNIQUE REFERENCES service_requests(id) ON DELETE CASCADE,

    -- Workflow state tracking
    current_state VARCHAR(50) NOT NULL DEFAULT 'pending_acknowledgment',
    -- States: pending_acknowledgment, acknowledged, started, completed, closed

    -- Assignment tracking
    acknowledged_by_employee_id UUID REFERENCES employees(id),
    acknowledged_at TIMESTAMP,

    started_by_employee_id UUID REFERENCES employees(id),
    started_at TIMESTAMP,

    completed_by_employee_id UUID REFERENCES employees(id),
    completed_at TIMESTAMP,

    -- Retry and timeout tracking
    acknowledgment_reminder_count INTEGER DEFAULT 0,
    last_acknowledgment_reminder_sent_at TIMESTAMP,

    start_reminder_count INTEGER DEFAULT 0,
    last_start_reminder_sent_at TIMESTAMP,

    -- Next scheduled action (for background job processing)
    next_scheduled_action VARCHAR(50), -- 'send_acknowledgment_reminder', 'send_start_reminder'
    next_scheduled_action_at TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_state CHECK (current_state IN (
        'pending_acknowledgment',
        'acknowledged',
        'started',
        'completed',
        'closed',
        'cancelled'
    ))
);

CREATE INDEX idx_workflow_state_service_request ON service_request_workflow_state(service_request_id);
CREATE INDEX idx_workflow_state_current_state ON service_request_workflow_state(current_state);
CREATE INDEX idx_workflow_state_next_scheduled ON service_request_workflow_state(next_scheduled_action_at);
CREATE INDEX idx_workflow_state_acknowledged_by ON service_request_workflow_state(acknowledged_by_employee_id);

-- ===================================
-- SERVICE REQUEST ACTION TOKENS
-- ===================================
-- Generates unique, time-limited tokens for acknowledge/start/close actions

CREATE TABLE service_request_action_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference to service request
    service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,

    -- Token details
    token VARCHAR(255) NOT NULL UNIQUE,
    action_type VARCHAR(50) NOT NULL, -- 'acknowledge', 'start', 'close'

    -- Recipient tracking (which employee this token is for)
    employee_id UUID NOT NULL REFERENCES employees(id),
    employee_email VARCHAR(255) NOT NULL,

    -- Token state
    is_used BOOLEAN DEFAULT false,
    used_at TIMESTAMP,
    used_by_employee_id UUID REFERENCES employees(id),

    is_expired BOOLEAN DEFAULT false,
    expired_at TIMESTAMP,

    -- Retry tracking (which attempt this token belongs to)
    retry_attempt INTEGER DEFAULT 0,

    -- Token expiration (null means no expiration)
    expires_at TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_action_type CHECK (action_type IN ('acknowledge', 'start', 'close'))
);

CREATE INDEX idx_action_tokens_token ON service_request_action_tokens(token);
CREATE INDEX idx_action_tokens_service_request ON service_request_action_tokens(service_request_id);
CREATE INDEX idx_action_tokens_employee ON service_request_action_tokens(employee_id);
CREATE INDEX idx_action_tokens_is_used ON service_request_action_tokens(is_used);
CREATE INDEX idx_action_tokens_is_expired ON service_request_action_tokens(is_expired);

-- ===================================
-- WORKFLOW NOTIFICATION RULES (Configurable by Admins)
-- ===================================
-- Defines who gets notified, when, and how often

CREATE TABLE workflow_notification_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Rule identification
    rule_name VARCHAR(100) NOT NULL,
    rule_description TEXT,

    -- Trigger conditions
    trigger_event VARCHAR(50) NOT NULL,
    -- Events: 'service_request_created', 'acknowledgment_timeout', 'acknowledged',
    --         'start_timeout', 'started', 'completed', 'closed'

    -- Recipients (can be role-based or specific employees)
    recipient_type VARCHAR(50) NOT NULL, -- 'role', 'specific_employee', 'service_request_creator'
    recipient_roles TEXT[], -- Array of role names: ['executive', 'admin', 'technician']
    recipient_employee_ids UUID[], -- Specific employee IDs

    -- Notification settings
    notification_type VARCHAR(50) NOT NULL DEFAULT 'email', -- 'email', 'sms', 'push'
    email_template_name VARCHAR(100),

    -- Timeout and retry settings
    timeout_minutes INTEGER, -- How long to wait before triggering (e.g., 2 min for acknowledgment)
    max_retry_count INTEGER DEFAULT 0, -- How many times to retry (0 = no retry)
    retry_interval_minutes INTEGER, -- How long between retries

    -- Ordering and priority
    execution_order INTEGER DEFAULT 0, -- Lower numbers execute first
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_employee_id UUID REFERENCES employees(id),

    CONSTRAINT valid_trigger_event CHECK (trigger_event IN (
        'service_request_created',
        'acknowledgment_timeout',
        'acknowledged',
        'start_timeout',
        'started',
        'completed',
        'closed'
    )),
    CONSTRAINT valid_recipient_type CHECK (recipient_type IN (
        'role',
        'specific_employee',
        'service_request_creator',
        'acknowledging_employee',
        'assigned_employee'
    ))
);

CREATE INDEX idx_notification_rules_trigger ON workflow_notification_rules(trigger_event);
CREATE INDEX idx_notification_rules_is_active ON workflow_notification_rules(is_active);
CREATE INDEX idx_notification_rules_execution_order ON workflow_notification_rules(execution_order);

-- ===================================
-- WORKFLOW NOTIFICATION LOG
-- ===================================
-- Tracks all notifications sent for audit and debugging

CREATE TABLE workflow_notification_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Reference to service request
    service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,

    -- Notification details
    notification_rule_id UUID REFERENCES workflow_notification_rules(id),
    trigger_event VARCHAR(50) NOT NULL,
    notification_type VARCHAR(50) NOT NULL,

    -- Recipients
    recipient_employee_id UUID REFERENCES employees(id),
    recipient_email VARCHAR(255),
    recipient_type VARCHAR(50), -- 'employee', 'client'

    -- Email details
    email_subject VARCHAR(255),
    email_template_used VARCHAR(100),

    -- Token tracking (if notification included action link)
    action_token_id UUID REFERENCES service_request_action_tokens(id),

    -- Delivery status
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivery_status VARCHAR(50) DEFAULT 'sent', -- 'sent', 'failed', 'bounced'
    delivery_error TEXT,

    -- Retry tracking
    retry_attempt INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notification_log_service_request ON workflow_notification_log(service_request_id);
CREATE INDEX idx_notification_log_recipient ON workflow_notification_log(recipient_employee_id);
CREATE INDEX idx_notification_log_trigger_event ON workflow_notification_log(trigger_event);
CREATE INDEX idx_notification_log_sent_at ON workflow_notification_log(sent_at);

-- ===================================
-- DEFAULT WORKFLOW NOTIFICATION RULES
-- ===================================
-- Insert default notification rules that can be customized by admins

INSERT INTO workflow_notification_rules (
    rule_name,
    rule_description,
    trigger_event,
    recipient_type,
    recipient_roles,
    notification_type,
    email_template_name,
    timeout_minutes,
    max_retry_count,
    retry_interval_minutes,
    execution_order,
    is_active
) VALUES
-- 1. Initial notification to executives, admins, and technicians
(
    'Initial Service Request Notification',
    'Notify executives, admins, and technicians when a new service request is created',
    'service_request_created',
    'role',
    ARRAY['executive', 'admin', 'technician'],
    'email',
    'service_request_acknowledgment',
    0, -- No timeout (send immediately)
    0, -- No retry (handled by next rule)
    NULL,
    1,
    true
),

-- 2. Acknowledgment timeout reminder (2 minutes)
(
    'Acknowledgment Timeout Reminder',
    'Resend notification if service request is not acknowledged within 2 minutes',
    'acknowledgment_timeout',
    'role',
    ARRAY['executive', 'admin', 'technician'],
    'email',
    'service_request_acknowledgment',
    2, -- 2 minutes timeout
    5, -- Retry up to 5 times
    2, -- Every 2 minutes
    2,
    true
),

-- 3. Notification to client when acknowledged
(
    'Client Acknowledgment Notification',
    'Notify client when service request is acknowledged by an employee',
    'acknowledged',
    'service_request_creator',
    NULL,
    'email',
    'service_request_acknowledged_client',
    0,
    0,
    NULL,
    3,
    true
),

-- 4. Notification to acknowledging employee to start
(
    'Employee Start Service Request',
    'Send start link to employee who acknowledged the service request',
    'acknowledged',
    'acknowledging_employee',
    NULL,
    'email',
    'service_request_start_link',
    0,
    0,
    NULL,
    4,
    true
),

-- 5. Start timeout reminder (10 minutes)
(
    'Start Timeout Reminder',
    'Remind employee to start service request if not started within 10 minutes',
    'start_timeout',
    'acknowledging_employee',
    NULL,
    'email',
    'service_request_start_reminder',
    10, -- 10 minutes timeout
    3, -- Retry up to 3 times
    10, -- Every 10 minutes
    5,
    true
),

-- 6. Notification when service request is started
(
    'Service Request Started - Client Notification',
    'Notify client when service request is started',
    'started',
    'service_request_creator',
    NULL,
    'email',
    'service_request_started_client',
    0,
    0,
    NULL,
    6,
    true
),

-- 7. Notification to executives and admins when started
(
    'Service Request Started - Admin Notification',
    'Notify executives and admins when service request is started',
    'started',
    'role',
    ARRAY['executive', 'admin'],
    'email',
    'service_request_started_admin',
    0,
    0,
    NULL,
    7,
    true
),

-- 8. Send close link to assigned employee
(
    'Employee Close Service Request',
    'Send close link to employee working on the service request',
    'started',
    'assigned_employee',
    NULL,
    'email',
    'service_request_close_link',
    0,
    0,
    NULL,
    8,
    true
),

-- 9. Notification when service request is closed
(
    'Service Request Closed - Client Notification',
    'Notify client when service request is closed',
    'closed',
    'service_request_creator',
    NULL,
    'email',
    'service_request_closed_client',
    0,
    0,
    NULL,
    9,
    true
),

-- 10. Notification to executives and admins when closed
(
    'Service Request Closed - Admin Notification',
    'Notify executives and admins when service request is closed',
    'closed',
    'role',
    ARRAY['executive', 'admin'],
    'email',
    'service_request_closed_admin',
    0,
    0,
    NULL,
    10,
    true
);

-- ===================================
-- HELPER FUNCTIONS
-- ===================================

-- Function to get employees by role for workflow notifications
CREATE OR REPLACE FUNCTION get_employees_by_roles(role_names TEXT[])
RETURNS TABLE (
    employee_id UUID,
    employee_email VARCHAR,
    employee_first_name VARCHAR,
    employee_role VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.email,
        e.first_name,
        r.role_name
    FROM employees e
    JOIN employee_roles er ON e.id = er.employee_id
    JOIN roles r ON er.role_id = r.id
    WHERE r.role_name = ANY(role_names)
      AND e.is_active = true
      AND e.soft_delete = false
      AND e.employee_status_id IN (
          SELECT id FROM employee_statuses
          WHERE name IN ('Active', 'Available')
      );
END;
$$ LANGUAGE plpgsql;

-- ===================================
-- TRIGGERS
-- ===================================

-- Auto-update updated_at timestamp for workflow_state
CREATE OR REPLACE FUNCTION update_workflow_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_workflow_state_updated_at
    BEFORE UPDATE ON service_request_workflow_state
    FOR EACH ROW
    EXECUTE FUNCTION update_workflow_state_updated_at();

-- Auto-create workflow state when service request is created
CREATE OR REPLACE FUNCTION auto_create_workflow_state()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO service_request_workflow_state (
        service_request_id,
        current_state,
        next_scheduled_action,
        next_scheduled_action_at
    ) VALUES (
        NEW.id,
        'pending_acknowledgment',
        'send_acknowledgment_reminder',
        CURRENT_TIMESTAMP + INTERVAL '2 minutes' -- Schedule first reminder at 2 minutes
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_create_workflow_state
    AFTER INSERT ON service_requests
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_workflow_state();

-- ===================================
-- COMMENTS
-- ===================================

COMMENT ON TABLE service_request_workflow_state IS 'Tracks the current workflow state of each service request';
COMMENT ON TABLE service_request_action_tokens IS 'Unique tokens for acknowledge/start/close actions in email notifications';
COMMENT ON TABLE workflow_notification_rules IS 'Configurable rules for workflow notifications (managed by admins)';
COMMENT ON TABLE workflow_notification_log IS 'Audit log of all workflow notifications sent';
