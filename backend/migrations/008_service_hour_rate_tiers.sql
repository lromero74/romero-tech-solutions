-- Service Hour Rate Tiers
-- Defines pricing tiers based on time of day and day of week
-- Allows administrators to configure Standard, Premium, and Emergency hour rates

-- Drop existing table if it exists
DROP TABLE IF EXISTS service_hour_rate_tiers CASCADE;

-- Create the rate tiers table
CREATE TABLE service_hour_rate_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tier identification
  tier_name VARCHAR(50) NOT NULL, -- 'Standard', 'Premium', 'Emergency'
  tier_level INTEGER NOT NULL, -- 1 = Standard, 2 = Premium, 3 = Emergency (for sorting/priority)

  -- Scheduling
  day_of_week INTEGER NOT NULL, -- 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  time_start TIME NOT NULL, -- Start time for this rate tier
  time_end TIME NOT NULL, -- End time for this rate tier

  -- Pricing
  rate_multiplier DECIMAL(4,2) DEFAULT 1.00, -- Multiplier for base rate (1.0 = base, 1.5 = 50% premium, etc.)

  -- UI/Display
  color_code VARCHAR(7) DEFAULT '#28a745', -- Hex color for UI display
  description TEXT,
  display_order INTEGER DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_day_of_week CHECK (day_of_week >= 0 AND day_of_week <= 6),
  CONSTRAINT valid_time_range CHECK (time_start < time_end),
  CONSTRAINT valid_rate_multiplier CHECK (rate_multiplier > 0),
  CONSTRAINT valid_tier_level CHECK (tier_level >= 1 AND tier_level <= 3)
);

-- Create indexes
CREATE INDEX idx_service_hour_rate_tiers_active ON service_hour_rate_tiers(is_active);
CREATE INDEX idx_service_hour_rate_tiers_day ON service_hour_rate_tiers(day_of_week);
CREATE INDEX idx_service_hour_rate_tiers_tier_level ON service_hour_rate_tiers(tier_level);

-- Insert default 24/7 rate tier configuration
-- This provides a baseline that administrators can customize

-- WEEKDAYS (Monday-Friday): Standard, Premium, and Emergency hours
-- Standard Hours: 8 AM - 5 PM on weekdays
INSERT INTO service_hour_rate_tiers (tier_name, tier_level, day_of_week, time_start, time_end, rate_multiplier, color_code, description, display_order)
VALUES
  -- Monday
  ('Standard', 1, 1, '08:00:00', '17:00:00', 1.00, '#28a745', 'Standard business hours - Monday', 1),
  ('Premium', 2, 1, '06:00:00', '08:00:00', 1.25, '#ffc107', 'Early morning premium hours - Monday', 2),
  ('Premium', 2, 1, '17:00:00', '22:00:00', 1.25, '#ffc107', 'Evening premium hours - Monday', 3),
  ('Emergency', 3, 1, '22:00:00', '23:59:59', 1.75, '#dc3545', 'Late night emergency hours - Monday', 4),
  ('Emergency', 3, 1, '00:00:00', '06:00:00', 1.75, '#dc3545', 'Overnight emergency hours - Monday', 5),

  -- Tuesday
  ('Standard', 1, 2, '08:00:00', '17:00:00', 1.00, '#28a745', 'Standard business hours - Tuesday', 1),
  ('Premium', 2, 2, '06:00:00', '08:00:00', 1.25, '#ffc107', 'Early morning premium hours - Tuesday', 2),
  ('Premium', 2, 2, '17:00:00', '22:00:00', 1.25, '#ffc107', 'Evening premium hours - Tuesday', 3),
  ('Emergency', 3, 2, '22:00:00', '23:59:59', 1.75, '#dc3545', 'Late night emergency hours - Tuesday', 4),
  ('Emergency', 3, 2, '00:00:00', '06:00:00', 1.75, '#dc3545', 'Overnight emergency hours - Tuesday', 5),

  -- Wednesday
  ('Standard', 1, 3, '08:00:00', '17:00:00', 1.00, '#28a745', 'Standard business hours - Wednesday', 1),
  ('Premium', 2, 3, '06:00:00', '08:00:00', 1.25, '#ffc107', 'Early morning premium hours - Wednesday', 2),
  ('Premium', 2, 3, '17:00:00', '22:00:00', 1.25, '#ffc107', 'Evening premium hours - Wednesday', 3),
  ('Emergency', 3, 3, '22:00:00', '23:59:59', 1.75, '#dc3545', 'Late night emergency hours - Wednesday', 4),
  ('Emergency', 3, 3, '00:00:00', '06:00:00', 1.75, '#dc3545', 'Overnight emergency hours - Wednesday', 5),

  -- Thursday
  ('Standard', 1, 4, '08:00:00', '17:00:00', 1.00, '#28a745', 'Standard business hours - Thursday', 1),
  ('Premium', 2, 4, '06:00:00', '08:00:00', 1.25, '#ffc107', 'Early morning premium hours - Thursday', 2),
  ('Premium', 2, 4, '17:00:00', '22:00:00', 1.25, '#ffc107', 'Evening premium hours - Thursday', 3),
  ('Emergency', 3, 4, '22:00:00', '23:59:59', 1.75, '#dc3545', 'Late night emergency hours - Thursday', 4),
  ('Emergency', 3, 4, '00:00:00', '06:00:00', 1.75, '#dc3545', 'Overnight emergency hours - Thursday', 5),

  -- Friday
  ('Standard', 1, 5, '08:00:00', '17:00:00', 1.00, '#28a745', 'Standard business hours - Friday', 1),
  ('Premium', 2, 5, '06:00:00', '08:00:00', 1.25, '#ffc107', 'Early morning premium hours - Friday', 2),
  ('Premium', 2, 5, '17:00:00', '22:00:00', 1.25, '#ffc107', 'Evening premium hours - Friday', 3),
  ('Emergency', 3, 5, '22:00:00', '23:59:59', 1.75, '#dc3545', 'Late night emergency hours - Friday', 4),
  ('Emergency', 3, 5, '00:00:00', '06:00:00', 1.75, '#dc3545', 'Overnight emergency hours - Friday', 5),

  -- WEEKENDS: Premium and Emergency hours (no standard hours on weekends)
  -- Saturday
  ('Premium', 2, 6, '08:00:00', '22:00:00', 1.50, '#ffc107', 'Weekend premium hours - Saturday', 2),
  ('Emergency', 3, 6, '22:00:00', '23:59:59', 2.00, '#dc3545', 'Late night emergency hours - Saturday', 4),
  ('Emergency', 3, 6, '00:00:00', '08:00:00', 2.00, '#dc3545', 'Overnight emergency hours - Saturday', 5),

  -- Sunday
  ('Premium', 2, 0, '08:00:00', '22:00:00', 1.50, '#ffc107', 'Weekend premium hours - Sunday', 2),
  ('Emergency', 3, 0, '22:00:00', '23:59:59', 2.00, '#dc3545', 'Late night emergency hours - Sunday', 4),
  ('Emergency', 3, 0, '00:00:00', '08:00:00', 2.00, '#dc3545', 'Overnight emergency hours - Sunday', 5);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_service_hour_rate_tiers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER service_hour_rate_tiers_updated_at
  BEFORE UPDATE ON service_hour_rate_tiers
  FOR EACH ROW
  EXECUTE FUNCTION update_service_hour_rate_tiers_updated_at();

-- Comments
COMMENT ON TABLE service_hour_rate_tiers IS 'Defines pricing tiers (Standard, Premium, Emergency) based on time of day and day of week';
COMMENT ON COLUMN service_hour_rate_tiers.day_of_week IS '0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday';
COMMENT ON COLUMN service_hour_rate_tiers.tier_level IS '1=Standard, 2=Premium, 3=Emergency (higher number = higher priority/cost)';
COMMENT ON COLUMN service_hour_rate_tiers.rate_multiplier IS 'Multiplier applied to base service rate (1.0 = base, 1.5 = 50% premium, etc.)';
