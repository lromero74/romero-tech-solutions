-- Migration: Add audit_logs table for comprehensive security auditing
-- Date: 2025-09-30
-- Purpose: Replace/enhance security_logs with more comprehensive audit logging

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  user_id INTEGER,
  user_email VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  resource VARCHAR(255),
  action VARCHAR(100),
  result VARCHAR(50),
  reason VARCHAR(255),
  session_id INTEGER,
  event_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_email ON audit_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address);

-- Add comment
COMMENT ON TABLE audit_logs IS 'Comprehensive audit log for security-relevant events';
COMMENT ON COLUMN audit_logs.event_type IS 'Type of audit event (login_success, login_failure, etc.)';
COMMENT ON COLUMN audit_logs.user_id IS 'User ID associated with the event (null for anonymous events)';
COMMENT ON COLUMN audit_logs.event_data IS 'Additional event metadata stored as JSON';
COMMENT ON COLUMN audit_logs.created_at IS 'Timestamp when the event occurred';

-- Create function to automatically clean up old audit logs based on retention policy
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM audit_logs
  WHERE created_at < NOW() - INTERVAL '365 days'
  RETURNING id INTO deleted_count;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_audit_logs IS 'Automatically clean up audit logs older than 365 days';

-- Note: This table can coexist with security_logs table
-- security_logs will be used as fallback if audit_logs doesn't exist