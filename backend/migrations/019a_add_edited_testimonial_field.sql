-- =====================================================
-- Add edited testimonial text field
-- =====================================================
-- Created: 2025-10-08
-- Purpose: Store both original and edited versions of testimonials
-- =====================================================

-- Add column for edited testimonial text
ALTER TABLE service_testimonials
ADD COLUMN IF NOT EXISTS original_testimonial_text TEXT;

-- Move existing testimonial_text to original_testimonial_text
UPDATE service_testimonials
SET original_testimonial_text = testimonial_text
WHERE original_testimonial_text IS NULL;

-- Add column for edited testimonial (nullable - only set if admin edits)
ALTER TABLE service_testimonials
ADD COLUMN IF NOT EXISTS edited_testimonial_text TEXT;

-- Add column to track if testimonial was edited
ALTER TABLE service_testimonials
ADD COLUMN IF NOT EXISTS was_edited BOOLEAN DEFAULT false;

-- Update existing records
UPDATE service_testimonials
SET was_edited = false
WHERE was_edited IS NULL;

COMMENT ON COLUMN service_testimonials.original_testimonial_text IS 'Original testimonial text as submitted by the client';
COMMENT ON COLUMN service_testimonials.edited_testimonial_text IS 'Edited version of testimonial (for grammar, spelling, etc.) - NULL if not edited';
COMMENT ON COLUMN service_testimonials.was_edited IS 'Whether the testimonial was edited by an admin';
