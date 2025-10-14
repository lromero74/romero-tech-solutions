-- Migration: Add Mac App Store (mas) package manager tracking
-- Description: Adds mas_outdated field to track outdated Mac App Store applications
-- Date: 2025-10-13

-- Add mas_outdated column to agent_metrics table
ALTER TABLE agent_metrics
ADD COLUMN IF NOT EXISTS mas_outdated INTEGER DEFAULT 0;

-- Create index for mas_outdated queries
CREATE INDEX IF NOT EXISTS idx_agent_metrics_mas_outdated
ON agent_metrics(mas_outdated)
WHERE mas_outdated > 0;

-- Add comment to document the column
COMMENT ON COLUMN agent_metrics.mas_outdated IS 'Number of outdated Mac App Store applications (macOS only)';
