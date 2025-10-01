-- Migration: Service Types Translation Upgrade
-- Description: Upgrade existing service_types table to support translations
-- Date: 2025-10-01

-- Add new columns for translation support
ALTER TABLE service_types
ADD COLUMN IF NOT EXISTS type_code VARCHAR(100),
ADD COLUMN IF NOT EXISTS name_key VARCHAR(500),
ADD COLUMN IF NOT EXISTS description_key VARCHAR(500),
ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 999,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);

-- Migrate existing data: generate type_code from name
UPDATE service_types
SET type_code = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE type_code IS NULL;

-- Make type_code unique and not null
ALTER TABLE service_types ALTER COLUMN type_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_types_type_code ON service_types(type_code);

-- Generate translation keys for existing records
DO $$
DECLARE
  v_namespace_id UUID;
  v_en_language_id UUID;
  v_es_language_id UUID;
  v_service_type RECORD;
  v_name_key VARCHAR(500);
  v_description_key VARCHAR(500);
  v_name_key_id UUID;
  v_description_key_id UUID;
BEGIN
  -- Get common namespace ID
  SELECT id INTO v_namespace_id
  FROM t_translation_namespaces
  WHERE namespace = 'common';

  -- Get language IDs
  SELECT id INTO v_en_language_id FROM t_languages WHERE code = 'en';
  SELECT id INTO v_es_language_id FROM t_languages WHERE code = 'es';

  -- Process each existing service type
  FOR v_service_type IN SELECT * FROM service_types WHERE name_key IS NULL LOOP
    -- Generate translation keys
    v_name_key := 'serviceTypes.' || v_service_type.type_code || '.name';
    v_description_key := 'serviceTypes.' || v_service_type.type_code || '.description';

    -- Insert translation keys
    INSERT INTO t_translation_keys (namespace_id, key_path, default_value)
    VALUES (v_namespace_id, v_name_key, v_service_type.name)
    ON CONFLICT (namespace_id, key_path) DO NOTHING
    RETURNING id INTO v_name_key_id;

    IF v_name_key_id IS NULL THEN
      SELECT id INTO v_name_key_id FROM t_translation_keys
      WHERE namespace_id = v_namespace_id AND key_path = v_name_key;
    END IF;

    INSERT INTO t_translation_keys (namespace_id, key_path, default_value)
    VALUES (v_namespace_id, v_description_key, COALESCE(v_service_type.description, ''))
    ON CONFLICT (namespace_id, key_path) DO NOTHING
    RETURNING id INTO v_description_key_id;

    IF v_description_key_id IS NULL THEN
      SELECT id INTO v_description_key_id FROM t_translation_keys
      WHERE namespace_id = v_namespace_id AND key_path = v_description_key;
    END IF;

    -- Insert English translations
    INSERT INTO t_translations (key_id, language_id, value, is_approved)
    VALUES (v_name_key_id, v_en_language_id, v_service_type.name, true)
    ON CONFLICT (key_id, language_id) DO NOTHING;

    INSERT INTO t_translations (key_id, language_id, value, is_approved)
    VALUES (v_description_key_id, v_en_language_id, COALESCE(v_service_type.description, ''), true)
    ON CONFLICT (key_id, language_id) DO NOTHING;

    -- Update service type with translation keys
    UPDATE service_types
    SET name_key = v_name_key,
        description_key = v_description_key
    WHERE id = v_service_type.id;
  END LOOP;
END $$;

-- Create function to get service types with translations
CREATE OR REPLACE FUNCTION get_service_types_with_translations(
  p_language_code VARCHAR(5) DEFAULT 'en'
) RETURNS TABLE (
  id UUID,
  type_code VARCHAR(100),
  category VARCHAR(100),
  type_name TEXT,
  description TEXT,
  is_active BOOLEAN,
  is_system BOOLEAN,
  sort_order INTEGER
) AS $$
DECLARE
  v_language_id UUID;
BEGIN
  -- Get language ID
  SELECT l.id INTO v_language_id
  FROM t_languages l
  WHERE l.code = p_language_code AND l.is_active = true;

  -- If language not found, get default language
  IF v_language_id IS NULL THEN
    SELECT l.id INTO v_language_id
    FROM t_languages l
    WHERE l.is_default = true AND l.is_active = true
    LIMIT 1;
  END IF;

  -- Return service types with translations
  RETURN QUERY
  SELECT
    st.id,
    st.type_code,
    st.category,
    COALESCE(
      (SELECT t.value
       FROM t_translation_keys tk
       JOIN t_translations t ON tk.id = t.key_id
       WHERE tk.key_path = st.name_key AND t.language_id = v_language_id
       LIMIT 1),
      (SELECT tk.default_value
       FROM t_translation_keys tk
       WHERE tk.key_path = st.name_key
       LIMIT 1),
      st.name,
      st.type_code
    ) as type_name,
    COALESCE(
      (SELECT t.value
       FROM t_translation_keys tk
       JOIN t_translations t ON tk.id = t.key_id
       WHERE tk.key_path = st.description_key AND t.language_id = v_language_id
       LIMIT 1),
      (SELECT tk.default_value
       FROM t_translation_keys tk
       WHERE tk.key_path = st.description_key
       LIMIT 1),
      st.description,
      ''
    ) as description,
    st.is_active,
    st.is_system,
    st.sort_order
  FROM service_types st
  WHERE st.is_active = true
  ORDER BY
    CASE WHEN st.type_code = 'other' THEN 1 ELSE 0 END, -- "Other" always last
    st.sort_order,
    st.type_code;
END;
$$ LANGUAGE plpgsql;

-- Create function to add or update service type with translations
CREATE OR REPLACE FUNCTION upsert_service_type_with_translations(
  p_type_code VARCHAR(100),
  p_category VARCHAR(100),
  p_name_en TEXT,
  p_description_en TEXT,
  p_name_es TEXT DEFAULT NULL,
  p_description_es TEXT DEFAULT NULL,
  p_sort_order INTEGER DEFAULT 999,
  p_is_system BOOLEAN DEFAULT false,
  p_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_service_type_id UUID;
  v_name_key VARCHAR(500);
  v_description_key VARCHAR(500);
  v_namespace_id UUID;
  v_name_key_id UUID;
  v_description_key_id UUID;
  v_en_language_id UUID;
  v_es_language_id UUID;
BEGIN
  -- Get common namespace ID
  SELECT id INTO v_namespace_id
  FROM t_translation_namespaces
  WHERE namespace = 'common';

  -- Get language IDs
  SELECT id INTO v_en_language_id FROM t_languages WHERE code = 'en';
  SELECT id INTO v_es_language_id FROM t_languages WHERE code = 'es';

  -- Generate translation keys
  v_name_key := 'serviceTypes.' || p_type_code || '.name';
  v_description_key := 'serviceTypes.' || p_type_code || '.description';

  -- Insert or update service type
  INSERT INTO service_types (
    type_code, name, category, name_key, description_key,
    sort_order, is_system, created_by, updated_by
  )
  VALUES (
    p_type_code, p_name_en, p_category, v_name_key, v_description_key,
    p_sort_order, p_is_system, p_user_id, p_user_id
  )
  ON CONFLICT (type_code)
  DO UPDATE SET
    name = p_name_en,
    category = p_category,
    sort_order = p_sort_order,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = p_user_id
  RETURNING id INTO v_service_type_id;

  -- Insert translation keys if they don't exist
  INSERT INTO t_translation_keys (namespace_id, key_path, default_value)
  VALUES (v_namespace_id, v_name_key, p_name_en)
  ON CONFLICT (namespace_id, key_path)
  DO UPDATE SET default_value = p_name_en, updated_at = CURRENT_TIMESTAMP
  RETURNING id INTO v_name_key_id;

  IF v_name_key_id IS NULL THEN
    SELECT id INTO v_name_key_id FROM t_translation_keys
    WHERE namespace_id = v_namespace_id AND key_path = v_name_key;
  END IF;

  INSERT INTO t_translation_keys (namespace_id, key_path, default_value)
  VALUES (v_namespace_id, v_description_key, p_description_en)
  ON CONFLICT (namespace_id, key_path)
  DO UPDATE SET default_value = p_description_en, updated_at = CURRENT_TIMESTAMP
  RETURNING id INTO v_description_key_id;

  IF v_description_key_id IS NULL THEN
    SELECT id INTO v_description_key_id FROM t_translation_keys
    WHERE namespace_id = v_namespace_id AND key_path = v_description_key;
  END IF;

  -- Insert English translations
  INSERT INTO t_translations (key_id, language_id, value, is_approved)
  VALUES (v_name_key_id, v_en_language_id, p_name_en, true)
  ON CONFLICT (key_id, language_id)
  DO UPDATE SET value = p_name_en, is_approved = true, updated_at = CURRENT_TIMESTAMP;

  INSERT INTO t_translations (key_id, language_id, value, is_approved)
  VALUES (v_description_key_id, v_en_language_id, p_description_en, true)
  ON CONFLICT (key_id, language_id)
  DO UPDATE SET value = p_description_en, is_approved = true, updated_at = CURRENT_TIMESTAMP;

  -- Insert Spanish translations if provided
  IF p_name_es IS NOT NULL THEN
    INSERT INTO t_translations (key_id, language_id, value, is_approved)
    VALUES (v_name_key_id, v_es_language_id, p_name_es, true)
    ON CONFLICT (key_id, language_id)
    DO UPDATE SET value = p_name_es, is_approved = true, updated_at = CURRENT_TIMESTAMP;
  END IF;

  IF p_description_es IS NOT NULL THEN
    INSERT INTO t_translations (key_id, language_id, value, is_approved)
    VALUES (v_description_key_id, v_es_language_id, p_description_es, true)
    ON CONFLICT (key_id, language_id)
    DO UPDATE SET value = p_description_es, is_approved = true, updated_at = CURRENT_TIMESTAMP;
  END IF;

  RETURN v_service_type_id;
END;
$$ LANGUAGE plpgsql;

-- Add "Other" service type if it doesn't exist
INSERT INTO service_types (type_code, name, category, description, is_system, sort_order)
VALUES ('other', 'Other', 'General', 'Other services not listed above', true, 999)
ON CONFLICT (type_code) DO NOTHING;

-- Mark all existing service types as system types
UPDATE service_types SET is_system = true WHERE is_system = false OR is_system IS NULL;

-- Add audit trigger for service types
CREATE OR REPLACE FUNCTION audit_service_types_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (table_name, record_id, action, new_data, changed_by)
    VALUES ('service_types', NEW.id, 'INSERT', row_to_json(NEW), NEW.created_by);
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('service_types', NEW.id, 'UPDATE', row_to_json(OLD), row_to_json(NEW), NEW.updated_by);
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (table_name, record_id, action, old_data, changed_by)
    VALUES ('service_types', OLD.id, 'DELETE', row_to_json(OLD), OLD.updated_by);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS service_types_audit_trigger ON service_types;
CREATE TRIGGER service_types_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON service_types
FOR EACH ROW EXECUTE FUNCTION audit_service_types_changes();
