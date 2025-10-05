-- Migration: Convert invoice date columns from timestamptz to date
-- Purpose: Ensure consistent invoice dates across all timezones for legal/financial documents
-- Date: 2025-10-05

BEGIN;

-- Convert invoice date columns to date type (removes time component)
-- This ensures all users see the same calendar date regardless of timezone

ALTER TABLE invoices
  ALTER COLUMN issue_date TYPE date USING issue_date::date,
  ALTER COLUMN due_date TYPE date USING due_date::date,
  ALTER COLUMN payment_date TYPE date USING payment_date::date;

-- Add comments explaining the rationale
COMMENT ON COLUMN invoices.issue_date IS 'Invoice issue date (date only, no time component) - consistent across all timezones';
COMMENT ON COLUMN invoices.due_date IS 'Invoice due date (date only, no time component) - consistent across all timezones';
COMMENT ON COLUMN invoices.payment_date IS 'Invoice payment date (date only, no time component) - consistent across all timezones';

COMMIT;

-- Verification queries (run after migration):
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'invoices' AND column_name IN ('issue_date', 'due_date', 'payment_date');
-- SELECT id, invoice_number, issue_date, due_date, payment_date FROM invoices LIMIT 5;
