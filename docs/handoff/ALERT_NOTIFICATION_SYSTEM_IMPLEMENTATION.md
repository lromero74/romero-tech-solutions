# Alert Notification System - Complete Implementation Plan

**Created:** 2025-10-20
**Status:** Planning Phase
**Version:** 1.0
**Last Updated:** 2025-10-20

## Executive Summary

This document outlines the complete implementation of an enterprise-grade alert notification system for the Romero Tech Solutions RMM platform. The system will provide multi-channel notifications (Email, SMS, WebSocket), intelligent routing, escalation policies, subscriber management, and full internationalization (English/Spanish) support.

**Current State:** Only WebSocket notifications to online admins are implemented.

**Target State:** Full multi-channel notification system with subscriber preferences, escalation policies, client notifications, and comprehensive RBAC controls.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema Changes](#database-schema-changes)
3. [Backend Services](#backend-services)
4. [Frontend Components](#frontend-components)
5. [RBAC & Permissions](#rbac--permissions)
6. [Industry Standard Defaults](#industry-standard-defaults)
7. [Client-Side Features](#client-side-features)
8. [Internationalization](#internationalization)
9. [Migration & Rollout Plan](#migration--rollout-plan)
10. [Testing Strategy](#testing-strategy)
11. [Tech Debt Resolution](#tech-debt-resolution)

---

## Architecture Overview

### Current Architecture
```
Agent Metrics → Confluence Detection → Alert Created → WebSocket Broadcast → Admin Dashboard
```

### Target Architecture
```
Agent Metrics → Confluence Detection → Alert Created
                                           ↓
                                    Alert Router
                                           ↓
                         ┌─────────────────┼─────────────────┐
                         ↓                 ↓                 ↓
                  WebSocket          Email Service      SMS Service
                         ↓                 ↓                 ↓
                  Admins (Live)    Subscribers (All)  Critical Alerts
                         ↓                 ↓                 ↓
                  Browser Notif.    AWS SES (i18n)   Twilio (i18n)

                  Escalation Monitor (Background Job)
                         ↓
                  Unacknowledged → Escalate → Notify Higher Tier
```

### Key Components

1. **Alert Router Service** - Determines who gets notified via which channels
2. **Email Notification Service** - Sends i18n email alerts via AWS SES
3. **SMS Notification Service** - Sends i18n SMS alerts via Twilio
4. **Subscriber Management Service** - Manages employee & client subscriptions
5. **Escalation Service** - Handles alert escalation policies
6. **Client Alert Service** - Manages client-facing agent alerts

---

## Database Schema Changes

### Migration 048: Alert Subscribers

**File:** `backend/migrations/048_alert_subscribers.sql`

```sql
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
-- GRANT PERMISSIONS TO BACKEND ROLE
-- ====================================
-- Add grants if you have a specific backend database role
-- GRANT SELECT, INSERT, UPDATE ON alert_subscribers TO backend_role;
-- GRANT SELECT, INSERT, UPDATE ON client_alert_subscriptions TO backend_role;
-- GRANT SELECT ON alert_escalation_policies TO backend_role;
-- GRANT SELECT, INSERT, UPDATE ON alert_notifications TO backend_role;
```

---

### Migration 049: Alert Configuration Extensions

**File:** `backend/migrations/049_alert_config_extensions.sql`

```sql
-- Migration 049: Alert Configuration Extensions for Client Notifications
-- Purpose: Add client-facing alert configuration and i18n support
-- Created: 2025-10-20

-- Add client visibility flag to alert configurations
ALTER TABLE alert_configurations
  ADD COLUMN IF NOT EXISTS client_visible BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_category VARCHAR(50),
  ADD COLUMN IF NOT EXISTS client_display_name_en VARCHAR(100),
  ADD COLUMN IF NOT EXISTS client_display_name_es VARCHAR(100),
  ADD COLUMN IF NOT EXISTS client_description_en TEXT,
  ADD COLUMN IF NOT EXISTS client_description_es TEXT;

-- Add escalation policy reference
ALTER TABLE alert_configurations
  ADD COLUMN IF NOT EXISTS escalation_policy_id INTEGER REFERENCES alert_escalation_policies(id) ON DELETE SET NULL;

CREATE INDEX idx_alert_config_client_visible ON alert_configurations(client_visible) WHERE client_visible = true;
CREATE INDEX idx_alert_config_escalation ON alert_configurations(escalation_policy_id);

COMMENT ON COLUMN alert_configurations.client_visible IS 'Whether clients should see this alert type in their dashboard';
COMMENT ON COLUMN alert_configurations.client_category IS 'Simplified category for clients: critical_issue, performance_degradation, security_alert';

-- Map existing alerts to client categories
UPDATE alert_configurations
SET
  client_visible = true,
  client_category = CASE
    WHEN alert_type = 'high_utilization' THEN 'performance_degradation'
    WHEN alert_type = 'volatility_spike' THEN 'critical_issue'
    ELSE 'critical_issue'
  END,
  client_display_name_en = CASE
    WHEN alert_type = 'high_utilization' THEN 'High Resource Usage'
    WHEN alert_type = 'low_utilization' THEN 'Low Resource Usage'
    WHEN alert_type = 'rising_trend' THEN 'Resource Usage Increasing'
    WHEN alert_type = 'declining_trend' THEN 'Resource Usage Decreasing'
    WHEN alert_type = 'volatility_spike' THEN 'System Instability Detected'
  END,
  client_display_name_es = CASE
    WHEN alert_type = 'high_utilization' THEN 'Alto Uso de Recursos'
    WHEN alert_type = 'low_utilization' THEN 'Bajo Uso de Recursos'
    WHEN alert_type = 'rising_trend' THEN 'Uso de Recursos en Aumento'
    WHEN alert_type = 'declining_trend' THEN 'Uso de Recursos en Disminución'
    WHEN alert_type = 'volatility_spike' THEN 'Inestabilidad del Sistema Detectada'
  END,
  client_description_en = CASE
    WHEN alert_type = 'high_utilization' THEN 'Your system is experiencing high resource usage which may affect performance.'
    WHEN alert_type = 'volatility_spike' THEN 'Your system is showing unusual instability patterns that require attention.'
    ELSE 'System monitoring has detected an unusual pattern requiring review.'
  END,
  client_description_es = CASE
    WHEN alert_type = 'high_utilization' THEN 'Su sistema está experimentando un alto uso de recursos que puede afectar el rendimiento.'
    WHEN alert_type = 'volatility_spike' THEN 'Su sistema muestra patrones inusuales de inestabilidad que requieren atención.'
    ELSE 'El monitoreo del sistema ha detectado un patrón inusual que requiere revisión.'
  END,
  escalation_policy_id = (SELECT id FROM alert_escalation_policies WHERE policy_name = 'Default Critical Alert Escalation')
WHERE alert_type IN ('high_utilization', 'volatility_spike');
```

---

## Backend Services

### Service: alertNotificationService.js

**File:** `backend/services/alertNotificationService.js`

**Purpose:** Route and deliver alerts to subscribers via multiple channels

**Key Functions:**
- `routeAlert(alertHistory)` - Determine recipients and channels
- `sendEmailNotification(alert, subscriber, language)` - Send i18n email
- `sendSMSNotification(alert, subscriber, language)` - Send i18n SMS
- `notifyClients(alert)` - Notify clients of their agent alerts
- `checkQuietHours(subscriber)` - Respect quiet hours
- `logNotification(details)` - Track delivery

**Dependencies:**
- `emailService` (existing AWS SES)
- `twilioService` (new, for SMS)
- `websocketService` (existing)
- `translationService` (new, for i18n)

---

### Service: alertEscalationService.js

**File:** `backend/services/alertEscalationService.js`

**Purpose:** Background job to monitor and escalate unacknowledged alerts

**Key Functions:**
- `monitorUnacknowledgedAlerts()` - Check for alerts needing escalation (runs every 5 minutes)
- `escalateAlert(alertHistory, policy, level)` - Execute escalation
- `notifyEscalation(alert, recipients, level)` - Send escalation notifications
- `trackEscalation(alertHistoryId, level, recipients)` - Log escalation events

**Cron Job:** Runs every 5 minutes via existing scheduler

---

### Service: subscriberManagementService.js

**File:** `backend/services/subscriberManagementService.js`

**Purpose:** CRUD operations for alert subscriptions

**Key Functions:**
- `getEmployeeSubscriptions(employeeId)` - Get employee's subscriptions
- `createSubscription(data)` - Create new subscription
- `updateSubscription(id, data)` - Update subscription
- `deleteSubscription(id)` - Remove subscription
- `getSubscribersForAlert(alertHistory)` - Find matching subscribers
- `getClientSubscribersForAgent(agentId)` - Find clients subscribed to agent

---

### Service: translationService.js (New)

**File:** `backend/services/translationService.js`

**Purpose:** Handle i18n for alert notifications

**Key Functions:**
- `translateAlert(alertData, language)` - Translate alert content
- `getAlertTemplate(alertType, channel, language)` - Get localized template
- `interpolateVariables(template, variables)` - Replace {{variables}}

---

### Service: twilioService.js (New)

**File:** `backend/services/twilioService.js`

**Purpose:** Send SMS notifications via Twilio

**Dependencies:** Twilio SDK (already in use for MFA)

**Key Functions:**
- `sendAlertSMS(phoneNumber, message, language)` - Send SMS
- `formatPhoneNumber(number)` - Normalize phone format
- `validatePhoneNumber(number)` - Validate before sending

---

## Frontend Components

### Component: AlertSubscriptionManager (Employee)

**File:** `src/components/admin/AlertSubscriptionManager.tsx`

**Location:** Admin Dashboard → Settings → Alert Subscriptions

**Features:**
- List employee's current subscriptions
- Create/edit/delete subscriptions
- Filter by scope (all agents, business, service location, specific agent)
- Configure channels (email, SMS, WebSocket, browser)
- Set severity filters
- Configure quiet hours
- Test notification delivery

**RBAC:**
- All employees can manage their own subscriptions
- Managers can view team subscriptions
- Admins can manage all subscriptions

---

### Component: ClientAlertPreferences (Client)

**File:** `src/components/client/settings/ClientAlertPreferences.tsx`

**Location:** Client Dashboard → Settings → Alert Notifications

**Features:**
- Enable/disable alerts for monitored agents
- Choose notification channels
- Set language preference (en/es)
- Choose digest mode vs real-time
- Preview sample alerts in chosen language

**Permissions:** Clients can only manage alerts for their own agents

---

### Component: AlertEscalationManager (Admin)

**File:** `src/components/admin/settings/AlertEscalationManager.tsx`

**Location:** Admin Dashboard → Settings → Alert Escalation

**Features:**
- Create/edit escalation policies
- Set trigger conditions (time, severity)
- Define escalation targets (roles, specific employees)
- Configure escalation chains
- View escalation history and statistics

**RBAC:** Executive and Admin only

---

### Component: AlertNotificationLog (Admin)

**File:** `src/components/admin/AlertNotificationLog.tsx`

**Location:** Admin Dashboard → Alerts → Notification Log

**Features:**
- View all sent notifications
- Filter by channel, status, recipient
- Retry failed deliveries
- View delivery statistics
- Export notification logs

**RBAC:** Admin and Manager

---

## RBAC & Permissions

### New Permissions

**File:** `backend/migrations/050_alert_notification_permissions.sql`

```sql
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
  ('alert_configs.manage_client_visibility', 'alert_configurations', 'manage', 'Configure which alerts clients can see', true);

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
```

---

## Industry Standard Defaults

### Default Subscriptions (Auto-Created)

When an employee is created, automatically create subscription:
- **Executives & Admins:** Subscribe to ALL critical and high alerts, email + SMS
- **Managers:** Subscribe to agents in their managed teams, email only
- **Technicians:** No automatic subscriptions (opt-in)
- **Sales:** No automatic subscriptions (opt-in)

### Default Escalation Policy

Already created in migration 048:
- **Policy:** Escalate after 30 minutes
- **Severity:** High and Critical only
- **Targets:** Managers and Executives
- **Channels:** Email and SMS
- **Max Escalations:** 2 (0→30min→60min)

### Default Alert Configurations

For clients:
- Only **High Utilization** and **Volatility Spike** are client-visible
- Category mapping:
  - High Utilization → "Performance Degradation"
  - Volatility Spike → "Critical Issue"

---

## Client-Side Features

### What Clients Can Manage

**In Client Dashboard → Settings → Alert Notifications:**

1. **Enable/Disable Alerts** per monitored agent
2. **Choose Notification Channels:**
   - Email (default ON)
   - SMS (default OFF)
   - Browser/Push notifications (default ON)
3. **Language Preference:** English or Spanish (defaults to account language)
4. **Delivery Mode:**
   - Real-time (immediate notifications)
   - Daily Digest (one email per day at chosen time)
5. **Alert Categories to Receive:**
   - Critical Issues (ON by default)
   - Performance Degradation (ON by default)
   - Security Alerts (ON by default - future)

### What Clients Cannot See

- Technical indicator details (RSI, MACD, etc.)
- Raw metric values
- Internal alert configuration details
- Employee notification logs
- Escalation policies

### Client Notification Experience

**Email Template (English):**
```
Subject: Alert: High Resource Usage on [Server Name]

Dear [Client Name],

We've detected an issue with your monitored system that requires your attention.

System: [Server Name]
Alert: High Resource Usage
Severity: Medium
Detected: [Timestamp]

Description:
Your system is experiencing high resource usage which may affect performance.
Our technical team is monitoring the situation.

What this means:
- Your applications may run slower than usual
- System response times may be delayed
- No immediate action required from you

We recommend:
- Avoiding resource-intensive tasks temporarily
- Contacting us if you experience any issues

View details in your dashboard: [Link]

Best regards,
Romero Tech Solutions Team
```

**Email Template (Spanish):**
```
Asunto: Alerta: Alto Uso de Recursos en [Nombre del Servidor]

Estimado/a [Nombre del Cliente],

Hemos detectado un problema en su sistema monitoreado que requiere su atención.

Sistema: [Nombre del Servidor]
Alerta: Alto Uso de Recursos
Gravedad: Media
Detectado: [Marca de Tiempo]

Descripción:
Su sistema está experimentando un alto uso de recursos que puede afectar el
rendimiento. Nuestro equipo técnico está monitoreando la situación.

Qué significa esto:
- Sus aplicaciones pueden funcionar más lento de lo habitual
- Los tiempos de respuesta del sistema pueden retrasarse
- No se requiere acción inmediata de su parte

Recomendamos:
- Evitar tareas que consuman muchos recursos temporalmente
- Contactarnos si experimenta algún problema

Ver detalles en su panel: [Enlace]

Saludos cordiales,
Equipo de Romero Tech Solutions
```

---

## Internationalization

### Translation Keys for Alerts

**File:** `backend/translations/alert_notifications_en.json`
**File:** `backend/translations/alert_notifications_es.json`

```json
{
  "alert.subject.high_utilization": "Alert: High Resource Usage on {{deviceName}}",
  "alert.subject.volatility_spike": "Alert: System Instability on {{deviceName}}",

  "alert.greeting": "Dear {{clientName}},",
  "alert.intro": "We've detected an issue with your monitored system that requires your attention.",

  "alert.label.system": "System",
  "alert.label.alert": "Alert",
  "alert.label.severity": "Severity",
  "alert.label.detected": "Detected",

  "alert.severity.low": "Low",
  "alert.severity.medium": "Medium",
  "alert.severity.high": "High",
  "alert.severity.critical": "Critical",

  "alert.category.critical_issue": "Critical Issue",
  "alert.category.performance_degradation": "Performance Degradation",
  "alert.category.security_alert": "Security Alert",

  "alert.footer.signature": "Best regards,\nRomero Tech Solutions Team"
}
```

### Language Resolution Priority

For clients:
1. Subscription-specific language override
2. User account language preference
3. Business default language
4. System default (en)

For employees:
1. Subscription language preference
2. Employee profile language
3. System default (en)

---

## Migration & Rollout Plan

### Phase 1: Database & Core Services (Week 1)

- [ ] Run migrations 048, 049, 050
- [ ] Create `alertNotificationService.js`
- [ ] Create `twilioService.js`
- [ ] Create `translationService.js`
- [ ] Create `subscriberManagementService.js`
- [ ] Add i18n JSON files
- [ ] Update `alertHistoryService` to call notification router

### Phase 2: Email Notifications (Week 2)

- [ ] Create email templates (HTML + text, both languages)
- [ ] Implement email sending in `alertNotificationService`
- [ ] Add email delivery tracking
- [ ] Test with real AWS SES
- [ ] Create default subscriptions for existing employees

### Phase 3: SMS Notifications (Week 2)

- [ ] Implement SMS in `twilioService`
- [ ] Create SMS templates (both languages)
- [ ] Test with Twilio
- [ ] Add phone number validation

### Phase 4: Employee UI (Week 3)

- [ ] Create `AlertSubscriptionManager` component
- [ ] Add to admin settings menu
- [ ] Implement RBAC checks
- [ ] Add subscription API endpoints
- [ ] Test notification delivery from UI

### Phase 5: Escalation System (Week 3-4)

- [ ] Create `alertEscalationService.js`
- [ ] Add to scheduler (cron job every 5 minutes)
- [ ] Create `AlertEscalationManager` component (admin only)
- [ ] Test escalation flow
- [ ] Monitor escalation logs

### Phase 6: Client Notifications (Week 4-5)

- [ ] Create `ClientAlertPreferences` component
- [ ] Add client subscription API endpoints
- [ ] Implement client notification routing
- [ ] Create client-friendly email templates
- [ ] Test i18n for clients
- [ ] Add to client settings menu

### Phase 7: Monitoring & Refinement (Week 5-6)

- [ ] Create `AlertNotificationLog` component
- [ ] Add delivery statistics dashboard
- [ ] Implement retry logic for failed deliveries
- [ ] Performance testing
- [ ] Load testing (simulate 1000s of alerts)
- [ ] Add notification rate limiting

---

## Testing Strategy

### Unit Tests

**Files to create:**
- `backend/tests/services/alertNotificationService.test.js`
- `backend/tests/services/alertEscalationService.test.js`
- `backend/tests/services/subscriberManagementService.test.js`
- `backend/tests/services/translationService.test.js`

### Integration Tests

**Scenarios:**
1. Alert created → subscribers notified via email
2. Alert created → subscribers notified via SMS
3. Alert unacknowledged → escalation triggered
4. Client subscription → client receives i18n notification
5. Quiet hours respected
6. Failed delivery → retry logic
7. Multiple escalation levels

### E2E Tests

**User Flows:**
1. Employee creates subscription → receives test notification
2. Admin creates escalation policy → alert triggers escalation
3. Client enables alerts → receives notification in Spanish
4. Manager views team subscriptions

---

## Tech Debt Resolution

### Issue 1: Duplicate hasRecentSimilarAlert Logic

**Current:** `alertHistoryService.js:349-367`
**Problem:** Query checks configurationId instead of metric_type + alert_type

**Fix:**
```javascript
async hasRecentSimilarAlert(agentId, configurationId, minutesAgo = 15) {
  // Should match on agent + config, not agent + metric + type
  const result = await query(
    `SELECT id FROM alert_history
     WHERE agent_id = $1
       AND alert_config_id = $2
       AND triggered_at > NOW() - INTERVAL '${minutesAgo} minutes'
       AND resolved_at IS NULL
     LIMIT 1`,
    [agentId, configurationId]
  );
  return result.rows.length > 0;
}
```

### Issue 2: notify_email Flag Not Used

**Current:** Flag stored but no email sending logic
**Fix:** Implement in Phase 2 (above)

### Issue 3: No Subscriber Management

**Current:** Broadcasts to ALL admins
**Fix:** Implement subscriber filtering in `alertNotificationService`

### Issue 4: No Language Support

**Current:** All notifications in English only
**Fix:** Implement `translationService` and use throughout

### Issue 5: No Delivery Tracking

**Current:** WebSocket sent but no confirmation
**Fix:** Add `alert_notifications` table and logging

---

## Success Metrics

### Technical Metrics

- **Alert Delivery Success Rate:** Target 99.5%
- **Average Delivery Time:** < 30 seconds from alert creation
- **Escalation Response Time:** < 5 minutes from trigger
- **Failed Delivery Retry Success:** > 80%

### Business Metrics

- **Reduction in Missed Alerts:** Target 90% reduction
- **Client Satisfaction:** Survey score > 4.5/5 on alert notifications
- **Mean Time to Acknowledge (MTTA):** < 15 minutes for critical alerts
- **Mean Time to Resolution (MTTR):** < 2 hours for critical alerts

---

## Rollout Checklist

### Pre-Production

- [ ] All migrations tested on dev database
- [ ] All new services have unit tests
- [ ] Integration tests pass
- [ ] Email templates reviewed by marketing
- [ ] Translation review by Spanish speaker
- [ ] Twilio account configured with production credentials
- [ ] AWS SES production access enabled
- [ ] Rate limits configured (prevent spam)

### Production Deployment

- [ ] Run migrations during maintenance window
- [ ] Deploy backend services
- [ ] Enable notification routing (feature flag)
- [ ] Create default subscriptions for executives/admins
- [ ] Test with internal team first (1 week)
- [ ] Gradual rollout to all employees
- [ ] Enable client notifications (2 weeks after employee rollout)
- [ ] Monitor error logs and delivery rates
- [ ] Adjust escalation policies based on feedback

### Post-Launch

- [ ] Week 1: Daily monitoring, fix critical bugs
- [ ] Week 2: Collect feedback, adjust templates
- [ ] Week 3: Enable escalation policies
- [ ] Week 4: Enable client notifications
- [ ] Month 1 review: Analyze metrics, adjust policies

---

## Documentation Updates Required

### Files to Update

1. **README.md** - Add alert notification section
2. **CLAUDE.md** - Add architecture notes
3. **API Documentation** - New endpoints
4. **Employee Handbook** - How to manage subscriptions
5. **Client User Guide** - How to configure alerts

### New Documentation Files

1. **docs/ALERT_NOTIFICATION_GUIDE.md** - Complete user guide
2. **docs/api/ALERT_SUBSCRIPTION_API.md** - API reference
3. **docs/admin/ESCALATION_POLICY_GUIDE.md** - Admin guide

---

## Future Enhancements

### Phase 7+: Advanced Features

1. **PagerDuty Integration** - Enterprise on-call management
2. **Slack/Teams Integration** - Notifications to team channels
3. **Voice Calls** - Critical alert phone calls via Twilio
4. **Mobile App Push** - Native mobile app notifications
5. **Alert Correlation** - Group related alerts intelligently
6. **ML-Based Alert Tuning** - Learn from acknowledgment patterns
7. **Custom Alert Rules** - Let clients create their own alert logic
8. **Alert Dashboards** - Real-time alert monitoring wall

---

## Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-10-20 | 1.0 | Initial implementation plan | Claude Code |

---

## Appendix A: Industry Standard References

### Alert Notification Best Practices

**Sources:**
- PagerDuty Incident Response Guide
- Atlassian Incident Management Handbook
- ITIL v4 Incident Management
- Google SRE Book - On-Call and Alerting

**Key Principles:**
1. **Actionable Alerts Only** - Every alert should require human action
2. **Context-Rich** - Include enough info to start troubleshooting
3. **Escalation Paths** - Clear chain of command for critical issues
4. **Acknowledgment Required** - Track who responded and when
5. **Feedback Loop** - Alert fatigue tracking and adjustment

### Notification Timing Standards

- **Critical:** Immediate (< 1 minute)
- **High:** Within 5 minutes
- **Medium:** Within 15 minutes
- **Low:** Digest or next business day

### Escalation Standards

- **First Escalation:** 15-30 minutes (industry: 30 min)
- **Second Escalation:** 30-60 minutes
- **Maximum Escalations:** 3 levels before executive notification

---

## Appendix B: Cost Estimates

### AWS SES Costs

- **$0.10 per 1,000 emails**
- Estimated: 10,000 alerts/month = $1/month

### Twilio SMS Costs

- **$0.0079 per SMS (US)**
- **$0.0042 per SMS (Mexico - Spanish speakers)**
- Estimated: 500 SMS/month = $4/month

### Total Estimated Monthly Cost

- **Notifications:** ~$5/month
- **Development Time:** 6 weeks (1 developer)
- **ROI:** Prevented outages and faster response time

---

**END OF HANDOFF DOCUMENT**
