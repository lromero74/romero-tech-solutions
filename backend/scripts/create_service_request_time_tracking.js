#!/usr/bin/env node

import { getPool } from '../config/database.js';

async function createServiceRequestTimeTrackingTables() {
  const pool = await getPool();

  console.log('🔧 Creating service request time tracking and closure system tables...');

  try {
    // 1. Create service_request_closure_reasons table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_request_closure_reasons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reason_name VARCHAR(100) NOT NULL UNIQUE,
        reason_description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created service_request_closure_reasons table');

    // 2. Create service_request_time_entries table for start/stop tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_request_time_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        action_type VARCHAR(10) NOT NULL CHECK (action_type IN ('start', 'stop')),
        action_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_by_type VARCHAR(20) NOT NULL DEFAULT 'employee',
        created_by_id UUID NOT NULL,
        created_by_name VARCHAR(255) NOT NULL
      )
    `);
    console.log('✅ Created service_request_time_entries table');

    // 3. Add closure-related columns to service_requests table
    await pool.query(`
      ALTER TABLE service_requests
      ADD COLUMN IF NOT EXISTS current_status VARCHAR(20) DEFAULT 'pending' CHECK (current_status IN ('pending', 'acknowledged', 'in_progress', 'paused', 'completed', 'closed')),
      ADD COLUMN IF NOT EXISTS closure_reason_id UUID REFERENCES service_request_closure_reasons(id),
      ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS closed_by_employee_id UUID REFERENCES employees(id),
      ADD COLUMN IF NOT EXISTS total_work_duration_minutes INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_start_time TIMESTAMP WITH TIME ZONE
    `);
    console.log('✅ Added closure and time tracking columns to service_requests table');

    // 4. Insert default closure reasons
    await pool.query(`
      INSERT INTO service_request_closure_reasons (reason_name, reason_description)
      VALUES
        ('Request Complete', 'Service request has been successfully completed'),
        ('Customer Cancelled', 'Customer cancelled the service request'),
        ('Technician Cancelled', 'Technician cancelled the service request'),
        ('Duplicate Request', 'This is a duplicate of another service request'),
        ('Unable to Complete', 'Service request cannot be completed due to technical or other constraints')
      ON CONFLICT (reason_name) DO NOTHING
    `);
    console.log('✅ Inserted default closure reasons');

    // 5. Create indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_service_request_time_entries_service_request_id
      ON service_request_time_entries(service_request_id);

      CREATE INDEX IF NOT EXISTS idx_service_request_time_entries_employee_id
      ON service_request_time_entries(employee_id);

      CREATE INDEX IF NOT EXISTS idx_service_request_time_entries_action_timestamp
      ON service_request_time_entries(action_timestamp);

      CREATE INDEX IF NOT EXISTS idx_service_requests_current_status
      ON service_requests(current_status);

      CREATE INDEX IF NOT EXISTS idx_service_requests_closure_reason_id
      ON service_requests(closure_reason_id);
    `);
    console.log('✅ Created performance indexes');

    // 6. Create a view for calculating total work time
    await pool.query(`
      CREATE OR REPLACE VIEW v_service_request_work_time AS
      SELECT
        sr.id,
        sr.request_number,
        sr.total_work_duration_minutes,
        sr.current_status,
        sr.last_start_time,
        CASE
          WHEN sr.current_status = 'in_progress' AND sr.last_start_time IS NOT NULL THEN
            sr.total_work_duration_minutes + EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - sr.last_start_time))/60
          ELSE sr.total_work_duration_minutes
        END AS current_total_minutes,
        CASE
          WHEN sr.current_status = 'in_progress' AND sr.last_start_time IS NOT NULL THEN
            EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - sr.last_start_time))/60
          ELSE 0
        END as current_session_minutes
      FROM service_requests sr
    `);
    console.log('✅ Created v_service_request_work_time view');

    console.log('🎉 Service request time tracking and closure system tables created successfully!');

  } catch (error) {
    console.error('❌ Error creating service request time tracking tables:', error);
    throw error;
  } finally {
    // Don't close the pool here since it might be used elsewhere
  }
}

// Run the script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createServiceRequestTimeTrackingTables()
    .then(() => {
      console.log('✅ Database schema update completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Database schema update failed:', error);
      process.exit(1);
    });
}

export default createServiceRequestTimeTrackingTables;