-- ============================================================================
-- Add Default Devices Allowed to Subscription Pricing
-- ============================================================================
-- Adds a default_devices_allowed field to subscription_pricing table
-- This serves as a template for new users joining each tier
-- Existing users keep their current devices_allowed values (grandfathered)
-- ============================================================================

BEGIN;

-- Add default_devices_allowed column to subscription_pricing table
ALTER TABLE subscription_pricing
ADD COLUMN default_devices_allowed INTEGER DEFAULT 2 NOT NULL;

-- Update existing pricing rows with sensible defaults
UPDATE subscription_pricing
SET default_devices_allowed = CASE tier
    WHEN 'free' THEN 2
    WHEN 'subscribed' THEN 10
    WHEN 'enterprise' THEN 50
    ELSE 2
END,
updated_at = CURRENT_TIMESTAMP
WHERE default_devices_allowed IS NULL OR default_devices_allowed = 2;

-- Add helpful comment
COMMENT ON COLUMN subscription_pricing.default_devices_allowed IS 'Default device limit for new users of this tier (existing users keep their current limits)';

COMMIT;

-- ============================================================================
-- Verification Query
-- ============================================================================
-- SELECT tier, base_devices, default_devices_allowed, price_per_additional_device FROM subscription_pricing WHERE is_active = TRUE;
