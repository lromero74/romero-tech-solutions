-- Create service_addresses table
-- This table stores multiple service locations for each business
CREATE TABLE IF NOT EXISTS service_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    -- Address label and details
    address_label VARCHAR(100) NOT NULL, -- e.g., "Main Office", "Warehouse", "Home"

    -- Address fields
    street VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(50) NOT NULL,
    zip_code VARCHAR(20) NOT NULL,
    country VARCHAR(50) NOT NULL DEFAULT 'USA',

    -- Contact information for this location
    contact_person VARCHAR(255),
    contact_phone VARCHAR(20),

    -- Additional notes
    notes TEXT,

    -- Status and metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_service_addresses_business_id ON service_addresses(business_id);
CREATE INDEX IF NOT EXISTS idx_service_addresses_active ON service_addresses(business_id, is_active);
CREATE INDEX IF NOT EXISTS idx_service_addresses_label ON service_addresses(business_id, address_label);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_service_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_service_addresses_updated_at
    BEFORE UPDATE ON service_addresses
    FOR EACH ROW
    EXECUTE FUNCTION update_service_addresses_updated_at();