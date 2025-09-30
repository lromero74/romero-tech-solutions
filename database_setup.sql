-- =============================================
-- Romero Tech Solutions - Database Setup Script
-- =============================================
--
-- This file contains the complete database schema and reference data
-- for the Romero Tech Solutions MSP application.
--
-- Generated using pg_dump from production database
-- Date: September 29, 2025
-- Source Database: romerotechsolutions (34.228.181.68:5432)
--
-- USAGE INSTRUCTIONS:
-- 1. Create a new PostgreSQL database
-- 2. Connect to the database as a superuser
-- 3. Run this script: psql -d your_database_name -f database_setup.sql
--
-- IMPORTANT NOTES:
-- - This script includes all table structures, constraints, indexes, and views
-- - Reference data is included for essential lookup tables
-- - Foreign key relationships have been added for referential integrity
-- - No production user data is included for security
--
-- REQUIREMENTS:
-- - PostgreSQL 12+ (tested with PostgreSQL 16)
-- - Superuser privileges for schema creation
-- - Minimum 1GB available disk space
--
-- =============================================
--
-- PostgreSQL database dump
--

\restrict ygmukJXrgJnemLfdWnESBncy4zfvEbpPk1KvCGFjsoHXa5zY85Ch1HH2NKiBCcP

-- Dumped from database version 16.8
-- Dumped by pg_dump version 16.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: add_service_addresses(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_service_addresses(p_business_id uuid, p_addresses jsonb) RETURNS TABLE(success boolean, message text, addresses_added integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_address JSONB;
    v_count INTEGER := 0;
BEGIN
    -- Loop through addresses array
    FOR v_address IN SELECT jsonb_array_elements(p_addresses)
    LOOP
        INSERT INTO service_addresses (
            business_id,
            address_label,
            street,
            city,
            state,
            zip_code,
            country,
            contact_person,
            contact_phone,
            notes
        ) VALUES (
            p_business_id,
            v_address->>'label',
            v_address->>'street',
            v_address->>'city',
            v_address->>'state',
            v_address->>'zipCode',
            COALESCE(v_address->>'country', 'USA'),
            v_address->>'contactPerson',
            v_address->>'contactPhone',
            v_address->>'notes'
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN QUERY SELECT TRUE, 'Service addresses added successfully'::TEXT, v_count;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, SQLERRM::TEXT, 0;
END;
$$;


--
-- Name: check_available_quota(uuid, bigint, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_available_quota(p_business_id uuid, p_file_size_bytes bigint, p_service_location_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid) RETURNS TABLE(can_upload boolean, quota_type character varying, available_bytes bigint, reason text, warning_level character varying, soft_limit_exceeded boolean, usage_percentage numeric)
    LANGUAGE plpgsql
    AS $$
DECLARE
    business_quota RECORD;
    site_quota RECORD;
    user_quota RECORD;
    current_usage BIGINT;
    applicable_limit BIGINT;
    applicable_soft_limit BIGINT;
    usage_pct DECIMAL(5,2);
    warning_pct INTEGER;
    alert_pct INTEGER;
BEGIN
    -- Get business quota
    SELECT * INTO business_quota
    FROM t_client_storage_quotas
    WHERE business_id = p_business_id
    AND quota_type = 'business';

    -- Check if business quota exists
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'business'::VARCHAR(20), 0::BIGINT,
                          'No business storage quota configured'::TEXT,
                          'none'::VARCHAR(20), false, 0::DECIMAL(5,2);
        RETURN;
    END IF;

    -- Check business hard limit (always enforced)
    IF business_quota.storage_used_bytes + p_file_size_bytes > business_quota.storage_limit_bytes THEN
        RETURN QUERY SELECT false, 'business'::VARCHAR(20),
                          (business_quota.storage_limit_bytes - business_quota.storage_used_bytes),
                          'Business storage quota exceeded (hard limit)'::TEXT,
                          'hard_limit'::VARCHAR(20), true,
                          ROUND((business_quota.storage_used_bytes::DECIMAL / business_quota.storage_limit_bytes) * 100, 2);
        RETURN;
    END IF;

    -- Check site quota if applicable
    IF p_service_location_id IS NOT NULL THEN
        SELECT * INTO site_quota
        FROM t_client_storage_quotas
        WHERE business_id = p_business_id
        AND service_location_id = p_service_location_id
        AND quota_type = 'site';

        IF FOUND AND site_quota.storage_used_bytes + p_file_size_bytes > site_quota.storage_limit_bytes THEN
            RETURN QUERY SELECT false, 'site'::VARCHAR(20),
                              (site_quota.storage_limit_bytes - site_quota.storage_used_bytes),
                              'Site storage quota exceeded (hard limit)'::TEXT,
                              'hard_limit'::VARCHAR(20), true,
                              ROUND((site_quota.storage_used_bytes::DECIMAL / site_quota.storage_limit_bytes) * 100, 2);
            RETURN;
        END IF;
    END IF;

    -- Check user quota if applicable
    IF p_user_id IS NOT NULL THEN
        SELECT * INTO user_quota
        FROM t_client_storage_quotas
        WHERE business_id = p_business_id
        AND service_location_id = p_service_location_id
        AND user_id = p_user_id
        AND quota_type = 'user';

        IF FOUND AND user_quota.storage_used_bytes + p_file_size_bytes > user_quota.storage_limit_bytes THEN
            RETURN QUERY SELECT false, 'user'::VARCHAR(20),
                              (user_quota.storage_limit_bytes - user_quota.storage_used_bytes),
                              'User storage quota exceeded (hard limit)'::TEXT,
                              'hard_limit'::VARCHAR(20), true,
                              ROUND((user_quota.storage_used_bytes::DECIMAL / user_quota.storage_limit_bytes) * 100, 2);
            RETURN;
        END IF;
    END IF;

    -- Determine which quota to check for soft limits and warnings (most restrictive)
    current_usage := business_quota.storage_used_bytes;
    applicable_limit := business_quota.storage_limit_bytes;
    applicable_soft_limit := business_quota.storage_soft_limit_bytes;
    warning_pct := business_quota.warning_threshold_percentage;
    alert_pct := business_quota.alert_threshold_percentage;

    -- Use site quota if more restrictive
    IF site_quota IS NOT NULL AND site_quota.storage_limit_bytes < applicable_limit THEN
        current_usage := site_quota.storage_used_bytes;
        applicable_limit := site_quota.storage_limit_bytes;
        applicable_soft_limit := site_quota.storage_soft_limit_bytes;
        warning_pct := site_quota.warning_threshold_percentage;
        alert_pct := site_quota.alert_threshold_percentage;
    END IF;

    -- Use user quota if more restrictive
    IF user_quota IS NOT NULL AND user_quota.storage_limit_bytes < applicable_limit THEN
        current_usage := user_quota.storage_used_bytes;
        applicable_limit := user_quota.storage_limit_bytes;
        applicable_soft_limit := user_quota.storage_soft_limit_bytes;
        warning_pct := user_quota.warning_threshold_percentage;
        alert_pct := user_quota.alert_threshold_percentage;
    END IF;

    -- Calculate usage percentage against soft limit (if exists) or hard limit
    IF applicable_soft_limit IS NOT NULL THEN
        usage_pct := ROUND(((current_usage + p_file_size_bytes)::DECIMAL / applicable_soft_limit) * 100, 2);

        -- Check if upload would exceed soft limit
        IF current_usage + p_file_size_bytes > applicable_soft_limit THEN
            RETURN QUERY SELECT true, 'user'::VARCHAR(20),
                              (applicable_limit - current_usage),
                              'Upload allowed but soft limit exceeded - consider reducing storage usage'::TEXT,
                              'soft_exceeded'::VARCHAR(20), true, usage_pct;
            RETURN;
        END IF;

        -- Check alert threshold (based on soft limit)
        IF usage_pct >= alert_pct THEN
            RETURN QUERY SELECT true, 'user'::VARCHAR(20),
                              (applicable_limit - current_usage),
                              'Upload allowed but approaching storage limit - please clean up files soon'::TEXT,
                              'alert'::VARCHAR(20), false, usage_pct;
            RETURN;
        END IF;

        -- Check warning threshold (based on soft limit)
        IF usage_pct >= warning_pct THEN
            RETURN QUERY SELECT true, 'user'::VARCHAR(20),
                              (applicable_limit - current_usage),
                              'Upload allowed but storage is getting full - consider cleaning up files'::TEXT,
                              'warning'::VARCHAR(20), false, usage_pct;
            RETURN;
        END IF;
    ELSE
        -- No soft limit, use hard limit for percentage calculations
        usage_pct := ROUND(((current_usage + p_file_size_bytes)::DECIMAL / applicable_limit) * 100, 2);

        -- Check alert threshold (based on hard limit)
        IF usage_pct >= alert_pct THEN
            RETURN QUERY SELECT true, 'user'::VARCHAR(20),
                              (applicable_limit - current_usage),
                              'Upload allowed but approaching storage limit'::TEXT,
                              'alert'::VARCHAR(20), false, usage_pct;
            RETURN;
        END IF;

        -- Check warning threshold (based on hard limit)
        IF usage_pct >= warning_pct THEN
            RETURN QUERY SELECT true, 'user'::VARCHAR(20),
                              (applicable_limit - current_usage),
                              'Upload allowed but storage is getting full'::TEXT,
                              'warning'::VARCHAR(20), false, usage_pct;
            RETURN;
        END IF;
    END IF;

    -- All checks passed - upload allowed with no warnings
    RETURN QUERY SELECT true, 'none'::VARCHAR(20),
                      (applicable_limit - current_usage),
                      'Upload allowed'::TEXT,
                      'none'::VARCHAR(20), false, usage_pct;
END;
$$;


--
-- Name: cleanup_expired_session_preferences(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_session_preferences() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM t_session_language_preferences
  WHERE expires_at < CURRENT_TIMESTAMP;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;


--
-- Name: cleanup_expired_sessions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_sessions() RETURNS integer
    LANGUAGE plpgsql
    AS $$
      DECLARE
        cleaned_count INTEGER;
      BEGIN
        UPDATE user_sessions
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE is_active = true AND expires_at < CURRENT_TIMESTAMP;

        GET DIAGNOSTICS cleaned_count = ROW_COUNT;
        RETURN cleaned_count;
      END;
      $$;


--
-- Name: cleanup_password_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_password_history() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    config_record RECORD;
    user_record RECORD;
BEGIN
    -- Get the active password complexity configuration
    SELECT password_history_count INTO config_record
    FROM password_complexity_requirements
    WHERE is_active = true
    LIMIT 1;

    -- If no history count is set or it's 0, exit
    IF config_record.password_history_count IS NULL OR config_record.password_history_count = 0 THEN
        RETURN;
    END IF;

    -- For each user, keep only the most recent N passwords
    FOR user_record IN SELECT DISTINCT user_id FROM password_history LOOP
        DELETE FROM password_history
        WHERE user_id = user_record.user_id
        AND id NOT IN (
            SELECT id
            FROM password_history
            WHERE user_id = user_record.user_id
            ORDER BY created_at DESC
            LIMIT config_record.password_history_count
        );
    END LOOP;
END;
$$;


--
-- Name: confirm_client_email(character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_client_email(p_token character varying, p_email character varying) RETURNS TABLE(user_id uuid, business_id uuid, success boolean, message text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_user_id UUID;
    v_business_id UUID;
    v_token_expires TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Find user with matching token and email (qualify column names to avoid ambiguity)
    SELECT u.id, u.business_id, u.confirmation_expires_at 
    INTO v_user_id, v_business_id, v_token_expires
    FROM users u
    WHERE u.email = p_email 
    AND u.confirmation_token = p_token 
    AND u.email_verified = FALSE 
    AND u.is_active = FALSE;

    -- Check if user was found
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'Invalid confirmation token or email already confirmed'::TEXT;
        RETURN;
    END IF;

    -- Check if token has expired
    IF v_token_expires < CURRENT_TIMESTAMP THEN
        RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'Confirmation token has expired'::TEXT;
        RETURN;
    END IF;

    BEGIN
        -- Update user to confirmed and active
        UPDATE users
        SET email_verified = TRUE,
            is_active = TRUE,
            confirmation_token = NULL,
            confirmation_expires_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_user_id;

        -- Activate the business as well
        UPDATE businesses
        SET is_active = TRUE,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_business_id;

        -- Return success
        RETURN QUERY SELECT v_user_id, v_business_id, TRUE, 'Email confirmed successfully'::TEXT;

    EXCEPTION
        WHEN OTHERS THEN
            -- Return error
            RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, SQLERRM::TEXT;
    END;
END;
$$;


--
-- Name: enforce_single_active_per_user_type(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_single_active_per_user_type() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN IF NEW.is_active = true THEN UPDATE password_complexity_requirements SET is_active = false WHERE id != NEW.id AND user_type = NEW.user_type AND is_active = true; END IF; RETURN NEW; END; $$;


--
-- Name: get_translations(character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_translations(p_language_code character varying, p_namespace character varying) RETURNS TABLE(key_path character varying, value text, default_value text)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: get_user_language_preference(uuid, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_language_preference(p_user_id uuid, p_context character varying DEFAULT 'general'::character varying) RETURNS character varying
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: insert_translation_batch(character varying, character varying, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_translation_batch(p_namespace character varying, p_language_code character varying, p_translations jsonb) RETURNS integer
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: register_client_business(character varying, character varying, character varying, character varying, character varying, character varying, character varying, character varying, character varying, character varying, character varying, character varying, character varying, character varying, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_client_business(p_business_name character varying, p_domain_email character varying, p_business_street character varying, p_business_city character varying, p_business_state character varying, p_business_zip_code character varying, p_business_country character varying, p_contact_name character varying, p_contact_email character varying, p_contact_phone character varying, p_job_title character varying, p_cognito_id character varying, p_password_hash character varying, p_confirmation_token character varying, p_confirmation_expires timestamp with time zone) RETURNS TABLE(business_id uuid, user_id uuid, success boolean, message text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_business_id UUID;
    v_user_id UUID;
    v_existing_business_id UUID;
    v_existing_user_id UUID;
    v_name_parts TEXT[];
    v_first_name VARCHAR(255);
    v_last_name VARCHAR(255);
BEGIN
    -- Check if business domain already exists
    SELECT id INTO v_existing_business_id
    FROM businesses
    WHERE domain_email = p_domain_email;

    -- Check if user email already exists
    SELECT id INTO v_existing_user_id
    FROM users
    WHERE email = p_contact_email;

    -- Return error if email already exists
    IF v_existing_user_id IS NOT NULL THEN
        RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'Email address already registered'::TEXT;
        RETURN;
    END IF;

    -- Split name into first and last parts
    v_name_parts := string_to_array(p_contact_name, ' ');
    v_first_name := v_name_parts[1];
    IF array_length(v_name_parts, 1) > 1 THEN
        v_last_name := array_to_string(v_name_parts[2:array_length(v_name_parts, 1)], ' ');
    ELSE
        v_last_name := '';
    END IF;

    BEGIN
        -- Create or get business record
        IF v_existing_business_id IS NULL THEN
            INSERT INTO businesses (
                business_name,
                domain_email,
                business_street,
                business_city,
                business_state,
                business_zip_code,
                business_country,
                is_active
            ) VALUES (
                p_business_name,
                p_domain_email,
                p_business_street,
                p_business_city,
                p_business_state,
                p_business_zip_code,
                p_business_country,
                FALSE -- Will be activated after email confirmation
            ) RETURNING id INTO v_business_id;
        ELSE
            v_business_id := v_existing_business_id;
        END IF;

        -- Create user record with correct column names
        INSERT INTO users (
            cognito_user_id,
            email,
            role,
            first_name,
            last_name,
            phone,
            business_id,
            is_primary_contact,
            email_verified,
            confirmation_token,
            confirmation_expires_at,
            is_active
        ) VALUES (
            p_cognito_id,
            p_contact_email,
            'client',
            v_first_name,
            v_last_name,
            p_contact_phone,
            v_business_id,
            TRUE, -- First contact is the primary contact
            FALSE, -- Will be confirmed via email
            p_confirmation_token,
            p_confirmation_expires,
            FALSE -- Will be activated after email confirmation
        ) RETURNING id INTO v_user_id;

        -- Return success
        RETURN QUERY SELECT v_business_id, v_user_id, TRUE, 'Business and user created successfully'::TEXT;

    EXCEPTION
        WHEN OTHERS THEN
            -- Return error
            RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, SQLERRM::TEXT;
    END;
END;
$$;


--
-- Name: set_user_language_preference(uuid, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_language_preference(p_user_id uuid, p_language_code character varying, p_context character varying DEFAULT 'general'::character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: update_businesses_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_businesses_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_location_contacts_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_location_contacts_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$;


--
-- Name: update_location_types_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_location_types_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_password_complexity_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_password_complexity_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_quota_usage(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_quota_usage() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    file_business_id UUID;
    file_location_id UUID;
    file_user_id UUID;
    file_size_change BIGINT;
    file_count_change INTEGER;
BEGIN
    -- Handle INSERT/UPDATE/DELETE operations
    IF TG_OP = 'INSERT' THEN
        file_business_id := NEW.business_id;
        file_location_id := NEW.service_location_id;
        file_user_id := NEW.uploaded_by_user_id;
        file_size_change := NEW.file_size_bytes;
        file_count_change := 1;
    ELSIF TG_OP = 'UPDATE' THEN
        file_business_id := NEW.business_id;
        file_location_id := NEW.service_location_id;
        file_user_id := NEW.uploaded_by_user_id;
        file_size_change := NEW.file_size_bytes - OLD.file_size_bytes;
        file_count_change := 0; -- File count doesn't change on update
    ELSIF TG_OP = 'DELETE' THEN
        file_business_id := OLD.business_id;
        file_location_id := OLD.service_location_id;
        file_user_id := OLD.uploaded_by_user_id;
        file_size_change := -OLD.file_size_bytes;
        file_count_change := -1;
    END IF;

    -- Update business quota usage
    UPDATE t_client_storage_quotas
    SET storage_used_bytes = storage_used_bytes + file_size_change,
        file_count = file_count + file_count_change,
        last_usage_update = CURRENT_TIMESTAMP
    WHERE business_id = file_business_id
    AND quota_type = 'business';

    -- Update site quota usage if applicable
    IF file_location_id IS NOT NULL THEN
        UPDATE t_client_storage_quotas
        SET storage_used_bytes = storage_used_bytes + file_size_change,
            file_count = file_count + file_count_change,
            last_usage_update = CURRENT_TIMESTAMP
        WHERE business_id = file_business_id
        AND service_location_id = file_location_id
        AND quota_type = 'site';
    END IF;

    -- Update user quota usage if applicable
    IF file_user_id IS NOT NULL AND file_location_id IS NOT NULL THEN
        UPDATE t_client_storage_quotas
        SET storage_used_bytes = storage_used_bytes + file_size_change,
            file_count = file_count + file_count_change,
            last_usage_update = CURRENT_TIMESTAMP
        WHERE business_id = file_business_id
        AND service_location_id = file_location_id
        AND user_id = file_user_id
        AND quota_type = 'user';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


--
-- Name: update_service_locations_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_service_locations_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$;


--
-- Name: update_users_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_users_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_login_mfa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_login_mfa (
    id integer NOT NULL,
    user_id character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    mfa_code character varying(10) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    user_type character varying(20) NOT NULL,
    CONSTRAINT admin_login_mfa_user_type_check CHECK (((user_type)::text = ANY ((ARRAY['employee'::character varying, 'client'::character varying])::text[])))
);


--
-- Name: admin_login_mfa_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_login_mfa_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_login_mfa_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_login_mfa_id_seq OWNED BY public.admin_login_mfa.id;


--
-- Name: business_authorized_domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_authorized_domains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    domain character varying(255) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: businesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.businesses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_name character varying(255) NOT NULL,
    logo_url text,
    is_active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    logo_filename character varying(255),
    soft_delete boolean DEFAULT false,
    logo_position_x integer DEFAULT 50,
    logo_position_y integer DEFAULT 50,
    logo_scale integer DEFAULT 100,
    logo_background_color character varying(7),
    primary_street character varying(255)
);


--
-- Name: common_passwords; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.common_passwords (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    password_hash text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description character varying(255),
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: email_verifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    verification_code character varying(6) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false,
    user_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: employee_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    address_type character varying(20) DEFAULT 'primary'::character varying NOT NULL,
    street character varying(255),
    street_2 character varying(255),
    city character varying(100),
    state character varying(50),
    zip_code character varying(20),
    country character varying(50) DEFAULT 'USA'::character varying,
    is_primary boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: employee_emergency_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_emergency_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    first_name character varying(100),
    last_name character varying(100),
    relationship character varying(100),
    phone character varying(20),
    email character varying(255),
    is_primary boolean DEFAULT true,
    priority_order integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: employee_employment_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_employment_statuses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status_name character varying(50) NOT NULL,
    display_name character varying(100) NOT NULL,
    description character varying(255),
    is_active_status boolean DEFAULT true,
    allows_login boolean DEFAULT true,
    allows_timesheet boolean DEFAULT true,
    allows_scheduling boolean DEFAULT true,
    requires_termination_date boolean DEFAULT false,
    workflow_order integer DEFAULT 0,
    badge_color character varying(20) DEFAULT 'blue'::character varying,
    is_system_status boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: employee_job_titles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_job_titles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(100) NOT NULL,
    description character varying(255),
    level integer DEFAULT 1,
    salary_min numeric(10,2),
    salary_max numeric(10,2),
    is_active boolean DEFAULT true,
    requires_degree boolean DEFAULT false,
    years_experience_min integer DEFAULT 0,
    years_experience_max integer,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: employee_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    photo_type character varying(30) DEFAULT 'profile'::character varying NOT NULL,
    file_url text,
    filename character varying(255),
    original_filename character varying(255),
    file_size integer,
    mime_type character varying(100),
    width integer,
    height integer,
    position_x numeric(5,2) DEFAULT 50.00,
    position_y numeric(5,2) DEFAULT 50.00,
    scale_factor numeric(5,2) DEFAULT 100.00,
    is_primary boolean DEFAULT true,
    is_active boolean DEFAULT true,
    upload_source character varying(50) DEFAULT 'admin_portal'::character varying,
    uploaded_by uuid,
    processing_status character varying(20) DEFAULT 'completed'::character varying,
    alt_text character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: employee_pronouns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_pronouns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pronoun_set character varying(50) NOT NULL,
    display_name character varying(100) NOT NULL,
    subject_pronoun character varying(20) NOT NULL,
    object_pronoun character varying(20) NOT NULL,
    possessive_adjective character varying(20) NOT NULL,
    possessive_pronoun character varying(20) NOT NULL,
    reflexive_pronoun character varying(20) NOT NULL,
    example_sentence character varying(255),
    is_common boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: employee_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    role_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: employee_working_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_working_statuses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status_name character varying(50) NOT NULL,
    display_name character varying(100) NOT NULL,
    description text,
    color_code character varying(20),
    is_available_for_work boolean DEFAULT false,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cognito_user_id character varying(255),
    email character varying(255) NOT NULL,
    email_verified boolean DEFAULT false,
    first_name character varying(100),
    last_name character varying(100),
    phone character varying(20),
    employee_id character varying(50),
    hire_date date,
    is_active boolean DEFAULT true,
    is_on_vacation boolean DEFAULT false,
    is_out_sick boolean DEFAULT false,
    salary numeric(10,2),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_login timestamp with time zone,
    profile_photo_url text,
    profile_photo_filename character varying(255),
    password_hash character varying(255),
    middle_initial character varying(10),
    preferred_name character varying(100),
    employee_number character varying(50),
    job_title character varying(100),
    employee_status character varying(50) DEFAULT 'active'::character varying,
    pronouns character varying(50),
    termination_date timestamp with time zone,
    is_on_other_leave boolean DEFAULT false,
    photo_position_x numeric(5,2) DEFAULT 50.00,
    photo_position_y numeric(5,2) DEFAULT 50.00,
    photo_scale numeric(5,2) DEFAULT 100.00,
    department_id uuid,
    job_title_id uuid,
    employee_status_id uuid,
    pronouns_id uuid,
    working_status_id uuid,
    soft_delete boolean DEFAULT false
);


--
-- Name: location_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_location_id uuid NOT NULL,
    user_id uuid NOT NULL,
    contact_role character varying(50) DEFAULT 'contact'::character varying,
    is_primary_contact boolean DEFAULT false,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: location_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.location_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type_code character varying(50) NOT NULL,
    display_name character varying(100) NOT NULL,
    category character varying(50) NOT NULL,
    description text,
    icon character varying(50),
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: mfa_verification_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mfa_verification_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code character varying(6) NOT NULL,
    code_type character varying(50) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    used_at timestamp with time zone,
    phone_number character varying(20)
);


--
-- Name: password_complexity_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_complexity_requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    min_length integer DEFAULT 8 NOT NULL,
    max_length integer,
    require_uppercase boolean DEFAULT true NOT NULL,
    require_lowercase boolean DEFAULT true NOT NULL,
    require_numbers boolean DEFAULT true NOT NULL,
    require_special_characters boolean DEFAULT true NOT NULL,
    special_character_set text DEFAULT '!@#$%^&*()_+-=[]{}|;:,.<>?'::text,
    prevent_common_passwords boolean DEFAULT true NOT NULL,
    prevent_user_info_in_password boolean DEFAULT true NOT NULL,
    password_history_count integer DEFAULT 5,
    expiration_days integer DEFAULT 90,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by uuid,
    updated_by uuid,
    enable_password_history boolean DEFAULT true NOT NULL,
    enable_password_expiration boolean DEFAULT true NOT NULL,
    user_type character varying(20) DEFAULT 'employee'::character varying,
    CONSTRAINT password_complexity_requirements_user_type_check CHECK (((user_type)::text = ANY ((ARRAY['employee'::character varying, 'client'::character varying])::text[]))),
    CONSTRAINT valid_expiration_days CHECK (((expiration_days IS NULL) OR ((expiration_days > 0) AND (expiration_days <= 3650)))),
    CONSTRAINT valid_history_count CHECK (((password_history_count >= 0) AND (password_history_count <= 50))),
    CONSTRAINT valid_max_length CHECK (((max_length IS NULL) OR ((max_length >= min_length) AND (max_length <= 256)))),
    CONSTRAINT valid_min_length CHECK (((min_length > 0) AND (min_length <= 256)))
);


--
-- Name: password_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    password_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id integer NOT NULL,
    user_id character varying(255) NOT NULL,
    user_type character varying(20) NOT NULL,
    email character varying(255) NOT NULL,
    reset_token character varying(255) NOT NULL,
    reset_code character varying(10) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.password_reset_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.password_reset_tokens_id_seq OWNED BY public.password_reset_tokens.id;


--
-- Name: priority_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.priority_levels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL,
    description text,
    escalation_hours integer,
    color_code character varying(7),
    display_order integer NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL,
    display_name character varying(100) NOT NULL,
    description text,
    text_color character varying(20) DEFAULT '#000000'::character varying NOT NULL,
    background_color character varying(20) DEFAULT '#f3f4f6'::character varying NOT NULL,
    border_color character varying(20) DEFAULT '#d1d5db'::character varying NOT NULL,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: service_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    address_label character varying(100) NOT NULL,
    street character varying(255) NOT NULL,
    city character varying(100) NOT NULL,
    state character varying(50) NOT NULL,
    zip_code character varying(20) NOT NULL,
    country character varying(50) DEFAULT 'USA'::character varying NOT NULL,
    contact_person character varying(255),
    contact_phone character varying(20),
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    location_name character varying(255),
    location_type character varying(50) DEFAULT 'branch'::character varying,
    soft_delete boolean DEFAULT false
);


--
-- Name: service_request_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_request_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_request_id uuid NOT NULL,
    technician_id uuid NOT NULL,
    assigned_by_user_id uuid NOT NULL,
    assignment_type character varying(50) DEFAULT 'primary'::character varying,
    assignment_reason text,
    is_active boolean DEFAULT true,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    unassigned_at timestamp without time zone,
    unassigned_by_user_id uuid,
    unassignment_reason text
);


--
-- Name: service_request_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_request_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_request_id uuid NOT NULL,
    comment_text text NOT NULL,
    comment_type character varying(50) DEFAULT 'general'::character varying,
    author_user_id uuid NOT NULL,
    is_internal boolean DEFAULT false,
    is_client_visible boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    soft_delete boolean DEFAULT false,
    deleted_at timestamp without time zone,
    deleted_by_user_id uuid
);


--
-- Name: service_request_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_request_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_request_id uuid NOT NULL,
    file_name character varying(255) NOT NULL,
    file_path character varying(500),
    attachment_type character varying(50),
    description text,
    attached_by_user_id uuid NOT NULL,
    is_client_visible boolean DEFAULT true,
    is_technician_visible boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: service_request_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_request_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_request_id uuid NOT NULL,
    action_type character varying(50) NOT NULL,
    old_value text,
    new_value text,
    changed_by_user_id uuid NOT NULL,
    change_reason text,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: service_request_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_request_statuses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL,
    description text,
    is_final_status boolean DEFAULT false,
    requires_technician boolean DEFAULT false,
    color_code character varying(7),
    display_order integer NOT NULL,
    is_active boolean DEFAULT true,
    client_visible boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: service_request_time_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_request_time_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_request_id uuid NOT NULL,
    technician_id uuid NOT NULL,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone,
    duration_minutes integer,
    work_description text NOT NULL,
    work_type character varying(50),
    is_billable boolean DEFAULT true,
    hourly_rate numeric(8,2),
    is_on_site boolean DEFAULT true,
    is_remote boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id uuid NOT NULL
);


--
-- Name: service_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_number character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    client_id uuid NOT NULL,
    business_id uuid NOT NULL,
    service_location_id uuid NOT NULL,
    assigned_technician_id uuid,
    created_by_user_id uuid NOT NULL,
    requested_date date NOT NULL,
    requested_time_start time without time zone,
    requested_time_end time without time zone,
    scheduled_date date,
    scheduled_time_start time without time zone,
    scheduled_time_end time without time zone,
    completed_date timestamp without time zone,
    urgency_level_id uuid NOT NULL,
    priority_level_id uuid NOT NULL,
    status_id uuid NOT NULL,
    primary_contact_name character varying(255),
    primary_contact_phone character varying(20),
    primary_contact_email character varying(255),
    alternate_contact_name character varying(255),
    alternate_contact_phone character varying(20),
    callback_number character varying(20),
    best_contact_times text,
    service_type_id uuid,
    estimated_duration_minutes integer,
    actual_duration_minutes integer,
    access_instructions text,
    special_requirements text,
    safety_considerations text,
    equipment_needed text,
    allow_after_hours boolean DEFAULT false,
    allow_weekends boolean DEFAULT false,
    requires_client_presence boolean DEFAULT false,
    resolution_summary text,
    technician_notes text,
    client_satisfaction_rating integer,
    client_feedback text,
    requires_follow_up boolean DEFAULT false,
    follow_up_date date,
    estimated_cost numeric(10,2),
    actual_cost numeric(10,2),
    billable_hours numeric(5,2),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_status_change timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    soft_delete boolean DEFAULT false,
    deleted_at timestamp without time zone,
    deleted_by_user_id uuid,
    CONSTRAINT service_requests_client_satisfaction_rating_check CHECK (((client_satisfaction_rating >= 1) AND (client_satisfaction_rating <= 5)))
);


--
-- Name: service_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    category character varying(50),
    estimated_duration_minutes integer,
    default_urgency_level_id uuid,
    default_priority_level_id uuid,
    requires_special_tools boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    base_price numeric(10,2) DEFAULT 0,
    estimated_hours numeric(5,2) DEFAULT 0,
    icon character varying(100),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id integer NOT NULL,
    setting_key character varying(255) NOT NULL,
    setting_value jsonb NOT NULL,
    setting_type character varying(100) DEFAULT 'general'::character varying NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: system_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_settings_id_seq OWNED BY public.system_settings.id;


--
-- Name: t_area_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_area_codes (
    id integer NOT NULL,
    area_code character(3) NOT NULL,
    county_id integer NOT NULL,
    is_overlay boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: t_area_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.t_area_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: t_area_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.t_area_codes_id_seq OWNED BY public.t_area_codes.id;


--
-- Name: t_cities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_cities (
    id integer NOT NULL,
    county_id integer NOT NULL,
    city_name character varying(100) NOT NULL,
    city_type character varying(20) DEFAULT 'City'::character varying,
    is_incorporated boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: t_cities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.t_cities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: t_cities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.t_cities_id_seq OWNED BY public.t_cities.id;


--
-- Name: t_client_file_access_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_client_file_access_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_file_id uuid NOT NULL,
    accessed_by_user_id uuid NOT NULL,
    access_type character varying(20) NOT NULL,
    access_granted boolean NOT NULL,
    denial_reason text,
    ip_address inet,
    user_agent text,
    session_id character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: t_client_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_client_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    original_filename character varying(255) NOT NULL,
    stored_filename character varying(255) NOT NULL,
    file_path character varying(500) NOT NULL,
    content_type character varying(100),
    file_size_bytes bigint NOT NULL,
    business_id uuid NOT NULL,
    service_location_id uuid,
    uploaded_by_user_id uuid NOT NULL,
    file_category_id uuid,
    file_description text,
    tags text[],
    virus_scan_status character varying(20) DEFAULT 'pending'::character varying,
    virus_scan_result text,
    virus_scan_date timestamp without time zone,
    quarantine_reason text,
    is_public_to_business boolean DEFAULT true,
    is_public_to_site boolean DEFAULT true,
    access_restricted_to_uploader boolean DEFAULT false,
    download_count integer DEFAULT 0,
    last_downloaded_at timestamp without time zone,
    last_downloaded_by_user_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    soft_delete boolean DEFAULT false,
    deleted_at timestamp without time zone,
    deleted_by_user_id uuid,
    deletion_reason text,
    service_request_id uuid,
    CONSTRAINT t_client_files_virus_scan_status_check CHECK (((virus_scan_status)::text = ANY ((ARRAY['pending'::character varying, 'scanning'::character varying, 'clean'::character varying, 'infected'::character varying, 'quarantined'::character varying, 'deleted'::character varying])::text[])))
);


--
-- Name: t_client_storage_quotas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_client_storage_quotas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_id uuid NOT NULL,
    service_location_id uuid,
    user_id uuid,
    quota_type character varying(20) NOT NULL,
    storage_limit_bytes bigint NOT NULL,
    storage_soft_limit_bytes bigint,
    storage_used_bytes bigint DEFAULT 0,
    warning_threshold_percentage integer DEFAULT 80,
    alert_threshold_percentage integer DEFAULT 95,
    file_count integer DEFAULT 0,
    last_usage_update timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_warning_sent timestamp without time zone,
    last_alert_sent timestamp without time zone,
    set_by_admin_id uuid NOT NULL,
    quota_notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT t_client_storage_quotas_check CHECK (((((quota_type)::text = 'business'::text) AND (service_location_id IS NULL) AND (user_id IS NULL)) OR (((quota_type)::text = 'site'::text) AND (service_location_id IS NOT NULL) AND (user_id IS NULL)) OR (((quota_type)::text = 'user'::text) AND (service_location_id IS NOT NULL) AND (user_id IS NOT NULL)))),
    CONSTRAINT t_client_storage_quotas_quota_type_check CHECK (((quota_type)::text = ANY ((ARRAY['business'::character varying, 'site'::character varying, 'user'::character varying])::text[])))
);


--
-- Name: t_counties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_counties (
    id integer NOT NULL,
    state_id integer NOT NULL,
    county_name character varying(100) NOT NULL,
    fips_code character(5),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: t_counties_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.t_counties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: t_counties_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.t_counties_id_seq OWNED BY public.t_counties.id;


--
-- Name: t_file_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_file_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL,
    description text,
    icon_name character varying(50),
    color_code character varying(7),
    allowed_file_types text[],
    max_file_size_bytes bigint,
    requires_virus_scan boolean DEFAULT true,
    display_order integer NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: t_file_virus_scan_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_file_virus_scan_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_file_id uuid NOT NULL,
    scan_engine character varying(50) NOT NULL,
    scan_version character varying(50),
    scan_started_at timestamp without time zone NOT NULL,
    scan_completed_at timestamp without time zone,
    scan_duration_ms integer,
    scan_status character varying(20) NOT NULL,
    threats_found integer DEFAULT 0,
    threat_names text[],
    scan_raw_output text,
    action_taken character varying(50),
    action_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: t_languages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_languages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(5) NOT NULL,
    name character varying(100) NOT NULL,
    native_name character varying(100) NOT NULL,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    direction character varying(3) DEFAULT 'ltr'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: t_session_language_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_session_language_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_token character varying(255) NOT NULL,
    language_code character varying(5) NOT NULL,
    context character varying(50) DEFAULT 'general'::character varying NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: t_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_states (
    id integer NOT NULL,
    state_code character(2) NOT NULL,
    state_name character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: t_states_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.t_states_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: t_states_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.t_states_id_seq OWNED BY public.t_states.id;


--
-- Name: t_translation_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_translation_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    namespace_id uuid NOT NULL,
    key_path character varying(500) NOT NULL,
    description text,
    default_value text,
    context text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: t_translation_namespaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_translation_namespaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    namespace character varying(100) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: t_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_translations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key_id uuid NOT NULL,
    language_id uuid NOT NULL,
    value text NOT NULL,
    is_approved boolean DEFAULT false,
    translated_by character varying(255),
    reviewed_by character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: t_user_language_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_user_language_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    language_id uuid NOT NULL,
    context character varying(50) DEFAULT 'general'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: t_we_serve; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_we_serve (
    id integer NOT NULL,
    location_type character varying(20) NOT NULL,
    location_id integer NOT NULL,
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT t_we_serve_location_type_check CHECK (((location_type)::text = ANY ((ARRAY['state'::character varying, 'county'::character varying, 'city'::character varying, 'zipcode'::character varying, 'area_code'::character varying])::text[])))
);


--
-- Name: t_we_serve_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.t_we_serve_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: t_we_serve_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.t_we_serve_id_seq OWNED BY public.t_we_serve.id;


--
-- Name: t_zipcodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.t_zipcodes (
    id integer NOT NULL,
    zipcode character(5) NOT NULL,
    city_id integer NOT NULL,
    zipcode_type character varying(20) DEFAULT 'Standard'::character varying,
    primary_city boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: t_zipcodes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.t_zipcodes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: t_zipcodes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.t_zipcodes_id_seq OWNED BY public.t_zipcodes.id;


--
-- Name: trusted_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trusted_devices (
    id integer NOT NULL,
    user_id character varying(255) NOT NULL,
    user_type character varying(20) NOT NULL,
    device_fingerprint text NOT NULL,
    device_name character varying(255) NOT NULL,
    device_info jsonb DEFAULT '{}'::jsonb,
    is_shared_device boolean DEFAULT false,
    last_used timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone NOT NULL,
    revoked boolean DEFAULT false,
    revoked_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT trusted_devices_user_type_check CHECK (((user_type)::text = ANY ((ARRAY['employee'::character varying, 'client'::character varying])::text[])))
);


--
-- Name: trusted_devices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.trusted_devices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: trusted_devices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.trusted_devices_id_seq OWNED BY public.trusted_devices.id;


--
-- Name: urgency_levels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.urgency_levels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL,
    description text,
    minimum_lead_time_hours integer NOT NULL,
    max_response_time_hours integer,
    color_code character varying(7),
    display_order integer NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(255) NOT NULL,
    user_email character varying(255) NOT NULL,
    session_token character varying(512) NOT NULL,
    user_agent text,
    ip_address character varying(45),
    login_time timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_activity timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone DEFAULT (CURRENT_TIMESTAMP + '24:00:00'::interval),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cognito_user_id character varying(255),
    email character varying(255) NOT NULL,
    email_verified boolean DEFAULT false,
    role character varying(50) DEFAULT 'client'::character varying NOT NULL,
    first_name character varying(255),
    last_name character varying(255),
    phone character varying(20),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_login timestamp with time zone,
    is_active boolean DEFAULT true,
    business_id uuid,
    is_primary_contact boolean DEFAULT false,
    confirmation_token character varying(255),
    confirmation_expires_at timestamp with time zone,
    profile_photo_url text,
    profile_photo_filename character varying(255),
    password_hash character varying(255),
    photo_position_x numeric(5,2) DEFAULT 50.00,
    photo_position_y numeric(5,2) DEFAULT 50.00,
    photo_scale numeric(5,2) DEFAULT 100.00,
    soft_delete boolean DEFAULT false,
    password_changed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    password_expires_at timestamp with time zone,
    force_password_change boolean DEFAULT false,
    photo_background_color character varying(7),
    mfa_enabled boolean DEFAULT false,
    mfa_email character varying(255),
    mfa_backup_codes text,
    mfa_enabled_at timestamp with time zone,
    language_preference character varying(10) DEFAULT 'en'::character varying,
    phone_number character varying(20),
    phone_verified boolean DEFAULT false,
    mfa_method character varying(10) DEFAULT 'email'::character varying,
    title character varying(100),
    cell_phone character varying(20),
    email_verification_token character varying(255),
    email_verification_expires_at timestamp with time zone,
    CONSTRAINT users_role_check CHECK (((role)::text = 'client'::text))
);


--
-- Name: v_business_locations_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_business_locations_summary AS
 SELECT b.id AS business_id,
    b.business_name,
    count(sl.id) AS total_locations,
        CASE
            WHEN (b.primary_street IS NOT NULL) THEN 1
            ELSE 0
        END AS headquarters_count,
    count(
        CASE
            WHEN ((sl.location_type)::text = 'branch'::text) THEN 1
            ELSE NULL::integer
        END) AS branch_count,
    count(
        CASE
            WHEN ((sl.location_type)::text = 'warehouse'::text) THEN 1
            ELSE NULL::integer
        END) AS warehouse_count,
    count(
        CASE
            WHEN ((sl.location_type)::text = 'remote'::text) THEN 1
            ELSE NULL::integer
        END) AS remote_count
   FROM (public.businesses b
     LEFT JOIN public.service_locations sl ON (((b.id = sl.business_id) AND (sl.is_active = true) AND (sl.soft_delete = false))))
  WHERE (b.is_active = true)
  GROUP BY b.id, b.business_name, b.primary_street
  ORDER BY b.business_name;


--
-- Name: v_client_files; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_client_files AS
 SELECT cf.id,
    cf.original_filename,
    cf.stored_filename,
    cf.file_path,
    cf.content_type,
    cf.file_size_bytes,
    cf.business_id,
    cf.service_location_id,
    cf.uploaded_by_user_id,
    cf.file_category_id,
    cf.file_description,
    cf.tags,
    cf.virus_scan_status,
    cf.virus_scan_result,
    cf.virus_scan_date,
    cf.quarantine_reason,
    cf.is_public_to_business,
    cf.is_public_to_site,
    cf.access_restricted_to_uploader,
    cf.download_count,
    cf.last_downloaded_at,
    cf.last_downloaded_by_user_id,
    cf.created_at,
    cf.updated_at,
    cf.soft_delete,
    cf.deleted_at,
    cf.deleted_by_user_id,
    cf.deletion_reason,
    fc.name AS category_name,
    fc.icon_name AS category_icon,
    fc.color_code AS category_color,
    b.business_name,
    sl.address_label AS location_name,
    concat(uploader.first_name, ' ', uploader.last_name) AS uploader_name,
    concat(downloader.first_name, ' ', downloader.last_name) AS last_downloader_name
   FROM (((((public.t_client_files cf
     LEFT JOIN public.t_file_categories fc ON ((cf.file_category_id = fc.id)))
     LEFT JOIN public.businesses b ON ((cf.business_id = b.id)))
     LEFT JOIN public.service_locations sl ON ((cf.service_location_id = sl.id)))
     LEFT JOIN public.users uploader ON ((cf.uploaded_by_user_id = uploader.id)))
     LEFT JOIN public.users downloader ON ((cf.last_downloaded_by_user_id = downloader.id)))
  WHERE (cf.soft_delete = false);


--
-- Name: v_client_service_requests; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_client_service_requests AS
 SELECT sr.id,
    sr.request_number,
    sr.title,
    sr.description,
    sr.client_id,
    sr.business_id,
    sr.service_location_id,
    sr.assigned_technician_id,
    sr.created_by_user_id,
    sr.requested_date,
    sr.requested_time_start,
    sr.requested_time_end,
    sr.scheduled_date,
    sr.scheduled_time_start,
    sr.scheduled_time_end,
    sr.completed_date,
    sr.urgency_level_id,
    sr.priority_level_id,
    sr.status_id,
    sr.primary_contact_name,
    sr.primary_contact_phone,
    sr.primary_contact_email,
    sr.alternate_contact_name,
    sr.alternate_contact_phone,
    sr.callback_number,
    sr.best_contact_times,
    sr.service_type_id,
    sr.estimated_duration_minutes,
    sr.actual_duration_minutes,
    sr.access_instructions,
    sr.special_requirements,
    sr.safety_considerations,
    sr.equipment_needed,
    sr.allow_after_hours,
    sr.allow_weekends,
    sr.requires_client_presence,
    sr.resolution_summary,
    sr.technician_notes,
    sr.client_satisfaction_rating,
    sr.client_feedback,
    sr.requires_follow_up,
    sr.follow_up_date,
    sr.estimated_cost,
    sr.actual_cost,
    sr.billable_hours,
    sr.created_at,
    sr.updated_at,
    sr.last_status_change,
    sr.soft_delete,
    sr.deleted_at,
    sr.deleted_by_user_id,
    ul.name AS urgency_level_name,
    ul.color_code AS urgency_color,
    pl.name AS priority_level_name,
    pl.color_code AS priority_color,
    srs.name AS status_name,
    srs.color_code AS status_color,
    st.name AS service_type_name,
    st.category AS service_category,
    sl.address_label AS location_name,
    sl.street AS location_street,
    sl.city AS location_city,
    sl.state AS location_state,
    b.business_name,
    concat(e.first_name, ' ', e.last_name) AS technician_name
   FROM (((((((public.service_requests sr
     LEFT JOIN public.urgency_levels ul ON ((sr.urgency_level_id = ul.id)))
     LEFT JOIN public.priority_levels pl ON ((sr.priority_level_id = pl.id)))
     LEFT JOIN public.service_request_statuses srs ON ((sr.status_id = srs.id)))
     LEFT JOIN public.service_types st ON ((sr.service_type_id = st.id)))
     LEFT JOIN public.service_locations sl ON ((sr.service_location_id = sl.id)))
     LEFT JOIN public.businesses b ON ((sr.business_id = b.id)))
     LEFT JOIN public.employees e ON ((sr.assigned_technician_id = e.id)))
  WHERE (sr.soft_delete = false);


--
-- Name: v_client_users_with_business; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_client_users_with_business AS
 SELECT u.id AS user_id,
    u.cognito_user_id,
    u.email,
    u.email_verified,
    u.first_name,
    u.last_name,
    u.phone,
    u.is_primary_contact,
    u.created_at AS user_created_at,
    u.updated_at AS user_updated_at,
    u.last_login,
    u.is_active,
    b.id AS business_id,
    b.business_name,
    b.logo_url,
    b.created_at AS business_created_at,
    b.updated_at AS business_updated_at
   FROM (public.users u
     LEFT JOIN public.businesses b ON ((u.business_id = b.id)))
  WHERE ((u.role)::text = 'client'::text);


--
-- Name: v_file_storage_by_business; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_file_storage_by_business AS
 SELECT cf.business_id,
    b.business_name,
    count(*) AS total_files,
    sum(cf.file_size_bytes) AS total_storage_used,
    count(
        CASE
            WHEN ((cf.virus_scan_status)::text = 'clean'::text) THEN 1
            ELSE NULL::integer
        END) AS clean_files,
    count(
        CASE
            WHEN ((cf.virus_scan_status)::text = 'infected'::text) THEN 1
            ELSE NULL::integer
        END) AS infected_files,
    count(
        CASE
            WHEN ((cf.virus_scan_status)::text = 'pending'::text) THEN 1
            ELSE NULL::integer
        END) AS pending_scan_files
   FROM (public.t_client_files cf
     LEFT JOIN public.businesses b ON ((cf.business_id = b.id)))
  WHERE (cf.soft_delete = false)
  GROUP BY cf.business_id, b.business_name
  ORDER BY (sum(cf.file_size_bytes)) DESC;


--
-- Name: v_location_contacts_detail; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_location_contacts_detail AS
 SELECT sl.id AS location_id,
    sl.location_name,
    sl.location_type,
    false AS is_headquarters,
    b.business_name,
    u.id AS user_id,
    u.email,
    u.first_name,
    u.last_name,
    u.role AS user_role,
    lc.contact_role,
    lc.is_primary_contact,
    lc.notes AS contact_notes
   FROM (((public.service_locations sl
     JOIN public.businesses b ON ((sl.business_id = b.id)))
     LEFT JOIN public.location_contacts lc ON ((sl.id = lc.service_location_id)))
     LEFT JOIN public.users u ON ((lc.user_id = u.id)))
  WHERE ((sl.is_active = true) AND (sl.soft_delete = false) AND (b.is_active = true))
  ORDER BY b.business_name, sl.location_name, lc.is_primary_contact DESC;


--
-- Name: v_location_types; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_location_types AS
 SELECT id,
    type_code,
    display_name,
    category,
    description,
    icon,
    is_active,
    sort_order,
    created_at,
    updated_at
   FROM public.location_types
  WHERE (is_active = true)
  ORDER BY sort_order, display_name;


--
-- Name: v_quota_usage_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_quota_usage_summary AS
 SELECT q.id,
    q.business_id,
    q.service_location_id,
    q.user_id,
    q.quota_type,
    q.storage_limit_bytes,
    q.storage_soft_limit_bytes,
    q.storage_used_bytes,
    q.file_count,
    q.warning_threshold_percentage,
    q.alert_threshold_percentage,
    round((((q.storage_used_bytes)::numeric / (COALESCE(q.storage_soft_limit_bytes, q.storage_limit_bytes))::numeric) * (100)::numeric), 2) AS usage_percentage,
    (q.storage_limit_bytes - q.storage_used_bytes) AS available_bytes,
    (COALESCE(q.storage_soft_limit_bytes, q.storage_limit_bytes) - q.storage_used_bytes) AS available_soft_bytes,
    b.business_name,
    sl.address_label AS location_name,
    concat(u.first_name, ' ', u.last_name) AS user_name,
    concat(admin.first_name, ' ', admin.last_name) AS set_by_admin_name
   FROM ((((public.t_client_storage_quotas q
     LEFT JOIN public.businesses b ON ((q.business_id = b.id)))
     LEFT JOIN public.service_locations sl ON ((q.service_location_id = sl.id)))
     LEFT JOIN public.users u ON ((q.user_id = u.id)))
     LEFT JOIN public.users admin ON ((q.set_by_admin_id = admin.id)))
  WHERE (q.business_id IS NOT NULL)
  ORDER BY q.business_id, q.quota_type, q.service_location_id, q.user_id;


--
-- Name: v_we_serve_locations; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_we_serve_locations AS
 WITH served_locations AS (
         SELECT ws.id,
            ws.location_type,
            ws.location_id,
            ws.is_active,
            ws.notes,
            ws.created_at,
            ws.updated_at,
                CASE ws.location_type
                    WHEN 'state'::text THEN s.state_name
                    WHEN 'county'::text THEN co.county_name
                    WHEN 'city'::text THEN ci.city_name
                    WHEN 'zipcode'::text THEN (z.zipcode)::character varying
                    WHEN 'area_code'::text THEN (ac.area_code)::character varying
                    ELSE NULL::character varying
                END AS location_name,
                CASE ws.location_type
                    WHEN 'state'::text THEN s.state_code
                    WHEN 'county'::text THEN st.state_code
                    WHEN 'city'::text THEN st2.state_code
                    WHEN 'zipcode'::text THEN st3.state_code
                    WHEN 'area_code'::text THEN st4.state_code
                    ELSE NULL::bpchar
                END AS state_code
           FROM (((((((((((((public.t_we_serve ws
             LEFT JOIN public.t_states s ON ((((ws.location_type)::text = 'state'::text) AND (ws.location_id = s.id))))
             LEFT JOIN public.t_counties co ON ((((ws.location_type)::text = 'county'::text) AND (ws.location_id = co.id))))
             LEFT JOIN public.t_states st ON ((((ws.location_type)::text = 'county'::text) AND (co.state_id = st.id))))
             LEFT JOIN public.t_cities ci ON ((((ws.location_type)::text = 'city'::text) AND (ws.location_id = ci.id))))
             LEFT JOIN public.t_counties co2 ON ((((ws.location_type)::text = 'city'::text) AND (ci.county_id = co2.id))))
             LEFT JOIN public.t_states st2 ON ((co2.state_id = st2.id)))
             LEFT JOIN public.t_zipcodes z ON ((((ws.location_type)::text = 'zipcode'::text) AND (ws.location_id = z.id))))
             LEFT JOIN public.t_cities ci2 ON ((z.city_id = ci2.id)))
             LEFT JOIN public.t_counties co3 ON ((ci2.county_id = co3.id)))
             LEFT JOIN public.t_states st3 ON ((co3.state_id = st3.id)))
             LEFT JOIN public.t_area_codes ac ON ((((ws.location_type)::text = 'area_code'::text) AND (ws.location_id = ac.id))))
             LEFT JOIN public.t_counties co4 ON ((ac.county_id = co4.id)))
             LEFT JOIN public.t_states st4 ON ((co4.state_id = st4.id)))
        )
 SELECT id,
    location_type,
    location_id,
    is_active,
    notes,
    created_at,
    updated_at,
    location_name,
    state_code
   FROM served_locations
  ORDER BY state_code,
        CASE location_type
            WHEN 'state'::text THEN 1
            WHEN 'county'::text THEN 2
            WHEN 'city'::text THEN 3
            WHEN 'zipcode'::text THEN 4
            WHEN 'area_code'::text THEN 5
            ELSE NULL::integer
        END, location_name;


--
-- Name: admin_login_mfa id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_login_mfa ALTER COLUMN id SET DEFAULT nextval('public.admin_login_mfa_id_seq'::regclass);


--
-- Name: password_reset_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens ALTER COLUMN id SET DEFAULT nextval('public.password_reset_tokens_id_seq'::regclass);


--
-- Name: system_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings ALTER COLUMN id SET DEFAULT nextval('public.system_settings_id_seq'::regclass);


--
-- Name: t_area_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_area_codes ALTER COLUMN id SET DEFAULT nextval('public.t_area_codes_id_seq'::regclass);


--
-- Name: t_cities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_cities ALTER COLUMN id SET DEFAULT nextval('public.t_cities_id_seq'::regclass);


--
-- Name: t_counties id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_counties ALTER COLUMN id SET DEFAULT nextval('public.t_counties_id_seq'::regclass);


--
-- Name: t_states id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_states ALTER COLUMN id SET DEFAULT nextval('public.t_states_id_seq'::regclass);


--
-- Name: t_we_serve id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_we_serve ALTER COLUMN id SET DEFAULT nextval('public.t_we_serve_id_seq'::regclass);


--
-- Name: t_zipcodes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_zipcodes ALTER COLUMN id SET DEFAULT nextval('public.t_zipcodes_id_seq'::regclass);


--
-- Name: trusted_devices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trusted_devices ALTER COLUMN id SET DEFAULT nextval('public.trusted_devices_id_seq'::regclass);


--
-- Name: admin_login_mfa admin_login_mfa_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_login_mfa
    ADD CONSTRAINT admin_login_mfa_email_key UNIQUE (email);


--
-- Name: admin_login_mfa admin_login_mfa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_login_mfa
    ADD CONSTRAINT admin_login_mfa_pkey PRIMARY KEY (id);


--
-- Name: business_authorized_domains business_authorized_domains_business_id_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_authorized_domains
    ADD CONSTRAINT business_authorized_domains_business_id_domain_key UNIQUE (business_id, domain);


--
-- Name: business_authorized_domains business_authorized_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_authorized_domains
    ADD CONSTRAINT business_authorized_domains_pkey PRIMARY KEY (id);


--
-- Name: businesses businesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_pkey PRIMARY KEY (id);


--
-- Name: common_passwords common_passwords_password_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.common_passwords
    ADD CONSTRAINT common_passwords_password_hash_key UNIQUE (password_hash);


--
-- Name: common_passwords common_passwords_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.common_passwords
    ADD CONSTRAINT common_passwords_pkey PRIMARY KEY (id);


--
-- Name: departments departments_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_name_key UNIQUE (name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: email_verifications email_verifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verifications
    ADD CONSTRAINT email_verifications_pkey PRIMARY KEY (id);


--
-- Name: employee_addresses employee_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_addresses
    ADD CONSTRAINT employee_addresses_pkey PRIMARY KEY (id);


--
-- Name: employee_emergency_contacts employee_emergency_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_emergency_contacts
    ADD CONSTRAINT employee_emergency_contacts_pkey PRIMARY KEY (id);


--
-- Name: employee_job_titles employee_job_titles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_job_titles
    ADD CONSTRAINT employee_job_titles_pkey PRIMARY KEY (id);


--
-- Name: employee_job_titles employee_job_titles_title_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_job_titles
    ADD CONSTRAINT employee_job_titles_title_key UNIQUE (title);


--
-- Name: employee_photos employee_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_photos
    ADD CONSTRAINT employee_photos_pkey PRIMARY KEY (id);


--
-- Name: employee_pronouns employee_pronouns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_pronouns
    ADD CONSTRAINT employee_pronouns_pkey PRIMARY KEY (id);


--
-- Name: employee_pronouns employee_pronouns_pronoun_set_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_pronouns
    ADD CONSTRAINT employee_pronouns_pronoun_set_key UNIQUE (pronoun_set);


--
-- Name: employee_roles employee_roles_employee_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_roles
    ADD CONSTRAINT employee_roles_employee_id_role_id_key UNIQUE (employee_id, role_id);


--
-- Name: employee_roles employee_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_roles
    ADD CONSTRAINT employee_roles_pkey PRIMARY KEY (id);


--
-- Name: employee_employment_statuses employee_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_employment_statuses
    ADD CONSTRAINT employee_statuses_pkey PRIMARY KEY (id);


--
-- Name: employee_employment_statuses employee_statuses_status_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_employment_statuses
    ADD CONSTRAINT employee_statuses_status_name_key UNIQUE (status_name);


--
-- Name: employee_working_statuses employee_working_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_working_statuses
    ADD CONSTRAINT employee_working_statuses_pkey PRIMARY KEY (id);


--
-- Name: employee_working_statuses employee_working_statuses_status_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_working_statuses
    ADD CONSTRAINT employee_working_statuses_status_name_key UNIQUE (status_name);


--
-- Name: employees employees_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_email_key UNIQUE (email);


--
-- Name: employees employees_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_employee_id_key UNIQUE (employee_id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: location_contacts location_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_contacts
    ADD CONSTRAINT location_contacts_pkey PRIMARY KEY (id);


--
-- Name: location_contacts location_contacts_service_location_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_contacts
    ADD CONSTRAINT location_contacts_service_location_id_user_id_key UNIQUE (service_location_id, user_id);


--
-- Name: location_types location_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_types
    ADD CONSTRAINT location_types_pkey PRIMARY KEY (id);


--
-- Name: location_types location_types_type_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_types
    ADD CONSTRAINT location_types_type_code_key UNIQUE (type_code);


--
-- Name: mfa_verification_codes mfa_verification_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_verification_codes
    ADD CONSTRAINT mfa_verification_codes_pkey PRIMARY KEY (id);


--
-- Name: password_complexity_requirements password_complexity_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_complexity_requirements
    ADD CONSTRAINT password_complexity_requirements_pkey PRIMARY KEY (id);


--
-- Name: password_history password_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_history
    ADD CONSTRAINT password_history_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_email_key UNIQUE (email);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: priority_levels priority_levels_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.priority_levels
    ADD CONSTRAINT priority_levels_name_key UNIQUE (name);


--
-- Name: priority_levels priority_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.priority_levels
    ADD CONSTRAINT priority_levels_pkey PRIMARY KEY (id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: service_locations service_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_locations
    ADD CONSTRAINT service_addresses_pkey PRIMARY KEY (id);


--
-- Name: service_request_assignments service_request_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_assignments
    ADD CONSTRAINT service_request_assignments_pkey PRIMARY KEY (id);


--
-- Name: service_request_comments service_request_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_comments
    ADD CONSTRAINT service_request_comments_pkey PRIMARY KEY (id);


--
-- Name: service_request_files service_request_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_files
    ADD CONSTRAINT service_request_files_pkey PRIMARY KEY (id);


--
-- Name: service_request_history service_request_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_history
    ADD CONSTRAINT service_request_history_pkey PRIMARY KEY (id);


--
-- Name: service_request_statuses service_request_statuses_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_statuses
    ADD CONSTRAINT service_request_statuses_name_key UNIQUE (name);


--
-- Name: service_request_statuses service_request_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_statuses
    ADD CONSTRAINT service_request_statuses_pkey PRIMARY KEY (id);


--
-- Name: service_request_time_entries service_request_time_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_time_entries
    ADD CONSTRAINT service_request_time_entries_pkey PRIMARY KEY (id);


--
-- Name: service_requests service_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_pkey PRIMARY KEY (id);


--
-- Name: service_requests service_requests_request_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_request_number_key UNIQUE (request_number);


--
-- Name: service_types service_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_types
    ADD CONSTRAINT service_types_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_setting_key_key UNIQUE (setting_key);


--
-- Name: t_area_codes t_area_codes_area_code_county_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_area_codes
    ADD CONSTRAINT t_area_codes_area_code_county_id_key UNIQUE (area_code, county_id);


--
-- Name: t_area_codes t_area_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_area_codes
    ADD CONSTRAINT t_area_codes_pkey PRIMARY KEY (id);


--
-- Name: t_cities t_cities_county_id_city_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_cities
    ADD CONSTRAINT t_cities_county_id_city_name_key UNIQUE (county_id, city_name);


--
-- Name: t_cities t_cities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_cities
    ADD CONSTRAINT t_cities_pkey PRIMARY KEY (id);


--
-- Name: t_client_file_access_log t_client_file_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_file_access_log
    ADD CONSTRAINT t_client_file_access_log_pkey PRIMARY KEY (id);


--
-- Name: t_client_files t_client_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_files
    ADD CONSTRAINT t_client_files_pkey PRIMARY KEY (id);


--
-- Name: t_client_files t_client_files_stored_filename_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_files
    ADD CONSTRAINT t_client_files_stored_filename_key UNIQUE (stored_filename);


--
-- Name: t_client_storage_quotas t_client_storage_quotas_business_id_service_location_id_use_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_storage_quotas
    ADD CONSTRAINT t_client_storage_quotas_business_id_service_location_id_use_key UNIQUE (business_id, service_location_id, user_id);


--
-- Name: t_client_storage_quotas t_client_storage_quotas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_storage_quotas
    ADD CONSTRAINT t_client_storage_quotas_pkey PRIMARY KEY (id);


--
-- Name: t_counties t_counties_fips_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_counties
    ADD CONSTRAINT t_counties_fips_code_key UNIQUE (fips_code);


--
-- Name: t_counties t_counties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_counties
    ADD CONSTRAINT t_counties_pkey PRIMARY KEY (id);


--
-- Name: t_counties t_counties_state_id_county_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_counties
    ADD CONSTRAINT t_counties_state_id_county_name_key UNIQUE (state_id, county_name);


--
-- Name: t_file_categories t_file_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_file_categories
    ADD CONSTRAINT t_file_categories_name_key UNIQUE (name);


--
-- Name: t_file_categories t_file_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_file_categories
    ADD CONSTRAINT t_file_categories_pkey PRIMARY KEY (id);


--
-- Name: t_file_virus_scan_log t_file_virus_scan_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_file_virus_scan_log
    ADD CONSTRAINT t_file_virus_scan_log_pkey PRIMARY KEY (id);


--
-- Name: t_languages t_languages_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_languages
    ADD CONSTRAINT t_languages_code_key UNIQUE (code);


--
-- Name: t_languages t_languages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_languages
    ADD CONSTRAINT t_languages_pkey PRIMARY KEY (id);


--
-- Name: t_session_language_preferences t_session_language_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_session_language_preferences
    ADD CONSTRAINT t_session_language_preferences_pkey PRIMARY KEY (id);


--
-- Name: t_session_language_preferences t_session_language_preferences_session_token_context_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_session_language_preferences
    ADD CONSTRAINT t_session_language_preferences_session_token_context_key UNIQUE (session_token, context);


--
-- Name: t_states t_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_states
    ADD CONSTRAINT t_states_pkey PRIMARY KEY (id);


--
-- Name: t_states t_states_state_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_states
    ADD CONSTRAINT t_states_state_code_key UNIQUE (state_code);


--
-- Name: t_states t_states_state_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_states
    ADD CONSTRAINT t_states_state_name_key UNIQUE (state_name);


--
-- Name: t_translation_keys t_translation_keys_namespace_id_key_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_translation_keys
    ADD CONSTRAINT t_translation_keys_namespace_id_key_path_key UNIQUE (namespace_id, key_path);


--
-- Name: t_translation_keys t_translation_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_translation_keys
    ADD CONSTRAINT t_translation_keys_pkey PRIMARY KEY (id);


--
-- Name: t_translation_namespaces t_translation_namespaces_namespace_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_translation_namespaces
    ADD CONSTRAINT t_translation_namespaces_namespace_key UNIQUE (namespace);


--
-- Name: t_translation_namespaces t_translation_namespaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_translation_namespaces
    ADD CONSTRAINT t_translation_namespaces_pkey PRIMARY KEY (id);


--
-- Name: t_translations t_translations_key_id_language_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_translations
    ADD CONSTRAINT t_translations_key_id_language_id_key UNIQUE (key_id, language_id);


--
-- Name: t_translations t_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_translations
    ADD CONSTRAINT t_translations_pkey PRIMARY KEY (id);


--
-- Name: t_user_language_preferences t_user_language_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_user_language_preferences
    ADD CONSTRAINT t_user_language_preferences_pkey PRIMARY KEY (id);


--
-- Name: t_user_language_preferences t_user_language_preferences_user_id_context_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_user_language_preferences
    ADD CONSTRAINT t_user_language_preferences_user_id_context_key UNIQUE (user_id, context);


--
-- Name: t_we_serve t_we_serve_location_type_location_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_we_serve
    ADD CONSTRAINT t_we_serve_location_type_location_id_key UNIQUE (location_type, location_id);


--
-- Name: t_we_serve t_we_serve_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_we_serve
    ADD CONSTRAINT t_we_serve_pkey PRIMARY KEY (id);


--
-- Name: t_zipcodes t_zipcodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_zipcodes
    ADD CONSTRAINT t_zipcodes_pkey PRIMARY KEY (id);


--
-- Name: t_zipcodes t_zipcodes_zipcode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_zipcodes
    ADD CONSTRAINT t_zipcodes_zipcode_key UNIQUE (zipcode);


--
-- Name: trusted_devices trusted_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trusted_devices
    ADD CONSTRAINT trusted_devices_pkey PRIMARY KEY (id);


--
-- Name: trusted_devices trusted_devices_user_id_user_type_device_fingerprint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trusted_devices
    ADD CONSTRAINT trusted_devices_user_id_user_type_device_fingerprint_key UNIQUE (user_id, user_type, device_fingerprint);


--
-- Name: urgency_levels urgency_levels_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.urgency_levels
    ADD CONSTRAINT urgency_levels_name_key UNIQUE (name);


--
-- Name: urgency_levels urgency_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.urgency_levels
    ADD CONSTRAINT urgency_levels_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_session_token_key UNIQUE (session_token);


--
-- Name: users users_cognito_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_cognito_user_id_key UNIQUE (cognito_user_id);


--
-- Name: users users_confirmation_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_confirmation_token_key UNIQUE (confirmation_token);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_admin_login_mfa_email_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_login_mfa_email_code ON public.admin_login_mfa USING btree (email, mfa_code);


--
-- Name: idx_area_codes_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_area_codes_code ON public.t_area_codes USING btree (area_code);


--
-- Name: idx_area_codes_county_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_area_codes_county_id ON public.t_area_codes USING btree (county_id);


--
-- Name: idx_business_authorized_domains_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_authorized_domains_active ON public.business_authorized_domains USING btree (is_active);


--
-- Name: idx_business_authorized_domains_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_authorized_domains_business_id ON public.business_authorized_domains USING btree (business_id);


--
-- Name: idx_business_authorized_domains_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_authorized_domains_domain ON public.business_authorized_domains USING btree (domain);


--
-- Name: idx_businesses_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_active ON public.businesses USING btree (is_active);


--
-- Name: idx_businesses_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_name ON public.businesses USING btree (business_name);


--
-- Name: idx_cities_county_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cities_county_id ON public.t_cities USING btree (county_id);


--
-- Name: idx_client_files_service_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_files_service_request_id ON public.t_client_files USING btree (service_request_id);


--
-- Name: idx_common_passwords_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_common_passwords_active ON public.common_passwords USING btree (is_active);


--
-- Name: idx_common_passwords_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_common_passwords_hash ON public.common_passwords USING btree (password_hash);


--
-- Name: idx_counties_state_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_counties_state_id ON public.t_counties USING btree (state_id);


--
-- Name: idx_departments_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_departments_active ON public.departments USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_departments_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_departments_name ON public.departments USING btree (name);


--
-- Name: idx_departments_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_departments_sort_order ON public.departments USING btree (sort_order);


--
-- Name: idx_email_verifications_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verifications_code ON public.email_verifications USING btree (verification_code);


--
-- Name: idx_email_verifications_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_email_verifications_email ON public.email_verifications USING btree (email);


--
-- Name: idx_email_verifications_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verifications_expires_at ON public.email_verifications USING btree (expires_at);


--
-- Name: idx_employee_addresses_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_addresses_employee_id ON public.employee_addresses USING btree (employee_id);


--
-- Name: idx_employee_addresses_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_addresses_primary ON public.employee_addresses USING btree (is_primary) WHERE (is_primary = true);


--
-- Name: idx_employee_addresses_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_addresses_type ON public.employee_addresses USING btree (address_type);


--
-- Name: idx_employee_emergency_contacts_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_emergency_contacts_employee_id ON public.employee_emergency_contacts USING btree (employee_id);


--
-- Name: idx_employee_emergency_contacts_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_emergency_contacts_primary ON public.employee_emergency_contacts USING btree (is_primary) WHERE (is_primary = true);


--
-- Name: idx_employee_emergency_contacts_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_emergency_contacts_priority ON public.employee_emergency_contacts USING btree (priority_order);


--
-- Name: idx_employee_job_titles_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_job_titles_active ON public.employee_job_titles USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_employee_job_titles_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_job_titles_level ON public.employee_job_titles USING btree (level);


--
-- Name: idx_employee_job_titles_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_job_titles_sort_order ON public.employee_job_titles USING btree (sort_order);


--
-- Name: idx_employee_job_titles_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_job_titles_title ON public.employee_job_titles USING btree (title);


--
-- Name: idx_employee_photos_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_photos_active ON public.employee_photos USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_employee_photos_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_photos_employee_id ON public.employee_photos USING btree (employee_id);


--
-- Name: idx_employee_photos_filename; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_photos_filename ON public.employee_photos USING btree (filename);


--
-- Name: idx_employee_photos_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_photos_primary ON public.employee_photos USING btree (is_primary) WHERE (is_primary = true);


--
-- Name: idx_employee_photos_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_photos_type ON public.employee_photos USING btree (photo_type);


--
-- Name: idx_employee_photos_unique_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_employee_photos_unique_primary ON public.employee_photos USING btree (employee_id, photo_type) WHERE ((is_primary = true) AND (is_active = true));


--
-- Name: idx_employee_photos_upload_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_photos_upload_date ON public.employee_photos USING btree (created_at);


--
-- Name: idx_employee_pronouns_common; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_pronouns_common ON public.employee_pronouns USING btree (is_common) WHERE (is_common = true);


--
-- Name: idx_employee_pronouns_set; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_pronouns_set ON public.employee_pronouns USING btree (pronoun_set);


--
-- Name: idx_employee_pronouns_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_pronouns_sort_order ON public.employee_pronouns USING btree (sort_order);


--
-- Name: idx_employee_roles_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_roles_employee_id ON public.employee_roles USING btree (employee_id);


--
-- Name: idx_employee_roles_role_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_roles_role_id ON public.employee_roles USING btree (role_id);


--
-- Name: idx_employee_statuses_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_statuses_active ON public.employee_employment_statuses USING btree (is_active_status) WHERE (is_active_status = true);


--
-- Name: idx_employee_statuses_allows_login; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_statuses_allows_login ON public.employee_employment_statuses USING btree (allows_login) WHERE (allows_login = true);


--
-- Name: idx_employee_statuses_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_statuses_name ON public.employee_employment_statuses USING btree (status_name);


--
-- Name: idx_employee_statuses_workflow; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_statuses_workflow ON public.employee_employment_statuses USING btree (workflow_order);


--
-- Name: idx_employee_working_statuses_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_working_statuses_active ON public.employee_working_statuses USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_employee_working_statuses_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_working_statuses_name ON public.employee_working_statuses USING btree (status_name);


--
-- Name: idx_employee_working_statuses_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_working_statuses_sort_order ON public.employee_working_statuses USING btree (sort_order);


--
-- Name: idx_employees_department_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_department_id ON public.employees USING btree (department_id);


--
-- Name: idx_employees_employee_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_employee_number ON public.employees USING btree (employee_number);


--
-- Name: idx_employees_employee_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_employee_status ON public.employees USING btree (employee_status);


--
-- Name: idx_employees_employee_status_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_employee_status_id ON public.employees USING btree (employee_status_id);


--
-- Name: idx_employees_job_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_job_title ON public.employees USING btree (job_title);


--
-- Name: idx_employees_job_title_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_job_title_id ON public.employees USING btree (job_title_id);


--
-- Name: idx_employees_preferred_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_preferred_name ON public.employees USING btree (preferred_name);


--
-- Name: idx_employees_pronouns_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_pronouns_id ON public.employees USING btree (pronouns_id);


--
-- Name: idx_employees_termination_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_termination_date ON public.employees USING btree (termination_date);


--
-- Name: idx_location_contacts_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_contacts_location ON public.location_contacts USING btree (service_location_id);


--
-- Name: idx_location_contacts_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_contacts_primary ON public.location_contacts USING btree (service_location_id, is_primary_contact);


--
-- Name: idx_location_contacts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_location_contacts_user ON public.location_contacts USING btree (user_id);


--
-- Name: idx_password_complexity_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_complexity_active ON public.password_complexity_requirements USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_password_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_history_created_at ON public.password_history USING btree (created_at);


--
-- Name: idx_password_history_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_history_user_id ON public.password_history USING btree (user_id);


--
-- Name: idx_roles_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roles_is_active ON public.roles USING btree (is_active);


--
-- Name: idx_roles_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roles_name ON public.roles USING btree (name);


--
-- Name: idx_roles_sort_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roles_sort_order ON public.roles USING btree (sort_order);


--
-- Name: idx_service_locations_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_locations_active ON public.service_locations USING btree (business_id, is_active);


--
-- Name: idx_service_locations_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_locations_business_id ON public.service_locations USING btree (business_id);


--
-- Name: idx_service_locations_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_locations_type ON public.service_locations USING btree (business_id, location_type);


--
-- Name: idx_service_request_assignments_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_request_assignments_is_active ON public.service_request_assignments USING btree (is_active);


--
-- Name: idx_service_request_assignments_service_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_request_assignments_service_request_id ON public.service_request_assignments USING btree (service_request_id);


--
-- Name: idx_service_request_assignments_technician_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_request_assignments_technician_id ON public.service_request_assignments USING btree (technician_id);


--
-- Name: idx_service_request_comments_is_client_visible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_request_comments_is_client_visible ON public.service_request_comments USING btree (is_client_visible);


--
-- Name: idx_service_request_comments_service_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_request_comments_service_request_id ON public.service_request_comments USING btree (service_request_id);


--
-- Name: idx_service_request_files_service_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_request_files_service_request_id ON public.service_request_files USING btree (service_request_id);


--
-- Name: idx_service_request_history_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_request_history_created_at ON public.service_request_history USING btree (created_at);


--
-- Name: idx_service_request_history_service_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_request_history_service_request_id ON public.service_request_history USING btree (service_request_id);


--
-- Name: idx_service_request_time_entries_service_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_request_time_entries_service_request_id ON public.service_request_time_entries USING btree (service_request_id);


--
-- Name: idx_service_request_time_entries_technician_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_request_time_entries_technician_id ON public.service_request_time_entries USING btree (technician_id);


--
-- Name: idx_service_requests_assigned_technician_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_assigned_technician_id ON public.service_requests USING btree (assigned_technician_id);


--
-- Name: idx_service_requests_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_business_id ON public.service_requests USING btree (business_id);


--
-- Name: idx_service_requests_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_client_id ON public.service_requests USING btree (client_id);


--
-- Name: idx_service_requests_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_created_at ON public.service_requests USING btree (created_at);


--
-- Name: idx_service_requests_requested_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_requested_date ON public.service_requests USING btree (requested_date);


--
-- Name: idx_service_requests_service_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_service_location_id ON public.service_requests USING btree (service_location_id);


--
-- Name: idx_service_requests_soft_delete; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_soft_delete ON public.service_requests USING btree (soft_delete);


--
-- Name: idx_service_requests_status_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_status_id ON public.service_requests USING btree (status_id);


--
-- Name: idx_service_requests_urgency_level_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_urgency_level_id ON public.service_requests USING btree (urgency_level_id);


--
-- Name: idx_session_language_preferences_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_language_preferences_expires ON public.t_session_language_preferences USING btree (expires_at);


--
-- Name: idx_session_language_preferences_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_language_preferences_token ON public.t_session_language_preferences USING btree (session_token);


--
-- Name: idx_t_client_file_access_log_accessed_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t_client_file_access_log_accessed_by_user_id ON public.t_client_file_access_log USING btree (accessed_by_user_id);


--
-- Name: idx_t_client_file_access_log_client_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t_client_file_access_log_client_file_id ON public.t_client_file_access_log USING btree (client_file_id);


--
-- Name: idx_t_client_file_access_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t_client_file_access_log_created_at ON public.t_client_file_access_log USING btree (created_at);


--
-- Name: idx_t_client_files_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t_client_files_business_id ON public.t_client_files USING btree (business_id);


--
-- Name: idx_t_client_files_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t_client_files_created_at ON public.t_client_files USING btree (created_at);


--
-- Name: idx_t_client_files_file_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t_client_files_file_category_id ON public.t_client_files USING btree (file_category_id);


--
-- Name: idx_t_client_files_service_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t_client_files_service_location_id ON public.t_client_files USING btree (service_location_id);


--
-- Name: idx_t_client_files_soft_delete; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t_client_files_soft_delete ON public.t_client_files USING btree (soft_delete);


--
-- Name: idx_t_client_files_uploaded_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t_client_files_uploaded_by_user_id ON public.t_client_files USING btree (uploaded_by_user_id);


--
-- Name: idx_t_client_files_virus_scan_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t_client_files_virus_scan_status ON public.t_client_files USING btree (virus_scan_status);


--
-- Name: idx_t_client_storage_quotas_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t_client_storage_quotas_business_id ON public.t_client_storage_quotas USING btree (business_id);


--
-- Name: idx_t_client_storage_quotas_quota_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t_client_storage_quotas_quota_type ON public.t_client_storage_quotas USING btree (quota_type);


--
-- Name: idx_t_client_storage_quotas_service_location_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t_client_storage_quotas_service_location_id ON public.t_client_storage_quotas USING btree (service_location_id);


--
-- Name: idx_t_client_storage_quotas_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t_client_storage_quotas_user_id ON public.t_client_storage_quotas USING btree (user_id);


--
-- Name: idx_t_file_virus_scan_log_client_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t_file_virus_scan_log_client_file_id ON public.t_file_virus_scan_log USING btree (client_file_id);


--
-- Name: idx_t_file_virus_scan_log_scan_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_t_file_virus_scan_log_scan_started_at ON public.t_file_virus_scan_log USING btree (scan_started_at);


--
-- Name: idx_translation_keys_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_translation_keys_active ON public.t_translation_keys USING btree (is_active);


--
-- Name: idx_translation_keys_namespace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_translation_keys_namespace_id ON public.t_translation_keys USING btree (namespace_id);


--
-- Name: idx_translations_approved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_translations_approved ON public.t_translations USING btree (is_approved);


--
-- Name: idx_translations_key_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_translations_key_id ON public.t_translations USING btree (key_id);


--
-- Name: idx_translations_language_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_translations_language_id ON public.t_translations USING btree (language_id);


--
-- Name: idx_trusted_devices_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trusted_devices_expires ON public.trusted_devices USING btree (expires_at);


--
-- Name: idx_trusted_devices_fingerprint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trusted_devices_fingerprint ON public.trusted_devices USING btree (device_fingerprint);


--
-- Name: idx_trusted_devices_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trusted_devices_user ON public.trusted_devices USING btree (user_id, user_type);


--
-- Name: idx_user_language_preferences_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_language_preferences_user_id ON public.t_user_language_preferences USING btree (user_id);


--
-- Name: idx_user_sessions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_active ON public.user_sessions USING btree (is_active, expires_at);


--
-- Name: idx_user_sessions_session_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_session_token ON public.user_sessions USING btree (session_token);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: idx_users_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_business_id ON public.users USING btree (business_id);


--
-- Name: idx_users_cognito_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_cognito_user_id ON public.users USING btree (cognito_user_id);


--
-- Name: idx_users_confirmation_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_confirmation_token ON public.users USING btree (confirmation_token);


--
-- Name: idx_users_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_created_at ON public.users USING btree (created_at);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_force_password_change; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_force_password_change ON public.users USING btree (force_password_change) WHERE (force_password_change = true);


--
-- Name: idx_users_is_primary_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_is_primary_contact ON public.users USING btree (is_primary_contact);


--
-- Name: idx_users_password_changed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_password_changed_at ON public.users USING btree (password_changed_at);


--
-- Name: idx_users_password_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_password_expires_at ON public.users USING btree (password_expires_at);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_we_serve_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_we_serve_active ON public.t_we_serve USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_we_serve_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_we_serve_type_id ON public.t_we_serve USING btree (location_type, location_id);


--
-- Name: idx_zipcodes_city_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zipcodes_city_id ON public.t_zipcodes USING btree (city_id);


--
-- Name: idx_zipcodes_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_zipcodes_code ON public.t_zipcodes USING btree (zipcode);


--
-- Name: password_complexity_requirements enforce_single_active_per_user_type_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_single_active_per_user_type_trigger BEFORE INSERT OR UPDATE ON public.password_complexity_requirements FOR EACH ROW EXECUTE FUNCTION public.enforce_single_active_per_user_type();


--
-- Name: password_complexity_requirements password_complexity_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER password_complexity_updated_at_trigger BEFORE UPDATE ON public.password_complexity_requirements FOR EACH ROW EXECUTE FUNCTION public.update_password_complexity_updated_at();


--
-- Name: t_client_files trigger_update_quota_usage; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_quota_usage AFTER INSERT OR DELETE OR UPDATE ON public.t_client_files FOR EACH ROW EXECUTE FUNCTION public.update_quota_usage();


--
-- Name: users trigger_update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_users_updated_at();


--
-- Name: businesses update_businesses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.update_businesses_updated_at();


--
-- Name: email_verifications update_email_verifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_email_verifications_updated_at BEFORE UPDATE ON public.email_verifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: location_contacts update_location_contacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_location_contacts_updated_at BEFORE UPDATE ON public.location_contacts FOR EACH ROW EXECUTE FUNCTION public.update_location_contacts_updated_at();


--
-- Name: location_types update_location_types_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_location_types_updated_at BEFORE UPDATE ON public.location_types FOR EACH ROW EXECUTE FUNCTION public.update_location_types_updated_at();


--
-- Name: service_locations update_service_locations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_service_locations_updated_at BEFORE UPDATE ON public.service_locations FOR EACH ROW EXECUTE FUNCTION public.update_service_locations_updated_at();


--
-- Name: business_authorized_domains business_authorized_domains_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_authorized_domains
    ADD CONSTRAINT business_authorized_domains_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: employee_addresses employee_addresses_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_addresses
    ADD CONSTRAINT employee_addresses_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_emergency_contacts employee_emergency_contacts_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_emergency_contacts
    ADD CONSTRAINT employee_emergency_contacts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_photos employee_photos_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_photos
    ADD CONSTRAINT employee_photos_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_roles employee_roles_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_roles
    ADD CONSTRAINT employee_roles_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_roles employee_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_roles
    ADD CONSTRAINT employee_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: employees employees_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: employees employees_employee_employment_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_employee_employment_status_id_fkey FOREIGN KEY (employee_status_id) REFERENCES public.employee_employment_statuses(id);


--
-- Name: employees employees_job_title_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_job_title_id_fkey FOREIGN KEY (job_title_id) REFERENCES public.employee_job_titles(id);


--
-- Name: employees employees_pronouns_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pronouns_id_fkey FOREIGN KEY (pronouns_id) REFERENCES public.employee_pronouns(id);


--
-- Name: employees employees_working_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_working_status_id_fkey FOREIGN KEY (working_status_id) REFERENCES public.employee_working_statuses(id);


--
-- Name: t_session_language_preferences fk_session_language_preferences_session_token; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_session_language_preferences
    ADD CONSTRAINT fk_session_language_preferences_session_token FOREIGN KEY (session_token) REFERENCES public.user_sessions(session_token) ON DELETE CASCADE;


--
-- Name: location_contacts location_contacts_service_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_contacts
    ADD CONSTRAINT location_contacts_service_location_id_fkey FOREIGN KEY (service_location_id) REFERENCES public.service_locations(id) ON DELETE CASCADE;


--
-- Name: location_contacts location_contacts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.location_contacts
    ADD CONSTRAINT location_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: mfa_verification_codes mfa_verification_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mfa_verification_codes
    ADD CONSTRAINT mfa_verification_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: password_complexity_requirements password_complexity_requirements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_complexity_requirements
    ADD CONSTRAINT password_complexity_requirements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: password_complexity_requirements password_complexity_requirements_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_complexity_requirements
    ADD CONSTRAINT password_complexity_requirements_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: password_history password_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_history
    ADD CONSTRAINT password_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: service_locations service_addresses_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_locations
    ADD CONSTRAINT service_addresses_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;


--
-- Name: service_request_assignments service_request_assignments_assigned_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_assignments
    ADD CONSTRAINT service_request_assignments_assigned_by_user_id_fkey FOREIGN KEY (assigned_by_user_id) REFERENCES public.users(id);


--
-- Name: service_request_assignments service_request_assignments_service_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_assignments
    ADD CONSTRAINT service_request_assignments_service_request_id_fkey FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;


--
-- Name: service_request_assignments service_request_assignments_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_assignments
    ADD CONSTRAINT service_request_assignments_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.employees(id);


--
-- Name: service_request_assignments service_request_assignments_unassigned_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_assignments
    ADD CONSTRAINT service_request_assignments_unassigned_by_user_id_fkey FOREIGN KEY (unassigned_by_user_id) REFERENCES public.users(id);


--
-- Name: service_request_comments service_request_comments_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_comments
    ADD CONSTRAINT service_request_comments_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id);


--
-- Name: service_request_comments service_request_comments_deleted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_comments
    ADD CONSTRAINT service_request_comments_deleted_by_user_id_fkey FOREIGN KEY (deleted_by_user_id) REFERENCES public.users(id);


--
-- Name: service_request_comments service_request_comments_service_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_comments
    ADD CONSTRAINT service_request_comments_service_request_id_fkey FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;


--
-- Name: service_request_files service_request_files_attached_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_files
    ADD CONSTRAINT service_request_files_attached_by_user_id_fkey FOREIGN KEY (attached_by_user_id) REFERENCES public.users(id);


--
-- Name: service_request_files service_request_files_service_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_files
    ADD CONSTRAINT service_request_files_service_request_id_fkey FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;


--
-- Name: service_request_history service_request_history_changed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_history
    ADD CONSTRAINT service_request_history_changed_by_user_id_fkey FOREIGN KEY (changed_by_user_id) REFERENCES public.users(id);


--
-- Name: service_request_history service_request_history_service_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_history
    ADD CONSTRAINT service_request_history_service_request_id_fkey FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;


--
-- Name: service_request_time_entries service_request_time_entries_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_time_entries
    ADD CONSTRAINT service_request_time_entries_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: service_request_time_entries service_request_time_entries_service_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_time_entries
    ADD CONSTRAINT service_request_time_entries_service_request_id_fkey FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;


--
-- Name: service_request_time_entries service_request_time_entries_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_time_entries
    ADD CONSTRAINT service_request_time_entries_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.employees(id);


--
-- Name: service_requests service_requests_assigned_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_assigned_technician_id_fkey FOREIGN KEY (assigned_technician_id) REFERENCES public.employees(id);


--
-- Name: service_requests service_requests_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: service_requests service_requests_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id);


--
-- Name: service_requests service_requests_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- Name: service_requests service_requests_deleted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_deleted_by_user_id_fkey FOREIGN KEY (deleted_by_user_id) REFERENCES public.users(id);


--
-- Name: service_requests service_requests_priority_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_priority_level_id_fkey FOREIGN KEY (priority_level_id) REFERENCES public.priority_levels(id);


--
-- Name: service_requests service_requests_service_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_service_location_id_fkey FOREIGN KEY (service_location_id) REFERENCES public.service_locations(id);


--
-- Name: service_requests service_requests_service_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES public.service_types(id);


--
-- Name: service_requests service_requests_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.service_request_statuses(id);


--
-- Name: service_requests service_requests_urgency_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_urgency_level_id_fkey FOREIGN KEY (urgency_level_id) REFERENCES public.urgency_levels(id);


--
-- Name: service_types service_types_default_priority_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_types
    ADD CONSTRAINT service_types_default_priority_level_id_fkey FOREIGN KEY (default_priority_level_id) REFERENCES public.priority_levels(id);


--
-- Name: service_types service_types_default_urgency_level_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_types
    ADD CONSTRAINT service_types_default_urgency_level_id_fkey FOREIGN KEY (default_urgency_level_id) REFERENCES public.urgency_levels(id);


--
-- Name: t_area_codes t_area_codes_county_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_area_codes
    ADD CONSTRAINT t_area_codes_county_id_fkey FOREIGN KEY (county_id) REFERENCES public.t_counties(id);


--
-- Name: t_cities t_cities_county_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_cities
    ADD CONSTRAINT t_cities_county_id_fkey FOREIGN KEY (county_id) REFERENCES public.t_counties(id);


--
-- Name: t_client_file_access_log t_client_file_access_log_accessed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_file_access_log
    ADD CONSTRAINT t_client_file_access_log_accessed_by_user_id_fkey FOREIGN KEY (accessed_by_user_id) REFERENCES public.users(id);


--
-- Name: t_client_file_access_log t_client_file_access_log_client_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_file_access_log
    ADD CONSTRAINT t_client_file_access_log_client_file_id_fkey FOREIGN KEY (client_file_id) REFERENCES public.t_client_files(id) ON DELETE CASCADE;


--
-- Name: t_client_files t_client_files_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_files
    ADD CONSTRAINT t_client_files_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: t_client_files t_client_files_deleted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_files
    ADD CONSTRAINT t_client_files_deleted_by_user_id_fkey FOREIGN KEY (deleted_by_user_id) REFERENCES public.users(id);


--
-- Name: t_client_files t_client_files_file_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_files
    ADD CONSTRAINT t_client_files_file_category_id_fkey FOREIGN KEY (file_category_id) REFERENCES public.t_file_categories(id);


--
-- Name: t_client_files t_client_files_last_downloaded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_files
    ADD CONSTRAINT t_client_files_last_downloaded_by_user_id_fkey FOREIGN KEY (last_downloaded_by_user_id) REFERENCES public.users(id);


--
-- Name: t_client_files t_client_files_service_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_files
    ADD CONSTRAINT t_client_files_service_location_id_fkey FOREIGN KEY (service_location_id) REFERENCES public.service_locations(id);


--
-- Name: t_client_files t_client_files_service_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_files
    ADD CONSTRAINT t_client_files_service_request_id_fkey FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id) ON DELETE SET NULL;


--
-- Name: t_client_files t_client_files_uploaded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_files
    ADD CONSTRAINT t_client_files_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES public.users(id);


--
-- Name: t_client_storage_quotas t_client_storage_quotas_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_storage_quotas
    ADD CONSTRAINT t_client_storage_quotas_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: t_client_storage_quotas t_client_storage_quotas_service_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_storage_quotas
    ADD CONSTRAINT t_client_storage_quotas_service_location_id_fkey FOREIGN KEY (service_location_id) REFERENCES public.service_locations(id);


--
-- Name: t_client_storage_quotas t_client_storage_quotas_set_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_storage_quotas
    ADD CONSTRAINT t_client_storage_quotas_set_by_admin_id_fkey FOREIGN KEY (set_by_admin_id) REFERENCES public.users(id);


--
-- Name: t_client_storage_quotas t_client_storage_quotas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_client_storage_quotas
    ADD CONSTRAINT t_client_storage_quotas_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: t_counties t_counties_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_counties
    ADD CONSTRAINT t_counties_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.t_states(id);


--
-- Name: t_file_virus_scan_log t_file_virus_scan_log_client_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_file_virus_scan_log
    ADD CONSTRAINT t_file_virus_scan_log_client_file_id_fkey FOREIGN KEY (client_file_id) REFERENCES public.t_client_files(id) ON DELETE CASCADE;


--
-- Name: t_translation_keys t_translation_keys_namespace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_translation_keys
    ADD CONSTRAINT t_translation_keys_namespace_id_fkey FOREIGN KEY (namespace_id) REFERENCES public.t_translation_namespaces(id) ON DELETE CASCADE;


--
-- Name: t_translations t_translations_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_translations
    ADD CONSTRAINT t_translations_key_id_fkey FOREIGN KEY (key_id) REFERENCES public.t_translation_keys(id) ON DELETE CASCADE;


--
-- Name: t_translations t_translations_language_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_translations
    ADD CONSTRAINT t_translations_language_id_fkey FOREIGN KEY (language_id) REFERENCES public.t_languages(id) ON DELETE CASCADE;


--
-- Name: t_user_language_preferences t_user_language_preferences_language_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_user_language_preferences
    ADD CONSTRAINT t_user_language_preferences_language_id_fkey FOREIGN KEY (language_id) REFERENCES public.t_languages(id) ON DELETE CASCADE;


--
-- Name: t_user_language_preferences t_user_language_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_user_language_preferences
    ADD CONSTRAINT t_user_language_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: t_zipcodes t_zipcodes_city_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.t_zipcodes
    ADD CONSTRAINT t_zipcodes_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.t_cities(id);


--
-- Name: users users_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict ygmukJXrgJnemLfdWnESBncy4zfvEbpPk1KvCGFjsoHXa5zY85Ch1HH2NKiBCcP

--
-- PostgreSQL database dump
--

\restrict qzLhzTARYHhLd2Klbo85fomW5UIXfgTxCMhbvh0uhPMNikd5a3X80SyhZ1dkYl8

-- Dumped from database version 16.8
-- Dumped by pg_dump version 16.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: service_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.service_types VALUES ('68084cc9-06a3-40a7-b23a-2a229ddf8262', 'Network Troubleshooting', 'Diagnose and resolve network connectivity issues', 'Network', 120, NULL, NULL, false, true, '2025-09-27 09:35:00.257258', '2025-09-27 09:35:00.257258');
INSERT INTO public.service_types VALUES ('57afd10b-b0d6-4f5d-bf4c-7d62088b912b', 'Hardware Repair', 'Repair or replace faulty hardware components', 'Hardware', 180, NULL, NULL, false, true, '2025-09-27 09:35:00.257258', '2025-09-27 09:35:00.257258');
INSERT INTO public.service_types VALUES ('c39334e9-d339-4d31-86d4-23a593c34471', 'Software Installation', 'Install and configure software applications', 'Software', 90, NULL, NULL, false, true, '2025-09-27 09:35:00.257258', '2025-09-27 09:35:00.257258');
INSERT INTO public.service_types VALUES ('ac055672-739e-49f2-a38c-1f64e698e3b7', 'Security Assessment', 'Evaluate and improve security posture', 'Security', 240, NULL, NULL, false, true, '2025-09-27 09:35:00.257258', '2025-09-27 09:35:00.257258');
INSERT INTO public.service_types VALUES ('d956c313-3db4-4969-868f-7a21d3239193', 'System Maintenance', 'Routine maintenance and updates', 'Maintenance', 60, NULL, NULL, false, true, '2025-09-27 09:35:00.257258', '2025-09-27 09:35:00.257258');
INSERT INTO public.service_types VALUES ('27408365-8dd8-4b48-bc86-73110d7b0523', 'Data Recovery', 'Recover lost or corrupted data', 'Data', 300, NULL, NULL, false, true, '2025-09-27 09:35:00.257258', '2025-09-27 09:35:00.257258');
INSERT INTO public.service_types VALUES ('8f1af99a-0363-471a-9b13-a71980fdc8d4', 'Email Configuration', 'Setup and troubleshoot email systems', 'Software', 90, NULL, NULL, false, true, '2025-09-27 09:35:00.257258', '2025-09-27 09:35:00.257258');
INSERT INTO public.service_types VALUES ('3e5d6c84-dcd0-428d-a4d3-147262e49bf1', 'Backup Solutions', 'Implement and test backup systems', 'Data', 180, NULL, NULL, false, true, '2025-09-27 09:35:00.257258', '2025-09-27 09:35:00.257258');
INSERT INTO public.service_types VALUES ('e4b1b4ac-40f4-41cf-8d61-b610667f715d', 'Wi-Fi Setup', 'Configure wireless network access', 'Network', 120, NULL, NULL, false, true, '2025-09-27 09:35:00.257258', '2025-09-27 09:35:00.257258');
INSERT INTO public.service_types VALUES ('6107ccc4-7538-4cf6-ad99-cc1182d606ae', 'Printer Installation', 'Install and configure printers and scanners', 'Hardware', 60, NULL, NULL, false, true, '2025-09-27 09:35:00.257258', '2025-09-27 09:35:00.257258');


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.system_settings VALUES (1, 'session_config', '{"timeout": 25, "warningTime": 2}', 'security', 'Session timeout configuration in minutes', '2025-09-24 21:37:58.440899', '2025-09-25 11:06:26.211592');
INSERT INTO public.system_settings VALUES (4, 'scheduler_buffer_before_hours', '2', 'scheduling', 'Minimum hours required before existing appointments when scheduling new appointments', '2025-09-27 17:03:24.558046', '2025-09-27 17:03:24.558046');
INSERT INTO public.system_settings VALUES (5, 'scheduler_buffer_after_hours', '1', 'scheduling', 'Minimum hours required after existing appointments when scheduling new appointments', '2025-09-27 17:03:24.558046', '2025-09-27 17:03:24.558046');
INSERT INTO public.system_settings VALUES (6, 'scheduler_default_slot_duration_hours', '2', 'scheduling', 'Default duration in hours for new appointment slots', '2025-09-27 17:03:24.558046', '2025-09-27 17:03:24.558046');
INSERT INTO public.system_settings VALUES (7, 'scheduler_minimum_advance_hours', '1', 'scheduling', 'Minimum hours into the future that appointments can be scheduled', '2025-09-27 17:03:24.558046', '2025-09-27 17:03:24.558046');
INSERT INTO public.system_settings VALUES (3, 'mfa_required', 'true', 'security', 'Require multi-factor authentication for all employee logins', '2025-09-25 10:56:57.092348', '2025-09-28 19:36:40.446337');
INSERT INTO public.system_settings VALUES (8, 'signup_ip_daily_limit', '3', 'general', 'Maximum signups per day from the same IP address', '2025-09-29 06:15:51.097359', '2025-09-29 06:15:51.097359');
INSERT INTO public.system_settings VALUES (9, 'signup_global_daily_limit', '20', 'general', 'Maximum signups per day across all IP addresses', '2025-09-29 06:16:00.567297', '2025-09-29 06:16:00.567297');


--
-- Data for Name: t_translations; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.t_translations VALUES ('fa480bbb-e1da-493e-a26f-249cdb630b36', '7221f952-f91e-4f53-84f1-fa3f0b96132a', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'AM', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('e3c7ffe9-da2d-47d6-8486-474170142b8f', '54dab721-4bde-4fa3-99e5-2c495588e5ad', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'PM', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('b59ef0da-37aa-4870-97b9-1e6a056645a9', '033229e6-58fc-4ecb-b886-a3a1ce2fc4d8', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Email', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('ed784d1c-bddd-488c-a8d0-2997e7c9c21e', '05af055c-4098-4343-8dea-166edf8726de', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Login', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('97b1263d-e710-48cc-ae09-23fdf0cb54dc', '82be6813-127b-4eec-b98c-a59341c8a6f6', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'No', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('283a4730-ae60-4137-9a49-ef61cabe70d5', '18acf397-3546-4909-b2d4-c3ec6851c193', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Today', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('03211289-21f9-4020-8dc5-13a8c5bb296f', 'c82cc593-b74b-4a00-9a87-76c788f79868', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Logout', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('3c790424-b737-45e7-b244-ac65f1b9ece2', 'e6cfb21d-d097-41b3-928b-1e9df6a926c7', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Sign In', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('24df57b8-ca40-4eea-8966-be3f0774c162', '69f8081c-09ea-460f-9d27-65e29eaf5e44', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'File Manager', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('e50a0dde-02a5-4d37-8fd1-fb7615e2f918', 'b0ef8914-b82f-4035-a2ad-42f06cb5aac3', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Add', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('c46bc3e0-a10f-4a93-b203-c916ce65ee7d', '14691d38-877b-43e9-8ef2-85f3e10096ce', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Yes', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('d347b596-cc16-4c98-87f3-df7f66499ce4', 'fee322b6-de0a-409e-a5fb-f817f0953ce3', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Back', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('c586c630-efcc-4154-8934-6d8cc2970abc', '9b745ee1-eea5-4634-964a-17bb39c9c138', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Edit', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('df9fd0b9-5a7c-4d43-808e-1c02db0b46be', 'be954cf4-e727-4b9f-9b05-1ed39767c6cc', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Information', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('6a8fa068-dec9-4228-ab9d-42beed019186', 'cfec8065-a236-43bf-9506-2a1a426bc02e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Next', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('bef85029-795e-4522-bd2a-13bfe758b9dc', '0337e814-94d2-4fd6-8e94-8af92eb40cff', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Save', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('2c766bf0-8236-4b00-b3c9-e2b7cce10588', '46d032bf-0374-4b3c-a4a4-03177086ffd3', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Password', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('804d5187-2543-4a68-acf8-38ed6ca58dfe', '49d9a9d6-0d33-4aaf-abec-3dbb0272d7d3', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'No files uploaded yet', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('86d64509-6bb4-4d72-a916-8ffffe267d7d', '687976a3-3d23-47e6-aedd-aa8611a88aa5', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Close', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('4a102bfa-89dd-41d3-b660-c808c016c76b', '53c95680-c34d-4129-a8d5-39e4ef3c0849', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Error', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('baa07deb-7598-4c77-9808-527f8f87e01e', 'd5c0bec3-c226-4810-9262-18bfabb8af5d', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'hour', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('5dfd6213-9deb-4af4-a4e0-74d78a635eaa', 'ff193706-851c-4d95-bed6-abdce84418e2', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Tomorrow', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('2faf5692-9da9-49cd-bd0a-b02311b22984', 'f7fdc8b8-3e79-42c9-abbe-223aca448075', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Logging in...', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('1f567a4b-4942-46e5-8781-879cb5a56f85', '53a5288d-4168-41dd-9259-fc0703e3975f', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Cancel', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('1a015a1b-d42c-4003-9da9-59f0c6b1c728', '41f7ad56-4ad2-4bef-9b98-b606d11cc476', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Delete', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('8e3772d8-66e5-43a4-9d24-2f955d66e30c', '59a9c2a3-cb5b-4924-91ad-68c174b2d951', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Role', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('5c4b422e-db54-4c92-841c-81871d17523a', '4d2f56b1-4220-4fcb-81dd-054cb2fd4fb7', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'hours', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('24910f5c-55bd-4083-aa59-e8f26c489791', '97a2a67f-703c-48c1-8e2d-15559274a86f', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Yesterday', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('98fd1cb4-03fb-4618-a281-0c27e20197fa', '31e197f0-7b49-451e-a24e-7d4d86bc4855', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Login failed. Please try again.', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('4f74cf5b-9974-495f-a3d5-17c1878ad235', 'b5b0d275-2280-41e6-9cb2-563e0894583e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Client Login', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('ef5f26b8-a2c8-4d00-b6b4-737f050e1d25', 'fa5c8b50-5d67-44e5-9376-4021dffa2cc0', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Client Dashboard', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('83f1d929-874a-493f-8831-15b49ac80d55', '671b04d6-5085-4675-b626-d17a2e0ea033', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'The requested resource was not found.', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('b09014c2-cbc5-487e-bf24-9d69a0cb73ce', '835c0ccf-a2a0-433b-b5bf-71a5e116731c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Confirm', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('ec5332eb-240c-487d-8cbf-e1483e74e6e3', 'aacb99b3-d4d1-4773-bf6e-97b8040518ba', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Loading...', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('1d42782c-be24-4e00-a563-483002abc162', 'f7031ad7-35ef-4f4f-9375-8323f804d381', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Success', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('2d927593-9519-4e5e-9cdb-bad3bb2cafa5', '2cdc2bd1-667c-4ad5-9109-8bd6aae9acaf', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Warning', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('c01717a0-730a-4e12-9728-d632fe73f917', '0141ae63-96a6-412c-b6f2-bd56429efdd9', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Service Locations', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('3b5e8149-7c05-436d-916f-54a19e7d1079', '97b242b3-44ca-415c-8b0f-47aaa4d85432', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Access forbidden.', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('fa35cc55-12ce-4451-91e9-65b07cc3186b', '16466a39-65a3-4a03-9ff8-f0dfa38e5576', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Previous', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('7b37dc31-c688-412f-8676-286112ca8505', 'e15cd990-458c-4fe6-8336-b4f7ad9209f9', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'English', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('45b7650d-abd6-4092-ac3b-e84eeba52c2b', '8a0c1b56-b51e-4c15-8ad7-8dd55c473a59', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Español', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('8682664f-327e-4d27-9e11-58275cf5581d', '2e35359e-29ca-4858-a3ea-4bab1eb0f800', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Profile', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('4a406b68-23c5-4a78-8ddc-739c038bbdca', '56781420-5a39-43d3-9d0d-924b7527652d', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Welcome back', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('d94f1bff-25ce-4669-938f-6ce390874b4a', '7fa76b2f-fd1b-49ef-b22f-37a8cb2fc8a6', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Search files...', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('979f3046-cd92-47e4-8ad1-0674ed2f50d2', '2442e0bf-ec23-4d7e-9e5d-c8829d8f03b2', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Upload Files', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('b2f3fbed-4fa3-4bb7-aa01-31105dcb72c8', '4da0d984-a791-44a5-8f12-bf278f76f7dd', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Address', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('2b24314b-5225-40b6-b14c-78a34bae1a7e', '4b8f84ec-a74f-4f14-9ab3-a6384eadb3fb', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Contact', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('327e8428-aa09-4343-bcc8-164609116471', '36c05d30-a965-453a-8a0e-ca106edd59de', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Selected', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('9cdc522a-f199-45f9-b6ef-9d7845f6d561', 'abd4b842-b25b-4f22-aedb-a013a329299f', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Password', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('1c0105f1-3e4d-4a9d-927b-9fa6992ea9ba', '18e383d0-bb28-4392-b0d6-44ea59d2703a', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Security', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('41b70c1e-1033-4cb4-b684-354b324f04bc', 'e9dcdd18-26c0-4cd9-bd7c-819d1de28f7c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Email is required', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('bff39bf3-ae45-49c1-8e9f-00180b7b781c', '564e094b-76bd-45f8-b6e8-b6859305f8a5', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Overview', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('a4d7d3db-8568-446a-a6f3-e12e44d7092e', '3d6cbbf3-caf7-4de5-a5a9-430b63b4793b', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Server error. Please try again later.', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('1d6e9ce7-6b2a-4ccd-b5d0-606b5c476b90', '7a282357-ebb6-4d93-86ac-9e5bd8608e0e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'File', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('4e998879-5809-40ea-aa19-2a4eb096e546', 'bbb8870e-6665-479b-85e1-1e872068b0f9', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Size', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('4d9b549f-fccc-4f36-9049-53d7e304ec1b', 'beff112f-5624-4b94-a4d7-f0cbda222b2a', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Upload Files', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('6c7039e4-216d-4919-8b15-488ed8acea65', '65ae9902-cb38-4825-890b-44dfcd0b0a77', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Forgot Password?', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('25dde579-ad28-4645-b211-da71e6fdf802', '03693f36-c08e-43c3-8dc4-f6717078beb5', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'File Storage', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('b46d791e-035d-4927-88fe-d80bae227b01', '5e85c624-0364-4098-94d8-21a3144b849f', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Network error. Please check your connection.', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('e7b60372-c492-49a3-be58-796ca31972c9', 'bcf3e98e-7a51-4065-8511-4c43a2234896', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'You are not authorized to perform this action.', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('42c785ac-43c9-4d5d-a937-99324ee2f5b5', '424cb27c-b0b7-4af8-96eb-8b0e1ef8305c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'An unknown error occurred.', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('fa89fc20-096d-4fa3-a05d-2b20c476dc06', '4cf32760-310d-49f5-bfdb-9c6a8aeb81d1', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'No files found matching your search', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('10d7902f-5110-4b9c-b40b-22314d631426', '09a0b3c6-7e65-4388-afbb-c07c8c2f8b4e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Delete', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('c1732613-3fe5-4490-8c9a-ec2d3b26ebcf', 'f5c04d36-fe35-4d01-a4cc-dce7fceabc5f', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Maximum file size', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('e7f5ae81-f4b7-4515-a33f-17066a71da31', '7429ae15-bc9f-4273-8f8f-f21b7556308b', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Schedule Service Request', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('b5885ddb-e21d-455d-91bb-8747b1217d32', '3e0a95df-1c0a-4176-a1d0-05e617a9b1dc', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Select Time & Duration', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-28 01:37:20.883192');
INSERT INTO public.t_translations VALUES ('43a888e2-8e8b-42c2-affc-7b90e5cf3d66', 'de8eaa52-a2f4-45b7-a954-d55c02a64bfd', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Account Settings', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('7a2df9ba-a049-439a-9294-e3fe60528ca2', '3ff50754-e4b9-4107-9229-d87ad1d48d19', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Password is required', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('1c9fe7e5-ab5a-465d-8144-7ae3e09c642c', '0a57bc23-9a8e-469b-b91a-0378098ae626', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Actions', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('74d6409f-7c2d-45ee-aeee-bd16f459341b', 'd0111f6e-0001-4379-8574-66b23bc1609e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Drag and drop files here, or click to select', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('8de87876-828c-44ed-9001-41f682d7ecf4', '27e06732-fb28-48d3-b196-b00171b135c9', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Contact Name', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('66786491-c112-4247-a04e-7387f702cd13', '7c086960-b297-4cb1-97cf-da8b954fa404', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Service Requests', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('7cae5b47-5673-4284-9a93-b9083bd778d2', 'f3a2fe90-8195-44fc-a632-4635820b04c7', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Schedule Service', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('3db4d610-6fb3-4e4b-a0e7-3de3e650b30e', '30781212-8817-4a80-bc32-6b7fbcf77975', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Settings', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('103cd69e-8ded-4fb5-bb0e-32e23fd353f5', 'a7fb5751-1bb5-4500-97d1-b410fa006e02', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Quick Actions', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('b5dd36cf-58b7-47a6-a7ca-6843cd114676', '6af56a88-8652-4fd7-8705-af148683c20d', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Please check your input and try again.', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('87562adb-926e-4373-bd11-17dd2e76db90', 'de187c9b-6ce1-4b18-b354-94c34df62688', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Location', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('698d29b8-5cf7-4115-be4f-8001ba115240', '7a3449cc-3bc4-4393-9c8b-f64e9d94c8b0', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Uploaded', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('817a441b-cf9a-42da-af33-959ffa6e9d09', '1e835918-0b98-4382-806e-107e6c8d94e9', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Uploading', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('464f942d-5f72-4298-a125-09cc3c1c6d9f', '2f332cd5-f1af-48ff-8ddf-cf653796200d', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Email Address', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('1d67a4c2-8140-4b32-a3f1-8ba9fe2ad1ee', 'cdd63068-388f-4e0b-8c9d-25914e8f257b', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Phone Number', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('9dc73c25-5091-4e09-9e8b-8ea60031fac0', '6bfa747d-69d3-4eaa-92a7-aa46b288649c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Select Urgency', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('05f490b3-a7a2-469b-a511-2be7c2ea2fd5', '9e7f4ea7-1ba2-4fef-9463-5eb8e1da015f', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Standard hours', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('13702360-6ed8-4b28-8930-889796059c02', '7ebd9774-c982-4a3a-bd54-0ca1b6f202ce', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Invalid email or password', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('58dacbcf-a466-4460-acb2-5758d2723bc6', '62928b84-1931-4ea1-a231-b7bf30042846', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Dashboard', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('dd4716b5-9f88-40d5-a10e-07c5f084ef9e', '8eea0fab-3ae1-4001-8baf-75a5e9aea41e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Service Locations', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('3e7cb7af-84cc-4bb8-b2cc-ec958f8514cd', '87d85142-e76f-46eb-99a8-bb0d12d30823', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Storage Used', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('d9e13c4f-3d68-44d1-bb13-ce759ca50038', 'd68343a4-ac88-444f-a92b-2aef79774dd7', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Completing', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('2f7e7b8c-a824-49a6-83d1-0a32955fd6fc', 'b84261ab-6206-4ecd-9b74-f82da936b951', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Select Language', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('1504b6cd-4708-44a6-9632-8ecc4a453142', '9a5feb67-e42b-4fe6-8265-c2bfa6d60155', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Failed to schedule service request', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('47b558c3-3513-42d6-aeb9-7101c772fd71', 'fc9460c5-eacd-4f0c-9dd4-2d3835fa2579', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Premium pricing applies for after-hours service', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('d1ccfe14-02bb-463e-be2e-1ef3f57b678a', '7157faa7-df50-48bd-a5a3-4d65e4297cbd', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Total Files', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('ff02b1e3-e7f6-4871-8211-c26cb6487425', 'c1e245f9-e686-475a-b047-7543201e3462', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Select Files', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('041bd9c3-2807-4f18-835b-7a510bb76dd7', 'e8eb3164-7536-4c4e-93af-153ef9c20e2a', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Service Duration', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('eea2c7ca-ad66-4949-abac-2da4634cef56', 'a03ef002-8c51-43c0-8ebb-883f1151d31c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Locations', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('8ea1aef6-1f08-48b5-b00a-98e80f742038', '91d4e889-d904-4a78-8370-7ea2cb5950af', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Allowed file types', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('0c59ddbe-30eb-4f82-8436-8937c5d3bd94', 'f474312e-0682-4730-b3ae-6e2bc5cc9825', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Approaching storage limit', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('19b5d458-c492-4b86-a7b3-3a60c354a6fc', 'a7de3f23-61f8-478e-87a0-cf49e900c5dc', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Upload failed', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('361514c8-4fda-4460-8744-4436d2dc89b3', '70afb4a1-d25e-49a1-9ba1-cc9c101c34da', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Service request scheduled successfully!', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('60d5ee32-b247-48eb-b6b8-8b8919387543', 'd7a6f78a-fbc6-48b0-9163-32308f7a1159', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Priority', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('64e2ace4-6bb8-4881-9e72-ab6e65f4f63b', '46831cc9-a2a0-4617-950c-89879df59bb6', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'View/Download', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('673dfe8d-b889-4299-9e82-c5a217bb9dae', '1ff722fb-13eb-4cda-b7fc-e72eb5dd8339', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'All Locations', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('c854271b-476c-40ea-a627-66efb02bb40b', '723f3841-eeaf-4776-8ef1-7bf67c64baa7', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Upload would exceed storage quota', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('c086b72f-f011-4e50-8a33-0d411ed391ed', '216299f1-5b72-452e-a708-7e85c3cd08af', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Virus Scanning', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('89970039-44fd-42bc-bd67-bdf86357e7ba', '359fc258-0f0c-4012-849f-b8cead4b5a3d', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Are you sure you want to delete this file?', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('686dc5b3-ca7e-41df-8319-c9e012a5c4ff', '4a23b176-1ef6-42b7-896f-5eee9047d73f', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Upload Complete', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('1162f00e-c4d8-4d99-9c6b-cee271de579d', '8a48231c-ffef-45de-9d68-3edcd8c23958', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Back to Form', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('373bd0f0-7e54-432b-829c-fa0cfffe1633', 'b9e7ed7d-951b-4720-b480-cfdc2d45d6a9', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Available Space', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('3d236a8c-b50e-4838-922e-8ec11a8aba27', 'c7fddd8c-0736-4a6d-9273-bf9e92a95852', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Submitting request...', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('d7c846eb-89a1-422d-8152-bcef375edfa8', '73e83248-be78-4893-8bf2-83467337e5da', '3760eb9f-af6a-4037-920e-68769dcd17d3', '4-hour lead time', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('3db05cc0-23dc-427e-be5b-d72e6c9b4310', '4d2c6bf9-63a1-46b4-8302-59e62e82d225', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Email Address', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('3b89ae5c-652b-4e83-89db-25fa3f92e2d5', '8a2e143d-f1b3-44a0-8d2c-17e0bc59c9ae', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Phone Number', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('9ce347bf-ee01-4ef4-9a39-fd77abd9ce75', '2d8915c3-62a3-420d-9bc5-29a66a73c3b1', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Active Requests', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('175ec781-98a1-4ea6-934b-e8682f68a5b2', '32bb02ac-259b-45ee-8dee-0db21163be7c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Available Space', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('fec426d6-3dce-418d-b6fb-63e27348fc51', 'd7bfb1c2-8530-4f90-9bc5-098810310564', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Schedule Another', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('cb240876-6b85-405f-b26b-7181581a83a4', '4a53bd3a-7f6c-4985-99eb-654ab3bca3cc', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Schedule Request', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('df81a150-9c1e-4188-96db-83d780accfa2', '5b09b22f-9708-4650-805c-9962e1519d32', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enter contact name', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('b7c7dc2d-4ff4-4fb1-85cd-ede4fef3afbb', '98a95905-b6c4-4a7a-94ec-0f47a48cf0b4', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Request Details', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('6d23a3e3-31cb-4c6b-84bf-0a45d2d60557', 'e88caaa4-ee43-4f0e-a898-6e8405758b9a', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Last Name', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('092136ae-118f-4609-985a-38c9a601e669', 'bf97b3f1-a883-490f-98b4-adda37f2cc17', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enter email address', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('2dedbd3d-fdca-4ae1-8c83-595867af7ff8', '17f63970-1c30-416d-be48-ed2df7ce1e0f', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enter phone number', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('8915e24f-4b6c-4336-b06f-a38eae8f5a68', '44f89793-e448-4a55-a3fc-40d76b5f34a7', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'First Name', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('9c6e77d5-7092-4cb7-865b-47b73cc994dc', '0392dfad-9d3b-4677-a119-f515c69bd5a4', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Email address is already in use', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('43e4c821-19b2-451b-9e75-7496dd660b74', 'c8d2e9e9-906d-440d-bad9-73a279eeb7b2', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Emergency Service', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('ec4bebe3-6c20-43e5-a791-b691e21fd2ba', '9d664105-c4d8-40a7-b62a-1d0acf817ffe', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Contact Information', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-28 01:37:20.883192');
INSERT INTO public.t_translations VALUES ('f893f0d4-afd5-4f81-8019-225afe3be888', 'b19c64bc-e8e3-45e2-8c01-4535a6a45b15', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Service Description', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-28 01:37:20.883192');
INSERT INTO public.t_translations VALUES ('154c59b1-19d2-4f4f-9694-2d0c3a07dae4', 'b64664d7-11f9-4055-ac33-74181f047a7e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Service Type', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-28 01:37:20.883192');
INSERT INTO public.t_translations VALUES ('56e05f6a-d86b-496f-93b6-fb281a357b69', '353f338c-6f8e-4c28-8808-3e56b354d560', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Select a location', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-28 01:37:20.883192');
INSERT INTO public.t_translations VALUES ('721d16ce-63a8-4358-abfc-bc0a69a6517d', '33b97ebf-fe20-4e2a-818f-0097d29a0781', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Normal Service', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('b343be43-39ca-4312-8a51-17990e6ac97d', 'b4fe8ede-05a1-48f4-a2f4-25adb8834efc', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'All fields are required', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('c1512e5a-44bd-4652-bdf2-e83d7b957d2f', '4d8dd1e6-f977-4ddf-9c43-4d7e83d63213', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Save Changes', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('615f467b-94e7-4f1a-a681-2a61aba1a5d9', 'a3e8fc64-bf78-450f-96be-b477e72b88fa', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Failed to update contact information', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('8d4e9ee0-c8af-4b65-be00-93f852b8b3c0', '9885cc25-8a22-40a5-bc9b-3f6fe9d3e5e1', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Invalid email format', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('36d2f016-a5b1-41fc-a5d2-da1bbc6d9e9a', 'b7fc47c5-c688-44e0-8f21-8ec9df029529', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Contact information updated successfully', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('336343d5-af16-483e-a83d-3cd5883e1805', '5af19590-945b-448c-8836-0b8cfbdd195c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'First name, last name, and email are required', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('cb8035ed-4d2c-4cd4-9a75-e5611ff3fe0b', 'bad75658-33fc-469f-8493-f8673f7188a6', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enter email address', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('1083246e-7cab-4dec-8452-9cde27c537e4', '0bafb658-8c4c-4483-ba2b-94275fea7344', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enter phone number', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('bb19a6a3-9d27-4a08-8d2f-9f497927af58', 'eda993f5-42b9-452c-8d48-fd259bbd8363', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enter last name', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('ecaebb5f-5235-4cc0-9436-6dad6b4b72f5', '772881cb-d251-43ca-ac20-c8f0786ccc13', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enter first name', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 10:29:04.322999');
INSERT INTO public.t_translations VALUES ('5f0a70d8-ad77-48b4-91d0-8a4acbead940', '7221f952-f91e-4f53-84f1-fa3f0b96132a', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'AM', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('40a7190d-8393-4019-b231-c21ec39908db', '54dab721-4bde-4fa3-99e5-2c495588e5ad', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'PM', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('defba5a2-66f8-4ee7-a187-5a2133184f1e', '033229e6-58fc-4ecb-b886-a3a1ce2fc4d8', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Correo', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('ea74766e-af65-41aa-a609-b611def06ff6', '05af055c-4098-4343-8dea-166edf8726de', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Iniciar Sesión', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('72e02460-b482-4e44-8b55-6934649a9443', '82be6813-127b-4eec-b98c-a59341c8a6f6', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'No', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('15f79c65-f83a-4176-ad7b-6512533997e4', '18acf397-3546-4909-b2d4-c3ec6851c193', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Hoy', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('e8f29b49-7673-46bc-bcc7-2531305648f2', 'c82cc593-b74b-4a00-9a87-76c788f79868', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Cerrar Sesión', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('e9855787-c8da-4d7c-b456-8cbb62919f53', 'e6cfb21d-d097-41b3-928b-1e9df6a926c7', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Acceder', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('d39c34af-6b7e-462e-80ea-c532b5453fc5', '69f8081c-09ea-460f-9d27-65e29eaf5e44', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Gestor de Archivos', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('c8378e09-3ded-4780-a743-b5973d28deae', 'b0ef8914-b82f-4035-a2ad-42f06cb5aac3', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Agregar', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('dd6506a7-068a-4c4d-b2c2-cf5e5f9586d9', '14691d38-877b-43e9-8ef2-85f3e10096ce', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Sí', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('e428fd33-b54c-4404-90fb-ef5ab5787fb9', 'fee322b6-de0a-409e-a5fb-f817f0953ce3', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Atrás', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('0cf70c19-a9c1-4055-a1b8-9d746ee7a6ba', '9b745ee1-eea5-4634-964a-17bb39c9c138', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Editar', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('4b1ac96e-1dfa-45e0-b86b-2ab2819112b5', 'be954cf4-e727-4b9f-9b05-1ed39767c6cc', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Información', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('6370953e-15de-4aaa-a073-1d0f2ec8923f', 'cfec8065-a236-43bf-9506-2a1a426bc02e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Siguiente', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('e26df3a3-835b-4e67-8b6c-f52ac3de0ff9', '0337e814-94d2-4fd6-8e94-8af92eb40cff', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Guardar', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('0d0e6d5b-d869-4096-a58d-87a89b8f5141', '46d032bf-0374-4b3c-a4a4-03177086ffd3', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Contraseña', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('8ef4278b-f55e-4ed9-947c-011d695f0cf2', '49d9a9d6-0d33-4aaf-abec-3dbb0272d7d3', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'No hay archivos subidos aún', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('859936cb-5121-423e-8440-3ccd5245eea4', '687976a3-3d23-47e6-aedd-aa8611a88aa5', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Cerrar', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('077f54f0-9d94-475c-811c-572824b8289d', '53c95680-c34d-4129-a8d5-39e4ef3c0849', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Error', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('dfe54924-c73a-4817-bb38-094601545d5d', 'd5c0bec3-c226-4810-9262-18bfabb8af5d', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'hora', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('de9749a7-9a0b-4f53-b704-90818cfd61ef', 'ff193706-851c-4d95-bed6-abdce84418e2', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Mañana', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('234db541-b67c-4943-974f-251488cda054', 'f7fdc8b8-3e79-42c9-abbe-223aca448075', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Iniciando sesión...', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('b0c106ad-054a-4fcc-a045-d9ef3452ce16', '53a5288d-4168-41dd-9259-fc0703e3975f', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Cancelar', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('3d7f02bd-9939-4c16-a970-205b8deacd32', '41f7ad56-4ad2-4bef-9b98-b606d11cc476', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Eliminar', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('6ca77fb9-8bf0-4261-a8dd-853c9f608d21', '59a9c2a3-cb5b-4924-91ad-68c174b2d951', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Rol', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('e193e9df-870d-4f73-afb8-a94d763756b9', '4d2f56b1-4220-4fcb-81dd-054cb2fd4fb7', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'horas', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('0d043e34-98b2-44c5-bb42-23b4b97b3770', 'de8eaa52-a2f4-45b7-a954-d55c02a64bfd', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Configuración de Cuenta', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('78f03ec9-bb5c-490e-9358-57955a99a93a', '97a2a67f-703c-48c1-8e2d-15559274a86f', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ayer', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('0075dcf4-7fa5-4d2e-9cdf-e9dbd636518d', '31e197f0-7b49-451e-a24e-7d4d86bc4855', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Error al iniciar sesión. Por favor intente de nuevo.', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('cad16993-65ca-4829-a7a7-06499b89b870', 'b5b0d275-2280-41e6-9cb2-563e0894583e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Acceso de Cliente', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('42647d40-49c9-45c8-99cb-496d881d3189', 'fa5c8b50-5d67-44e5-9376-4021dffa2cc0', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Panel del Cliente', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('619e17b6-51c7-4fdc-94de-f9895f71724e', '671b04d6-5085-4675-b626-d17a2e0ea033', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'El recurso solicitado no fue encontrado.', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('a74bf793-106d-4fbd-ab6b-4700a602af3f', '835c0ccf-a2a0-433b-b5bf-71a5e116731c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Confirmar', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('8c38be5e-b64f-45b7-b085-f402d1bbaa61', 'aacb99b3-d4d1-4773-bf6e-97b8040518ba', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Cargando...', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('a1cf0991-b00b-4233-bf23-75d9bb23ae8f', 'f7031ad7-35ef-4f4f-9375-8323f804d381', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Éxito', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('3b284ce0-c1e5-453e-8bf9-49d8a4162397', '2cdc2bd1-667c-4ad5-9109-8bd6aae9acaf', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Advertencia', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('9132a13c-0daa-4034-ac68-857825d981a6', '0141ae63-96a6-412c-b6f2-bd56429efdd9', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ubicaciones de Servicio', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('a2280500-6c0e-45f0-912f-d579a5f4fd88', '97b242b3-44ca-415c-8b0f-47aaa4d85432', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Acceso prohibido.', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('67073bee-99ca-4312-b713-553ad4fa051c', '16466a39-65a3-4a03-9ff8-f0dfa38e5576', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Anterior', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('d39569b8-e26e-4049-851f-dd8d956592e5', 'e15cd990-458c-4fe6-8336-b4f7ad9209f9', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'English', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('008bbe9c-a722-4b62-bb5f-6b92e0257207', '8a0c1b56-b51e-4c15-8ad7-8dd55c473a59', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Español', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('eecb8d37-dda7-420b-8d0c-9b721b8a7245', '2e35359e-29ca-4858-a3ea-4bab1eb0f800', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Perfil', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('90d159a4-3772-45b0-9a80-7f820bad6178', '56781420-5a39-43d3-9d0d-924b7527652d', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Bienvenido de nuevo', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('8f25920c-20c1-4eba-b47c-091f9179b11b', '7fa76b2f-fd1b-49ef-b22f-37a8cb2fc8a6', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Buscar archivos...', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('54862472-ece8-406a-b71c-bd726e710a28', '2442e0bf-ec23-4d7e-9e5d-c8829d8f03b2', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Subir Archivos', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('f78fa0b3-0fcc-4d4d-9e36-e7fcfb351439', '4da0d984-a791-44a5-8f12-bf278f76f7dd', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Dirección', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('d270a8cd-51c3-4741-bfed-cf4f1ae3bcd5', '4b8f84ec-a74f-4f14-9ab3-a6384eadb3fb', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Contacto', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('d1d6fa6e-ffbc-41ea-ac31-9a50f4c214c8', '36c05d30-a965-453a-8a0e-ca106edd59de', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Seleccionado', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('f78b7ed7-5a35-46b6-832b-d2da38975bd5', 'abd4b842-b25b-4f22-aedb-a013a329299f', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Contraseña', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('876589e1-8aa3-4c68-b0bc-40a9e7fe8c53', '18e383d0-bb28-4392-b0d6-44ea59d2703a', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Seguridad', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('f6b8efaf-da21-481a-a2ea-05daf209d9b9', 'e9dcdd18-26c0-4cd9-bd7c-819d1de28f7c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'El correo es obligatorio', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('6c9495af-010f-494a-9db0-863b9673af4e', '564e094b-76bd-45f8-b6e8-b6859305f8a5', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Resumen', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('e3db2f14-b267-4490-aaa8-8196f3589dd7', '3d6cbbf3-caf7-4de5-a5a9-430b63b4793b', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Error del servidor. Por favor intente más tarde.', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('88fc3d56-0b3b-47ae-b2e2-3cbf396a153b', '7a282357-ebb6-4d93-86ac-9e5bd8608e0e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Archivo', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('84c30096-5dc4-4a2a-8d82-34d5fb202320', 'bbb8870e-6665-479b-85e1-1e872068b0f9', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Tamaño', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('18c93410-64c9-4d79-9432-369fe038382f', 'beff112f-5624-4b94-a4d7-f0cbda222b2a', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Subir Archivos', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('68da67a4-29eb-4fa1-8ec4-dd383c1a923f', '65ae9902-cb38-4825-890b-44dfcd0b0a77', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', '¿Olvidaste tu contraseña?', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('ea128c77-2ec7-4c61-8648-32a822d69b3b', '03693f36-c08e-43c3-8dc4-f6717078beb5', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Almacenamiento de Archivos', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('5109c4fa-07f5-40d5-8ead-45f4117cf02a', '5e85c624-0364-4098-94d8-21a3144b849f', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Error de red. Por favor verifique su conexión.', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('69265353-b2b7-40f2-9806-aa3f3781cc43', 'bcf3e98e-7a51-4065-8511-4c43a2234896', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'No está autorizado para realizar esta acción.', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('0510fc79-66a5-4229-b994-1c1cd72f5032', '424cb27c-b0b7-4af8-96eb-8b0e1ef8305c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ocurrió un error desconocido.', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('3fac379a-43bf-4922-ab98-5cc1005574e1', '4cf32760-310d-49f5-bfdb-9c6a8aeb81d1', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'No se encontraron archivos que coincidan con su búsqueda', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('621f6f00-e5fe-4581-8941-4b5cba4059f0', '09a0b3c6-7e65-4388-afbb-c07c8c2f8b4e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Eliminar', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('1908e341-c039-4f7f-9206-bc5b24bd10d0', 'f5c04d36-fe35-4d01-a4cc-dce7fceabc5f', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Tamaño máximo de archivo', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('c19201e6-891d-43de-8563-364ba99878e7', '3ff50754-e4b9-4107-9229-d87ad1d48d19', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'La contraseña es obligatoria', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('8058c2cb-927b-440a-a941-46823f6e2aa3', '0a57bc23-9a8e-469b-b91a-0378098ae626', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Acciones', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('2f9d7977-8b0a-492e-8358-8cb733287a66', 'd0111f6e-0001-4379-8574-66b23bc1609e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Arrastra y suelta archivos aquí, o haz clic para seleccionar', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('7730d898-9377-4edc-8894-2c822d74c607', '27e06732-fb28-48d3-b196-b00171b135c9', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Nombre de Contacto', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('44f688be-019c-477b-a3c2-665a9d4bfc10', '7c086960-b297-4cb1-97cf-da8b954fa404', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Solicitudes de Servicio', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('cdf67f0f-9f34-462e-a9df-5ca7912bb92d', 'f3a2fe90-8195-44fc-a632-4635820b04c7', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Programar Servicio', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('8e89ad51-6491-455a-952c-95522b3168e6', '30781212-8817-4a80-bc32-6b7fbcf77975', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Configuración', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('2e9ecc65-ee48-4a05-8c81-7684094d9dcd', 'a7fb5751-1bb5-4500-97d1-b410fa006e02', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Acciones Rápidas', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('82bb1496-b504-4538-956f-a70684feb8d8', '6af56a88-8652-4fd7-8705-af148683c20d', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Por favor verifique su información e intente de nuevo.', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('18885945-ecc6-401e-9dad-6030f6b3b0f4', 'de187c9b-6ce1-4b18-b354-94c34df62688', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ubicación', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('dd278240-df9f-4df9-97a0-98d49d7c7b8a', '7a3449cc-3bc4-4393-9c8b-f64e9d94c8b0', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Subido', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('60534c58-1ca6-4c57-b8ff-ab4313ad590e', '1e835918-0b98-4382-806e-107e6c8d94e9', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Subiendo', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('19e0f095-bfa3-45ae-aa60-163b1be8f461', '2f332cd5-f1af-48ff-8ddf-cf653796200d', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Dirección de Correo', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('1abdde72-4fff-499f-80e6-f39de811b61e', 'cdd63068-388f-4e0b-8c9d-25914e8f257b', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Número de Teléfono', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('c8854ac6-0e04-4320-94b1-90d6cc5dbeff', '6bfa747d-69d3-4eaa-92a7-aa46b288649c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Seleccionar Urgencia', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('e877787d-126a-40dc-8f12-83e6f0e9051a', '9e7f4ea7-1ba2-4fef-9463-5eb8e1da015f', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Horario estándar', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('49a4bdb4-64a0-401f-92ff-513dbc693dc7', '7ebd9774-c982-4a3a-bd54-0ca1b6f202ce', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Correo o contraseña inválidos', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('be0318fd-e629-42b7-9d04-1cb0bd0a8663', '62928b84-1931-4ea1-a231-b7bf30042846', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Panel', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('bb1bb769-2575-4d63-bb10-6af5a14f2678', '8eea0fab-3ae1-4001-8baf-75a5e9aea41e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ubicaciones de Servicio', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('3d34f007-5ff5-4815-a3d8-ab9c42a71e3b', '87d85142-e76f-46eb-99a8-bb0d12d30823', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Almacenamiento Usado', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('f0f216a8-fd6d-4539-95f9-8dd0e1189dc1', 'd68343a4-ac88-444f-a92b-2aef79774dd7', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Completando', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('f9f627e0-bb09-4a35-970b-35cdbbb9f179', 'b84261ab-6206-4ecd-9b74-f82da936b951', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Seleccionar Idioma', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('71d8e443-fc2f-4541-89a6-a2e75d08909a', '9a5feb67-e42b-4fe6-8265-c2bfa6d60155', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Error al programar solicitud de servicio', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('7049ae0e-d285-4178-bb29-35d74deed7b5', 'fc9460c5-eacd-4f0c-9dd4-2d3835fa2579', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Se aplican tarifas premium para servicios fuera del horario', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('f1734be0-7c2a-4542-9bae-28223e341ea3', '7157faa7-df50-48bd-a5a3-4d65e4297cbd', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Total de Archivos', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('980c45ff-0c56-48ef-805e-e7d524e0d8ab', 'c1e245f9-e686-475a-b047-7543201e3462', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Seleccionar Archivos', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('86f1a5c8-6540-482f-a243-ff1077052bf4', 'e8eb3164-7536-4c4e-93af-153ef9c20e2a', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Duración del Servicio', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('dcb56a11-d3c0-44de-958c-59e324d67ff1', 'a03ef002-8c51-43c0-8ebb-883f1151d31c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ubicaciones', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('ebf2db16-75da-4b21-930f-b27511fe3358', '91d4e889-d904-4a78-8370-7ea2cb5950af', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Tipos de archivo permitidos', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('66916b72-872e-4330-80d4-ef378391543d', 'f474312e-0682-4730-b3ae-6e2bc5cc9825', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Acercándose al límite de almacenamiento', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('a010cb9b-1087-4c9c-9d98-eb19bb72d11b', 'a7de3f23-61f8-478e-87a0-cf49e900c5dc', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Error en la subida', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('45309a31-6a06-45dc-b446-0e687bcc733c', '70afb4a1-d25e-49a1-9ba1-cc9c101c34da', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', '¡Solicitud de servicio programada exitosamente!', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('726152aa-f6b5-4de2-9086-15636d0c967a', 'd7a6f78a-fbc6-48b0-9163-32308f7a1159', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Prioridad', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('392465c7-3a6e-4aa6-8d15-b1d8400a303f', '46831cc9-a2a0-4617-950c-89879df59bb6', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ver/Descargar', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('aeaf92c3-bd2f-4c50-a109-1b8021484aee', '1ff722fb-13eb-4cda-b7fc-e72eb5dd8339', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Todas las Ubicaciones', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('3226825f-21fd-4432-bff4-75e03d695d57', '723f3841-eeaf-4776-8ef1-7bf67c64baa7', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'La subida excedería la cuota de almacenamiento', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('d16f11b6-abbe-4456-9a1b-e166570affbb', '216299f1-5b72-452e-a708-7e85c3cd08af', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Escaneando Virus', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('7786efef-ab47-4a8e-bb2e-34a2b77c05cf', '359fc258-0f0c-4012-849f-b8cead4b5a3d', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', '¿Está seguro de que desea eliminar este archivo?', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('ae157d87-3602-43bd-a704-6662dcbc78bd', '4a23b176-1ef6-42b7-896f-5eee9047d73f', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Subida Completa', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('7bc6b222-8d97-4704-8a6a-25d81a5b0595', '8a48231c-ffef-45de-9d68-3edcd8c23958', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Volver al Formulario', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('9f6c47d6-8ae3-4157-bd9a-4a55de6285ee', 'b9e7ed7d-951b-4720-b480-cfdc2d45d6a9', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Espacio Disponible', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('2c355774-4d76-4445-9e8f-9ad8627f3517', 'c7fddd8c-0736-4a6d-9273-bf9e92a95852', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Enviando solicitud...', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('42dbceff-e4f3-4cf3-a548-adbb938a032f', 'fd9607cc-9c5d-4180-bb22-af711b608431', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Almacenamiento Usado', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 19:39:44.298581');
INSERT INTO public.t_translations VALUES ('9a0a9806-ea80-4787-a9c9-8fd7b3d18ded', '05b18d3a-fb2b-4754-8df6-36a9a5ab9b12', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Seleccionar Fecha', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('d409dad7-be5d-42f2-af89-b227e0f0d96f', '3e0a95df-1c0a-4176-a1d0-05e617a9b1dc', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Seleccionar Hora y Duración', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-28 01:37:32.177776');
INSERT INTO public.t_translations VALUES ('41c96333-b111-4ab4-9480-ee7abc3e4658', '9d664105-c4d8-40a7-b62a-1d0acf817ffe', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Información de Contacto', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-28 01:37:32.177776');
INSERT INTO public.t_translations VALUES ('bc30f77f-9646-4315-b32e-0e96b367d7ab', 'b19c64bc-e8e3-45e2-8c01-4535a6a45b15', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Descripción del Servicio', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-28 01:37:32.177776');
INSERT INTO public.t_translations VALUES ('149f3f72-2f0a-4233-a79d-ade73fb67e7e', '33b97ebf-fe20-4e2a-818f-0097d29a0781', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Servicio Normal', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('f15ab1f2-7fe6-4784-a0d4-652093ceacd4', '73e83248-be78-4893-8bf2-83467337e5da', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Tiempo de espera de 4 horas', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('959239dd-a20d-4f9d-a729-5339547b61f9', '4d2c6bf9-63a1-46b4-8302-59e62e82d225', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Dirección de Correo', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('55e6965d-9572-4288-8c74-05fd91f77303', '8a2e143d-f1b3-44a0-8d2c-17e0bc59c9ae', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Número de Teléfono', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('519b377a-0cf0-45ab-84d4-30fa007bd707', '2d8915c3-62a3-420d-9bc5-29a66a73c3b1', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Solicitudes Activas', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('d6881c7d-9400-410f-b5ca-47bf32667379', '32bb02ac-259b-45ee-8dee-0db21163be7c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Espacio Disponible', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('965541b9-60af-4d64-ab9e-099995b03c67', 'd7bfb1c2-8530-4f90-9bc5-098810310564', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Programar Otra', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('a7ee6c12-dbd6-4de5-b790-5babc621d145', '4a53bd3a-7f6c-4985-99eb-654ab3bca3cc', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Programar Solicitud', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('866502bd-d974-4fac-961d-79bcbf038aaa', '5b09b22f-9708-4650-805c-9962e1519d32', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ingrese nombre de contacto', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('f8db85c3-9744-4709-83da-ab946db6a5e9', '98a95905-b6c4-4a7a-94ec-0f47a48cf0b4', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Detalles de la Solicitud', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('845c45d3-dc98-435e-8b77-49b173409c0e', 'e88caaa4-ee43-4f0e-a898-6e8405758b9a', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Apellido', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('9ec4a221-090e-47e9-bba5-d01eafd970a9', 'bf97b3f1-a883-490f-98b4-adda37f2cc17', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ingrese dirección de correo', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('ea745d7d-7f5e-4c7f-9d16-3d2c0fc125f0', '17f63970-1c30-416d-be48-ed2df7ce1e0f', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ingrese número de teléfono', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('c443c2ce-ecdb-4d43-92f7-9007803d0309', '44f89793-e448-4a55-a3fc-40d76b5f34a7', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Nombre', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('59d6445d-21e2-4c81-907c-243271693ca5', '0392dfad-9d3b-4677-a119-f515c69bd5a4', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'La dirección de correo ya está en uso', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('787f723c-ebb4-4872-8587-67ca8af6514c', 'b4fe8ede-05a1-48f4-a2f4-25adb8834efc', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Todos los campos son obligatorios', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('eac8957d-4b38-492f-98ef-1bc91764a415', '4d8dd1e6-f977-4ddf-9c43-4d7e83d63213', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Guardar Cambios', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('573add15-4f69-44e8-8308-bfad742f30d6', 'a3e8fc64-bf78-450f-96be-b477e72b88fa', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Error al actualizar información de contacto', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('7a4e59bb-fccb-44e8-bd23-3beab9e319fa', '9885cc25-8a22-40a5-bc9b-3f6fe9d3e5e1', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Formato de correo inválido', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('21c58e8d-7275-459a-8107-7e48236692d9', 'b7fc47c5-c688-44e0-8f21-8ec9df029529', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Información de contacto actualizada exitosamente', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('aa130d38-eb54-4fcb-9079-31d7e2df24c4', '5af19590-945b-448c-8836-0b8cfbdd195c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Nombre, apellido y correo son obligatorios', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('eadbbf59-e2f9-4908-b4af-29ec410064f5', 'bad75658-33fc-469f-8493-f8673f7188a6', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ingrese dirección de correo', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('e3e35593-5b72-44d2-8309-ebddc2a09c2f', '0bafb658-8c4c-4483-ba2b-94275fea7344', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ingrese número de teléfono', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('c9aabc8c-69c5-43f9-bfc7-df063131ac7d', 'eda993f5-42b9-452c-8d48-fd259bbd8363', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ingrese apellido', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('908329c6-1f7c-4dc7-866c-c75716e5084a', '772881cb-d251-43ca-ac20-c8f0786ccc13', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ingrese nombre', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 10:29:04.992898');
INSERT INTO public.t_translations VALUES ('9501feff-4edf-4afe-ba81-99c18290c081', '6bfeee4c-f97c-407c-9413-075869b4002c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Failed to delete file', true, NULL, NULL, '2025-09-27 19:20:43.343786', '2025-09-27 19:20:43.343786');
INSERT INTO public.t_translations VALUES ('f91314d4-6fc1-42cf-8362-6ce862712ccc', '6bfeee4c-f97c-407c-9413-075869b4002c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Error al eliminar archivo', true, NULL, NULL, '2025-09-27 19:20:53.763556', '2025-09-27 19:20:53.763556');
INSERT INTO public.t_translations VALUES ('c9dd26a8-6408-4441-b30d-895ba476da5c', 'd0ce0147-75f5-407a-938a-97f7231c42bd', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Page {{current}} of {{total}}', true, NULL, NULL, '2025-09-27 19:25:11.598431', '2025-09-27 19:25:11.598431');
INSERT INTO public.t_translations VALUES ('8cd5ea92-343c-4300-bc8e-8bd70433e9a5', 'd0ce0147-75f5-407a-938a-97f7231c42bd', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Página {{current}} de {{total}}', true, NULL, NULL, '2025-09-27 19:25:21.438552', '2025-09-27 19:25:21.438552');
INSERT INTO public.t_translations VALUES ('fba1f72b-8dee-450d-ab2d-adb94f7f5d94', 'ad64defc-831f-4ad2-a5be-c60305a182fa', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Maximum {{count}} files', true, NULL, NULL, '2025-09-27 19:26:48.238953', '2025-09-27 19:26:48.238953');
INSERT INTO public.t_translations VALUES ('46b0fd7e-bdfe-4960-909a-52dfe7f0d35d', 'cbff28b7-ce38-490c-8485-27d9fda332e1', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Clear Completed', true, NULL, NULL, '2025-09-27 19:26:48.238953', '2025-09-27 19:26:48.238953');
INSERT INTO public.t_translations VALUES ('42fe47ed-def4-45eb-a6c0-316dffd19f09', 'b00c23fa-9d6b-4dc6-b527-ff62869cc5fd', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Upload Progress', true, NULL, NULL, '2025-09-27 19:26:48.238953', '2025-09-27 19:26:48.238953');
INSERT INTO public.t_translations VALUES ('93f0aadb-8905-45d1-8214-0ad68f499a05', 'ad64defc-831f-4ad2-a5be-c60305a182fa', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Máximo {{count}} archivos', true, NULL, NULL, '2025-09-27 19:26:56.358278', '2025-09-27 19:26:56.358278');
INSERT INTO public.t_translations VALUES ('5dbbe9f8-a1b9-4b05-9aab-4f7433ed68d7', 'cbff28b7-ce38-490c-8485-27d9fda332e1', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Limpiar Completados', true, NULL, NULL, '2025-09-27 19:26:56.358278', '2025-09-27 19:26:56.358278');
INSERT INTO public.t_translations VALUES ('957cb9d3-a53c-4707-be0d-1b4adaea03d9', 'b00c23fa-9d6b-4dc6-b527-ff62869cc5fd', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Progreso de Subida', true, NULL, NULL, '2025-09-27 19:26:56.358278', '2025-09-27 19:26:56.358278');
INSERT INTO public.t_translations VALUES ('ad6c3c2d-707b-40e7-9443-179dc54ebc14', '933c3e2d-51f7-4b27-8af5-5b2ed588726d', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Site', true, NULL, NULL, '2025-09-27 19:27:43.863999', '2025-09-27 19:27:43.863999');
INSERT INTO public.t_translations VALUES ('6c577493-6f3b-4395-8c89-5152a2462df0', '8844b984-4177-424a-88be-134dcb6ac7bb', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Business', true, NULL, NULL, '2025-09-27 19:27:43.863999', '2025-09-27 19:27:43.863999');
INSERT INTO public.t_translations VALUES ('171f0da8-7423-45fa-a80e-630c943c5886', '74dfef88-3cb5-4f4a-b8cc-97e738b5c07b', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Access Level', true, NULL, NULL, '2025-09-27 19:27:43.863999', '2025-09-27 19:27:43.863999');
INSERT INTO public.t_translations VALUES ('6541ee7c-b475-4380-9c03-532889b5fc53', '933c3e2d-51f7-4b27-8af5-5b2ed588726d', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Sitio', true, NULL, NULL, '2025-09-27 19:27:51.038322', '2025-09-27 19:27:51.038322');
INSERT INTO public.t_translations VALUES ('723d86a7-e1b5-4f9a-b723-c7fcee69f760', '8844b984-4177-424a-88be-134dcb6ac7bb', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Empresa', true, NULL, NULL, '2025-09-27 19:27:51.038322', '2025-09-27 19:27:51.038322');
INSERT INTO public.t_translations VALUES ('bb71e6f1-ff8a-4f8c-b8c8-8be57c48549b', '74dfef88-3cb5-4f4a-b8cc-97e738b5c07b', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Nivel de Acceso', true, NULL, NULL, '2025-09-27 19:27:51.038322', '2025-09-27 19:27:51.038322');
INSERT INTO public.t_translations VALUES ('a75b21c0-b620-4fa4-9aca-8f13e4104e8d', '27cb4e1f-048a-4ebe-a9de-e7acec1bdcf3', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'This section is coming soon. We are working on implementing this feature.', true, NULL, NULL, '2025-09-27 19:32:16.243369', '2025-09-27 19:32:16.243369');
INSERT INTO public.t_translations VALUES ('4b21ea7b-69cc-4ce0-83c4-3ec973d8f43f', '740651a2-6ad7-4343-a505-9c008f019939', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Manage your service requests and view your account information.', true, NULL, NULL, '2025-09-27 19:32:16.243369', '2025-09-27 19:32:16.243369');
INSERT INTO public.t_translations VALUES ('cabd3fc8-a049-4304-b37f-e4f013340c4f', '4c4f7faf-23e3-4b04-833d-3e18cd831b93', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Please select a date first', true, NULL, NULL, '2025-09-27 19:32:16.243369', '2025-09-27 19:32:16.243369');
INSERT INTO public.t_translations VALUES ('4ba9992a-b4e2-434d-beb7-a6d4c2a1edd9', 'f07b516e-c2eb-4215-a96f-9ce4082e8765', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'View Requests', true, NULL, NULL, '2025-09-27 19:32:16.243369', '2025-09-27 19:32:16.243369');
INSERT INTO public.t_translations VALUES ('eba221da-0cbb-4dd2-ae7d-280d115b1f6b', '27cb4e1f-048a-4ebe-a9de-e7acec1bdcf3', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Esta sección estará disponible pronto. Estamos trabajando en implementar esta función.', true, NULL, NULL, '2025-09-27 19:32:25.75815', '2025-09-27 19:32:25.75815');
INSERT INTO public.t_translations VALUES ('494f550a-2ace-438b-b5d0-bd8b5b381eda', '740651a2-6ad7-4343-a505-9c008f019939', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Administra tus solicitudes de servicio y consulta la información de tu cuenta.', true, NULL, NULL, '2025-09-27 19:32:25.75815', '2025-09-27 19:32:25.75815');
INSERT INTO public.t_translations VALUES ('4b8173f1-5043-4f44-a935-2058c9ca4620', '4c4f7faf-23e3-4b04-833d-3e18cd831b93', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Por favor selecciona una fecha primero', true, NULL, NULL, '2025-09-27 19:32:25.75815', '2025-09-27 19:32:25.75815');
INSERT INTO public.t_translations VALUES ('a9caff9c-d1dc-47de-855a-8c91f1fb8051', 'f07b516e-c2eb-4215-a96f-9ce4082e8765', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ver Solicitudes', true, NULL, NULL, '2025-09-27 19:32:25.75815', '2025-09-27 19:32:25.75815');
INSERT INTO public.t_translations VALUES ('49e029a9-f5cd-411c-80dc-d069f1019427', '778b48c7-3e08-4d1f-92e6-9d99f5568045', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Primary', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 19:39:34.238342');
INSERT INTO public.t_translations VALUES ('1e5274ef-0e45-4165-b994-7b8d2d2dc9c2', '866ead24-4800-483b-889d-a7a7b6866aa2', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'No accessible locations found.', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 19:39:34.238342');
INSERT INTO public.t_translations VALUES ('12dfcede-f028-4044-809d-57eef3bce6bd', 'fd9607cc-9c5d-4180-bb22-af711b608431', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Storage Used', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 19:39:34.238342');
INSERT INTO public.t_translations VALUES ('a07b6e6e-6e98-4417-b9cb-0f5bc1b1b8c9', '567904e9-271f-4943-a886-2d139c4d33eb', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Quick Actions', true, NULL, NULL, '2025-09-27 19:39:34.238342', '2025-09-27 19:39:34.238342');
INSERT INTO public.t_translations VALUES ('64498ce4-91ab-4f0b-a74d-5b1b785ed7c9', '778b48c7-3e08-4d1f-92e6-9d99f5568045', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Principal', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 19:39:44.298581');
INSERT INTO public.t_translations VALUES ('b3b57c93-317a-477d-9387-172181b55662', '866ead24-4800-483b-889d-a7a7b6866aa2', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'No se encontraron ubicaciones accesibles.', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-27 19:39:44.298581');
INSERT INTO public.t_translations VALUES ('e71ab34a-f3f8-4b6d-ac9c-e949bfa68472', '567904e9-271f-4943-a886-2d139c4d33eb', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Acciones Rápidas', true, NULL, NULL, '2025-09-27 19:39:44.298581', '2025-09-27 19:39:44.298581');
INSERT INTO public.t_translations VALUES ('1ef88e4d-0b7d-4cd4-a275-6d1408756410', '072186d3-933c-428d-9cf2-383038b4a2fe', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Today', true, NULL, NULL, '2025-09-27 19:39:57.358718', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('e4701737-e417-466f-ac50-6003cca5a463', '26890393-f8e1-4750-b848-5fa558fa06da', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Select a date, time, and service details for your request.', true, NULL, NULL, '2025-09-27 19:39:57.358718', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('dc79fc57-5c70-482a-ad7c-41745b786fa1', '05b18d3a-fb2b-4754-8df6-36a9a5ab9b12', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Select Date', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('de4fd658-26fb-444c-94e6-eba83dac8c4f', 'ff652353-95cb-4f2e-bd93-86e6b1cdb518', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Service Urgency Level', true, NULL, NULL, '2025-09-27 19:39:57.358718', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('bbe152d6-8523-451f-96f1-cec8e4029a35', '69c9025a-6e61-40ba-bf2a-11e50fbe52b3', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Advanced Time Slot Picker', true, NULL, NULL, '2025-09-27 19:39:57.358718', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('a1ff6b91-f009-4514-954f-62679a931be2', '424b8a6d-8b18-4d77-93df-dffe4e19ed4b', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Premium Service', true, NULL, NULL, '2025-09-27 19:39:57.358718', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('8c97c8d0-224e-4cba-a30d-98c36c28254f', '31163d85-9a68-44ab-ae00-6884db9ca8cb', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Failed to submit service request. Please try again.', true, NULL, NULL, '2025-09-27 19:39:57.358718', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('c767dc69-104d-490d-a814-c137cdec1fc9', 'e46d3c6f-024e-43c2-9bf7-d2126531f199', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Service', true, NULL, NULL, '2025-09-27 19:39:57.358718', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('d539e90d-b558-4af5-b411-1aba9b00176e', '71430bf6-8def-4f08-975b-1fbca8108dd6', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Priority service - 4 hour advance notice required', true, NULL, NULL, '2025-09-27 19:39:57.358718', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('3d69d3b6-11ca-4853-93e4-3bd1a161fdef', 'e76b7858-e58c-4d55-80d6-201c5686eb12', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'View real-time availability and book instantly', true, NULL, NULL, '2025-09-27 19:39:57.358718', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('c0569950-e427-4657-bf28-fdef6aa96cd9', '5ef962f9-2bc3-4213-9dc2-53ce04931778', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Service Request Submitted', true, NULL, NULL, '2025-09-27 19:39:57.358718', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('b7afb8e8-05b6-46fd-8c22-4602dbfb0620', '91741dc2-bd1c-4880-944d-713e5c8ad04c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Standard service request - 24 hour advance notice required', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('2d8e34ea-7e56-4dab-a8db-48c80077b520', '303896c9-cf27-4cf7-a49d-f26bf18d3753', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Your service request has been submitted successfully. You will receive a confirmation email shortly.', true, NULL, NULL, '2025-09-27 19:39:57.358718', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('8ce51560-a8f5-402e-aade-c56caebe7051', '034786ef-5eda-46c5-93bb-a869fc53992e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Emergency service - 1 hour advance notice required', true, NULL, NULL, '2025-09-27 10:29:04.322999', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('83ee3701-317a-4363-a6ec-d5b7f4799cfa', '870179e9-e26d-4741-b424-a3994ec21fcd', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Schedule Another Request', true, NULL, NULL, '2025-09-27 19:39:57.358718', '2025-09-27 19:39:57.358718');
INSERT INTO public.t_translations VALUES ('025b2cf1-89a0-4207-a57a-89cd626d1425', '7429ae15-bc9f-4273-8f8f-f21b7556308b', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Programar Solicitud de Servicio', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('4fa63a52-be6e-4f98-86d8-5f5de6b134da', '072186d3-933c-428d-9cf2-383038b4a2fe', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Hoy', true, NULL, NULL, '2025-09-28 01:37:09.093025', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('6fcdc0be-c75b-4ab3-b9e7-7b69f1880b07', '26890393-f8e1-4750-b848-5fa558fa06da', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Seleccione una fecha, hora y detalles del servicio para su solicitud.', true, NULL, NULL, '2025-09-28 01:37:09.093025', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('162ac258-e5ad-41fa-820b-f9819c8ff7d3', 'ff652353-95cb-4f2e-bd93-86e6b1cdb518', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Nivel de Urgencia del Servicio', true, NULL, NULL, '2025-09-28 01:37:09.093025', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('518efd87-0cf4-4390-af38-57f5d542a589', '69c9025a-6e61-40ba-bf2a-11e50fbe52b3', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Selector Avanzado de Horarios', true, NULL, NULL, '2025-09-28 01:37:09.093025', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('9912872b-e841-415c-9db9-cc62625871c2', '31163d85-9a68-44ab-ae00-6884db9ca8cb', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Error al enviar la solicitud de servicio. Inténtalo de nuevo.', true, NULL, NULL, '2025-09-28 01:37:09.093025', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('d3e63c8e-99e2-4a26-bf4e-03abf63907c4', 'e46d3c6f-024e-43c2-9bf7-d2126531f199', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Servicio', true, NULL, NULL, '2025-09-28 01:37:09.093025', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('55d797cb-b984-40ec-bdc0-5504a4d09145', '71430bf6-8def-4f08-975b-1fbca8108dd6', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Servicio prioritario - se requiere aviso con 4 horas de anticipación', true, NULL, NULL, '2025-09-28 01:37:09.093025', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('b17a3053-bd0e-4a8e-9c61-e1b9947cc603', 'e76b7858-e58c-4d55-80d6-201c5686eb12', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ver disponibilidad en tiempo real y reservar instantáneamente', true, NULL, NULL, '2025-09-28 01:37:09.093025', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('244e9292-bd2f-41e9-addb-a290aeb0f0df', '5ef962f9-2bc3-4213-9dc2-53ce04931778', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Solicitud de Servicio Enviada', true, NULL, NULL, '2025-09-28 01:37:09.093025', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('ad548c3a-f677-499b-8afe-e4843d0a73b0', '91741dc2-bd1c-4880-944d-713e5c8ad04c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Tiempo de espera de 24 horas', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('511134e7-1d7c-4d18-9b71-bd5a7887cfd7', '303896c9-cf27-4cf7-a49d-f26bf18d3753', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Su solicitud de servicio se ha enviado exitosamente. Recibirá un correo de confirmación en breve.', true, NULL, NULL, '2025-09-28 01:37:09.093025', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('9f0d7f33-4b62-412d-8f09-8f0eb44cc9d7', '034786ef-5eda-46c5-93bb-a869fc53992e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Tiempo de espera de 1 hora', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('53d7b4f6-cbbd-4350-b70b-e96246ddd190', '870179e9-e26d-4741-b424-a3994ec21fcd', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Programar Otra Solicitud', true, NULL, NULL, '2025-09-28 01:37:09.093025', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('c84c282d-3f6d-486d-bd33-619b6d722801', 'b12415f5-d9d5-4ae1-adc9-0545a5ad6555', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Service Duration', true, NULL, NULL, '2025-09-28 01:37:20.883192', '2025-09-28 01:37:20.883192');
INSERT INTO public.t_translations VALUES ('aaaacb44-4a44-4da8-b8f1-0d794313ad89', '480463ff-ab3f-4936-b2cd-9bd5715e7382', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Service Location', true, NULL, NULL, '2025-09-28 01:37:20.883192', '2025-09-28 01:37:20.883192');
INSERT INTO public.t_translations VALUES ('151694e0-42af-409f-8b98-9d177b86af4a', 'a114fafa-4bd5-49d4-9604-12cdc199d23a', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Attach Files (Optional)', true, NULL, NULL, '2025-09-28 01:37:20.883192', '2025-09-28 01:37:20.883192');
INSERT INTO public.t_translations VALUES ('e09f4bf5-baa4-4285-86ff-1a5dbdea4c5c', '9a800b9d-b720-41a1-bcef-4ffbb7510dd8', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Contact Name', true, NULL, NULL, '2025-09-28 01:37:20.883192', '2025-09-28 01:37:20.883192');
INSERT INTO public.t_translations VALUES ('a58fc797-3985-418d-8cf0-96564e555a12', 'db051983-f4bf-4487-91b5-25850483f777', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Phone Number', true, NULL, NULL, '2025-09-28 01:37:20.883192', '2025-09-28 01:37:20.883192');
INSERT INTO public.t_translations VALUES ('77101454-6fd5-4914-8388-78cf6d5a3a27', '58d49b92-747f-480a-877c-33849892093c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Email Address', true, NULL, NULL, '2025-09-28 01:37:20.883192', '2025-09-28 01:37:20.883192');
INSERT INTO public.t_translations VALUES ('30849c75-77f6-400a-99d7-a36f5c91b86a', '20be57d9-6fed-4598-90a1-76942585e3ee', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Select service type', true, NULL, NULL, '2025-09-28 01:37:20.883192', '2025-09-28 01:37:20.883192');
INSERT INTO public.t_translations VALUES ('cb0a71e2-6d49-47cd-8bb1-002fd5d9d38c', '56b7e6a7-fab3-46a4-a24a-e8a6ec493694', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Describe the issue or service needed...', true, NULL, NULL, '2025-09-28 01:37:20.883192', '2025-09-28 01:37:20.883192');
INSERT INTO public.t_translations VALUES ('ed0c8393-f032-43b2-b1ad-37716acf039c', 'b12415f5-d9d5-4ae1-adc9-0545a5ad6555', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Duración del Servicio', true, NULL, NULL, '2025-09-28 01:37:32.177776', '2025-09-28 01:37:32.177776');
INSERT INTO public.t_translations VALUES ('f139287b-104d-44df-861c-ef5bc97d7477', '480463ff-ab3f-4936-b2cd-9bd5715e7382', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ubicación del Servicio', true, NULL, NULL, '2025-09-28 01:37:32.177776', '2025-09-28 01:37:32.177776');
INSERT INTO public.t_translations VALUES ('35ee5cd7-d778-42c7-9709-e69f4c2987a6', 'a114fafa-4bd5-49d4-9604-12cdc199d23a', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Adjuntar Archivos (Opcional)', true, NULL, NULL, '2025-09-28 01:37:32.177776', '2025-09-28 01:37:32.177776');
INSERT INTO public.t_translations VALUES ('4285a7d5-82f1-4456-bc9c-5900568bb38a', '9a800b9d-b720-41a1-bcef-4ffbb7510dd8', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Nombre de Contacto', true, NULL, NULL, '2025-09-28 01:37:32.177776', '2025-09-28 01:37:32.177776');
INSERT INTO public.t_translations VALUES ('80069a4c-a1bd-41d8-8743-42b5f4e4f783', 'db051983-f4bf-4487-91b5-25850483f777', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Número de Teléfono', true, NULL, NULL, '2025-09-28 01:37:32.177776', '2025-09-28 01:37:32.177776');
INSERT INTO public.t_translations VALUES ('7646fdd2-9fbc-46b2-916a-f5648332b5c4', 'b64664d7-11f9-4055-ac33-74181f047a7e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Tipo de Servicio', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-28 01:37:32.177776');
INSERT INTO public.t_translations VALUES ('a17b4d2d-165e-40b3-ac17-01302a4cb04b', '58d49b92-747f-480a-877c-33849892093c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Dirección de Correo', true, NULL, NULL, '2025-09-28 01:37:32.177776', '2025-09-28 01:37:32.177776');
INSERT INTO public.t_translations VALUES ('076999f2-7d7c-4957-9ef0-ec6b49dbb4b7', '353f338c-6f8e-4c28-8808-3e56b354d560', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Seleccionar una ubicación', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-28 01:37:32.177776');
INSERT INTO public.t_translations VALUES ('1c176c93-4ce4-4e24-94b6-7b3b2b86f73d', '20be57d9-6fed-4598-90a1-76942585e3ee', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Seleccionar tipo de servicio', true, NULL, NULL, '2025-09-28 01:37:32.177776', '2025-09-28 01:37:32.177776');
INSERT INTO public.t_translations VALUES ('aef70dd6-6c0f-4849-8ec4-6e4d6cf8eff3', '56b7e6a7-fab3-46a4-a24a-e8a6ec493694', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Describa el problema o servicio necesario...', true, NULL, NULL, '2025-09-28 01:37:32.177776', '2025-09-28 01:37:32.177776');
INSERT INTO public.t_translations VALUES ('7408fb5e-43c5-4945-a35b-88d0ebde5e2a', '5281521c-c530-4f4a-9bf4-13f30dbd1060', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'New Password', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('63324b8b-bdc0-4aee-b2f3-f88004ad1d8f', '66ab81f8-7edc-4d7b-8eff-25ac14bedc3c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Profile', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('eeddc1a4-ee33-40c0-a4ca-fec0acb61a62', 'a7fb9eb9-03d3-4e51-a175-35b18bbada5c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Email Address', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('2156460d-0093-419c-9b41-e3fffa45f939', '6ed8062f-06bd-42d8-8ce1-42ce5603e9cf', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Phone Number', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('40c2e4df-2d77-4563-912d-4c9872c73797', 'b89bd598-feea-416e-acc7-6eb02d97e827', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Password', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('e28a4c0c-708e-43fe-bf2b-bdf35cd2c22f', '97947593-cf52-414d-94a0-8728a41c4ff7', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Security', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('0d71301c-722b-4abe-b40e-ccb04acda224', '629b3549-5e9b-480a-a3c7-c36e3ae7f96d', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Confirm New Password', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('a0d29b0b-726a-431e-97a1-b00147b336c4', '7fea9d09-f2f1-46e3-8d16-b00a78422f5b', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Current Password', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('992db24e-5742-40c4-8a03-e2757fcd4dbb', '391e20da-9cf6-4c99-8ca3-3976134d9ddb', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'New passwords do not match', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('e162d9ab-d7f9-42e0-89b5-64fa46d36532', '5d3144b8-9811-41d9-abc8-56f4a031fc71', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Last Name', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('d7f5b99d-747a-4f5b-b91e-a1d171efb14d', '48f1e05a-b831-439c-800a-eb41b1981876', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Failed to load user data', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('0fff8dfd-8ea3-42f6-8255-d128510f4a18', '33351e41-ae85-482d-a816-bd35688d0025', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'First Name', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('52a689d0-4590-4764-ac07-a4ccbf4207b7', '37202545-6f6c-4428-8603-c45294e1b972', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'One number', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('21c9fbb0-4c38-42ac-9bde-c7015a7f83af', '210cce29-01f9-401e-9177-10c6b5a7941e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Save Changes', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('3c3e0523-f6fb-45a4-9d6a-a13b60ae3edb', 'ebe04479-665d-4620-a7bc-1474c829f397', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'One special character', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('1725543f-32d3-43a8-917f-a7a6a7bd29e8', '9c053480-b318-4246-8212-56acfd9407f9', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Failed to update contact information', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('bf976426-a476-44f4-b493-792f5bfdc6e6', '629cdb12-bccc-49d0-a859-b90c992f78b0', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Change Password', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('e0454716-f8e2-44e0-b3dc-f1c157290668', '2d55306a-42da-4866-bd64-3499fd384681', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Failed to change password', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('0dd94e40-8233-45f0-bc48-07dc00a7c925', 'c8d2e9e9-906d-440d-bad9-73a279eeb7b2', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Servicio de Emergencia', true, NULL, NULL, '2025-09-27 10:29:04.992898', '2025-09-28 01:37:09.093025');
INSERT INTO public.t_translations VALUES ('452949c0-a34e-4e34-b817-5ba6e8f532e3', 'a68a2f82-33c1-4661-88d9-5f9cee7884d1', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Password Requirements', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('b8b084ae-054b-4bdd-81bb-0be7a000aff0', '02c6ae33-d0a6-43c8-9ec0-89e0a6afc878', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Contact information updated successfully', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('4543233d-c9d3-47a6-8393-93bef0543d08', '1c09a73b-f9bd-4a45-ace7-615425e5cf8e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Password changed successfully', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('6542e8eb-dd31-43dd-8200-5efb41dd726c', '1b766671-9708-4236-9380-fb22bec82753', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'One lowercase letter', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('58f284fe-5a54-4a97-94c6-9e2bc876d978', '44dddf07-3a8f-4e79-b2b7-3362ab46a7cb', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'At least 8 characters', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('31dd2e6c-29f3-4772-9228-7d44b5982366', '16f68da4-3b83-4bea-a7f0-f0d84d547c4e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'One uppercase letter', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('62dae62c-8ab3-4d77-ac0d-ea3730dca736', 'b9dba5ac-e748-4428-8371-2f2f03cfcf02', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enter new password', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('70563558-0db1-4891-89c9-4c1633bf4748', '4f02181f-e58f-4d48-ba6e-d8d7d583c9e7', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enter email address', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('1f5a1257-e0f0-4b40-80e2-ab459119bc98', '93801e5e-a34d-43e0-9c32-e8da7b83902a', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enter phone number', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('4ac84821-8a9b-4e6f-bc18-00029e1d2289', 'ccae52cd-12e4-49b1-b425-3da005ca8051', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Confirm new password', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('02dc4f19-5791-43d8-a424-e42ecaf2e351', '92aceccc-5988-4459-91f3-587d48899efd', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enter current password', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('bc3c38ab-c901-4856-a268-6a55316d7f76', 'f6c9edff-5a0a-404a-829d-2d03fced402c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Password does not meet requirements', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('373accbd-623a-48a7-8eda-a9c8e15e7c56', '8a58eb77-8caf-424f-bd5c-c4dcdb3a5a5d', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enter last name', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('2dff4b5e-3dc6-4a73-bfa4-cc632e1bc771', 'e4f28088-9bc7-42e9-8ade-d729b3ae0bcc', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enter first name', true, NULL, NULL, '2025-09-28 01:37:45.963219', '2025-09-28 01:37:45.963219');
INSERT INTO public.t_translations VALUES ('3398bd4a-7905-4a82-ba8d-dde421a980fb', 'f59906e7-677b-4f47-a2c0-df3155274f35', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Multi-Factor Authentication (MFA)', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('a98a72eb-2dc9-4de7-8cb3-3d4e01f05a0a', 'd726d9ec-ec99-4987-b91c-1c64f401ec0c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Set Up MFA', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('a50ea82f-005b-4fc5-b2e0-dccf3e010f95', '9c782085-1532-467d-a92d-a6fcb4e8d418', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enable MFA', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('591b4b80-d364-4e16-98b4-5cb80c0a2768', '9069bf07-a212-4581-8cec-5916b5f6b3a9', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Disable MFA', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('4182dcf6-c344-428a-aba5-8014224891c0', 'cfc88f8a-8de6-4333-a38e-9539d6db612f', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'MFA enabled successfully', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('19785860-92b4-4261-9cce-6b1c8a7feda2', 'c401a304-9a09-46a9-bbef-e125fb736d8e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Resend Code', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('4bccb987-1802-464f-bd77-5b96d1a8c180', '216bbaba-148b-426e-aa34-d1632214a4cc', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'I have Saved These Codes', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('e37b30fa-faba-4a61-b52b-4445fd11684d', 'eaac95bb-0512-41a0-9a67-82fec4548b2e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Backup Codes', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('7fa8cce6-5d70-41e3-bd42-5eaf595eef16', 'c84043c3-dce8-45fc-933f-a24ae7230b19', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Invalid verification code', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('39995dcf-5e04-4c11-ad86-bad1898647be', '595c5601-f4c4-45d3-9c11-f25f6af0d2d1', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'MFA disabled successfully', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('02ad921d-fc42-4337-a6e5-27f85b9fa757', '6906632c-d8dc-472b-8221-e73f0edf1297', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Verify', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('c1f46fef-40b4-4d65-bf60-520a94225ef7', '3f4d82a7-5bcf-43c4-a900-4b81adce9d9e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Failed to verify code', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('2ecbd970-d6e0-4cf1-9327-4dcf9818907f', '0bfff773-4163-4ce2-8a63-87ac9b8e8eee', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Add an extra layer of security to your account by requiring email verification for login.', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('691aa0c7-f91d-46d6-8506-b3dc62e8552a', '07e4ede3-c96a-49cc-b860-c11b527fee5d', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Failed to send verification code', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('103b67b6-a2af-42b1-aee4-9cd449aca54a', '7aab7bf1-8817-447f-8fc9-dc712af5445b', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Save these backup codes in a secure location. You can use them to access your account if you can not receive email codes.', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('d653eb0c-4aa2-44e7-b4db-c30b5d9367ed', '1523f677-8904-4bb9-98a3-d2fb848e5468', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enter 6-digit code', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('aada9ddb-b181-49a1-80a5-6b3af608da19', '3cf7aab6-8f13-4b41-bc2a-2740fa62587c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Failed to disable MFA', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('07ef3fdc-7f86-4da0-a676-c6fffbdb77e5', '71dea57e-1d28-4f4a-9148-7c0a141f065a', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Today', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('f7279b4b-7a33-4132-a674-7a5ff4be611d', 'd73f371d-7203-4752-91ff-56065ddcdef4', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Fri', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('ecf7ac7a-16b2-4ed5-a2b2-d1069a48dee2', '4697ad1f-57fc-4a1c-8710-2f9e6cd72f6c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Mon', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('7102efce-b185-4391-81fe-bd11d0ccd9b2', 'c4d848ad-4ea6-4580-b949-02a9a986f3bc', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Sat', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('20c48f2e-0c3a-450a-9540-3b3fcb028b4f', 'feb03b3d-3c3a-4d0d-95a7-cea568d3e7e5', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Sun', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('cdfda63b-bd02-4be7-94c8-834d83f6ac12', 'a2bd4b30-c0f7-4e40-843f-b093085e7b0e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Thu', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('8eeee88d-94e0-4b4c-a429-ade0d2a23d3a', '4c5ca33c-15f4-4470-a45d-a19f23f3357d', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Tue', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('c4acb93d-a118-4052-a041-7ca30f64dab5', 'c9c20280-0ae2-4959-8c74-891392d497f8', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Wed', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('52efb772-02d1-4afe-99dd-3d601903c4a0', 'd38b33c9-e1b0-417b-bb83-e6ebbc215d2e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Day', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('e223499a-69a5-460e-b3e2-d3b16f6ff068', '142c402e-c6fc-4651-91cf-f56dc627be4f', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'May', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('67203a6c-f5bd-48bb-bc72-ed9c65d2b6fc', '1b20e267-1da1-421b-b0da-fcf14338e90a', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Week', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('3092becb-3812-4361-9244-f70cd354d338', '12791721-8f99-4a67-af16-99acd9678ae1', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'July', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('a7119244-06ad-472c-97bb-a75ffabbbca5', '204f7957-90c6-4054-8441-dd12b1d4791c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'June', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('cefa9ef9-9165-4fb4-a46b-c9c01e18c726', '011a0309-1dda-44ac-9b9e-d8fd11ff2730', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Month', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('fc0ca45b-226f-4995-b616-fc19cfc76f74', 'd2ad0b9c-7a36-454e-9bfe-c4440a3f72eb', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'April', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('77746fae-785f-4b57-956d-dc8ab9a011f3', '52cdf9a1-36ab-4323-b251-769d0381b6f4', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'March', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('07c0c28a-3405-4753-a54c-85e2558fb721', 'e4a56e00-c8e4-4076-bd76-7b0f016bbdfc', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'August', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('a9cc5582-1e82-489e-b2d1-9c7286c21535', 'd14f006b-cd2c-4add-9128-984f7ee4093c', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'January', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('a52042b6-439f-400c-b392-65ab834f1676', '7f7d6fcd-f778-4656-a5b7-16e0a5c18cb5', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'October', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('04dd9109-0222-4798-b4a9-42a24098f6f8', 'fcd19207-0433-4488-93a8-90a67b1fc3df', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'December', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('cd4d9475-736c-494a-a6e1-24c197778f98', '3409e32f-fd07-4f13-9822-a1e394b63f0b', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'February', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('7a31538f-9c73-41f0-b068-873ba5eb77f0', '7be511e3-5089-4fcc-b9c5-938e2fdec855', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'November', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('383c5575-fcb9-408b-8b71-e4d3a717aa27', 'd7bc5511-04c4-412c-bccc-43cbffd9300a', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'September', true, NULL, NULL, '2025-09-28 01:43:33.904001', '2025-09-28 01:43:33.904001');
INSERT INTO public.t_translations VALUES ('5e5942d1-b398-4ea9-bb25-f2960af571be', '71dea57e-1d28-4f4a-9148-7c0a141f065a', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Hoy', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('617adaca-8816-4256-b6c8-8425706168ba', 'd73f371d-7203-4752-91ff-56065ddcdef4', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Vie', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('5286a11e-61c4-492d-a5e8-0540b93ac41b', '4697ad1f-57fc-4a1c-8710-2f9e6cd72f6c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Lun', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('aa21fc7d-e659-412c-a792-6dd6b23d8b30', 'c4d848ad-4ea6-4580-b949-02a9a986f3bc', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Sáb', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('dda0f076-94ff-4f14-9347-67d910c188c0', 'feb03b3d-3c3a-4d0d-95a7-cea568d3e7e5', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Dom', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('8f8f7404-820f-4ac1-b597-eee7aa9283ec', 'a2bd4b30-c0f7-4e40-843f-b093085e7b0e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Jue', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('4257e349-39f4-49cf-86c3-7ded3d42cef8', '4c5ca33c-15f4-4470-a45d-a19f23f3357d', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Mar', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('fdce1247-3e35-403a-9e61-6711e799f614', 'c9c20280-0ae2-4959-8c74-891392d497f8', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Mié', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('38463a14-a807-41f1-9080-b2cf47d0569c', 'd38b33c9-e1b0-417b-bb83-e6ebbc215d2e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Día', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('129c5012-72d7-4a9b-8714-6ce878bcadfc', '142c402e-c6fc-4651-91cf-f56dc627be4f', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Mayo', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('0cc4e55b-f49a-405e-9f4e-4fcf8abd3424', '6b7ac4a6-2a35-4d7e-81f9-4f7bd799662a', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enter the verification code sent to {{email}}', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('a68c4fbb-6178-4be9-a52d-cebf3781db98', '1b20e267-1da1-421b-b0da-fcf14338e90a', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Semana', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('7b674491-fd5d-4597-abd7-7453adb5e1f2', '12791721-8f99-4a67-af16-99acd9678ae1', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Julio', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('4933820d-e021-4dce-822e-8369c012b1d7', '204f7957-90c6-4054-8441-dd12b1d4791c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Junio', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('fa59a269-00ad-4be8-ae89-edcad6548f28', '011a0309-1dda-44ac-9b9e-d8fd11ff2730', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Mes', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('e36e7499-40c8-4845-be6e-4dbc4f0c7a79', 'd2ad0b9c-7a36-454e-9bfe-c4440a3f72eb', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Abril', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('19bd41e7-5489-46c8-bfe3-b4c4a9ad3cec', '52cdf9a1-36ab-4323-b251-769d0381b6f4', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Marzo', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('cec18830-4306-4143-842a-787ba04d057c', 'e4a56e00-c8e4-4076-bd76-7b0f016bbdfc', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Agosto', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('0ad87137-232b-4644-b675-ea3e5b8d3b36', 'd14f006b-cd2c-4add-9128-984f7ee4093c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Enero', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('bb29e1fd-15ab-4b46-a300-e3762cfb973f', '7f7d6fcd-f778-4656-a5b7-16e0a5c18cb5', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Octubre', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('581f13dd-b4c3-4f58-b28b-b096d859a4a3', 'fcd19207-0433-4488-93a8-90a67b1fc3df', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Diciembre', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('f890b988-7146-4c64-8b96-76ae46473231', '3409e32f-fd07-4f13-9822-a1e394b63f0b', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Febrero', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('d16423ce-aea9-4433-bc11-59d900be1f8e', '7be511e3-5089-4fcc-b9c5-938e2fdec855', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Noviembre', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('830bf592-6fd5-4b18-87cb-e3eebc067006', 'd7bc5511-04c4-412c-bccc-43cbffd9300a', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Septiembre', true, NULL, NULL, '2025-09-28 01:43:45.083804', '2025-09-28 01:43:45.083804');
INSERT INTO public.t_translations VALUES ('d6fb8e4d-4f6c-4f58-943a-0b2626c5edd8', '7f4480ea-ca5f-4cf0-9975-74ad2627e00e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Week of', true, NULL, NULL, '2025-09-28 01:48:43.678877', '2025-09-28 01:48:43.678877');
INSERT INTO public.t_translations VALUES ('aafa55ca-e41b-41f8-9daf-860cbdfc8e70', '2d18c490-c47f-45f9-9f75-3b21cd049167', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Sun', true, NULL, NULL, '2025-09-28 01:48:43.678877', '2025-09-28 01:48:43.678877');
INSERT INTO public.t_translations VALUES ('d55b8821-9000-4e1c-b617-5e0b64fc1878', 'd4b5321d-1be2-417a-865b-d40e5b3faf12', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Mon', true, NULL, NULL, '2025-09-28 01:48:43.678877', '2025-09-28 01:48:43.678877');
INSERT INTO public.t_translations VALUES ('b97cec7b-bed1-49a9-abed-6343a05002ac', '3c0285ec-3e05-4abb-879b-d7078eba17c5', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Tue', true, NULL, NULL, '2025-09-28 01:48:43.678877', '2025-09-28 01:48:43.678877');
INSERT INTO public.t_translations VALUES ('d94ad233-053f-4ee7-9e38-c195525bd2b2', '68d10482-64e1-4a1e-ab6c-8a14caba885e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Wed', true, NULL, NULL, '2025-09-28 01:48:43.678877', '2025-09-28 01:48:43.678877');
INSERT INTO public.t_translations VALUES ('ce55aeb7-c226-4213-b602-8e9b5a64ff05', '93026bf0-c370-4d35-a110-34464c9b79ca', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Thu', true, NULL, NULL, '2025-09-28 01:48:43.678877', '2025-09-28 01:48:43.678877');
INSERT INTO public.t_translations VALUES ('c12fd8c3-dfd6-4743-a4d2-4443df7c0c99', '35f6dd79-59eb-4f9b-9e27-754d493cabf4', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Fri', true, NULL, NULL, '2025-09-28 01:48:43.678877', '2025-09-28 01:48:43.678877');
INSERT INTO public.t_translations VALUES ('2cf97bea-6122-432f-abbc-c37a26ebd064', 'b7c79807-9c44-4940-a630-90d39dae98e9', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Sat', true, NULL, NULL, '2025-09-28 01:48:43.678877', '2025-09-28 01:48:43.678877');
INSERT INTO public.t_translations VALUES ('9b6a7488-56d4-4b1e-b064-a2ce8c0a2d79', '7f4480ea-ca5f-4cf0-9975-74ad2627e00e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Semana del', true, NULL, NULL, '2025-09-28 01:48:52.608898', '2025-09-28 01:48:52.608898');
INSERT INTO public.t_translations VALUES ('8579ccc3-9727-4211-970f-f59f10c7d204', '2d18c490-c47f-45f9-9f75-3b21cd049167', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Dom', true, NULL, NULL, '2025-09-28 01:48:52.608898', '2025-09-28 01:48:52.608898');
INSERT INTO public.t_translations VALUES ('ac3e17ca-7f7c-445c-b0d7-bb219be40464', 'd4b5321d-1be2-417a-865b-d40e5b3faf12', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Lun', true, NULL, NULL, '2025-09-28 01:48:52.608898', '2025-09-28 01:48:52.608898');
INSERT INTO public.t_translations VALUES ('4ab853b9-178c-4981-b986-d72c92b3a97d', '3c0285ec-3e05-4abb-879b-d7078eba17c5', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Mar', true, NULL, NULL, '2025-09-28 01:48:52.608898', '2025-09-28 01:48:52.608898');
INSERT INTO public.t_translations VALUES ('595be437-37ae-4827-a963-08e494ec7547', '68d10482-64e1-4a1e-ab6c-8a14caba885e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Mié', true, NULL, NULL, '2025-09-28 01:48:52.608898', '2025-09-28 01:48:52.608898');
INSERT INTO public.t_translations VALUES ('d6ef58ca-e7d1-4374-94be-f6a972776ba6', '93026bf0-c370-4d35-a110-34464c9b79ca', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Jue', true, NULL, NULL, '2025-09-28 01:48:52.608898', '2025-09-28 01:48:52.608898');
INSERT INTO public.t_translations VALUES ('e13f495a-8c2b-4237-a059-cf53d04f94aa', '35f6dd79-59eb-4f9b-9e27-754d493cabf4', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Vie', true, NULL, NULL, '2025-09-28 01:48:52.608898', '2025-09-28 01:48:52.608898');
INSERT INTO public.t_translations VALUES ('6e8ba4b0-443a-4216-986f-97390fe4eed4', 'b7c79807-9c44-4940-a630-90d39dae98e9', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Sáb', true, NULL, NULL, '2025-09-28 01:48:52.608898', '2025-09-28 01:48:52.608898');
INSERT INTO public.t_translations VALUES ('2362c2ae-e000-4131-9342-ec963ea55fd6', '98038a0a-1699-49be-bc76-963f4b61639d', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Client Portal', true, NULL, NULL, '2025-09-28 01:49:27.464026', '2025-09-28 01:49:27.464026');
INSERT INTO public.t_translations VALUES ('499c559d-e162-48e4-94ae-6250bc66c98c', '98038a0a-1699-49be-bc76-963f4b61639d', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Portal del Cliente', true, NULL, NULL, '2025-09-28 01:49:34.344594', '2025-09-28 01:49:34.344594');
INSERT INTO public.t_translations VALUES ('ffaeda42-1d61-4715-8953-2df2b88e1d21', '66ab81f8-7edc-4d7b-8eff-25ac14bedc3c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Perfil', true, NULL, NULL, '2025-09-28 01:50:34.538361', '2025-09-28 01:50:34.538361');
INSERT INTO public.t_translations VALUES ('5363ec3e-2d22-4063-8747-4183f2e83534', 'b89bd598-feea-416e-acc7-6eb02d97e827', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Contraseña', true, NULL, NULL, '2025-09-28 01:50:34.538361', '2025-09-28 01:50:34.538361');
INSERT INTO public.t_translations VALUES ('94ec0d2c-ac02-4bfc-b022-6617fd4a066d', '97947593-cf52-414d-94a0-8728a41c4ff7', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Seguridad', true, NULL, NULL, '2025-09-28 01:50:34.538361', '2025-09-28 01:50:34.538361');
INSERT INTO public.t_translations VALUES ('568dbd37-3cad-4152-8370-a5572d61d5a8', '48f1e05a-b831-439c-800a-eb41b1981876', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Error al cargar datos del usuario', true, NULL, NULL, '2025-09-28 01:50:34.538361', '2025-09-28 01:50:34.538361');
INSERT INTO public.t_translations VALUES ('1d6ababa-b905-4107-aa65-0293fb2fc5c8', 'a7fb9eb9-03d3-4e51-a175-35b18bbada5c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Dirección de Correo', true, NULL, NULL, '2025-09-28 01:50:44.138783', '2025-09-28 01:50:44.138783');
INSERT INTO public.t_translations VALUES ('247c1851-631b-4cf2-8915-5916c245ee45', '6ed8062f-06bd-42d8-8ce1-42ce5603e9cf', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Número de Teléfono', true, NULL, NULL, '2025-09-28 01:50:44.138783', '2025-09-28 01:50:44.138783');
INSERT INTO public.t_translations VALUES ('11ef07b3-a192-4056-8fe4-beff770f77bb', '5d3144b8-9811-41d9-abc8-56f4a031fc71', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Apellido', true, NULL, NULL, '2025-09-28 01:50:44.138783', '2025-09-28 01:50:44.138783');
INSERT INTO public.t_translations VALUES ('8fd529b8-e39f-4efb-8fba-19ae77c19fcf', '33351e41-ae85-482d-a816-bd35688d0025', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Nombre', true, NULL, NULL, '2025-09-28 01:50:44.138783', '2025-09-28 01:50:44.138783');
INSERT INTO public.t_translations VALUES ('0d8cadde-3842-46ea-871d-875169679508', '210cce29-01f9-401e-9177-10c6b5a7941e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Guardar Cambios', true, NULL, NULL, '2025-09-28 01:50:44.138783', '2025-09-28 01:50:44.138783');
INSERT INTO public.t_translations VALUES ('8f53efd7-fc2e-45b7-aae0-3433db0371a0', '9c053480-b318-4246-8212-56acfd9407f9', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Error al actualizar información de contacto', true, NULL, NULL, '2025-09-28 01:50:44.138783', '2025-09-28 01:50:44.138783');
INSERT INTO public.t_translations VALUES ('728e7295-3aa0-498b-8288-fb5f62a03674', '02c6ae33-d0a6-43c8-9ec0-89e0a6afc878', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Información de contacto actualizada exitosamente', true, NULL, NULL, '2025-09-28 01:50:44.138783', '2025-09-28 01:50:44.138783');
INSERT INTO public.t_translations VALUES ('805ad239-dcd2-4446-b22e-7906b954e219', '4f02181f-e58f-4d48-ba6e-d8d7d583c9e7', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ingrese dirección de correo', true, NULL, NULL, '2025-09-28 01:50:44.138783', '2025-09-28 01:50:44.138783');
INSERT INTO public.t_translations VALUES ('07505c4f-e151-4146-8c68-d0c695b35332', '93801e5e-a34d-43e0-9c32-e8da7b83902a', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ingrese número de teléfono', true, NULL, NULL, '2025-09-28 01:50:44.138783', '2025-09-28 01:50:44.138783');
INSERT INTO public.t_translations VALUES ('2c807677-31e2-4015-b1ec-eadc6e54afe3', '8a58eb77-8caf-424f-bd5c-c4dcdb3a5a5d', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ingrese apellido', true, NULL, NULL, '2025-09-28 01:50:44.138783', '2025-09-28 01:50:44.138783');
INSERT INTO public.t_translations VALUES ('3dfd6e67-c078-4393-b3c8-f337b63f9f8c', 'e4f28088-9bc7-42e9-8ade-d729b3ae0bcc', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ingrese nombre', true, NULL, NULL, '2025-09-28 01:50:44.138783', '2025-09-28 01:50:44.138783');
INSERT INTO public.t_translations VALUES ('5e800549-b063-4f01-b30d-334c981f2e1f', '5281521c-c530-4f4a-9bf4-13f30dbd1060', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Nueva Contraseña', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('b139b744-6444-4e9c-9d1a-908fcd939e6b', '629b3549-5e9b-480a-a3c7-c36e3ae7f96d', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Confirmar Nueva Contraseña', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('b500e968-d337-4850-bb7a-8ba525320c05', '7fea9d09-f2f1-46e3-8d16-b00a78422f5b', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Contraseña Actual', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('34a0fd1f-5670-4390-ada5-cc025bbaa2f0', '391e20da-9cf6-4c99-8ca3-3976134d9ddb', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Las nuevas contraseñas no coinciden', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('858fc078-9c11-4ac2-b3c6-a232e5ae4d56', '37202545-6f6c-4428-8603-c45294e1b972', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Un número', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('fc207703-e704-48f8-b35a-ed3a86a0fee8', 'ebe04479-665d-4620-a7bc-1474c829f397', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Un carácter especial', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('c63e4d31-ab5c-4815-bea5-cc1c52026cea', '629cdb12-bccc-49d0-a859-b90c992f78b0', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Cambiar Contraseña', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('f55e769c-21f1-4f38-8462-02aad2d2d7f0', '2d55306a-42da-4866-bd64-3499fd384681', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Error al cambiar contraseña', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('5d591134-03be-4371-9e17-ae67283ed30b', 'a68a2f82-33c1-4661-88d9-5f9cee7884d1', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Requisitos de Contraseña', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('d60980da-16a4-400b-a63b-9c83be3c576b', '1c09a73b-f9bd-4a45-ace7-615425e5cf8e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Contraseña cambiada exitosamente', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('f220a0d4-8dc9-4038-91ef-d8ab5fe062a9', '1b766671-9708-4236-9380-fb22bec82753', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Una letra minúscula', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('4203e42a-4d38-4ddd-88ef-0b45b7f7df26', '44dddf07-3a8f-4e79-b2b7-3362ab46a7cb', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Al menos 8 caracteres', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('bafb1a36-4d34-4246-a599-3149d575ea8a', '16f68da4-3b83-4bea-a7f0-f0d84d547c4e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Una letra mayúscula', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('15b38a7b-0b33-4ce2-aeff-308ae812e7b9', 'b9dba5ac-e748-4428-8371-2f2f03cfcf02', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ingrese nueva contraseña', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('786b4ab7-9d6a-4a1a-b663-13b16a5c3ab8', 'ccae52cd-12e4-49b1-b425-3da005ca8051', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Confirme nueva contraseña', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('0420bd27-a01a-4d48-954a-a735e528ab68', '92aceccc-5988-4459-91f3-587d48899efd', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ingrese contraseña actual', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('3346089a-b175-41c5-a84b-1a4ab87ea1ed', 'f6c9edff-5a0a-404a-829d-2d03fced402c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'La contraseña no cumple los requisitos', true, NULL, NULL, '2025-09-28 01:50:54.843306', '2025-09-28 01:50:54.843306');
INSERT INTO public.t_translations VALUES ('d15fc192-841c-4718-9e69-b5e150422703', 'f59906e7-677b-4f47-a2c0-df3155274f35', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Autenticación Multifactor (MFA)', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('ddff1ad4-840c-440a-9a58-bb1728d60401', 'd726d9ec-ec99-4987-b91c-1c64f401ec0c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Configurar MFA', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('cc213300-fd72-4c89-a08c-e8abf3f9352b', '9c782085-1532-467d-a92d-a6fcb4e8d418', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Habilitar MFA', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('226966ed-1484-4cba-ad73-aeb031ddf821', '114f10a6-4195-4d5b-9a26-de9d4ea50590', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Questions? Contact us:', true, 'system', NULL, '2025-09-28 07:27:58.146519', '2025-09-28 07:27:58.146519');
INSERT INTO public.t_translations VALUES ('a95fd8ed-9082-448b-aa09-5a0b5294d9c0', '9069bf07-a212-4581-8cec-5916b5f6b3a9', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Deshabilitar MFA', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('d14a12d1-9156-4154-accc-94bc948d81f0', 'cfc88f8a-8de6-4333-a38e-9539d6db612f', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'MFA habilitado exitosamente', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('31fcba1c-b2b2-430e-ad90-c8468248f878', 'c401a304-9a09-46a9-bbef-e125fb736d8e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Reenviar Código', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('939d4bc5-5de0-4d80-85ad-7c53d36588f7', '216bbaba-148b-426e-aa34-d1632214a4cc', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'He Guardado Estos Códigos', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('83ce720d-6baa-42e6-9f08-0c42bf731890', 'eaac95bb-0512-41a0-9a67-82fec4548b2e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Códigos de Respaldo', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('e34c2e00-8710-42e1-83a3-78320351c317', 'c84043c3-dce8-45fc-933f-a24ae7230b19', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Código de verificación inválido', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('f53c05b7-b930-4a89-9bdd-90be8c6523fc', '595c5601-f4c4-45d3-9c11-f25f6af0d2d1', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'MFA deshabilitado exitosamente', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('ac16ae15-be3f-4422-a473-84c8aa1f32fe', '6906632c-d8dc-472b-8221-e73f0edf1297', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Verificar', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('329850ba-32bf-4644-8160-10c12dd9898a', '3f4d82a7-5bcf-43c4-a900-4b81adce9d9e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Error al verificar código', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('2b663c70-c0cc-49c6-a47b-2406e5ae9de2', '0bfff773-4163-4ce2-8a63-87ac9b8e8eee', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Agregue una capa extra de seguridad a su cuenta activando la autenticación multifactor.', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('10bcc65f-f34a-436a-bdf2-cc81e7b0951b', '07e4ede3-c96a-49cc-b860-c11b527fee5d', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Error al enviar código de verificación', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('10cd3285-d123-4b1d-a849-643d063ed46e', '7aab7bf1-8817-447f-8fc9-dc712af5445b', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Guarde estos códigos de respaldo en un lugar seguro. Puede usar cada código una sola vez para acceder a su cuenta si no puede recibir códigos de verificación.', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('9591dab1-e27e-47d5-8763-0c6f90551f08', '1523f677-8904-4bb9-98a3-d2fb848e5468', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ingrese código de 6 dígitos', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('e8b4cfa8-4dde-427d-9a55-fe0127d133af', '3cf7aab6-8f13-4b41-bc2a-2740fa62587c', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Error al deshabilitar MFA', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('91944e02-c87d-4805-9447-a734e303b78f', '57dbacfe-008d-4b6b-ac19-db2f3dea3c22', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Jan', false, NULL, NULL, '2025-09-28 04:38:44.122997', '2025-09-28 04:38:44.122997');
INSERT INTO public.t_translations VALUES ('e802caf7-b493-47a4-9259-33c112fc21df', '20574b15-3b05-44b6-b03d-50778af233be', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Feb', false, NULL, NULL, '2025-09-28 04:38:44.122997', '2025-09-28 04:38:44.122997');
INSERT INTO public.t_translations VALUES ('bc69e5e9-039f-4d4b-88b2-efbb7c84c049', 'fbe0be39-5b92-49e6-8113-1ad5130edf5a', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Mar', false, NULL, NULL, '2025-09-28 04:38:44.122997', '2025-09-28 04:38:44.122997');
INSERT INTO public.t_translations VALUES ('7c7cc696-3098-4ad8-be8f-47efd70f44fb', 'ef798c36-2e3e-46a8-a733-f62127f581ee', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Apr', false, NULL, NULL, '2025-09-28 04:38:44.122997', '2025-09-28 04:38:44.122997');
INSERT INTO public.t_translations VALUES ('01973478-f787-42e7-b17b-c0e62967be3f', '53963a50-cb0e-4781-a364-a375c7437570', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'May', false, NULL, NULL, '2025-09-28 04:38:44.122997', '2025-09-28 04:38:44.122997');
INSERT INTO public.t_translations VALUES ('26055987-0de3-4b80-8680-999c83985d96', '7e3b10ab-4f9e-41e2-a148-f1e48ed6d6c9', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Jun', false, NULL, NULL, '2025-09-28 04:38:44.122997', '2025-09-28 04:38:44.122997');
INSERT INTO public.t_translations VALUES ('90079813-0d73-4133-922d-4f0b2ca68859', '9944296a-837e-4630-951f-2691806e8bc1', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Jul', false, NULL, NULL, '2025-09-28 04:38:44.122997', '2025-09-28 04:38:44.122997');
INSERT INTO public.t_translations VALUES ('3ca62325-a8a4-4c3e-977a-7c48743740eb', '0a65a975-7e74-4b37-acf5-2bc9a5530d30', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Aug', false, NULL, NULL, '2025-09-28 04:38:44.122997', '2025-09-28 04:38:44.122997');
INSERT INTO public.t_translations VALUES ('5a56d22a-2c54-4e4d-8189-76df3f663934', '78a4796e-e62d-4062-9a7c-b08f8d53d6a1', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Sep', false, NULL, NULL, '2025-09-28 04:38:44.122997', '2025-09-28 04:38:44.122997');
INSERT INTO public.t_translations VALUES ('870cdb5a-190e-4a7f-8564-836d39398d98', '23981e2c-f66e-4dbc-83ea-53b7a33df96a', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Oct', false, NULL, NULL, '2025-09-28 04:38:44.122997', '2025-09-28 04:38:44.122997');
INSERT INTO public.t_translations VALUES ('a3e003fd-5b61-4f12-8a64-e6924d0d7648', '1e0e2d47-dc80-4814-84e8-fb645cf1373a', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Nov', false, NULL, NULL, '2025-09-28 04:38:44.122997', '2025-09-28 04:38:44.122997');
INSERT INTO public.t_translations VALUES ('753b0d93-b6f2-4563-8e05-e7dff22899a5', '71916b98-d9d2-417f-b8f6-e41d5d5c032e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Dec', false, NULL, NULL, '2025-09-28 04:38:44.122997', '2025-09-28 04:38:44.122997');
INSERT INTO public.t_translations VALUES ('80c85abe-7236-43e9-95eb-c4dc0fc6afc6', '57dbacfe-008d-4b6b-ac19-db2f3dea3c22', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ene', false, NULL, NULL, '2025-09-28 04:39:07.788287', '2025-09-28 04:39:07.788287');
INSERT INTO public.t_translations VALUES ('dd00a349-2400-42d2-b4b6-89b4d2ac98c4', '20574b15-3b05-44b6-b03d-50778af233be', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Feb', false, NULL, NULL, '2025-09-28 04:39:07.788287', '2025-09-28 04:39:07.788287');
INSERT INTO public.t_translations VALUES ('4ebe6c19-0673-4578-965b-8dd8643073ed', 'fbe0be39-5b92-49e6-8113-1ad5130edf5a', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Mar', false, NULL, NULL, '2025-09-28 04:39:07.788287', '2025-09-28 04:39:07.788287');
INSERT INTO public.t_translations VALUES ('51eeab8a-e13b-43f7-a11c-eabed1608276', 'ef798c36-2e3e-46a8-a733-f62127f581ee', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Abr', false, NULL, NULL, '2025-09-28 04:39:07.788287', '2025-09-28 04:39:07.788287');
INSERT INTO public.t_translations VALUES ('3991b68d-44e9-46ea-88ae-f745801bf056', '53963a50-cb0e-4781-a364-a375c7437570', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'May', false, NULL, NULL, '2025-09-28 04:39:07.788287', '2025-09-28 04:39:07.788287');
INSERT INTO public.t_translations VALUES ('4c520673-c26a-4ec6-8fa5-fbb754a927be', '7e3b10ab-4f9e-41e2-a148-f1e48ed6d6c9', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Jun', false, NULL, NULL, '2025-09-28 04:39:07.788287', '2025-09-28 04:39:07.788287');
INSERT INTO public.t_translations VALUES ('459a88b1-cb3e-47b4-97ea-299d80f4b6ff', '9944296a-837e-4630-951f-2691806e8bc1', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Jul', false, NULL, NULL, '2025-09-28 04:39:07.788287', '2025-09-28 04:39:07.788287');
INSERT INTO public.t_translations VALUES ('1f58568a-3843-4047-a4bd-0a2b523cd5e7', '0a65a975-7e74-4b37-acf5-2bc9a5530d30', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ago', false, NULL, NULL, '2025-09-28 04:39:07.788287', '2025-09-28 04:39:07.788287');
INSERT INTO public.t_translations VALUES ('1ee1ffff-abb6-47c6-8bc9-97c75c7ea97f', '23981e2c-f66e-4dbc-83ea-53b7a33df96a', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Oct', false, NULL, NULL, '2025-09-28 04:39:07.788287', '2025-09-28 04:39:07.788287');
INSERT INTO public.t_translations VALUES ('cf5a5555-421b-406a-96f5-f75fb06155e0', '1e0e2d47-dc80-4814-84e8-fb645cf1373a', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Nov', false, NULL, NULL, '2025-09-28 04:39:07.788287', '2025-09-28 04:39:07.788287');
INSERT INTO public.t_translations VALUES ('e042c100-e4cd-49d2-8c6c-b58e5f74744a', '71916b98-d9d2-417f-b8f6-e41d5d5c032e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Dic', false, NULL, NULL, '2025-09-28 04:39:07.788287', '2025-09-28 04:39:07.788287');
INSERT INTO public.t_translations VALUES ('17be00c6-61de-4d98-917f-5e3b27c7beac', '78a4796e-e62d-4062-9a7c-b08f8d53d6a1', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Sep', false, NULL, NULL, '2025-09-28 04:39:07.788287', '2025-09-28 04:39:07.788287');
INSERT INTO public.t_translations VALUES ('6e60e3c8-adab-46bc-9ae4-9961084e10b2', '424b8a6d-8b18-4d77-93df-dffe4e19ed4b', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Servicio Premium', true, NULL, NULL, '2025-09-28 01:37:09.093025', '2025-09-28 02:10:59.35397');
INSERT INTO public.t_translations VALUES ('7ef235a8-c6b0-4823-a187-313a274323c9', '6b7ac4a6-2a35-4d7e-81f9-4f7bd799662a', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ingrese el código de verificación enviado a {{email}}', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('831a8ac8-ed17-4f32-ba59-23f62d953dcc', '9efe6850-99e6-46ba-855e-2243b2e4dd4d', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', '✓ MFA está habilitado para {{email}}', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('d9cc9712-7214-4ad1-a824-86a9f3929479', 'd25924ae-a954-412e-906a-9811235e3dd3', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Enter the following 6-digit verification code to complete your {{purpose}}:', true, 'system', NULL, '2025-09-28 07:27:58.146519', '2025-09-28 07:27:58.146519');
INSERT INTO public.t_translations VALUES ('91e1ff77-d168-4ee1-b3db-8d34d910df4c', 'a38c73d1-f69c-4eb0-aaff-4f718142516f', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Your Verification Code:', true, 'system', NULL, '2025-09-28 07:27:58.146519', '2025-09-28 07:27:58.146519');
INSERT INTO public.t_translations VALUES ('da0c7f78-27a2-4a10-99f6-d2b411b00176', '9efe6850-99e6-46ba-855e-2243b2e4dd4d', '3760eb9f-af6a-4037-920e-68769dcd17d3', '✓ MFA is enabled for {{email}}', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('7a0c0146-cf88-4f1a-9a9e-f8bd011c11b3', '4197cbfc-16fd-4069-a0a6-0d07db00768d', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Verification code sent to {{email}}', true, NULL, NULL, '2025-09-28 01:37:59.918044', '2025-09-28 01:37:59.918044');
INSERT INTO public.t_translations VALUES ('193f08c7-2704-4d1d-b64d-e1e2b5a80429', '4197cbfc-16fd-4069-a0a6-0d07db00768d', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Código de verificación enviado a {{email}}', true, NULL, NULL, '2025-09-28 01:51:08.728425', '2025-09-28 01:51:08.728425');
INSERT INTO public.t_translations VALUES ('33178325-f2f5-4986-9c2b-4128dfb70692', 'fa161a29-377c-47e2-82d8-ae77269e7130', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Check Your Email', true, NULL, NULL, '2025-09-28 07:05:42.736689', '2025-09-28 07:05:42.736689');
INSERT INTO public.t_translations VALUES ('104eea9b-41e6-44c3-aa41-16c3ab3b3d0b', '1f0a3dd4-01f5-46a4-8378-c774157977fc', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'We sent a verification code to {{email}}. If you don''t see it in your inbox, please check your spam folder.', true, NULL, NULL, '2025-09-28 07:05:42.736689', '2025-09-28 07:05:42.736689');
INSERT INTO public.t_translations VALUES ('f28ac59b-f36d-4a7f-9a0c-a80f8478a599', 'f625bef8-2ce1-454c-8df2-55b9005fac51', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Verification code sent to {{email}}', true, NULL, NULL, '2025-09-28 07:05:42.736689', '2025-09-28 07:05:42.736689');
INSERT INTO public.t_translations VALUES ('394d6c5d-28d2-4b27-bde4-4c901803fd4c', 'fa161a29-377c-47e2-82d8-ae77269e7130', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Revisa Tu Correo', true, NULL, NULL, '2025-09-28 07:05:42.736689', '2025-09-28 07:05:42.736689');
INSERT INTO public.t_translations VALUES ('1744b569-5d56-4f46-ba1d-55ae660f9ac7', '1f0a3dd4-01f5-46a4-8378-c774157977fc', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Enviamos un código de verificación a {{email}}. Si no lo ves en tu bandeja de entrada, por favor revisa tu carpeta de spam.', true, NULL, NULL, '2025-09-28 07:05:42.736689', '2025-09-28 07:05:42.736689');
INSERT INTO public.t_translations VALUES ('1b14facf-5a2c-465e-a6d7-1f1534540778', 'f625bef8-2ce1-454c-8df2-55b9005fac51', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Código de verificación enviado a {{email}}', true, NULL, NULL, '2025-09-28 07:05:42.736689', '2025-09-28 07:05:42.736689');
INSERT INTO public.t_translations VALUES ('f16a9417-57d8-4ac7-b85d-c30477bf84c3', '305e8f40-7386-42d9-be2f-49b89b4808b0', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'We received a request to {{action}}. To {{action}}, please use the verification code below.', true, 'system', NULL, '2025-09-28 07:27:58.146519', '2025-09-28 07:27:58.146519');
INSERT INTO public.t_translations VALUES ('77451f05-17e6-45c1-a17b-d46f38fe4c85', '4167eb27-ae81-4739-9f13-133464bc48bb', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'If you did not request this {{purpose}}, please contact us immediately', true, 'system', NULL, '2025-09-28 07:27:58.146519', '2025-09-28 07:27:58.146519');
INSERT INTO public.t_translations VALUES ('7cbfdb27-272d-4670-897f-e8a3e7763acf', '87df6a88-bd75-4dee-a6a3-dc927eeb44fd', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'This code expires in 10 minutes', true, 'system', NULL, '2025-09-28 07:27:58.146519', '2025-09-28 07:27:58.146519');
INSERT INTO public.t_translations VALUES ('771b4918-c0a6-4cad-862a-a27e24b63c0e', '881912fd-e687-4697-a18a-abb6d5fd8f3e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Never share this code with anyone', true, 'system', NULL, '2025-09-28 07:27:58.146519', '2025-09-28 07:27:58.146519');
INSERT INTO public.t_translations VALUES ('6d7f07cd-0ac2-4721-b955-d86baa644910', 'e8548d1c-cca0-4923-82e1-15eb7ffe8de9', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'This code can only be used once', true, 'system', NULL, '2025-09-28 07:27:58.146519', '2025-09-28 07:27:58.146519');
INSERT INTO public.t_translations VALUES ('9686cc2a-63bf-48c6-bfc3-795624af513f', '8b909bb9-02ad-452f-8ffb-79fd61d825dd', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Security Information:', true, 'system', NULL, '2025-09-28 07:27:58.146519', '2025-09-28 07:27:58.146519');
INSERT INTO public.t_translations VALUES ('e88256da-d055-4f7a-ad7e-491a43ea53e8', '11e329fa-970d-427a-b301-11ced929c7ee', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Having trouble? Contact our support team at {{phone}} or {{email}}', true, 'system', NULL, '2025-09-28 07:27:58.146519', '2025-09-28 07:27:58.146519');
INSERT INTO public.t_translations VALUES ('17140611-9cc4-487f-9cea-1cddccb969b6', '47ceb877-f158-4855-8afd-37ab08d9f4ca', '3760eb9f-af6a-4037-920e-68769dcd17d3', '© 2025 Romero Tech Solutions. All rights reserved.', true, 'system', NULL, '2025-09-28 07:27:58.146519', '2025-09-28 07:27:58.146519');
INSERT INTO public.t_translations VALUES ('85fa4619-ef82-4eb8-b110-0cddb7c3d3a7', '146a77e4-de67-4d18-a57c-8e82d0af9e22', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Serving Escondido, CA and surrounding areas.', true, 'system', NULL, '2025-09-28 07:27:58.146519', '2025-09-28 07:27:58.146519');
INSERT INTO public.t_translations VALUES ('983fff2f-0bbf-487d-8ee7-766e50af229f', 'd25924ae-a954-412e-906a-9811235e3dd3', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Ingrese el siguiente código de verificación de 6 dígitos para completar su {{purpose}}:', true, 'system', NULL, '2025-09-28 07:28:30.456263', '2025-09-28 07:28:30.456263');
INSERT INTO public.t_translations VALUES ('8340a2a6-f838-4d17-924d-1b09c2e0afe3', 'a38c73d1-f69c-4eb0-aaff-4f718142516f', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Su Código de Verificación:', true, 'system', NULL, '2025-09-28 07:28:30.456263', '2025-09-28 07:28:30.456263');
INSERT INTO public.t_translations VALUES ('7c8bbed4-7114-4aa6-91c0-3ff22a0cbd2a', '305e8f40-7386-42d9-be2f-49b89b4808b0', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Recibimos una solicitud para {{action}}. Para {{action}}, por favor use el código de verificación a continuación.', true, 'system', NULL, '2025-09-28 07:28:30.456263', '2025-09-28 07:28:30.456263');
INSERT INTO public.t_translations VALUES ('70dbaec4-50f7-44ca-9802-ac28ae9ee2cd', '4167eb27-ae81-4739-9f13-133464bc48bb', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Si no solicitó este {{purpose}}, por favor contáctenos inmediatamente', true, 'system', NULL, '2025-09-28 07:28:30.456263', '2025-09-28 07:28:30.456263');
INSERT INTO public.t_translations VALUES ('1db9cd58-33f0-4d5e-95fd-92e92915e9ca', '87df6a88-bd75-4dee-a6a3-dc927eeb44fd', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Este código expira en 10 minutos', true, 'system', NULL, '2025-09-28 07:28:30.456263', '2025-09-28 07:28:30.456263');
INSERT INTO public.t_translations VALUES ('50527b36-2a63-4600-9603-c7c535470849', '881912fd-e687-4697-a18a-abb6d5fd8f3e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Nunca comparta este código con nadie', true, 'system', NULL, '2025-09-28 07:28:30.456263', '2025-09-28 07:28:30.456263');
INSERT INTO public.t_translations VALUES ('836fd1d6-8bdc-43cd-b893-eca4793feda0', 'e8548d1c-cca0-4923-82e1-15eb7ffe8de9', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Este código solo se puede usar una vez', true, 'system', NULL, '2025-09-28 07:28:30.456263', '2025-09-28 07:28:30.456263');
INSERT INTO public.t_translations VALUES ('4ddf713c-71bd-4722-ac9c-e98a2c1a851d', '8b909bb9-02ad-452f-8ffb-79fd61d825dd', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Información de Seguridad:', true, 'system', NULL, '2025-09-28 07:28:30.456263', '2025-09-28 07:28:30.456263');
INSERT INTO public.t_translations VALUES ('7e84e66f-46d0-4c1e-85f9-709a50b80389', '11e329fa-970d-427a-b301-11ced929c7ee', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', '¿Tiene problemas? Contacte a nuestro equipo de soporte al {{phone}} o {{email}}', true, 'system', NULL, '2025-09-28 07:28:30.456263', '2025-09-28 07:28:30.456263');
INSERT INTO public.t_translations VALUES ('53330ac0-804d-4bb9-a2d2-1f3089fd6c69', '47ceb877-f158-4855-8afd-37ab08d9f4ca', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', '© 2025 Romero Tech Solutions. Todos los derechos reservados.', true, 'system', NULL, '2025-09-28 07:28:30.456263', '2025-09-28 07:28:30.456263');
INSERT INTO public.t_translations VALUES ('4b5a4157-cc58-49b6-a367-8d441621e6cc', '114f10a6-4195-4d5b-9a26-de9d4ea50590', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', '¿Preguntas? Contáctenos:', true, 'system', NULL, '2025-09-28 07:28:30.456263', '2025-09-28 07:28:30.456263');
INSERT INTO public.t_translations VALUES ('390b2216-3bf4-4e20-bd0a-9763a02d9ef1', '146a77e4-de67-4d18-a57c-8e82d0af9e22', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Sirviendo a Escondido, CA y áreas circundantes.', true, 'system', NULL, '2025-09-28 07:28:30.456263', '2025-09-28 07:28:30.456263');
INSERT INTO public.t_translations VALUES ('fbcc0e28-c7da-4f2b-838d-c9c31073649f', 'a361e1a3-ca58-4711-af67-a99fa49485bf', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Your Romero Tech Solutions verification code is: {{code}}. Valid for 10 minutes. Do not share this code.', true, 'system', NULL, '2025-09-28 17:48:46.154789', '2025-09-28 17:48:46.154789');
INSERT INTO public.t_translations VALUES ('846e33ef-3fad-4d8f-9682-82b0a0cacf06', 'dcd9747d-a9d4-42bc-a694-31c19a58f5e2', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Your Romero Tech Solutions phone verification code is: {{code}}. Valid for 10 minutes.', true, 'system', NULL, '2025-09-28 17:48:46.154789', '2025-09-28 17:48:46.154789');
INSERT INTO public.t_translations VALUES ('b9e4e9c3-4acb-489d-9921-0670e1f1b2f9', '25b3ca8e-105b-4cc0-babd-72fd687c5327', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Email', true, 'system', NULL, '2025-09-28 17:48:46.154789', '2025-09-28 17:48:46.154789');
INSERT INTO public.t_translations VALUES ('8da57083-2bee-4af7-8a05-01949070ccbd', 'f4c784d7-8884-4ae6-97e5-c09b43c6de04', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'SMS', true, 'system', NULL, '2025-09-28 17:48:46.154789', '2025-09-28 17:48:46.154789');
INSERT INTO public.t_translations VALUES ('b7b256d7-83f8-4011-8921-89f7ea98c325', '28dc9a2c-f1f0-40ed-9fa4-d4215d1a9cdd', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Both Email & SMS', true, 'system', NULL, '2025-09-28 17:48:46.154789', '2025-09-28 17:48:46.154789');
INSERT INTO public.t_translations VALUES ('8f1b4a55-d9c4-44a3-a698-686cc81abf22', '14f4dba2-d726-49cf-949c-b607913fce5e', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Phone number must be verified before enabling SMS MFA', true, 'system', NULL, '2025-09-28 17:48:46.154789', '2025-09-28 17:48:46.154789');
INSERT INTO public.t_translations VALUES ('18fb0c8d-e265-4034-b363-163f296de299', '4134b661-5c82-40f1-b2c2-a10d186223a0', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'Please enter a valid phone number format', true, 'system', NULL, '2025-09-28 17:48:46.154789', '2025-09-28 17:48:46.154789');
INSERT INTO public.t_translations VALUES ('dcdfd338-13d2-46e7-b837-e6b3715cc6bd', '5fb15c65-db5e-4719-a70a-23095e1f5339', '3760eb9f-af6a-4037-920e-68769dcd17d3', 'SMS rate limit exceeded. Please try again later', true, 'system', NULL, '2025-09-28 17:48:46.154789', '2025-09-28 17:48:46.154789');
INSERT INTO public.t_translations VALUES ('1b69144c-d377-48d1-b3aa-c54a466bd0cf', 'a361e1a3-ca58-4711-af67-a99fa49485bf', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Su código de verificación de Romero Tech Solutions es: {{code}}. Válido por 10 minutos. No comparta este código.', true, 'system', NULL, '2025-09-28 17:49:05.945356', '2025-09-28 17:49:05.945356');
INSERT INTO public.t_translations VALUES ('9c660848-a1eb-4588-a024-9bf252a716fb', 'dcd9747d-a9d4-42bc-a694-31c19a58f5e2', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Su código de verificación de teléfono de Romero Tech Solutions es: {{code}}. Válido por 10 minutos.', true, 'system', NULL, '2025-09-28 17:49:05.945356', '2025-09-28 17:49:05.945356');
INSERT INTO public.t_translations VALUES ('4be09c66-71ef-4804-b312-5928ed3efa76', '25b3ca8e-105b-4cc0-babd-72fd687c5327', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Correo Electrónico', true, 'system', NULL, '2025-09-28 17:49:05.945356', '2025-09-28 17:49:05.945356');
INSERT INTO public.t_translations VALUES ('72495947-0071-4dcf-9a36-caf132ee8a37', 'f4c784d7-8884-4ae6-97e5-c09b43c6de04', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'SMS', true, 'system', NULL, '2025-09-28 17:49:05.945356', '2025-09-28 17:49:05.945356');
INSERT INTO public.t_translations VALUES ('6b0e6015-b124-462f-b875-79d57ce2e33e', '28dc9a2c-f1f0-40ed-9fa4-d4215d1a9cdd', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Correo y SMS', true, 'system', NULL, '2025-09-28 17:49:05.945356', '2025-09-28 17:49:05.945356');
INSERT INTO public.t_translations VALUES ('26341eb2-41ad-4b55-a6cb-85d1f9a95262', '14f4dba2-d726-49cf-949c-b607913fce5e', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'El número de teléfono debe ser verificado antes de habilitar SMS MFA', true, 'system', NULL, '2025-09-28 17:49:05.945356', '2025-09-28 17:49:05.945356');
INSERT INTO public.t_translations VALUES ('aa16649f-64c0-45ff-9869-a453811a17c1', '4134b661-5c82-40f1-b2c2-a10d186223a0', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Por favor ingrese un formato de número de teléfono válido', true, 'system', NULL, '2025-09-28 17:49:05.945356', '2025-09-28 17:49:05.945356');
INSERT INTO public.t_translations VALUES ('81f76772-e2b1-4520-aaef-df45c384b34b', '5fb15c65-db5e-4719-a70a-23095e1f5339', 'abcd53f9-3980-4e00-9fd3-0c4d90c5fef0', 'Límite de SMS excedido. Por favor intente más tarde', true, 'system', NULL, '2025-09-28 17:49:05.945356', '2025-09-28 17:49:05.945356');


--
-- Name: system_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.system_settings_id_seq', 9, true);


--
-- PostgreSQL database dump complete
--

\unrestrict qzLhzTARYHhLd2Klbo85fomW5UIXfgTxCMhbvh0uhPMNikd5a3X80SyhZ1dkYl8

