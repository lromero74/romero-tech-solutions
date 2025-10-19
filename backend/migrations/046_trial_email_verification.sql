-- Migration 046: Add Email Verification for Trial Agents
-- This migration adds email verification support for trial agent registrations
-- Allows multiple trial agents to be associated with a single verified email address
-- Prevents trial registration with emails that exist as non-trial users

-- ============================================================================
-- 1. Add email field to agent_devices for trial users
-- ============================================================================

-- Add email column for trial agents (allows aggregating multiple trial agents per user)
ALTER TABLE agent_devices
ADD COLUMN trial_email VARCHAR(255);

-- Add index for trial email lookups
CREATE INDEX idx_agent_devices_trial_email ON agent_devices(trial_email)
WHERE is_trial = true AND trial_email IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN agent_devices.trial_email IS
'Email address for trial agent registration. Used to aggregate multiple trial agents under one email. Required for trials.';

-- ============================================================================
-- 2. Create trial_email_verifications table (separate from regular email_verifications)
-- ============================================================================

-- Separate table for trial verifications to avoid conflicts with client registrations
CREATE TABLE IF NOT EXISTS trial_email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  verification_code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  trial_data JSONB DEFAULT '{}'::jsonb, -- Store trial-specific metadata
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient lookups
CREATE INDEX idx_trial_email_verifications_email ON trial_email_verifications(email);
CREATE INDEX idx_trial_email_verifications_expires ON trial_email_verifications(expires_at);

-- Add comments
COMMENT ON TABLE trial_email_verifications IS
'Email verification codes for trial agent registrations. Separate from client registration verifications.';

COMMENT ON COLUMN trial_email_verifications.trial_data IS
'JSON metadata about trial registration (device info, timestamp, etc.)';

-- ============================================================================
-- 3. Add trigger to update updated_at timestamp
-- ============================================================================

CREATE TRIGGER update_trial_email_verifications_updated_at
BEFORE UPDATE ON trial_email_verifications
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. Create trial_users table for easy migration to full accounts
-- ============================================================================

-- This table tracks trial users and facilitates easy conversion to full accounts
CREATE TABLE IF NOT EXISTS trial_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  email_verified BOOLEAN DEFAULT FALSE,
  email_verified_at TIMESTAMPTZ,

  -- Trial metadata
  trial_start_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  trial_expires_at TIMESTAMPTZ,
  agent_count INTEGER DEFAULT 0, -- Number of agents registered under this email

  -- Conversion tracking
  converted BOOLEAN DEFAULT FALSE,
  converted_at TIMESTAMPTZ,
  converted_to_user_id UUID REFERENCES users(id),
  converted_to_business_id UUID REFERENCES businesses(id),

  -- Contact information (collected during trial)
  contact_name VARCHAR(255),
  phone VARCHAR(50),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_access TIMESTAMPTZ,

  CONSTRAINT trial_users_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Indexes for performance
CREATE INDEX idx_trial_users_email ON trial_users(email);
CREATE INDEX idx_trial_users_converted ON trial_users(converted) WHERE converted = false;
CREATE INDEX idx_trial_users_expires ON trial_users(trial_expires_at);

-- Add comments
COMMENT ON TABLE trial_users IS
'Tracks trial users and provides easy migration path to full registration. Links trial agents to verified email addresses.';

COMMENT ON COLUMN trial_users.agent_count IS
'Count of trial agents associated with this email (auto-updated via trigger)';

COMMENT ON COLUMN trial_users.converted IS
'TRUE when trial user has converted to a full paid account';

COMMENT ON COLUMN trial_users.converted_to_user_id IS
'References the users table record created during conversion';

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_trial_users_updated_at
BEFORE UPDATE ON trial_users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. Add foreign key from agent_devices to trial_users
-- ============================================================================

-- Add trial_user_id to link trial agents to their email account
ALTER TABLE agent_devices
ADD COLUMN trial_user_id UUID REFERENCES trial_users(id);

-- Index for efficient joins
CREATE INDEX idx_agent_devices_trial_user_id ON agent_devices(trial_user_id)
WHERE is_trial = true;

COMMENT ON COLUMN agent_devices.trial_user_id IS
'Links trial agents to the trial_users table for aggregation and conversion tracking';

-- ============================================================================
-- 6. Create function to prevent trial registration with existing non-trial emails
-- ============================================================================

CREATE OR REPLACE FUNCTION check_trial_email_not_registered()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if email exists in users table (non-trial accounts)
  IF EXISTS (
    SELECT 1 FROM users WHERE email = NEW.email AND is_test_account = FALSE
  ) THEN
    RAISE EXCEPTION 'Email address % is already registered as a full account. Please use a different email or sign in.', NEW.email
      USING ERRCODE = '23505'; -- Unique violation error code
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to trial_users table
CREATE TRIGGER prevent_trial_email_duplication
BEFORE INSERT ON trial_users
FOR EACH ROW
EXECUTE FUNCTION check_trial_email_not_registered();

-- ============================================================================
-- 7. Create function to automatically update agent_count in trial_users
-- ============================================================================

CREATE OR REPLACE FUNCTION update_trial_user_agent_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Update agent count when trial agent is added or removed
  IF TG_OP = 'INSERT' AND NEW.trial_user_id IS NOT NULL THEN
    UPDATE trial_users
    SET agent_count = (
      SELECT COUNT(*)
      FROM agent_devices
      WHERE trial_user_id = NEW.trial_user_id
        AND is_trial = true
        AND soft_delete = false
    ),
    last_access = CURRENT_TIMESTAMP
    WHERE id = NEW.trial_user_id;

  ELSIF TG_OP = 'DELETE' AND OLD.trial_user_id IS NOT NULL THEN
    UPDATE trial_users
    SET agent_count = (
      SELECT COUNT(*)
      FROM agent_devices
      WHERE trial_user_id = OLD.trial_user_id
        AND is_trial = true
        AND soft_delete = false
    )
    WHERE id = OLD.trial_user_id;

  ELSIF TG_OP = 'UPDATE' AND OLD.trial_user_id IS NOT NULL THEN
    -- Handle agent moving between trial users or soft delete changes
    UPDATE trial_users
    SET agent_count = (
      SELECT COUNT(*)
      FROM agent_devices
      WHERE trial_user_id = OLD.trial_user_id
        AND is_trial = true
        AND soft_delete = false
    )
    WHERE id = OLD.trial_user_id;

    IF NEW.trial_user_id IS NOT NULL AND NEW.trial_user_id != OLD.trial_user_id THEN
      UPDATE trial_users
      SET agent_count = (
        SELECT COUNT(*)
        FROM agent_devices
        WHERE trial_user_id = NEW.trial_user_id
          AND is_trial = true
          AND soft_delete = false
      ),
      last_access = CURRENT_TIMESTAMP
      WHERE id = NEW.trial_user_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to agent_devices table
-- Note: We can't use TG_OP in WHEN clause, so we check inside the function instead
CREATE TRIGGER maintain_trial_user_agent_count
AFTER INSERT OR UPDATE OR DELETE ON agent_devices
FOR EACH ROW
EXECUTE FUNCTION update_trial_user_agent_count();

-- ============================================================================
-- 8. Migration Complete
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 046 complete: Trial email verification and conversion system installed';
  RAISE NOTICE '   - Added trial_email and trial_user_id columns to agent_devices';
  RAISE NOTICE '   - Created trial_email_verifications table';
  RAISE NOTICE '   - Created trial_users table for conversion tracking';
  RAISE NOTICE '   - Added prevention of duplicate emails between trials and full accounts';
  RAISE NOTICE '   - Added automatic agent counting for trial users';
  RAISE NOTICE '   - Enabled easy migration path from trial to full registration';
END $$;
