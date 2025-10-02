-- Migration: Add base hourly rate setting
-- Description: Creates a system setting for the base hourly rate used to calculate service costs with rate multipliers
-- Created: 2025-10-01

-- Insert base_rate setting if it doesn't already exist
INSERT INTO system_settings (setting_key, setting_value, setting_type, description, created_at, updated_at)
VALUES (
    'base_hourly_rate',
    '75'::jsonb,
    'pricing',
    'Base hourly rate in dollars for on-call services. This rate is multiplied by the tier rate multiplier to calculate actual service costs.',
    NOW(),
    NOW()
)
ON CONFLICT (setting_key) DO NOTHING;
