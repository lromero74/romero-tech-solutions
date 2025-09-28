-- Migration: Service Request File Associations
-- Description: Add service request association to file system
-- Date: 2025-09-27

-- Add service_request_id column to t_client_files table
ALTER TABLE t_client_files
ADD COLUMN service_request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX idx_client_files_service_request_id ON t_client_files(service_request_id);

-- Create view for service request files
CREATE OR REPLACE VIEW v_service_request_files AS
SELECT
  sr.id as request_id,
  sr.title as request_title,
  sr.urgency_level,
  sr.status,
  cf.file_id,
  cf.file_name,
  cf.original_name,
  cf.file_size_bytes,
  cf.size_formatted,
  cf.mime_type,
  cf.description as file_description,
  cf.category_name,
  cf.created_at as file_uploaded_at,
  c.first_name,
  c.last_name,
  b.business_name
FROM service_requests sr
JOIN t_client_files cf ON sr.id = cf.service_request_id
JOIN users c ON cf.uploaded_by_user_id = c.id
JOIN businesses b ON cf.business_id = b.id
WHERE sr.soft_delete = false
  AND cf.soft_delete = false;

-- Add constraint to ensure files can only be associated with one service request
-- Note: This is enforced by the column design, but adding a comment for clarity
COMMENT ON COLUMN t_client_files.service_request_id IS 'Associates file with a service request. Files can only be linked to one service request. NULL means general file not associated with any service request.';

-- Update the quota function to handle service request files appropriately
-- Files associated with service requests still count toward quota
CREATE OR REPLACE FUNCTION update_quota_usage()
RETURNS TRIGGER AS $$
BEGIN
  -- This function remains the same - service request files still count toward quota
  IF TG_OP = 'INSERT' THEN
    UPDATE t_client_storage_quotas
    SET
      current_usage_bytes = current_usage_bytes + NEW.file_size_bytes,
      last_updated = CURRENT_TIMESTAMP
    WHERE business_id = NEW.business_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only update if file size changed (unlikely but possible)
    IF OLD.file_size_bytes != NEW.file_size_bytes THEN
      UPDATE t_client_storage_quotas
      SET
        current_usage_bytes = current_usage_bytes + (NEW.file_size_bytes - OLD.file_size_bytes),
        last_updated = CURRENT_TIMESTAMP
      WHERE business_id = NEW.business_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE t_client_storage_quotas
    SET
      current_usage_bytes = current_usage_bytes - OLD.file_size_bytes,
      last_updated = CURRENT_TIMESTAMP
    WHERE business_id = OLD.business_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add function to get files for a specific service request
CREATE OR REPLACE FUNCTION get_service_request_files(p_request_id UUID)
RETURNS TABLE (
  file_id UUID,
  file_name TEXT,
  original_name TEXT,
  file_size_bytes BIGINT,
  size_formatted TEXT,
  mime_type TEXT,
  description TEXT,
  category_name TEXT,
  created_at TIMESTAMP,
  client_name TEXT,
  business_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cf.file_id,
    cf.file_name,
    cf.original_name,
    cf.file_size_bytes,
    cf.size_formatted,
    cf.mime_type,
    cf.description,
    cf.category_name,
    cf.created_at,
    CONCAT(c.first_name, ' ', c.last_name) as client_name,
    b.business_name
  FROM t_client_files cf
  JOIN users c ON cf.uploaded_by_user_id = c.id
  JOIN businesses b ON cf.business_id = b.id
  WHERE cf.service_request_id = p_request_id
    AND cf.soft_delete = false
  ORDER BY cf.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Add function to associate existing file with service request
CREATE OR REPLACE FUNCTION associate_file_with_service_request(
  p_file_id UUID,
  p_request_id UUID,
  p_client_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_file_count INTEGER;
  v_request_count INTEGER;
  v_client_access BOOLEAN := false;
BEGIN
  -- Verify file exists and belongs to client
  SELECT COUNT(*) INTO v_file_count
  FROM t_client_files
  WHERE file_id = p_file_id
    AND uploaded_by_user_id = p_client_id
    AND soft_delete = false;

  IF v_file_count = 0 THEN
    RETURN false;
  END IF;

  -- Verify service request exists and client has access
  SELECT COUNT(*) INTO v_request_count
  FROM service_requests sr
  JOIN users c ON sr.business_id = c.business_id
  WHERE sr.id = p_request_id
    AND c.id = p_client_id
    AND sr.soft_delete = false;

  IF v_request_count = 0 THEN
    RETURN false;
  END IF;

  -- Associate file with service request
  UPDATE t_client_files
  SET
    service_request_id = p_request_id,
    updated_at = CURRENT_TIMESTAMP
  WHERE file_id = p_file_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Add function to disassociate file from service request
CREATE OR REPLACE FUNCTION disassociate_file_from_service_request(
  p_file_id UUID,
  p_client_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_file_count INTEGER;
BEGIN
  -- Verify file exists and belongs to client
  SELECT COUNT(*) INTO v_file_count
  FROM t_client_files
  WHERE file_id = p_file_id
    AND uploaded_by_user_id = p_client_id
    AND soft_delete = false;

  IF v_file_count = 0 THEN
    RETURN false;
  END IF;

  -- Remove association
  UPDATE t_client_files
  SET
    service_request_id = NULL,
    updated_at = CURRENT_TIMESTAMP
  WHERE file_id = p_file_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;