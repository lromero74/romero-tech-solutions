-- Add snapshot columns to invoices table to preserve invoice data immutably
-- This ensures that changes to rate schedules don't affect historical invoices

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS rate_tiers_snapshot JSONB,
ADD COLUMN IF NOT EXISTS original_cost_estimate JSONB,
ADD COLUMN IF NOT EXISTS actual_hours_breakdown JSONB;

COMMENT ON COLUMN invoices.rate_tiers_snapshot IS 'Snapshot of service_hour_rate_tiers at invoice generation time';
COMMENT ON COLUMN invoices.original_cost_estimate IS 'Calculated original cost estimate with tier breakdown';
COMMENT ON COLUMN invoices.actual_hours_breakdown IS 'True hours worked breakdown with time entries and tier assignments';
