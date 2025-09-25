-- Update existing users table to support client business relationships
-- Add business relationship columns to users table

-- First, check if the columns already exist to avoid errors
DO $$
BEGIN
    -- Add business_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='business_id') THEN
        ALTER TABLE users ADD COLUMN business_id UUID REFERENCES businesses(id) ON DELETE SET NULL;
    END IF;

    -- Add is_business_owner column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='is_business_owner') THEN
        ALTER TABLE users ADD COLUMN is_business_owner BOOLEAN DEFAULT FALSE;
    END IF;

    -- Add job_title column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='job_title') THEN
        ALTER TABLE users ADD COLUMN job_title VARCHAR(100);
    END IF;

    -- Add email confirmation columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='email_confirmed') THEN
        ALTER TABLE users ADD COLUMN email_confirmed BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='email_confirmation_token') THEN
        ALTER TABLE users ADD COLUMN email_confirmation_token VARCHAR(255);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='email_confirmation_expires') THEN
        ALTER TABLE users ADD COLUMN email_confirmation_expires TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_users_business_id ON users(business_id);
CREATE INDEX IF NOT EXISTS idx_users_business_owner ON users(business_id, is_business_owner);
CREATE INDEX IF NOT EXISTS idx_users_email_confirmed ON users(email_confirmed);
CREATE INDEX IF NOT EXISTS idx_users_confirmation_token ON users(email_confirmation_token);

-- Update existing client users to have email_confirmed = true if they're already active
UPDATE users
SET email_confirmed = TRUE
WHERE role = 'client' AND is_active = TRUE AND email_confirmed IS NULL;

-- Create a view for client users with business information
CREATE OR REPLACE VIEW v_client_users_with_business AS
SELECT
    u.id as user_id,
    u.cognito_id,
    u.email,
    u.name,
    u.phone,
    u.address as personal_address,
    u.job_title,
    u.is_business_owner,
    u.email_confirmed,
    u.is_active as user_active,
    u.created_at as user_created_at,
    u.updated_at as user_updated_at,

    -- Business information
    b.id as business_id,
    b.business_name,
    b.domain_email,
    b.logo_url,
    b.business_street,
    b.business_city,
    b.business_state,
    b.business_zip_code,
    b.business_country,
    b.is_active as business_active,
    b.created_at as business_created_at,
    b.updated_at as business_updated_at
FROM users u
LEFT JOIN businesses b ON u.business_id = b.id
WHERE u.role = 'client';