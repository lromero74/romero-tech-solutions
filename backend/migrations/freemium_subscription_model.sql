-- ============================================================================
-- Freemium Subscription Model Migration
-- ============================================================================
-- Converts trial-based model to freemium subscription model
--
-- Changes:
-- 1. Add subscription_tier field (free, subscribed, enterprise)
-- 2. Rename trial_expires_at → subscription_expires_at
-- 3. Add devices_allowed field (configurable per user)
-- 4. Add profile_completed field (tracks full profile completion)
-- 5. Create subscription_pricing table (admin-configurable pricing)
-- 6. Migrate existing trial users to free tier
-- ============================================================================

BEGIN;

-- Create subscription tier enum type
CREATE TYPE subscription_tier_type AS ENUM ('free', 'subscribed', 'enterprise');

-- Add subscription_tier column to users table
ALTER TABLE users
ADD COLUMN subscription_tier subscription_tier_type DEFAULT 'free' NOT NULL;

-- Add devices_allowed column (default 2 for free tier)
ALTER TABLE users
ADD COLUMN devices_allowed INTEGER DEFAULT 2 NOT NULL;

-- Add profile_completed column (tracks whether user filled all profile fields)
ALTER TABLE users
ADD COLUMN profile_completed BOOLEAN DEFAULT FALSE NOT NULL;

-- Rename trial_expires_at to subscription_expires_at
ALTER TABLE users
RENAME COLUMN trial_expires_at TO subscription_expires_at;

-- Create subscription pricing configuration table
CREATE TABLE IF NOT EXISTS subscription_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier subscription_tier_type NOT NULL,
    base_devices INTEGER NOT NULL DEFAULT 2,
    price_per_additional_device DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    billing_period VARCHAR(20) DEFAULT 'monthly',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default pricing configuration
INSERT INTO subscription_pricing (tier, base_devices, price_per_additional_device, currency, billing_period)
VALUES
    ('free'::subscription_tier_type, 2, 0.00, 'USD', 'monthly'),
    ('subscribed'::subscription_tier_type, 2, 9.99, 'USD', 'monthly'),
    ('enterprise'::subscription_tier_type, 10, 7.99, 'USD', 'monthly');

-- ============================================================================
-- Migrate existing trial users to free tier
-- ============================================================================

-- Set all trial users to free tier and remove expiration
UPDATE users
SET
    subscription_tier = 'free'::subscription_tier_type,
    subscription_expires_at = NULL,
    devices_allowed = 2,
    profile_completed = CASE
        WHEN
            first_name IS NOT NULL AND
            last_name IS NOT NULL AND
            email IS NOT NULL AND
            business_id IS NOT NULL
        THEN TRUE
        ELSE FALSE
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE is_trial = TRUE;

-- Set all non-trial users to appropriate tier based on current state
UPDATE users
SET
    subscription_tier = CASE
        WHEN business_id IS NOT NULL AND email_verified = TRUE THEN 'subscribed'::subscription_tier_type
        ELSE 'free'::subscription_tier_type
    END,
    devices_allowed = CASE
        WHEN business_id IS NOT NULL AND email_verified = TRUE THEN 10
        ELSE 2
    END,
    profile_completed = CASE
        WHEN
            first_name IS NOT NULL AND
            last_name IS NOT NULL AND
            email IS NOT NULL AND
            business_id IS NOT NULL
        THEN TRUE
        ELSE FALSE
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE is_trial = FALSE OR is_trial IS NULL;

-- ============================================================================
-- Create indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_users_profile_completed ON users(profile_completed);
CREATE INDEX IF NOT EXISTS idx_subscription_pricing_tier ON subscription_pricing(tier) WHERE is_active = TRUE;

-- ============================================================================
-- Add helpful comments
-- ============================================================================

COMMENT ON COLUMN users.subscription_tier IS 'User subscription tier: free (2 devices), subscribed (pay per device), enterprise (custom)';
COMMENT ON COLUMN users.devices_allowed IS 'Maximum number of devices allowed for this user based on subscription';
COMMENT ON COLUMN users.profile_completed IS 'Whether user has completed full profile (required for service requests and upgrades)';
COMMENT ON COLUMN users.subscription_expires_at IS 'When subscription expires (NULL for free tier, date for paid subscriptions)';
COMMENT ON TABLE subscription_pricing IS 'Admin-configurable pricing for different subscription tiers';

COMMIT;

-- ============================================================================
-- Verification Queries (run these after migration to verify)
-- ============================================================================
-- SELECT subscription_tier, COUNT(*) as user_count FROM users GROUP BY subscription_tier;
-- SELECT * FROM subscription_pricing WHERE is_active = TRUE;
-- SELECT email, subscription_tier, devices_allowed, profile_completed FROM users LIMIT 10;
