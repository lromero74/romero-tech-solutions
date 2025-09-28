-- Service Request System Database Schema Migration - Part 1: Basic Tables
-- Created: 2025-09-27

-- ===================================
-- 1. REFERENCE TABLES (LOOKUP DATA)
-- ===================================

-- Urgency Levels (Normal, Prime, Emergency)
CREATE TABLE urgency_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    minimum_lead_time_hours INTEGER NOT NULL,
    max_response_time_hours INTEGER,
    color_code VARCHAR(7),
    display_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Priority Levels (Low, Medium, High, Critical)
CREATE TABLE priority_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    escalation_hours INTEGER,
    color_code VARCHAR(7),
    display_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Service Request Statuses
CREATE TABLE service_request_statuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_final_status BOOLEAN DEFAULT false,
    requires_technician BOOLEAN DEFAULT false,
    color_code VARCHAR(7),
    display_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    client_visible BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Service Types
CREATE TABLE service_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    estimated_duration_minutes INTEGER,
    default_urgency_level_id UUID REFERENCES urgency_levels(id),
    default_priority_level_id UUID REFERENCES priority_levels(id),
    requires_special_tools BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===================================
-- 2. INSERT DEFAULT DATA
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