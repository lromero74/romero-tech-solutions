-- Migration 011: Hourly Rate Categories
-- Create a system for managing different base hourly rates for different business types

-- Create hourly_rate_categories table
CREATE TABLE IF NOT EXISTS hourly_rate_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name VARCHAR(100) NOT NULL UNIQUE,
  base_hourly_rate NUMERIC(10, 2) NOT NULL CHECK (base_hourly_rate > 0),
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX idx_hourly_rate_categories_active ON hourly_rate_categories(is_active);
CREATE INDEX idx_hourly_rate_categories_default ON hourly_rate_categories(is_default);

-- Add rate_category_id column to businesses table
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS rate_category_id UUID REFERENCES hourly_rate_categories(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_businesses_rate_category ON businesses(rate_category_id);

-- Insert default categories
INSERT INTO hourly_rate_categories (category_name, base_hourly_rate, description, is_default, display_order)
VALUES
  ('Standard', 75.00, 'Default hourly rate for standard business clients', TRUE, 1),
  ('Non-Profit', 50.00, 'Discounted rate for non-profit organizations', FALSE, 2),
  ('Friends & Family', 40.00, 'Special rate for friends and family', FALSE, 3),
  ('B2B', 90.00, 'Business-to-business rate for corporate clients', FALSE, 4),
  ('Other', 75.00, 'Custom rate category', FALSE, 5)
ON CONFLICT (category_name) DO NOTHING;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_hourly_rate_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_hourly_rate_categories_updated_at
  BEFORE UPDATE ON hourly_rate_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_hourly_rate_categories_updated_at();

-- Ensure only one category is marked as default
CREATE OR REPLACE FUNCTION ensure_single_default_rate_category()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = TRUE THEN
    UPDATE hourly_rate_categories
    SET is_default = FALSE
    WHERE id != NEW.id AND is_default = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ensure_single_default_rate_category
  BEFORE INSERT OR UPDATE ON hourly_rate_categories
  FOR EACH ROW
  WHEN (NEW.is_default = TRUE)
  EXECUTE FUNCTION ensure_single_default_rate_category();

-- Add comment to table
COMMENT ON TABLE hourly_rate_categories IS 'Stores different base hourly rate categories for different types of business clients';
COMMENT ON COLUMN hourly_rate_categories.is_default IS 'Indicates the default category used for businesses without an assigned category';
COMMENT ON COLUMN businesses.rate_category_id IS 'References the hourly rate category for this business. If NULL, uses the default category.';
