-- ============================================================================
-- Implement Graduated/Tiered Pricing Model
-- ============================================================================
-- Changes the pricing structure from flat-rate to graduated tiers
-- Each tier's pricing builds on the previous tier's pricing ranges
--
-- New Pricing Structure:
-- Free:       Devices 1-2:  $0.00/month
-- Subscribed: Devices 1-2:  $0.00/month (inherited)
--             Devices 3-10: $9.99/month each
-- Enterprise: Devices 1-2:  $0.00/month (inherited)
--             Devices 3-10: $9.99/month each (inherited)
--             Devices 11-50: $7.99/month each
-- ============================================================================

BEGIN;

-- Add pricing_ranges column to store graduated pricing structure
ALTER TABLE subscription_pricing
ADD COLUMN pricing_ranges JSONB DEFAULT '[]'::jsonb;

-- Update Free tier pricing ranges
UPDATE subscription_pricing
SET pricing_ranges = '[
  {"start": 1, "end": 2, "price": 0.00, "description": "Free tier devices"}
]'::jsonb,
updated_at = CURRENT_TIMESTAMP
WHERE tier = 'free';

-- Update Subscribed tier pricing ranges (builds on Free)
UPDATE subscription_pricing
SET pricing_ranges = '[
  {"start": 1, "end": 2, "price": 0.00, "description": "Free tier devices (inherited)"},
  {"start": 3, "end": 10, "price": 9.99, "description": "Pro tier devices"}
]'::jsonb,
updated_at = CURRENT_TIMESTAMP
WHERE tier = 'subscribed';

-- Update Enterprise tier pricing ranges (builds on Free + Subscribed)
UPDATE subscription_pricing
SET pricing_ranges = '[
  {"start": 1, "end": 2, "price": 0.00, "description": "Free tier devices (inherited)"},
  {"start": 3, "end": 10, "price": 9.99, "description": "Pro tier devices (inherited)"},
  {"start": 11, "end": 50, "price": 7.99, "description": "Enterprise tier devices"}
]'::jsonb,
updated_at = CURRENT_TIMESTAMP
WHERE tier = 'enterprise';

-- Add helpful comment
COMMENT ON COLUMN subscription_pricing.pricing_ranges IS 'Graduated pricing structure: array of {start, end, price, description} objects defining device price ranges';

-- Create index for efficient JSONB queries
CREATE INDEX IF NOT EXISTS idx_subscription_pricing_ranges ON subscription_pricing USING GIN (pricing_ranges);

COMMIT;

-- ============================================================================
-- Verification Queries
-- ============================================================================
-- SELECT tier, pricing_ranges FROM subscription_pricing WHERE is_active = TRUE ORDER BY CASE tier WHEN 'free' THEN 1 WHEN 'subscribed' THEN 2 WHEN 'enterprise' THEN 3 END;

-- ============================================================================
-- Pricing Examples (for verification):
-- ============================================================================
-- Free tier with 2 devices:
--   Total: $0.00/month
--
-- Pro tier with 5 devices:
--   Devices 1-2:  $0.00 (2 × $0.00)
--   Devices 3-5:  $29.97 (3 × $9.99)
--   Total: $29.97/month
--
-- Pro tier with 10 devices:
--   Devices 1-2:  $0.00 (2 × $0.00)
--   Devices 3-10: $79.92 (8 × $9.99)
--   Total: $79.92/month
--
-- Enterprise tier with 20 devices:
--   Devices 1-2:   $0.00 (2 × $0.00)
--   Devices 3-10:  $79.92 (8 × $9.99)
--   Devices 11-20: $79.90 (10 × $7.99)
--   Total: $159.82/month
-- ============================================================================
