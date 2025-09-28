import { query, closePool } from '../config/database.js';

async function recreateEmployeeRolesTable() {
  try {
    console.log('🔄 Recreating employee_roles table with proper structure...');

    // Drop table if it exists (cleanup)
    console.log('🔄 Dropping existing table if it exists...');
    await query('DROP TABLE IF EXISTS employee_roles CASCADE');

    // Create the new employee_roles table
    console.log('🔄 Creating employee_roles table...');
    const createTableQuery = `
      CREATE TABLE employee_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, role_id)
      )
    `;

    await query(createTableQuery);
    console.log('✅ Employee_roles table created successfully');

    // Create indexes
    console.log('🔄 Creating indexes...');
    await query(`
      CREATE INDEX IF NOT EXISTS idx_employee_roles_employee_id ON employee_roles(employee_id);
      CREATE INDEX IF NOT EXISTS idx_employee_roles_role_id ON employee_roles(role_id);
    `);
    console.log('✅ Indexes created successfully');

    // Get the admin role ID from roles table
    console.log('🔄 Getting admin role ID...');
    const adminRoleResult = await query("SELECT id FROM roles WHERE name = 'admin'");

    if (adminRoleResult.rows.length === 0) {
      throw new Error('Admin role not found in roles table. Please run create_roles_table.js first.');
    }

    const adminRoleId = adminRoleResult.rows[0].id;
    console.log(`Admin role ID: ${adminRoleId}`);

    // Get Louis Romero's employee ID
    console.log('🔄 Getting Louis Romero employee ID...');
    const employeeResult = await query("SELECT id FROM employees WHERE email = 'louis@romerotechsolutions.com'");

    if (employeeResult.rows.length === 0) {
      throw new Error('Louis Romero employee record not found');
    }

    const employeeId = employeeResult.rows[0].id;
    console.log(`Employee ID: ${employeeId}`);

    // Insert the employee role record
    console.log('🔄 Assigning admin role to Louis Romero...');
    await query(`
      INSERT INTO employee_roles (employee_id, role_id)
      VALUES ($1, $2)
    `, [employeeId, adminRoleId]);

    console.log('✅ Admin role assigned successfully');

    // Verify the setup
    console.log('🔍 Verifying the setup...');
    const verificationResult = await query(`
      SELECT
        er.id,
        e.first_name,
        e.last_name,
        e.email,
        r.name as role_name,
        r.display_name,
        r.text_color,
        r.background_color,
        r.border_color
      FROM employee_roles er
      JOIN employees e ON er.employee_id = e.id
      JOIN roles r ON er.role_id = r.id
      ORDER BY e.first_name
    `);

    console.log('\n📋 Current employee role assignments:');
    verificationResult.rows.forEach(row => {
      console.log(`  ${row.first_name} ${row.last_name} (${row.email}): ${row.role_name} (${row.display_name})`);
      console.log(`    Colors: ${row.text_color} on ${row.background_color} with border ${row.border_color}`);
    });

    console.log(`\nTotal role assignments: ${verificationResult.rows.length}`);
    console.log('\n✅ Employee_roles table recreated successfully!');

  } catch (error) {
    console.error('❌ Error recreating employee_roles table:', error);
    throw error;
  } finally {
    await closePool();
  }
}

recreateEmployeeRolesTable();