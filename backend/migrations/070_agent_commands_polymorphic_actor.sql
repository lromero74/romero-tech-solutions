-- Migration 070: agent_commands.requested_by / approved_by become polymorphic
--
-- Background: agent_commands originally tracked employee-issued remote
-- commands only, so requested_by and approved_by were FK'd to employees.
-- With the v1.16.42 update_packages feature, agent owners (role=client,
-- stored in `users`) can also issue commands to their own devices —
-- the same UUID column may now hold either an employees.id or a
-- users.id, which violates the existing FK.
--
-- Resolution: drop the FK constraints. The columns remain UUIDs; the
-- application is responsible for resolving them via either table.
-- Rejected alternative: split into two columns (requested_by_employee,
-- requested_by_user) — that bloats the schema and forces every read
-- site to coalesce. Polymorphic is fine here because the audit-log
-- consumers already display via JOIN-then-fallback patterns.

ALTER TABLE agent_commands DROP CONSTRAINT IF EXISTS agent_commands_requested_by_fkey;
ALTER TABLE agent_commands DROP CONSTRAINT IF EXISTS agent_commands_approved_by_fkey;

-- Keep the indexes on the columns — they're still useful for filtering
-- "commands by actor" without the relational integrity gate.

COMMENT ON COLUMN agent_commands.requested_by IS
  'UUID of the actor who issued the command. References employees.id when an employee triggered it, or users.id when a client triggered it on their own device. Resolve via the agent_devices.business_id + role context.';
COMMENT ON COLUMN agent_commands.approved_by IS
  'UUID of the actor who approved the command (NULL = pending approval). Same polymorphic rules as requested_by.';
