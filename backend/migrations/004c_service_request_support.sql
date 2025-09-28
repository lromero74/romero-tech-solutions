-- Service Request System Database Schema Migration - Part 3: Supporting Tables
-- Created: 2025-09-27

-- ===================================
-- ACTIVITY & HISTORY TRACKING
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
-- TECHNICIAN & ASSIGNMENT TRACKING
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
-- FILE ATTACHMENTS (PLACEHOLDER)
-- ===================================

-- Service Request Files (Will link to client_files table when implemented)
CREATE TABLE service_request_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,

    -- File Context (temporary until client_files table exists)
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500),
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
-- INDEXES FOR PERFORMANCE
-- ===================================

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

-- File Attachments Index
CREATE INDEX idx_service_request_files_service_request_id ON service_request_files(service_request_id);