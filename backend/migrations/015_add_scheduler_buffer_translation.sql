-- Migration: Add scheduler.buffer translation
-- Description: Add "Buffer" translation to replace "Unavailable" in scheduler legend

-- Insert scheduler.buffer translation (replacing unavailable)
INSERT INTO translations_simple (key, en, es) VALUES
    ('scheduler.buffer', 'Buffer', 'Amortiguador')
ON CONFLICT (key) DO UPDATE
SET en = EXCLUDED.en, es = EXCLUDED.es;
