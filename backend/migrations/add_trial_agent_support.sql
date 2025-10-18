-- Migration: Add Trial Agent Support
-- Purpose: Enable 30-day free trial for potential clients
-- Date: 2025-10-18

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Modify agent_devices table to support trial agents
-- ═══════════════════════════════════════════════════════════════════════════

-- Add trial-related columns
ALTER TABLE agent_devices
ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS trial_start_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS trial_converted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS trial_converted_to_agent_id UUID REFERENCES agent_devices(id),
ADD COLUMN IF NOT EXISTS trial_original_id VARCHAR(255); -- Original trial-{timestamp} ID

-- Allow NULL business_id and service_location_id for trial agents
ALTER TABLE agent_devices
ALTER COLUMN business_id DROP NOT NULL,
ALTER COLUMN service_location_id DROP NOT NULL;

-- Add index for trial queries (performance optimization)
CREATE INDEX IF NOT EXISTS idx_agent_devices_trial
ON agent_devices(is_trial)
WHERE is_trial = true;

-- Add index for trial expiration queries
CREATE INDEX IF NOT EXISTS idx_agent_devices_trial_expiry
ON agent_devices(trial_end_date)
WHERE is_trial = true AND trial_converted_at IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN agent_devices.is_trial IS 'True if this is a trial agent (30-day free trial)';
COMMENT ON COLUMN agent_devices.trial_start_date IS 'When the trial started';
COMMENT ON COLUMN agent_devices.trial_end_date IS 'When the trial expires';
COMMENT ON COLUMN agent_devices.trial_converted_at IS 'When trial was converted to paid account';
COMMENT ON COLUMN agent_devices.trial_converted_to_agent_id IS 'New agent_id after conversion (if converted)';
COMMENT ON COLUMN agent_devices.trial_original_id IS 'Original trial ID (trial-{timestamp}) before conversion';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Create trial analytics view
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW trial_analytics AS
SELECT
  DATE(trial_start_date) as trial_date,
  COUNT(*) as trials_started,
  COUNT(CASE WHEN trial_converted_at IS NOT NULL THEN 1 END) as trials_converted,
  COUNT(CASE WHEN trial_end_date < NOW() AND trial_converted_at IS NULL THEN 1 END) as trials_expired,
  COUNT(CASE WHEN trial_end_date > NOW() AND trial_converted_at IS NULL THEN 1 END) as trials_active,
  ROUND(100.0 * COUNT(CASE WHEN trial_converted_at IS NOT NULL THEN 1 END) / NULLIF(COUNT(*), 0), 2) as conversion_rate_percent,
  ROUND(AVG(EXTRACT(EPOCH FROM (trial_converted_at - trial_start_date)) / 86400), 1) as avg_days_to_convert,
  ROUND(AVG(EXTRACT(EPOCH FROM (trial_end_date - trial_start_date)) / 86400), 1) as avg_trial_duration_days
FROM agent_devices
WHERE is_trial = true
GROUP BY DATE(trial_start_date)
ORDER BY trial_date DESC;

COMMENT ON VIEW trial_analytics IS 'Trial agent analytics for tracking conversion rates and trial performance';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Create function to get trial status
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_trial_status(p_agent_id UUID)
RETURNS TABLE (
  is_active BOOLEAN,
  days_remaining INTEGER,
  days_elapsed INTEGER,
  percent_used INTEGER,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (ad.trial_end_date > NOW() AND ad.trial_converted_at IS NULL) as is_active,
    GREATEST(0, EXTRACT(DAY FROM (ad.trial_end_date - NOW()))::INTEGER) as days_remaining,
    GREATEST(0, EXTRACT(DAY FROM (NOW() - ad.trial_start_date))::INTEGER) as days_elapsed,
    CASE
      WHEN EXTRACT(EPOCH FROM (ad.trial_end_date - ad.trial_start_date)) > 0 THEN
        LEAST(100, ROUND(100.0 * EXTRACT(EPOCH FROM (NOW() - ad.trial_start_date)) /
                         EXTRACT(EPOCH FROM (ad.trial_end_date - ad.trial_start_date)))::INTEGER)
      ELSE 0
    END as percent_used,
    CASE
      WHEN ad.trial_converted_at IS NOT NULL THEN 'converted'
      WHEN ad.trial_end_date < NOW() THEN 'expired'
      WHEN ad.trial_end_date > NOW() THEN 'active'
      ELSE 'unknown'
    END as status
  FROM agent_devices ad
  WHERE ad.id = p_agent_id AND ad.is_trial = true;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_trial_status IS 'Get current status of a trial agent including days remaining and expiration status';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Create function to check if trial is expired
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_trial_expired(p_agent_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM agent_devices
    WHERE id = p_agent_id
      AND is_trial = true
      AND trial_end_date < NOW()
      AND trial_converted_at IS NULL
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_trial_expired IS 'Check if a trial agent has expired (and not been converted)';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Create trigger to prevent metrics from expired trials
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION check_trial_expiration()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if agent is an expired trial
  IF EXISTS (
    SELECT 1 FROM agent_devices
    WHERE id = NEW.agent_device_id
      AND is_trial = true
      AND trial_end_date < NOW()
      AND trial_converted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Trial has expired. Please subscribe to continue monitoring.'
      USING HINT = 'Visit https://romerotechsolutions.com/pricing to subscribe';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_expired_trial_metrics
BEFORE INSERT ON agent_metrics
FOR EACH ROW
EXECUTE FUNCTION check_trial_expiration();

COMMENT ON TRIGGER prevent_expired_trial_metrics ON agent_metrics IS 'Prevents metrics insertion from expired trial agents';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Grant necessary permissions
-- ═══════════════════════════════════════════════════════════════════════════

-- Grant view access to application role (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rts_backend') THEN
    GRANT SELECT ON trial_analytics TO rts_backend;
    GRANT EXECUTE ON FUNCTION get_trial_status TO rts_backend;
    GRANT EXECUTE ON FUNCTION is_trial_expired TO rts_backend;
  END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Migration complete!
-- ═══════════════════════════════════════════════════════════════════════════

-- Verification queries (run these to test):
--
-- 1. Check if trial columns were added:
--    SELECT column_name, data_type, is_nullable
--    FROM information_schema.columns
--    WHERE table_name = 'agent_devices' AND column_name LIKE 'trial%';
--
-- 2. Test trial status function:
--    SELECT * FROM get_trial_status('some-uuid-here');
--
-- 3. View trial analytics:
--    SELECT * FROM trial_analytics;
