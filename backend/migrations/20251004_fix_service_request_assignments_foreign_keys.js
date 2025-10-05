/**
 * Migration: Fix service_request_assignments foreign key constraints
 *
 * Problem: The assigned_by_user_id and unassigned_by_user_id columns have foreign key
 * constraints referencing the 'users' table, but they should reference the 'employees' table
 * since these are employee IDs, not user/client IDs.
 *
 * Solution: Drop the incorrect foreign key constraints and recreate them pointing to
 * the employees table.
 */

import { getPool } from '../config/database.js';

async function up() {
  const pool = await getPool();

  try {
    console.log('🔧 Fixing foreign key constraints for service_request_assignments table...');

    await pool.query('BEGIN');

    // Drop incorrect foreign key constraints
    console.log('📤 Dropping incorrect foreign key constraints...');
    await pool.query(`
      ALTER TABLE service_request_assignments
      DROP CONSTRAINT IF EXISTS service_request_assignments_assigned_by_user_id_fkey;
    `);

    await pool.query(`
      ALTER TABLE service_request_assignments
      DROP CONSTRAINT IF EXISTS service_request_assignments_unassigned_by_user_id_fkey;
    `);

    // Add correct foreign key constraints pointing to employees table
    console.log('📥 Adding correct foreign key constraints to employees table...');
    await pool.query(`
      ALTER TABLE service_request_assignments
      ADD CONSTRAINT service_request_assignments_assigned_by_user_id_fkey
      FOREIGN KEY (assigned_by_user_id)
      REFERENCES employees(id)
      ON DELETE SET NULL;
    `);

    await pool.query(`
      ALTER TABLE service_request_assignments
      ADD CONSTRAINT service_request_assignments_unassigned_by_user_id_fkey
      FOREIGN KEY (unassigned_by_user_id)
      REFERENCES employees(id)
      ON DELETE SET NULL;
    `);

    await pool.query('COMMIT');

    console.log('✅ Successfully fixed foreign key constraints');

    // Verify the fix
    const result = await pool.query(`
      SELECT conname AS constraint_name, confrelid::regclass AS foreign_table
      FROM pg_constraint
      WHERE contype = 'f'
      AND conrelid = 'service_request_assignments'::regclass
      AND conname LIKE '%assigned_by%'
    `);

    console.log('📋 New foreign key constraints:');
    result.rows.forEach(row => {
      console.log(`   - ${row.constraint_name} -> ${row.foreign_table}`);
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function down() {
  const pool = await getPool();

  try {
    console.log('🔄 Rolling back foreign key constraint changes...');

    await pool.query('BEGIN');

    // Drop the corrected foreign key constraints
    await pool.query(`
      ALTER TABLE service_request_assignments
      DROP CONSTRAINT IF EXISTS service_request_assignments_assigned_by_user_id_fkey;
    `);

    await pool.query(`
      ALTER TABLE service_request_assignments
      DROP CONSTRAINT IF EXISTS service_request_assignments_unassigned_by_user_id_fkey;
    `);

    // Recreate the original (incorrect) foreign key constraints
    await pool.query(`
      ALTER TABLE service_request_assignments
      ADD CONSTRAINT service_request_assignments_assigned_by_user_id_fkey
      FOREIGN KEY (assigned_by_user_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
    `);

    await pool.query(`
      ALTER TABLE service_request_assignments
      ADD CONSTRAINT service_request_assignments_unassigned_by_user_id_fkey
      FOREIGN KEY (unassigned_by_user_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
    `);

    await pool.query('COMMIT');

    console.log('✅ Rolled back to original foreign key constraints');

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

// Execute the migration
if (import.meta.url === `file://${process.argv[1]}`) {
  const action = process.argv[2];

  if (action === 'down') {
    down()
      .then(() => {
        console.log('✅ Migration rolled back successfully');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Migration rollback failed:', error);
        process.exit(1);
      });
  } else {
    up()
      .then(() => {
        console.log('✅ Migration completed successfully');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Migration failed:', error);
        process.exit(1);
      });
  }
}

export { up, down };