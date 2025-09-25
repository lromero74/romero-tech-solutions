-- Password Complexity Requirements Table
-- This table stores configurable password complexity requirements for the application

CREATE TABLE IF NOT EXISTS password_complexity_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Basic Requirements
    min_length INTEGER NOT NULL DEFAULT 8,
    max_length INTEGER,

    -- Character Requirements
    require_uppercase BOOLEAN NOT NULL DEFAULT true,
    require_lowercase BOOLEAN NOT NULL DEFAULT true,
    require_numbers BOOLEAN NOT NULL DEFAULT true,
    require_special_characters BOOLEAN NOT NULL DEFAULT true,
    special_character_set TEXT DEFAULT '!@#$%^&*()_+-=[]{}|;:,.<>?',

    -- Security Requirements
    prevent_common_passwords BOOLEAN NOT NULL DEFAULT true,
    prevent_user_info_in_password BOOLEAN NOT NULL DEFAULT true,

    -- Password History and Expiration
    enable_password_history BOOLEAN NOT NULL DEFAULT true,
    password_history_count INTEGER DEFAULT 5,
    enable_password_expiration BOOLEAN NOT NULL DEFAULT true,
    expiration_days INTEGER DEFAULT 90,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),

    -- Constraints
    CONSTRAINT valid_min_length CHECK (min_length > 0 AND min_length <= 256),
    CONSTRAINT valid_max_length CHECK (max_length IS NULL OR (max_length >= min_length AND max_length <= 256)),
    CONSTRAINT valid_history_count CHECK (password_history_count >= 0 AND password_history_count <= 50),
    CONSTRAINT valid_expiration_days CHECK (expiration_days IS NULL OR (expiration_days > 0 AND expiration_days <= 3650))
);

-- Password History Table
-- Stores hashed passwords to prevent reuse
CREATE TABLE IF NOT EXISTS password_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Common Passwords Table (optional)
-- Stores common passwords to prevent their use
CREATE TABLE IF NOT EXISTS common_passwords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    password_hash TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add password metadata to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS password_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;

-- Update trigger for password_complexity_requirements
CREATE OR REPLACE FUNCTION update_password_complexity_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER password_complexity_updated_at_trigger
    BEFORE UPDATE ON password_complexity_requirements
    FOR EACH ROW
    EXECUTE FUNCTION update_password_complexity_updated_at();

-- Function to enforce only one active password complexity configuration
CREATE OR REPLACE FUNCTION enforce_single_active_password_config()
RETURNS TRIGGER AS $$
BEGIN
    -- If this is being set to active, deactivate all others
    IF NEW.is_active = true THEN
        UPDATE password_complexity_requirements
        SET is_active = false
        WHERE id != NEW.id AND is_active = true;
    END IF;

    -- Ensure at least one configuration remains active
    IF NEW.is_active = false AND
       (SELECT COUNT(*) FROM password_complexity_requirements WHERE is_active = true AND id != NEW.id) = 0 THEN
        RAISE EXCEPTION 'At least one password complexity configuration must remain active';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_single_active_config_trigger
    BEFORE INSERT OR UPDATE ON password_complexity_requirements
    FOR EACH ROW
    EXECUTE FUNCTION enforce_single_active_password_config();

-- Function to clean up old password history based on the current configuration
CREATE OR REPLACE FUNCTION cleanup_password_history()
RETURNS void AS $$
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
$$ LANGUAGE plpgsql;

-- Insert default password complexity configuration
INSERT INTO password_complexity_requirements (
    min_length,
    max_length,
    require_uppercase,
    require_lowercase,
    require_numbers,
    require_special_characters,
    special_character_set,
    prevent_common_passwords,
    prevent_user_info_in_password,
    enable_password_history,
    password_history_count,
    enable_password_expiration,
    expiration_days,
    is_active
) VALUES (
    8,
    128,
    true,
    true,
    true,
    true,
    '!@#$%^&*()_+-=[]{}|;:,.<>?',
    true,
    true,
    true,
    5,
    true,
    90,
    true
) ON CONFLICT DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_password_complexity_active ON password_complexity_requirements(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_password_history_user_id ON password_history(user_id);
CREATE INDEX IF NOT EXISTS idx_password_history_created_at ON password_history(created_at);
CREATE INDEX IF NOT EXISTS idx_common_passwords_hash ON common_passwords(password_hash);
CREATE INDEX IF NOT EXISTS idx_common_passwords_active ON common_passwords(is_active);
CREATE INDEX IF NOT EXISTS idx_users_password_changed_at ON users(password_changed_at);
CREATE INDEX IF NOT EXISTS idx_users_password_expires_at ON users(password_expires_at);
CREATE INDEX IF NOT EXISTS idx_users_force_password_change ON users(force_password_change) WHERE force_password_change = true;

-- Comments for documentation
COMMENT ON TABLE password_complexity_requirements IS 'Stores configurable password complexity requirements';
COMMENT ON TABLE password_history IS 'Stores password history to prevent reuse';
COMMENT ON TABLE common_passwords IS 'Stores common passwords that should be prevented';

COMMENT ON COLUMN password_complexity_requirements.min_length IS 'Minimum password length (1-256)';
COMMENT ON COLUMN password_complexity_requirements.max_length IS 'Maximum password length (optional)';
COMMENT ON COLUMN password_complexity_requirements.require_uppercase IS 'Require at least one uppercase letter';
COMMENT ON COLUMN password_complexity_requirements.require_lowercase IS 'Require at least one lowercase letter';
COMMENT ON COLUMN password_complexity_requirements.require_numbers IS 'Require at least one number';
COMMENT ON COLUMN password_complexity_requirements.require_special_characters IS 'Require at least one special character';
COMMENT ON COLUMN password_complexity_requirements.special_character_set IS 'Allowed special characters';
COMMENT ON COLUMN password_complexity_requirements.prevent_common_passwords IS 'Prevent use of common passwords';
COMMENT ON COLUMN password_complexity_requirements.prevent_user_info_in_password IS 'Prevent use of user information in passwords';
COMMENT ON COLUMN password_complexity_requirements.enable_password_history IS 'Whether password history tracking is enabled';
COMMENT ON COLUMN password_complexity_requirements.password_history_count IS 'Number of previous passwords to remember (0 to disable)';
COMMENT ON COLUMN password_complexity_requirements.enable_password_expiration IS 'Whether password expiration is enabled';
COMMENT ON COLUMN password_complexity_requirements.expiration_days IS 'Days until password expires (null to disable)';
COMMENT ON COLUMN password_complexity_requirements.is_active IS 'Whether this configuration is currently active';

COMMENT ON COLUMN users.password_changed_at IS 'When the password was last changed';
COMMENT ON COLUMN users.password_expires_at IS 'When the current password expires';
COMMENT ON COLUMN users.force_password_change IS 'Whether the user must change their password on next login';