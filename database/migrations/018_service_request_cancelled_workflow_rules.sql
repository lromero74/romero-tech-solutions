-- Migration: Add workflow notification rules for cancelled service requests
-- Created: 2025-10-05
-- Description: Adds two notification rules to send emails when service requests are cancelled

-- Step 1: Drop the existing constraint
ALTER TABLE workflow_notification_rules DROP CONSTRAINT IF EXISTS valid_trigger_event;

-- Step 2: Add updated constraint including 'cancelled'
ALTER TABLE workflow_notification_rules ADD CONSTRAINT valid_trigger_event
  CHECK (trigger_event IN (
    'service_request_created',
    'acknowledgment_timeout',
    'acknowledged',
    'start_timeout',
    'started',
    'completed',
    'closed',
    'cancelled'  -- NEW: Added cancelled event
  ));

-- Step 3: Add cancelled notification rule for clients
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
) VALUES (
  'Service Request Cancelled - Client Notification',
  'Notify client when their service request is cancelled',
  'cancelled',
  'service_request_creator',  -- The client who created the request
  NULL,  -- recipient_roles is NULL for non-role-based notifications
  'email',
  'service_request_cancelled_client',
  0,  -- Immediate notification (no timeout)
  3,  -- Max retry count
  5,  -- Retry interval in minutes
  110,  -- Execution order (after closed notifications which are ~100)
  true  -- Active
);

-- Add cancelled notification rule for admins/executives
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
) VALUES (
  'Service Request Cancelled - Admin Notification',
  'Notify executives and admins when a service request is cancelled',
  'cancelled',
  'role',  -- Role-based notification
  ARRAY['executive', 'admin'],  -- Send to executive and admin roles
  'email',
  'service_request_cancelled_admin',
  0,  -- Immediate notification (no timeout)
  3,  -- Max retry count
  5,  -- Retry interval in minutes
  111,  -- Execution order (after client cancelled notification)
  true  -- Active
);
