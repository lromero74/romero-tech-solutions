-- =====================================================
-- Dynamic Rating Questions System
-- =====================================================
-- Created: 2025-10-08
-- Purpose: Make rating questions configurable from database
--          instead of hardcoded in the application
-- =====================================================

-- Create rating_questions table
-- Stores the questions that clients will rate on
CREATE TABLE IF NOT EXISTS rating_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_key VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'price', 'speed', 'accuracy', 'professionalism'
    question_text TEXT NOT NULL, -- The actual question text shown to clients
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create rating_responses table
-- Stores individual ratings for each question
CREATE TABLE IF NOT EXISTS rating_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_rating_id UUID NOT NULL REFERENCES service_ratings(id) ON DELETE CASCADE,
    rating_question_id UUID NOT NULL REFERENCES rating_questions(id) ON DELETE CASCADE,
    rating_value INTEGER NOT NULL CHECK (rating_value >= 1 AND rating_value <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one response per question per rating
    CONSTRAINT unique_response_per_question UNIQUE (service_rating_id, rating_question_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_rating_questions_active ON rating_questions(is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_rating_responses_rating ON rating_responses(service_rating_id);
CREATE INDEX IF NOT EXISTS idx_rating_responses_question ON rating_responses(rating_question_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_rating_questions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rating_questions_updated_at_trigger
    BEFORE UPDATE ON rating_questions
    FOR EACH ROW
    EXECUTE FUNCTION update_rating_questions_updated_at();

-- Insert default rating questions
INSERT INTO rating_questions (question_key, question_text, display_order, is_active) VALUES
    ('price', 'How would you rate the price/value of the service?', 1, true),
    ('speed', 'How would you rate the speed of service delivery?', 2, true),
    ('accuracy', 'How would you rate the accuracy and quality of work?', 3, true),
    ('professionalism', 'How would you rate the professionalism of our team?', 4, true)
ON CONFLICT (question_key) DO NOTHING;

-- Migrate existing hardcoded ratings to the new dynamic system
-- This will copy data from the old columns to the new rating_responses table
DO $$
DECLARE
    rating_record RECORD;
    question_price_id UUID;
    question_speed_id UUID;
    question_accuracy_id UUID;
    question_professionalism_id UUID;
BEGIN
    -- Get question IDs
    SELECT id INTO question_price_id FROM rating_questions WHERE question_key = 'price';
    SELECT id INTO question_speed_id FROM rating_questions WHERE question_key = 'speed';
    SELECT id INTO question_accuracy_id FROM rating_questions WHERE question_key = 'accuracy';
    SELECT id INTO question_professionalism_id FROM rating_questions WHERE question_key = 'professionalism';

    -- Only migrate if the old columns exist and have data
    FOR rating_record IN
        SELECT id, rating_price, rating_speed, rating_accuracy, rating_professionalism
        FROM service_ratings
        WHERE rating_price IS NOT NULL
    LOOP
        -- Insert responses for each rating
        INSERT INTO rating_responses (service_rating_id, rating_question_id, rating_value)
        VALUES
            (rating_record.id, question_price_id, rating_record.rating_price),
            (rating_record.id, question_speed_id, rating_record.rating_speed),
            (rating_record.id, question_accuracy_id, rating_record.rating_accuracy),
            (rating_record.id, question_professionalism_id, rating_record.rating_professionalism)
        ON CONFLICT (service_rating_id, rating_question_id) DO NOTHING;
    END LOOP;
END $$;

-- Update the total_score calculation to use dynamic responses
-- Drop the old generated column
ALTER TABLE service_ratings DROP COLUMN IF EXISTS total_score;

-- Add new total_score column (not generated, will be calculated via query)
ALTER TABLE service_ratings ADD COLUMN IF NOT EXISTS total_score INTEGER;

-- Calculate and update total scores from rating_responses
UPDATE service_ratings sr
SET total_score = (
    SELECT COALESCE(SUM(rating_value), 0)
    FROM rating_responses rr
    WHERE rr.service_rating_id = sr.id
);

-- Add comments
COMMENT ON TABLE rating_questions IS 'Configurable rating questions shown to clients after service completion';
COMMENT ON TABLE rating_responses IS 'Individual ratings for each question per service request';
COMMENT ON COLUMN rating_questions.question_key IS 'Unique identifier for the question (used in code)';
COMMENT ON COLUMN rating_questions.question_text IS 'The actual question text displayed to clients';
COMMENT ON COLUMN rating_questions.display_order IS 'Order in which questions are displayed (lower numbers first)';
