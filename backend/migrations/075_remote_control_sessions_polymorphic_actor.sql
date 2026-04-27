-- Migration 075: remote_control_sessions.initiated_by_user becomes polymorphic
--
-- Same fix as migration 070 applied to remote_control_sessions:
-- the column may hold either an employees.id (MSP technician
-- using the dashboard) OR a users.id (client triggering it on
-- their own device, when we eventually expose that). Drop the
-- FK to users so both work.
--
-- Discovered in Phase 5 dogfood when the dashboard's executive
-- account (employee) tried to start a remote-control session and
-- the INSERT failed with foreign key violation:
--   "violates foreign key constraint
--   remote_control_sessions_initiated_by_user_fkey"

ALTER TABLE remote_control_sessions
  DROP CONSTRAINT IF EXISTS remote_control_sessions_initiated_by_user_fkey;

COMMENT ON COLUMN remote_control_sessions.initiated_by_user IS
  'UUID of the actor who initiated the session. References employees.id when an MSP technician triggered it, or users.id when a client triggered it on their own device. Resolve via JOIN-then-fallback in the audit log query.';
