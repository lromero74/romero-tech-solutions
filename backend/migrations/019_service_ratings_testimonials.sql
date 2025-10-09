-- =====================================================
-- Service Ratings and Testimonials System
-- =====================================================
-- Created: 2025-10-08
-- Purpose: Enable clients to rate completed service requests
--          and submit testimonials for marketing purposes
-- =====================================================

-- Create service_ratings table
-- Stores client satisfaction ratings for completed service requests
CREATE TABLE IF NOT EXISTS service_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Rating scores (1-5 scale)
    rating_price INTEGER NOT NULL CHECK (rating_price >= 1 AND rating_price <= 5),
    rating_speed INTEGER NOT NULL CHECK (rating_speed >= 1 AND rating_speed <= 5),
    rating_accuracy INTEGER NOT NULL CHECK (rating_accuracy >= 1 AND rating_accuracy <= 5),
    rating_professionalism INTEGER NOT NULL CHECK (rating_professionalism >= 1 AND rating_professionalism <= 5),

    -- Calculated total score (max 20)
    total_score INTEGER GENERATED ALWAYS AS (rating_price + rating_speed + rating_accuracy + rating_professionalism) STORED,

    -- Security token for accessing the rating form
    rating_token VARCHAR(255) UNIQUE NOT NULL,
    token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Metadata
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT unique_rating_per_service_request UNIQUE (service_request_id)
);

-- Create service_testimonials table
-- Stores client testimonials linked to high-rated service requests
CREATE TABLE IF NOT EXISTS service_testimonials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    service_rating_id UUID NOT NULL REFERENCES service_ratings(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Testimonial content
    testimonial_text TEXT NOT NULL,

    -- Privacy and display preferences
    display_name_preference VARCHAR(20) NOT NULL CHECK (display_name_preference IN ('first_name', 'last_name', 'full_name', 'anonymous')),
    allow_public_display BOOLEAN NOT NULL DEFAULT false,

    -- Approval workflow
    is_approved BOOLEAN NOT NULL DEFAULT false,
    approved_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT unique_testimonial_per_service_request UNIQUE (service_request_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_service_ratings_service_request ON service_ratings(service_request_id);
CREATE INDEX IF NOT EXISTS idx_service_ratings_client ON service_ratings(client_id);
CREATE INDEX IF NOT EXISTS idx_service_ratings_token ON service_ratings(rating_token);
CREATE INDEX IF NOT EXISTS idx_service_ratings_total_score ON service_ratings(total_score);

CREATE INDEX IF NOT EXISTS idx_service_testimonials_service_request ON service_testimonials(service_request_id);
CREATE INDEX IF NOT EXISTS idx_service_testimonials_rating ON service_testimonials(service_rating_id);
CREATE INDEX IF NOT EXISTS idx_service_testimonials_client ON service_testimonials(client_id);
CREATE INDEX IF NOT EXISTS idx_service_testimonials_approved ON service_testimonials(is_approved);
CREATE INDEX IF NOT EXISTS idx_service_testimonials_public_display ON service_testimonials(allow_public_display, is_approved);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_service_ratings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER service_ratings_updated_at_trigger
    BEFORE UPDATE ON service_ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_service_ratings_updated_at();

CREATE OR REPLACE FUNCTION update_service_testimonials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER service_testimonials_updated_at_trigger
    BEFORE UPDATE ON service_testimonials
    FOR EACH ROW
    EXECUTE FUNCTION update_service_testimonials_updated_at();

-- Add comments for documentation
COMMENT ON TABLE service_ratings IS 'Client satisfaction ratings for completed service requests';
COMMENT ON TABLE service_testimonials IS 'Client testimonials for marketing purposes, linked to high-rated service requests';

COMMENT ON COLUMN service_ratings.rating_price IS 'Client rating for price/value (1-5)';
COMMENT ON COLUMN service_ratings.rating_speed IS 'Client rating for speed of service (1-5)';
COMMENT ON COLUMN service_ratings.rating_accuracy IS 'Client rating for accuracy/quality (1-5)';
COMMENT ON COLUMN service_ratings.rating_professionalism IS 'Client rating for professionalism (1-5)';
COMMENT ON COLUMN service_ratings.total_score IS 'Automatically calculated total score (max 20)';
COMMENT ON COLUMN service_ratings.rating_token IS 'Unique token for accessing the rating form via email link';

COMMENT ON COLUMN service_testimonials.display_name_preference IS 'How the client name should be displayed: first_name, last_name, full_name, or anonymous';
COMMENT ON COLUMN service_testimonials.allow_public_display IS 'Whether the client allows their name to be displayed on the public website';
COMMENT ON COLUMN service_testimonials.is_approved IS 'Whether the testimonial has been approved by an admin for public display';
