-- Migration 071: agent_commands.delivered_at column
--
-- The GET /:agent_id/commands route (agent polling) marks delivered
-- commands by running:
--   UPDATE agent_commands SET status='delivered', delivered_at=NOW()
-- ...but the column was never added to the schema. The bug only
-- surfaced once an actual update_packages row existed to be polled,
-- because no other command type ever inserted a row through the
-- generic POST /commands route on this prod DB.
--
-- Add the column. Existing rows get NULL (none of them were ever
-- "delivered" through this code path so a backfill would be wrong).

ALTER TABLE agent_commands
ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

COMMENT ON COLUMN agent_commands.delivered_at IS
  'When the agent polled and was handed this command. NULL means the agent has not yet picked it up. Distinct from started_at (set by the agent when execution begins) and completed_at (set when the agent posts a result).';
