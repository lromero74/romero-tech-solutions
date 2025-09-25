-- Create businesses table
-- This table stores business information separately from users
CREATE TABLE IF NOT EXISTS businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name VARCHAR(255) NOT NULL,
    domain_email VARCHAR(255) NOT NULL UNIQUE, -- Business domain for email verification
    logo_url VARCHAR(500),

    -- Business address
    business_street VARCHAR(255) NOT NULL,
    business_city VARCHAR(100) NOT NULL,
    business_state VARCHAR(50) NOT NULL,
    business_zip_code VARCHAR(20) NOT NULL,
    business_country VARCHAR(50) NOT NULL DEFAULT 'USA',

    -- Status and metadata
    is_active BOOLEAN DEFAULT FALSE, -- Activated after email confirmation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on domain_email for lookups
CREATE INDEX IF NOT EXISTS idx_businesses_domain_email ON businesses(domain_email);

-- Create index on business_name for searches
CREATE INDEX IF NOT EXISTS idx_businesses_name ON businesses(business_name);

-- Create index on is_active for filtering
CREATE INDEX IF NOT EXISTS idx_businesses_active ON businesses(is_active);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_businesses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_businesses_updated_at
    BEFORE UPDATE ON businesses
    FOR EACH ROW
    EXECUTE FUNCTION update_businesses_updated_at();