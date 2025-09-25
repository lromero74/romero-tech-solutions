-- Stored procedures for client registration workflow

-- Function to register a new client business
CREATE OR REPLACE FUNCTION register_client_business(
    p_business_name VARCHAR(255),
    p_domain_email VARCHAR(255),
    p_business_street VARCHAR(255),
    p_business_city VARCHAR(100),
    p_business_state VARCHAR(50),
    p_business_zip_code VARCHAR(20),
    p_business_country VARCHAR(50),
    p_contact_name VARCHAR(255),
    p_contact_email VARCHAR(255),
    p_contact_phone VARCHAR(20),
    p_job_title VARCHAR(100),
    p_cognito_id VARCHAR(255),
    p_password_hash VARCHAR(255),
    p_confirmation_token VARCHAR(255),
    p_confirmation_expires TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE(
    business_id UUID,
    user_id UUID,
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_business_id UUID;
    v_user_id UUID;
    v_existing_business_id UUID;
    v_existing_user_id UUID;
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

    -- If business already exists but is not active, we can associate new contact
    IF v_existing_business_id IS NOT NULL THEN
        SELECT is_active INTO v_existing_business_id
        FROM businesses
        WHERE id = v_existing_business_id;
    END IF;

    BEGIN
        -- Start transaction
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

        -- Create user record
        INSERT INTO users (
            cognito_id,
            email,
            role,
            name,
            phone,
            address,
            business_id,
            is_business_owner,
            job_title,
            email_confirmed,
            email_confirmation_token,
            email_confirmation_expires,
            notes,
            is_active
        ) VALUES (
            p_cognito_id,
            p_contact_email,
            'client',
            p_contact_name,
            p_contact_phone,
            p_business_street || ', ' || p_business_city || ', ' || p_business_state || ' ' || p_business_zip_code,
            v_business_id,
            TRUE, -- First contact is the business owner
            p_job_title,
            FALSE, -- Will be confirmed via email
            p_confirmation_token,
            p_confirmation_expires,
            'Registered on ' || CURRENT_DATE::TEXT,
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

-- Function to confirm client email and activate account
CREATE OR REPLACE FUNCTION confirm_client_email(
    p_token VARCHAR(255),
    p_email VARCHAR(255)
)
RETURNS TABLE(
    user_id UUID,
    business_id UUID,
    success BOOLEAN,
    message TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_user_id UUID;
    v_business_id UUID;
    v_token_expires TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Find user by token and email
    SELECT id, business_id, email_confirmation_expires
    INTO v_user_id, v_business_id, v_token_expires
    FROM users
    WHERE email_confirmation_token = p_token
      AND email = p_email
      AND email_confirmed = FALSE;

    -- Check if user found
    IF v_user_id IS NULL THEN
        RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'Invalid or already used confirmation token'::TEXT;
        RETURN;
    END IF;

    -- Check if token expired
    IF v_token_expires < CURRENT_TIMESTAMP THEN
        RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'Confirmation token has expired'::TEXT;
        RETURN;
    END IF;

    BEGIN
        -- Activate user
        UPDATE users SET
            email_confirmed = TRUE,
            is_active = TRUE,
            email_confirmation_token = NULL,
            email_confirmation_expires = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_user_id;

        -- Activate business if this is the business owner
        UPDATE businesses SET
            is_active = TRUE,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_business_id;

        -- Return success
        RETURN QUERY SELECT v_user_id, v_business_id, TRUE, 'Email confirmed and account activated'::TEXT;

    EXCEPTION
        WHEN OTHERS THEN
            -- Return error
            RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, SQLERRM::TEXT;
    END;
END;
$$;

-- Function to add service addresses for a business
CREATE OR REPLACE FUNCTION add_service_addresses(
    p_business_id UUID,
    p_addresses JSONB
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    addresses_added INTEGER
)
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