#!/usr/bin/env node

import { getPool } from '../config/database.js';

async function createServiceRequestWorkflowTables() {
  const pool = await getPool();

  console.log('🔧 Creating service request workflow tables...');

  try {
    // 1. Create service_request_acknowledgments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_request_acknowledgments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        acknowledgment_token TEXT NOT NULL UNIQUE,
        acknowledged_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(service_request_id, employee_id)
      )
    `);
    console.log('✅ Created service_request_acknowledgments table');

    // 2. Create service_request_assignments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_request_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        assignment_token TEXT NOT NULL UNIQUE,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(service_request_id)
      )
    `);
    console.log('✅ Created service_request_assignments table');

    // 3. Create service_request_notes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS service_request_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
        note_text TEXT NOT NULL,
        note_type VARCHAR(50) NOT NULL DEFAULT 'general', -- 'general', 'status_change', 'assignment', 'completion'
        created_by_type VARCHAR(20) NOT NULL, -- 'client', 'employee', 'system'
        created_by_id UUID, -- NULL for system-generated notes
        created_by_name VARCHAR(255) NOT NULL, -- display name for the note
        is_visible_to_client BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created service_request_notes table');

    // 4. Add new columns to service_requests table
    await pool.query(`
      ALTER TABLE service_requests
      ADD COLUMN IF NOT EXISTS acknowledged_by_employee_id UUID REFERENCES employees(id),
      ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS assigned_to_employee_id UUID REFERENCES employees(id),
      ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE
    `);
    console.log('✅ Added acknowledgment and assignment columns to service_requests table');

    // 5. Create indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_service_request_acknowledgments_service_request_id
      ON service_request_acknowledgments(service_request_id);

      CREATE INDEX IF NOT EXISTS idx_service_request_acknowledgments_employee_id
      ON service_request_acknowledgments(employee_id);

      CREATE INDEX IF NOT EXISTS idx_service_request_acknowledgments_token
      ON service_request_acknowledgments(acknowledgment_token);

      CREATE INDEX IF NOT EXISTS idx_service_request_assignments_service_request_id
      ON service_request_assignments(service_request_id);

      CREATE INDEX IF NOT EXISTS idx_service_request_assignments_employee_id
      ON service_request_assignments(employee_id);

      CREATE INDEX IF NOT EXISTS idx_service_request_assignments_token
      ON service_request_assignments(assignment_token);

      CREATE INDEX IF NOT EXISTS idx_service_request_notes_service_request_id
      ON service_request_notes(service_request_id);

      CREATE INDEX IF NOT EXISTS idx_service_request_notes_created_at
      ON service_request_notes(created_at);
    `);
    console.log('✅ Created performance indexes');

    console.log('🎉 Service request workflow tables created successfully!');

  } catch (error) {
    console.error('❌ Error creating service request workflow tables:', error);
    throw error;
  } finally {
    // Don't close the pool here since it might be used elsewhere
  }
}

// Run the script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createServiceRequestWorkflowTables()
    .then(() => {
      console.log('✅ Database schema update completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Database schema update failed:', error);
      process.exit(1);
    });
}

export default createServiceRequestWorkflowTables;