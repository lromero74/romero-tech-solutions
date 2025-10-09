-- Migration: Add account lockout fields to employees and users tables
-- Purpose: Implement account-level lockout after repeated failed login attempts
-- Date: 2025-10-08

-- Add lockout fields to employees table
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS account_locked_until TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMP WITH TIME ZONE;

-- Add lockout fields to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS account_locked_until TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_failed_login_at TIMESTAMP WITH TIME ZONE;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_employees_account_locked ON employees(account_locked_until) WHERE account_locked_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_account_locked ON users(account_locked_until) WHERE account_locked_until IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN employees.failed_login_attempts IS 'Counter for consecutive failed login attempts';
COMMENT ON COLUMN employees.account_locked_until IS 'Account locked until this timestamp. NULL means not locked.';
COMMENT ON COLUMN employees.last_failed_login_at IS 'Timestamp of most recent failed login attempt';

COMMENT ON COLUMN users.failed_login_attempts IS 'Counter for consecutive failed login attempts';
COMMENT ON COLUMN users.account_locked_until IS 'Account locked until this timestamp. NULL means not locked.';
COMMENT ON COLUMN users.last_failed_login_at IS 'Timestamp of most recent failed login attempt';
