-- Protect invoice static data from modification
-- This trigger prevents changes to financial, billing, and calculation fields
-- Only payment-related fields can be updated after invoice creation

CREATE OR REPLACE FUNCTION prevent_invoice_data_modification()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent modification of any static invoice data
  -- Allow only payment-related fields to be updated

  IF OLD.id IS NOT NULL AND (
    -- Financial fields
    NEW.subtotal IS DISTINCT FROM OLD.subtotal OR
    NEW.tax_rate IS DISTINCT FROM OLD.tax_rate OR
    NEW.tax_amount IS DISTINCT FROM OLD.tax_amount OR
    NEW.total_amount IS DISTINCT FROM OLD.total_amount OR

    -- Hours and rates
    NEW.base_hourly_rate IS DISTINCT FROM OLD.base_hourly_rate OR
    NEW.standard_hours IS DISTINCT FROM OLD.standard_hours OR
    NEW.standard_rate IS DISTINCT FROM OLD.standard_rate OR
    NEW.standard_cost IS DISTINCT FROM OLD.standard_cost OR
    NEW.premium_hours IS DISTINCT FROM OLD.premium_hours OR
    NEW.premium_rate IS DISTINCT FROM OLD.premium_rate OR
    NEW.premium_cost IS DISTINCT FROM OLD.premium_cost OR
    NEW.emergency_hours IS DISTINCT FROM OLD.emergency_hours OR
    NEW.emergency_rate IS DISTINCT FROM OLD.emergency_rate OR
    NEW.emergency_cost IS DISTINCT FROM OLD.emergency_cost OR

    -- Discount/waiver fields
    NEW.waived_hours IS DISTINCT FROM OLD.waived_hours OR
    NEW.is_first_service_request IS DISTINCT FROM OLD.is_first_service_request OR

    -- Reference fields
    NEW.service_request_id IS DISTINCT FROM OLD.service_request_id OR
    NEW.business_id IS DISTINCT FROM OLD.business_id OR
    NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR

    -- Date fields
    NEW.issue_date IS DISTINCT FROM OLD.issue_date OR
    NEW.due_date IS DISTINCT FROM OLD.due_date OR

    -- Work description
    NEW.work_description IS DISTINCT FROM OLD.work_description OR

    -- Snapshot fields (preserve historical accuracy)
    NEW.rate_tiers_snapshot IS DISTINCT FROM OLD.rate_tiers_snapshot OR
    NEW.original_cost_estimate IS DISTINCT FROM OLD.original_cost_estimate OR
    NEW.actual_hours_breakdown IS DISTINCT FROM OLD.actual_hours_breakdown
  ) THEN
    RAISE EXCEPTION 'Invoice data cannot be modified after creation. Only payment-related fields (payment_status, payment_date, payment_method, stripe fields, notes) can be updated.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS trigger_prevent_invoice_data_modification ON invoices;

CREATE TRIGGER trigger_prevent_invoice_data_modification
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION prevent_invoice_data_modification();

-- Add comment explaining the protection
COMMENT ON TRIGGER trigger_prevent_invoice_data_modification ON invoices IS
  'Prevents modification of invoice static data. Only payment-related fields can be updated after invoice creation.';
