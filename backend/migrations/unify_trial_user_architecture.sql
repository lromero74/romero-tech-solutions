-- Migration: Unify Trial User Architecture
-- Purpose: Make trial users work like regular users with businesses, eliminating special trial logic
-- Date: 2025-10-18
--
-- Changes:
--   1. Add is_trial and trial_expires_at to users table
--   2. Create businesses for existing trial users
--   3. Link trial users and their agents to these businesses
--   4. Ensure all trial agents have proper business_id

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Add trial columns to users table
-- ═══════════════════════════════════════════════════════════════════════════

-- Add is_trial flag to users table (defaults to false for existing users)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT false;

-- Add trial_expires_at to track when trial ends
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN users.is_trial IS 'Indicates if this user is on a trial subscription';
COMMENT ON COLUMN users.trial_expires_at IS 'When the trial period expires (30 days from registration)';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Create businesses for existing trial users and link everything properly
-- ═══════════════════════════════════════════════════════════════════════════

-- For each trial agent that has a trial_user_id, we need to:
--   a. Ensure the user exists and is marked as trial
--   b. Create a business if user doesn't have one
--   c. Link the user to their business
--   d. Link the agent to the business

DO $$
DECLARE
    trial_agent RECORD;
    trial_user RECORD;
    business_id_var UUID;
    business_name_var VARCHAR(255);
BEGIN
    -- Loop through all trial agents that have a trial_user_id
    FOR trial_agent IN
        SELECT id, trial_user_id, trial_email, device_name, trial_start_date, trial_end_date
        FROM agent_devices
        WHERE is_trial = true AND trial_user_id IS NOT NULL
    LOOP
        RAISE NOTICE 'Processing trial agent: % (user: %)', trial_agent.id, trial_agent.trial_user_id;

        -- Get the trial user
        SELECT * INTO trial_user FROM users WHERE id = trial_agent.trial_user_id;

        IF trial_user.id IS NOT NULL THEN
            -- Mark user as trial
            UPDATE users
            SET
                is_trial = true,
                trial_expires_at = COALESCE(trial_agent.trial_end_date, trial_agent.trial_start_date + INTERVAL '30 days', NOW() + INTERVAL '30 days')
            WHERE id = trial_user.id;

            RAISE NOTICE 'Marked user % as trial', trial_user.id;

            -- Check if user already has a business
            IF trial_user.business_id IS NOT NULL THEN
                business_id_var := trial_user.business_id;
                RAISE NOTICE 'User already has business: %', business_id_var;
            ELSE
                -- Create a business for this trial user
                business_name_var := COALESCE(trial_user.first_name || ' ' || trial_user.last_name, trial_agent.trial_email, 'Trial Business') || ' (Trial)';

                INSERT INTO businesses (id, business_name, is_active, is_individual, created_at, updated_at)
                VALUES (gen_random_uuid(), business_name_var, true, true, NOW(), NOW())
                RETURNING id INTO business_id_var;

                RAISE NOTICE 'Created business % for user %', business_id_var, trial_user.id;

                -- Link user to their new business
                UPDATE users
                SET business_id = business_id_var
                WHERE id = trial_user.id;

                RAISE NOTICE 'Linked user % to business %', trial_user.id, business_id_var;
            END IF;

            -- Link the agent to the business
            UPDATE agent_devices
            SET business_id = business_id_var
            WHERE id = trial_agent.id;

            RAISE NOTICE 'Linked agent % to business %', trial_agent.id, business_id_var;
        ELSE
            RAISE WARNING 'Trial user % not found for agent %', trial_agent.trial_user_id, trial_agent.id;
        END IF;
    END LOOP;

    -- Handle trial agents without trial_user_id (orphaned trials)
    FOR trial_agent IN
        SELECT id, trial_email, device_name, trial_start_date, trial_end_date
        FROM agent_devices
        WHERE is_trial = true AND trial_user_id IS NULL AND business_id IS NULL
    LOOP
        RAISE NOTICE 'Found orphaned trial agent: % (email: %)', trial_agent.id, trial_agent.trial_email;

        -- If there's a trial_email, try to find or create a user
        IF trial_agent.trial_email IS NOT NULL THEN
            -- Try to find existing user by email
            SELECT * INTO trial_user FROM users WHERE email = trial_agent.trial_email LIMIT 1;

            IF trial_user.id IS NOT NULL THEN
                RAISE NOTICE 'Found existing user % for orphaned agent', trial_user.id;

                -- Mark user as trial
                UPDATE users
                SET
                    is_trial = true,
                    trial_expires_at = COALESCE(trial_agent.trial_end_date, trial_agent.trial_start_date + INTERVAL '30 days', NOW() + INTERVAL '30 days')
                WHERE id = trial_user.id;

                -- Ensure user has a business
                IF trial_user.business_id IS NULL THEN
                    business_name_var := COALESCE(trial_user.first_name || ' ' || trial_user.last_name, trial_agent.trial_email, 'Trial Business') || ' (Trial)';

                    INSERT INTO businesses (id, business_name, is_active, is_individual, created_at, updated_at)
                    VALUES (gen_random_uuid(), business_name_var, true, true, NOW(), NOW())
                    RETURNING id INTO business_id_var;

                    UPDATE users
                    SET business_id = business_id_var
                    WHERE id = trial_user.id;
                ELSE
                    business_id_var := trial_user.business_id;
                END IF;

                -- Link agent to business
                UPDATE agent_devices
                SET
                    business_id = business_id_var,
                    trial_user_id = trial_user.id
                WHERE id = trial_agent.id;

                RAISE NOTICE 'Linked orphaned agent % to business %', trial_agent.id, business_id_var;
            ELSE
                RAISE WARNING 'No user found for orphaned trial agent % with email %', trial_agent.id, trial_agent.trial_email;
            END IF;
        ELSE
            RAISE WARNING 'Orphaned trial agent % has no email - cannot link to user/business', trial_agent.id;
        END IF;
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Verify results
-- ═══════════════════════════════════════════════════════════════════════════

-- Show trial agents and their business associations
DO $$
DECLARE
    linked_count INTEGER;
    unlinked_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO linked_count FROM agent_devices WHERE is_trial = true AND business_id IS NOT NULL;
    SELECT COUNT(*) INTO unlinked_count FROM agent_devices WHERE is_trial = true AND business_id IS NULL;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Trial Agent Business Association Summary:';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Trial agents with business_id: %', linked_count;
    RAISE NOTICE 'Trial agents without business_id: %', unlinked_count;

    IF unlinked_count > 0 THEN
        RAISE WARNING 'Some trial agents still lack business associations - manual intervention may be needed';
    ELSE
        RAISE NOTICE 'SUCCESS: All trial agents are now associated with businesses!';
    END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration complete!
-- ═══════════════════════════════════════════════════════════════════════════

-- Verification queries (run after migration):
--
-- 1. Check trial users:
--    SELECT id, email, is_trial, trial_expires_at, business_id FROM users WHERE is_trial = true;
--
-- 2. Check trial agents and their business links:
--    SELECT ad.id, ad.device_name, ad.business_id, b.business_name, ad.trial_user_id, u.email
--    FROM agent_devices ad
--    LEFT JOIN businesses b ON ad.business_id = b.id
--    LEFT JOIN users u ON ad.trial_user_id = u.id
--    WHERE ad.is_trial = true;
--
-- 3. Check for any orphaned trial agents:
--    SELECT * FROM agent_devices WHERE is_trial = true AND business_id IS NULL;
