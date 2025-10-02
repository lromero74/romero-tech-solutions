-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Invoice identification
  invoice_number VARCHAR(50) UNIQUE NOT NULL,

  -- Client base rate at time of invoice
  base_hourly_rate NUMERIC(10, 2) NOT NULL,

  -- Billable hours breakdown (already rounded)
  standard_hours NUMERIC(10, 2) DEFAULT 0,
  standard_rate NUMERIC(10, 2) DEFAULT 0,
  standard_cost NUMERIC(10, 2) DEFAULT 0,

  premium_hours NUMERIC(10, 2) DEFAULT 0,
  premium_rate NUMERIC(10, 2) DEFAULT 0,
  premium_cost NUMERIC(10, 2) DEFAULT 0,

  emergency_hours NUMERIC(10, 2) DEFAULT 0,
  emergency_rate NUMERIC(10, 2) DEFAULT 0,
  emergency_cost NUMERIC(10, 2) DEFAULT 0,

  -- First-time client discount
  waived_hours NUMERIC(10, 2) DEFAULT 0,
  is_first_service_request BOOLEAN DEFAULT false,

  -- Totals
  subtotal NUMERIC(10, 2) NOT NULL,
  tax_rate NUMERIC(5, 4) DEFAULT 0,
  tax_amount NUMERIC(10, 2) DEFAULT 0,
  total_amount NUMERIC(10, 2) NOT NULL,

  -- Dates
  issue_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE,

  -- Payment status: 'due', 'overdue', 'paid', 'comped'
  payment_status VARCHAR(20) NOT NULL DEFAULT 'due',

  -- Additional info
  work_description TEXT,
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Indexes for search/filter
  CONSTRAINT check_payment_status CHECK (payment_status IN ('due', 'overdue', 'paid', 'comped'))
);

-- Create indexes for efficient querying
CREATE INDEX idx_invoices_service_request_id ON invoices(service_request_id);
CREATE INDEX idx_invoices_business_id ON invoices(business_id);
CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_payment_status ON invoices(payment_status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_invoices_payment_date ON invoices(payment_date);
CREATE INDEX idx_invoices_issue_date ON invoices(issue_date);

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_invoices_updated_at();

-- Create company_settings table for invoice details
CREATE TABLE IF NOT EXISTS company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert Romero Tech Solutions company information
INSERT INTO company_settings (setting_key, setting_value) VALUES
  ('company_name', 'Romero Tech Solutions'),
  ('company_address_line1', '1051 W El Norte Parkway'),
  ('company_address_line2', '#33'),
  ('company_city', 'Escondido'),
  ('company_state', 'CA'),
  ('company_zip', '92026'),
  ('company_phone', '(619) 940-5550'),
  ('company_email', 'billing@romerotechsolutions.com'),
  ('invoice_due_days', '30'),
  ('invoice_tax_rate', '0.0000')
ON CONFLICT (setting_key) DO NOTHING;
