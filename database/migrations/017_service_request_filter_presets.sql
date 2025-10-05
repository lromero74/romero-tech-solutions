-- Migration: Add Service Request Filter Presets
-- Description: Allow admins to create custom status filter presets with comparison operators
-- Date: 2025-10-05

-- Create table for admin-defined filter presets
CREATE TABLE IF NOT EXISTS service_request_filter_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  filter_type VARCHAR(50) NOT NULL DEFAULT 'status', -- 'status', 'urgency', 'priority', etc.

  -- Filter criteria (JSON for flexibility)
  -- Examples:
  -- {"operator": "is_final_status", "value": false}
  -- {"operator": "in", "values": ["Submitted", "Acknowledged"]}
  -- {"operator": "not_in", "values": ["Closed", "Cancelled"]}
  -- {"operator": "equals", "value": "Started"}
  criteria JSONB NOT NULL,

  -- Display settings
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Audit fields
  created_by_employee_id UUID REFERENCES employees(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_filter_type CHECK (filter_type IN ('status', 'urgency', 'priority', 'combined')),
  CONSTRAINT valid_criteria CHECK (jsonb_typeof(criteria) = 'object')
);

-- Create index for faster queries
CREATE INDEX idx_filter_presets_active ON service_request_filter_presets(is_active, display_order);
CREATE INDEX idx_filter_presets_type ON service_request_filter_presets(filter_type);

-- Add comments for documentation
COMMENT ON TABLE service_request_filter_presets IS 'Admin-defined filter presets for service requests';
COMMENT ON COLUMN service_request_filter_presets.criteria IS 'JSON criteria for filtering. Supports operators: is_final_status, in, not_in, equals';
COMMENT ON COLUMN service_request_filter_presets.display_order IS 'Order in which presets appear in dropdown (lower numbers first)';

-- Insert default "Open" preset to replace hardcoded logic
INSERT INTO service_request_filter_presets (name, description, filter_type, criteria, display_order, is_active)
VALUES (
  'Open',
  'All non-final statuses (not Closed or Cancelled)',
  'status',
  '{"operator": "is_final_status", "value": false}'::jsonb,
  1,
  true
);

-- Grant permissions
GRANT SELECT ON service_request_filter_presets TO PUBLIC;
GRANT INSERT, UPDATE, DELETE ON service_request_filter_presets TO postgres;
