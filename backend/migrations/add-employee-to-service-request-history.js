import { getPool } from '../config/database.js';

/**
 * Migration: Add employee support to service_request_history
 *
 * Makes changed_by_user_id nullable and adds changed_by_employee_id
 * to support both users and employees making changes to service requests
 */

async function migrate() {
  const pool = await getPool();

  try {
    console.log('Starting migration: Add employee support to service_request_history');

    // Step 1: Make changed_by_user_id nullable
    console.log('Step 1: Making changed_by_user_id nullable...');
    await pool.query(`
      ALTER TABLE service_request_history
      ALTER COLUMN changed_by_user_id DROP NOT NULL
    `);
    console.log('✅ changed_by_user_id is now nullable');

    // Step 2: Add changed_by_employee_id column
    console.log('Step 2: Adding changed_by_employee_id column...');
    await pool.query(`
      ALTER TABLE service_request_history
      ADD COLUMN changed_by_employee_id UUID REFERENCES employees(id)
    `);
    console.log('✅ changed_by_employee_id column added');

    // Step 3: Add check constraint to ensure at least one is set
    console.log('Step 3: Adding check constraint...');
    await pool.query(`
      ALTER TABLE service_request_history
      ADD CONSTRAINT service_request_history_changed_by_check
      CHECK (
        (changed_by_user_id IS NOT NULL AND changed_by_employee_id IS NULL) OR
        (changed_by_user_id IS NULL AND changed_by_employee_id IS NOT NULL)
      )
    `);
    console.log('✅ Check constraint added (ensures exactly one of user/employee is set)');

    console.log('✅ Migration completed successfully');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate();
