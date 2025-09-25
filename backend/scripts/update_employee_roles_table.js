import { query, closePool } from '../config/database.js';

async function updateEmployeeRolesTable() {
  try {
    console.log('🔄 Updating employee_roles table to reference roles table...');

    // First, let's check the current structure and data
    console.log('\n📋 Current employee_roles data:');
    const currentData = await query('SELECT * FROM employee_roles ORDER BY created_at');
    currentData.rows.forEach(row => {
      console.log(`  Employee ID: ${row.employee_id}, Role: ${row.role}`);
    });

    // Create a temporary table to store the current data
    console.log('\n🔄 Creating backup of current data...');
    await query(`
      CREATE TEMP TABLE employee_roles_backup AS
      SELECT * FROM employee_roles
    `);

    // Drop the old foreign key constraint
    console.log('🔄 Dropping old constraints...');
    await query('ALTER TABLE employee_roles DROP CONSTRAINT IF EXISTS employee_roles_employee_id_fkey');

    // Add new column for role_id (foreign key to roles table)
    console.log('🔄 Adding role_id column...');
    await query(`
      ALTER TABLE employee_roles
      ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id)
    `);

    // Update role_id based on role name
    console.log('🔄 Mapping existing roles to role_id...');

    // Update admin roles
    await query(`
      UPDATE employee_roles
      SET role_id = (SELECT id FROM roles WHERE name = 'admin')
      WHERE role = 'admin'
    `);

    // Update technician roles
    await query(`
      UPDATE employee_roles
      SET role_id = (SELECT id FROM roles WHERE name = 'technician')
      WHERE role = 'technician'
    `);

    // Update sales roles
    await query(`
      UPDATE employee_roles
      SET role_id = (SELECT id FROM roles WHERE name = 'sales')
      WHERE role = 'sales'
    `);

    // Check for any unmapped roles
    const unmappedRoles = await query(`
      SELECT DISTINCT role FROM employee_roles
      WHERE role_id IS NULL
    `);

    if (unmappedRoles.rows.length > 0) {
      console.log('⚠️ Found unmapped roles:');
      unmappedRoles.rows.forEach(row => {
        console.log(`  - ${row.role}`);
      });

      // For any unmapped roles, create them in the roles table
      for (const row of unmappedRoles.rows) {
        console.log(`🔄 Creating role '${row.role}' in roles table...`);
        const roleResult = await query(`
          INSERT INTO roles (name, display_name, description, text_color, background_color, border_color, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [
          row.role,
          row.role.charAt(0).toUpperCase() + row.role.slice(1), // Capitalize first letter
          `${row.role} role`,
          '#6b7280', // Default gray text
          '#f9fafb', // Default light gray background
          '#e5e7eb', // Default gray border
          99 // Low sort order for custom roles
        ]);

        // Update employee_roles with the new role_id
        await query(`
          UPDATE employee_roles
          SET role_id = $1
          WHERE role = $2 AND role_id IS NULL
        `, [roleResult.rows[0].id, row.role]);
      }
    }

    // Make role_id NOT NULL
    console.log('🔄 Making role_id column NOT NULL...');
    await query('ALTER TABLE employee_roles ALTER COLUMN role_id SET NOT NULL');

    // Re-add the foreign key constraint for employee_id
    console.log('🔄 Adding foreign key constraints...');
    await query(`
      ALTER TABLE employee_roles
      ADD CONSTRAINT employee_roles_employee_id_fkey
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    `);

    // Add foreign key constraint for role_id
    await query(`
      ALTER TABLE employee_roles
      ADD CONSTRAINT employee_roles_role_id_fkey
      FOREIGN KEY (role_id) REFERENCES roles(id)
    `);

    // Create new indexes
    console.log('🔄 Creating new indexes...');
    await query(`
      CREATE INDEX IF NOT EXISTS idx_employee_roles_role_id ON employee_roles(role_id);
      DROP INDEX IF EXISTS idx_employee_roles_role;
      DROP INDEX IF EXISTS employee_roles_employee_id_role_key;
      CREATE UNIQUE INDEX IF NOT EXISTS employee_roles_employee_id_role_id_key
      ON employee_roles(employee_id, role_id);
    `);

    // Verify the updated structure
    console.log('\n📋 Updated employee_roles data:');
    const updatedData = await query(`
      SELECT er.*, r.name as role_name, r.display_name, r.text_color, r.background_color
      FROM employee_roles er
      JOIN roles r ON er.role_id = r.id
      ORDER BY er.created_at
    `);

    updatedData.rows.forEach(row => {
      console.log(`  Employee ID: ${row.employee_id}, Role: ${row.role_name} (${row.display_name}) - ${row.text_color} on ${row.background_color}`);
    });

    console.log('\n✅ Employee_roles table updated successfully!');

  } catch (error) {
    console.error('❌ Error updating employee_roles table:', error);

    // Attempt to restore from backup if something went wrong
    try {
      console.log('🔄 Attempting to restore from backup...');
      await query('DROP TABLE IF EXISTS employee_roles CASCADE');
      await query('ALTER TABLE employee_roles_backup RENAME TO employee_roles');
      console.log('✅ Restored from backup');
    } catch (restoreError) {
      console.error('❌ Failed to restore from backup:', restoreError);
    }

    throw error;
  } finally {
    await closePool();
  }
}

updateEmployeeRolesTable();