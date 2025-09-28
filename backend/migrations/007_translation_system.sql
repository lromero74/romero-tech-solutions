-- Migration: Translation System
-- Description: Database-driven translation system for multi-language support
-- Date: 2025-09-27

-- Create languages table
CREATE TABLE t_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(5) NOT NULL UNIQUE, -- en, es, fr, de, etc.
  name VARCHAR(100) NOT NULL, -- English, Español, Français, Deutsch, etc.
  native_name VARCHAR(100) NOT NULL, -- English, Español, Français, Deutsch, etc.
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  direction VARCHAR(3) DEFAULT 'ltr', -- ltr (left-to-right) or rtl (right-to-left)
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create translation namespaces table (for organizing translations)
CREATE TABLE t_translation_namespaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace VARCHAR(100) NOT NULL UNIQUE, -- client, admin, public, etc.
  description TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create translation keys table
CREATE TABLE t_translation_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace_id UUID NOT NULL REFERENCES t_translation_namespaces(id) ON DELETE CASCADE,
  key_path VARCHAR(500) NOT NULL, -- dashboard.nav.schedule, settings.mfa.title, etc.
  description TEXT, -- Human-readable description for translators
  default_value TEXT, -- Fallback value if translation missing
  context TEXT, -- Additional context for translators
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(namespace_id, key_path)
);

-- Create translations table
CREATE TABLE t_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID NOT NULL REFERENCES t_translation_keys(id) ON DELETE CASCADE,
  language_id UUID NOT NULL REFERENCES t_languages(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  is_approved BOOLEAN DEFAULT false, -- For translation workflow approval
  translated_by VARCHAR(255), -- Who translated this
  reviewed_by VARCHAR(255), -- Who reviewed this translation
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(key_id, language_id)
);

-- Create user language preferences table
CREATE TABLE t_user_language_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  language_id UUID NOT NULL REFERENCES t_languages(id) ON DELETE CASCADE,
  context VARCHAR(50) NOT NULL DEFAULT 'general', -- general, client, admin
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(user_id, context)
);

-- Create session language preferences (for non-authenticated users)
CREATE TABLE t_session_language_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token VARCHAR(255) NOT NULL, -- Browser session identifier
  language_code VARCHAR(5) NOT NULL,
  context VARCHAR(50) NOT NULL DEFAULT 'general',
  expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(session_token, context)
);

-- Add indexes for performance
CREATE INDEX idx_translation_keys_namespace_id ON t_translation_keys(namespace_id);
CREATE INDEX idx_translation_keys_active ON t_translation_keys(is_active);
CREATE INDEX idx_translations_key_id ON t_translations(key_id);
CREATE INDEX idx_translations_language_id ON t_translations(language_id);
CREATE INDEX idx_translations_approved ON t_translations(is_approved);
CREATE INDEX idx_user_language_preferences_user_id ON t_user_language_preferences(user_id);
CREATE INDEX idx_session_language_preferences_token ON t_session_language_preferences(session_token);
CREATE INDEX idx_session_language_preferences_expires ON t_session_language_preferences(expires_at);

-- Insert default languages
INSERT INTO t_languages (code, name, native_name, is_active, is_default) VALUES
('en', 'English', 'English', true, true),
('es', 'Spanish', 'Español', true, false);

-- Insert translation namespaces
INSERT INTO t_translation_namespaces (namespace, description) VALUES
('client', 'Client dashboard and interfaces'),
('admin', 'Admin dashboard and interfaces'),
('public', 'Public website content'),
('auth', 'Authentication interfaces'),
('common', 'Common UI elements and messages');

-- Create function to get translations for a language and namespace
CREATE OR REPLACE FUNCTION get_translations(
  p_language_code VARCHAR(5),
  p_namespace VARCHAR(100)
) RETURNS TABLE (
  key_path VARCHAR(500),
  value TEXT,
  default_value TEXT
) AS $$
DECLARE
  v_language_id UUID;
  v_namespace_id UUID;
BEGIN
  -- Get language ID
  SELECT id INTO v_language_id
  FROM t_languages
  WHERE code = p_language_code AND is_active = true;

  -- Get namespace ID
  SELECT id INTO v_namespace_id
  FROM t_translation_namespaces
  WHERE namespace = p_namespace;

  -- Return translations with fallbacks
  RETURN QUERY
  SELECT
    tk.key_path,
    COALESCE(t.value, tk.default_value) as value,
    tk.default_value
  FROM t_translation_keys tk
  LEFT JOIN t_translations t ON tk.id = t.key_id AND t.language_id = v_language_id
  WHERE tk.namespace_id = v_namespace_id
    AND tk.is_active = true
  ORDER BY tk.key_path;
END;
$$ LANGUAGE plpgsql;

-- Create function to set user language preference
CREATE OR REPLACE FUNCTION set_user_language_preference(
  p_user_id UUID,
  p_language_code VARCHAR(5),
  p_context VARCHAR(50) DEFAULT 'general'
) RETURNS BOOLEAN AS $$
DECLARE
  v_language_id UUID;
BEGIN
  -- Get language ID
  SELECT id INTO v_language_id
  FROM t_languages
  WHERE code = p_language_code AND is_active = true;

  IF v_language_id IS NULL THEN
    RETURN false;
  END IF;

  -- Insert or update preference
  INSERT INTO t_user_language_preferences (user_id, language_id, context)
  VALUES (p_user_id, v_language_id, p_context)
  ON CONFLICT (user_id, context)
  DO UPDATE SET
    language_id = v_language_id,
    updated_at = CURRENT_TIMESTAMP;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Create function to get user language preference
CREATE OR REPLACE FUNCTION get_user_language_preference(
  p_user_id UUID,
  p_context VARCHAR(50) DEFAULT 'general'
) RETURNS VARCHAR(5) AS $$
DECLARE
  v_language_code VARCHAR(5);
BEGIN
  SELECT l.code INTO v_language_code
  FROM t_user_language_preferences ulp
  JOIN t_languages l ON ulp.language_id = l.id
  WHERE ulp.user_id = p_user_id
    AND ulp.context = p_context
    AND l.is_active = true;

  -- Return default language if no preference found
  IF v_language_code IS NULL THEN
    SELECT l.code INTO v_language_code
    FROM t_languages l
    WHERE l.is_default = true AND l.is_active = true
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_language_code, 'en');
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up expired session language preferences
CREATE OR REPLACE FUNCTION cleanup_expired_session_preferences() RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM t_session_language_preferences
  WHERE expires_at < CURRENT_TIMESTAMP;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to bulk insert translation keys and values
CREATE OR REPLACE FUNCTION insert_translation_batch(
  p_namespace VARCHAR(100),
  p_language_code VARCHAR(5),
  p_translations JSONB
) RETURNS INTEGER AS $$
DECLARE
  v_namespace_id UUID;
  v_language_id UUID;
  v_key_record RECORD;
  v_key_id UUID;
  v_inserted_count INTEGER := 0;
BEGIN
  -- Get namespace ID
  SELECT id INTO v_namespace_id
  FROM t_translation_namespaces
  WHERE namespace = p_namespace;

  -- Get language ID
  SELECT id INTO v_language_id
  FROM t_languages
  WHERE code = p_language_code AND is_active = true;

  IF v_namespace_id IS NULL OR v_language_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Process each translation
  FOR v_key_record IN SELECT * FROM jsonb_each_text(p_translations) LOOP
    -- Insert or get translation key
    INSERT INTO t_translation_keys (namespace_id, key_path, default_value)
    VALUES (v_namespace_id, v_key_record.key, v_key_record.value)
    ON CONFLICT (namespace_id, key_path)
    DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_key_id;

    -- If no returning value (conflict), get existing ID
    IF v_key_id IS NULL THEN
      SELECT id INTO v_key_id
      FROM t_translation_keys
      WHERE namespace_id = v_namespace_id AND key_path = v_key_record.key;
    END IF;

    -- Insert or update translation
    INSERT INTO t_translations (key_id, language_id, value, is_approved)
    VALUES (v_key_id, v_language_id, v_key_record.value, true)
    ON CONFLICT (key_id, language_id)
    DO UPDATE SET
      value = v_key_record.value,
      is_approved = true,
      updated_at = CURRENT_TIMESTAMP;

    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN v_inserted_count;
END;
$$ LANGUAGE plpgsql;