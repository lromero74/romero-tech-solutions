-- Service Request System Database Schema Migration - Part 2: Main Service Requests Table
-- Created: 2025-09-27

-- ===================================
-- MAIN SERVICE REQUEST TABLE
-- ===================================

CREATE TABLE service_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Request Identification
    request_number VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,

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
    deleted_by_user_id UUID REFERENCES users(id)
);

-- ===================================
-- INDEXES FOR PERFORMANCE
-- ===================================

CREATE INDEX idx_service_requests_business_id ON service_requests(business_id);
CREATE INDEX idx_service_requests_service_location_id ON service_requests(service_location_id);
CREATE INDEX idx_service_requests_client_id ON service_requests(client_id);
CREATE INDEX idx_service_requests_status_id ON service_requests(status_id);
CREATE INDEX idx_service_requests_urgency_level_id ON service_requests(urgency_level_id);
CREATE INDEX idx_service_requests_assigned_technician_id ON service_requests(assigned_technician_id);
CREATE INDEX idx_service_requests_requested_date ON service_requests(requested_date);
CREATE INDEX idx_service_requests_created_at ON service_requests(created_at);
CREATE INDEX idx_service_requests_soft_delete ON service_requests(soft_delete);

-- ===================================
-- BUSINESS ISOLATION VIEW
-- ===================================

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