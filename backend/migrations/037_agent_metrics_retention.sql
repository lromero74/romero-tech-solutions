-- Migration: 037_agent_metrics_retention.sql
-- Purpose: Implement 1-year data retention policy for agent_metrics table
-- Author: Claude Code
-- Date: 2025-10-11

-- Add index on collected_at for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_agent_metrics_collected_at ON agent_metrics (collected_at);

-- Create function to clean up old metrics (older than 365 days)
CREATE OR REPLACE FUNCTION cleanup_old_agent_metrics()
RETURNS TABLE(deleted_count bigint) AS $$
DECLARE
  rows_deleted bigint;
BEGIN
  -- Delete metrics older than 365 days
  DELETE FROM agent_metrics
  WHERE collected_at < NOW() - INTERVAL '365 days';

  GET DIAGNOSTICS rows_deleted = ROW_COUNT;

  -- Log the cleanup operation
  RAISE NOTICE 'Cleaned up % old agent_metrics records (older than 365 days)', rows_deleted;

  RETURN QUERY SELECT rows_deleted;
END;
$$ LANGUAGE plpgsql;

-- Add comment to explain the retention policy
COMMENT ON FUNCTION cleanup_old_agent_metrics() IS 'Deletes agent_metrics records older than 365 days to maintain 1-year retention policy';

-- Execute initial cleanup (safe - only deletes old data)
SELECT cleanup_old_agent_metrics();

-- Note: For automatic periodic cleanup, set up a cron job or scheduled task:
-- Example cron entry (daily at 2 AM):
-- 0 2 * * * psql -d romerotechsolutions -c "SELECT cleanup_old_agent_metrics();"
