-- Service Request System Database Schema Migration
-- Created: 2025-09-27
-- Purpose: Comprehensive MSP service request management system

-- ===================================
-- 1. REFERENCE TABLES (LOOKUP DATA)
-- ===================================

-- Urgency Levels (Normal, Prime, Emergency)
CREATE TABLE urgency_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,           -- Normal, Prime, Emergency
    description TEXT,
    minimum_lead_time_hours INTEGER NOT NULL,   -- 24, 4, 1
    max_response_time_hours INTEGER,             -- SLA response time
    color_code VARCHAR(7),                       -- #28a745, #ffc107, #dc3545
    display_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Priority Levels (Low, Medium, High, Critical)
CREATE TABLE priority_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,           -- Low, Medium, High, Critical
    description TEXT,
    escalation_hours INTEGER,                   -- Auto-escalate after X hours
    color_code VARCHAR(7),
    display_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Service Request Statuses (Pending, Scheduled, In Progress, Completed, etc.)
CREATE TABLE service_request_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,           -- Pending, Scheduled, In Progress, Completed, Cancelled, On Hold
    description TEXT,
    is_final_status BOOLEAN DEFAULT false,      -- Completed, Cancelled
    requires_technician BOOLEAN DEFAULT false,  -- In Progress requires assigned tech
    color_code VARCHAR(7),
    display_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    client_visible BOOLEAN DEFAULT true,        -- Show to clients in portal
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Service Types (Network, Hardware, Software, Security categories)
CREATE TABLE service_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,                 -- Network Troubleshooting, Hardware Repair, etc.
    description TEXT,
    category VARCHAR(50),                       -- Hardware, Software, Network, Security
    estimated_duration_minutes INTEGER,
    default_urgency_level_id UUID REFERENCES urgency_levels(id),
    default_priority_level_id UUID REFERENCES priority_levels(id),
    requires_special_tools BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===================================
-- 2. MAIN SERVICE REQUEST TABLE
-- ===================================

CREATE TABLE service_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Request Identification
    request_number VARCHAR(50) UNIQUE NOT NULL,  -- Human-readable: SR-2025-001234
    title VARCHAR(255) NOT NULL,                 -- Brief description
    description TEXT NOT NULL,                   -- Detailed issue description

    -- Relationships (Business Isolation Enforced Here)
    client_id UUID NOT NULL REFERENCES users(id),
    business_id UUID NOT NULL REFERENCES businesses(id),
    service_location_id UUID NOT NULL REFERENCES service_locations(id),
    assigned_technician_id UUID REFERENCES employees(id),
    created_by_user_id UUID NOT NULL REFERENCES users(id),

    -- Scheduling & Timing
    requested_date DATE NOT NULL,
    requested_time_start TIME,
    requested_time_end TIME,
    scheduled_date DATE,
    scheduled_time_start TIME,
    scheduled_time_end TIME,
    completed_date TIMESTAMP,

    -- Priority & Urgency
    urgency_level_id UUID NOT NULL REFERENCES urgency_levels(id),
    priority_level_id UUID NOT NULL REFERENCES priority_levels(id),

    -- Status Management
    status_id UUID NOT NULL REFERENCES service_request_statuses(id),

    -- Contact Information
    primary_contact_name VARCHAR(255),
    primary_contact_phone VARCHAR(20),
    primary_contact_email VARCHAR(255),
    alternate_contact_name VARCHAR(255),
    alternate_contact_phone VARCHAR(20),
    callback_number VARCHAR(20),
    best_contact_times TEXT,

    -- Service Details
    service_type_id UUID REFERENCES service_types(id),
    estimated_duration_minutes INTEGER,
    actual_duration_minutes INTEGER,

    -- Access & Special Instructions
    access_instructions TEXT,
    special_requirements TEXT,
    safety_considerations TEXT,
    equipment_needed TEXT,

    -- Business Hours & Scheduling Constraints
    allow_after_hours BOOLEAN DEFAULT false,
    allow_weekends BOOLEAN DEFAULT false,
    requires_client_presence BOOLEAN DEFAULT false,

    -- Resolution & Follow-up
    resolution_summary TEXT,
    technician_notes TEXT,
    client_satisfaction_rating INTEGER CHECK (client_satisfaction_rating >= 1 AND client_satisfaction_rating <= 5),
    client_feedback TEXT,
    requires_follow_up BOOLEAN DEFAULT false,
    follow_up_date DATE,

    -- Cost & Billing
    estimated_cost DECIMAL(10,2),
    actual_cost DECIMAL(10,2),
    billable_hours DECIMAL(5,2),

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_status_change TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Soft Delete
    soft_delete BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP,
    deleted_by_user_id UUID REFERENCES users(id),

    -- NOTE: Business isolation will be enforced by triggers and application logic
    -- Check constraints cannot contain subqueries in PostgreSQL
);

-- ===================================
-- 3. ACTIVITY & HISTORY TRACKING
-- ===================================

-- Service Request History (Complete Audit Trail)
CREATE TABLE service_request_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,

    -- Change Details
    action_type VARCHAR(50) NOT NULL,           -- created, status_changed, assigned, rescheduled, updated
    old_value TEXT,                             -- JSON or text of previous state
    new_value TEXT,                             -- JSON or text of new state

    -- Context
    changed_by_user_id UUID NOT NULL REFERENCES users(id),
    change_reason TEXT,
    notes TEXT,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Service Request Comments (Communication Log)
CREATE TABLE service_request_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,

    -- Comment Details
    comment_text TEXT NOT NULL,
    comment_type VARCHAR(50) DEFAULT 'general',  -- general, internal, client_visible, technician_note

    -- Author & Visibility
    author_user_id UUID NOT NULL REFERENCES users(id),
    is_internal BOOLEAN DEFAULT false,           -- Internal notes vs client-visible
    is_client_visible BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Soft Delete
    soft_delete BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP,
    deleted_by_user_id UUID REFERENCES users(id)
);

-- ===================================
-- 4. TECHNICIAN & ASSIGNMENT TRACKING
-- ===================================

-- Service Request Assignments (Assignment History)
CREATE TABLE service_request_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    technician_id UUID NOT NULL REFERENCES employees(id),

    -- Assignment Details
    assigned_by_user_id UUID NOT NULL REFERENCES users(id),
    assignment_type VARCHAR(50) DEFAULT 'primary', -- primary, backup, observer
    assignment_reason TEXT,

    -- Status
    is_active BOOLEAN DEFAULT true,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    unassigned_at TIMESTAMP,
    unassigned_by_user_id UUID REFERENCES users(id),
    unassignment_reason TEXT
);

-- Service Request Time Entries (Billable Hours Tracking)
CREATE TABLE service_request_time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    technician_id UUID NOT NULL REFERENCES employees(id),

    -- Time Details
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration_minutes INTEGER,

    -- Work Details
    work_description TEXT NOT NULL,
    work_type VARCHAR(50),                       -- diagnostic, repair, testing, documentation
    is_billable BOOLEAN DEFAULT true,
    hourly_rate DECIMAL(8,2),

    -- Location
    is_on_site BOOLEAN DEFAULT true,
    is_remote BOOLEAN DEFAULT false,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id UUID NOT NULL REFERENCES users(id)
);

-- ===================================
-- 5. FILE ATTACHMENTS (PLACEHOLDER)
-- ===================================

-- Service Request Files (Will link to client_files table when implemented)
CREATE TABLE service_request_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    -- client_file_id UUID NOT NULL REFERENCES client_files(id) ON DELETE CASCADE, -- Will add when client_files table exists

    -- File Context
    file_name VARCHAR(255) NOT NULL,             -- Temporary until client_files table exists
    file_path VARCHAR(500),                      -- Temporary until client_files table exists
    attachment_type VARCHAR(50),                 -- issue_photo, site_diagram, documentation, report
    description TEXT,
    attached_by_user_id UUID NOT NULL REFERENCES users(id),

    -- Visibility
    is_client_visible BOOLEAN DEFAULT true,
    is_technician_visible BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===================================
-- 6. INDEXES FOR PERFORMANCE
-- ===================================

-- Service Requests Indexes
CREATE INDEX idx_service_requests_business_id ON service_requests(business_id);
CREATE INDEX idx_service_requests_service_location_id ON service_requests(service_location_id);
CREATE INDEX idx_service_requests_client_id ON service_requests(client_id);
CREATE INDEX idx_service_requests_status_id ON service_requests(status_id);
CREATE INDEX idx_service_requests_urgency_level_id ON service_requests(urgency_level_id);
CREATE INDEX idx_service_requests_assigned_technician_id ON service_requests(assigned_technician_id);
CREATE INDEX idx_service_requests_requested_date ON service_requests(requested_date);
CREATE INDEX idx_service_requests_created_at ON service_requests(created_at);
CREATE INDEX idx_service_requests_soft_delete ON service_requests(soft_delete);

-- History and Comments Indexes
CREATE INDEX idx_service_request_history_service_request_id ON service_request_history(service_request_id);
CREATE INDEX idx_service_request_history_created_at ON service_request_history(created_at);
CREATE INDEX idx_service_request_comments_service_request_id ON service_request_comments(service_request_id);
CREATE INDEX idx_service_request_comments_is_client_visible ON service_request_comments(is_client_visible);

-- Assignment and Time Tracking Indexes
CREATE INDEX idx_service_request_assignments_service_request_id ON service_request_assignments(service_request_id);
CREATE INDEX idx_service_request_assignments_technician_id ON service_request_assignments(technician_id);
CREATE INDEX idx_service_request_assignments_is_active ON service_request_assignments(is_active);
CREATE INDEX idx_service_request_time_entries_service_request_id ON service_request_time_entries(service_request_id);
CREATE INDEX idx_service_request_time_entries_technician_id ON service_request_time_entries(technician_id);

-- ===================================
-- 7. DEFAULT DATA INSERTION
-- ===================================

-- Insert Urgency Levels
INSERT INTO urgency_levels (name, description, minimum_lead_time_hours, max_response_time_hours, color_code, display_order) VALUES
('Normal', 'Standard service request with regular business hours scheduling', 24, 48, '#28a745', 1),
('Prime', 'Priority service requiring faster response time', 4, 8, '#ffc107', 2),
('Emergency', 'Critical issue requiring immediate attention', 1, 2, '#dc3545', 3);

-- Insert Priority Levels
INSERT INTO priority_levels (name, description, escalation_hours, color_code, display_order) VALUES
('Low', 'Non-critical issues that can be addressed during normal business hours', 72, '#6c757d', 1),
('Medium', 'Standard priority issues affecting productivity', 24, '#17a2b8', 2),
('High', 'Important issues requiring prompt attention', 8, '#fd7e14', 3),
('Critical', 'Business-critical issues requiring immediate resolution', 2, '#dc3545', 4);

-- Insert Service Request Statuses
INSERT INTO service_request_statuses (name, description, is_final_status, requires_technician, color_code, display_order, client_visible) VALUES
('Pending', 'Request submitted and awaiting review', false, false, '#6c757d', 1, true),
('Scheduled', 'Request scheduled and assigned to technician', false, true, '#17a2b8', 2, true),
('In Progress', 'Technician is actively working on the request', false, true, '#ffc107', 3, true),
('Completed', 'Request has been resolved successfully', true, false, '#28a745', 4, true),
('Cancelled', 'Request was cancelled before completion', true, false, '#dc3545', 5, true),
('On Hold', 'Request is temporarily paused awaiting client or parts', false, false, '#fd7e14', 6, true);

-- Insert Service Types
INSERT INTO service_types (name, description, category, estimated_duration_minutes) VALUES
('Network Troubleshooting', 'Diagnose and resolve network connectivity issues', 'Network', 120),
('Hardware Repair', 'Repair or replace faulty hardware components', 'Hardware', 180),
('Software Installation', 'Install and configure software applications', 'Software', 90),
('Security Assessment', 'Evaluate and improve security posture', 'Security', 240),
('System Maintenance', 'Routine maintenance and updates', 'Maintenance', 60),
('Data Recovery', 'Recover lost or corrupted data', 'Data', 300),
('Email Configuration', 'Setup and troubleshoot email systems', 'Software', 90),
('Backup Solutions', 'Implement and test backup systems', 'Data', 180),
('Wi-Fi Setup', 'Configure wireless network access', 'Network', 120),
('Printer Installation', 'Install and configure printers and scanners', 'Hardware', 60);

-- ===================================
-- 8. TRIGGERS FOR AUTOMATIC UPDATES
-- ===================================

-- Trigger to update service_requests.updated_at on any change
CREATE OR REPLACE FUNCTION update_service_request_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_service_request_timestamp
    BEFORE UPDATE ON service_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_service_request_timestamp();

-- Trigger to update service_requests.last_status_change when status changes
CREATE OR REPLACE FUNCTION update_service_request_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status_id != OLD.status_id THEN
        NEW.last_status_change = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_service_request_status_change
    BEFORE UPDATE ON service_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_service_request_status_change();

-- Trigger to automatically create history entry on service request changes
CREATE OR REPLACE FUNCTION create_service_request_history()
RETURNS TRIGGER AS $$
BEGIN
    -- On INSERT
    IF TG_OP = 'INSERT' THEN
        INSERT INTO service_request_history (
            service_request_id,
            action_type,
            new_value,
            changed_by_user_id
        ) VALUES (
            NEW.id,
            'created',
            json_build_object(
                'title', NEW.title,
                'status_id', NEW.status_id,
                'urgency_level_id', NEW.urgency_level_id,
                'priority_level_id', NEW.priority_level_id
            )::text,
            NEW.created_by_user_id
        );
        RETURN NEW;
    END IF;

    -- On UPDATE
    IF TG_OP = 'UPDATE' THEN
        -- Status change
        IF NEW.status_id != OLD.status_id THEN
            INSERT INTO service_request_history (
                service_request_id,
                action_type,
                old_value,
                new_value,
                changed_by_user_id
            ) VALUES (
                NEW.id,
                'status_changed',
                (SELECT name FROM service_request_statuses WHERE id = OLD.status_id),
                (SELECT name FROM service_request_statuses WHERE id = NEW.status_id),
                NEW.created_by_user_id  -- Note: This should be updated to actual user making change
            );
        END IF;

        -- Assignment change
        IF COALESCE(NEW.assigned_technician_id::text, '') != COALESCE(OLD.assigned_technician_id::text, '') THEN
            INSERT INTO service_request_history (
                service_request_id,
                action_type,
                old_value,
                new_value,
                changed_by_user_id
            ) VALUES (
                NEW.id,
                'assigned',
                COALESCE(OLD.assigned_technician_id::text, 'unassigned'),
                COALESCE(NEW.assigned_technician_id::text, 'unassigned'),
                NEW.created_by_user_id  -- Note: This should be updated to actual user making change
            );
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_service_request_history
    AFTER INSERT OR UPDATE ON service_requests
    FOR EACH ROW
    EXECUTE FUNCTION create_service_request_history();

-- Trigger to enforce business isolation constraint
CREATE OR REPLACE FUNCTION enforce_service_request_business_isolation()
RETURNS TRIGGER AS $$
BEGIN
    -- Check that service_location belongs to the specified business
    IF NOT EXISTS (
        SELECT 1 FROM service_locations
        WHERE id = NEW.service_location_id
        AND business_id = NEW.business_id
    ) THEN
        RAISE EXCEPTION 'Service location % does not belong to business %',
                       NEW.service_location_id, NEW.business_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_enforce_service_request_business_isolation
    BEFORE INSERT OR UPDATE ON service_requests
    FOR EACH ROW
    EXECUTE FUNCTION enforce_service_request_business_isolation();

-- ===================================
-- 9. BUSINESS ISOLATION VIEW
-- ===================================

-- View for business-isolated service requests (for client portal)
CREATE VIEW v_client_service_requests AS
SELECT
    sr.*,
    ul.name as urgency_level_name,
    ul.color_code as urgency_color,
    pl.name as priority_level_name,
    pl.color_code as priority_color,
    srs.name as status_name,
    srs.color_code as status_color,
    st.name as service_type_name,
    st.category as service_category,
    sl.address_label as location_name,
    sl.street as location_street,
    sl.city as location_city,
    sl.state as location_state,
    b.business_name,
    CONCAT(e.first_name, ' ', e.last_name) as technician_name
FROM service_requests sr
LEFT JOIN urgency_levels ul ON sr.urgency_level_id = ul.id
LEFT JOIN priority_levels pl ON sr.priority_level_id = pl.id
LEFT JOIN service_request_statuses srs ON sr.status_id = srs.id
LEFT JOIN service_types st ON sr.service_type_id = st.id
LEFT JOIN service_locations sl ON sr.service_location_id = sl.id
LEFT JOIN businesses b ON sr.business_id = b.id
LEFT JOIN employees e ON sr.assigned_technician_id = e.id
WHERE sr.soft_delete = false;

COMMENT ON VIEW v_client_service_requests IS 'Business-isolated service requests view for client portal access control';