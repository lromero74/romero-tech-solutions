-- Migration 072: agent_metrics.clt_update_available column
--
-- The agent (v1.16.48+) reports whether `softwareupdate --list` on
-- macOS shows a pending Command Line Tools update. The dashboard
-- groups system-managed pip packages (Apple's bundled Python 3.9 in
-- /Library/Developer/CommandLineTools) under that signal: when this
-- column is true, the user has an actionable path to refresh those
-- vendor-managed Python packages by installing the pending CLT update.
--
-- Defaults to false because (a) it's only ever true on macOS hosts
-- with a pending CLT update and (b) NULL would be ambiguous between
-- "no CLT update pending" and "agent too old to report".

ALTER TABLE agent_metrics
ADD COLUMN IF NOT EXISTS clt_update_available BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN agent_metrics.clt_update_available IS
  'macOS only: true when the agent saw a pending Command Line Tools update in softwareupdate --list. Used by the dashboard to group vendor-managed pip packages (e.g. /Library/Developer/CommandLineTools) under that update.';
