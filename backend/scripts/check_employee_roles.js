import { query, closePool } from '../config/database.js';

async function checkEmployeeRoles() {
  try {
    console.log('🔍 Checking roles in employee_roles table...\n');

    const result = await query('SELECT DISTINCT role FROM employee_roles ORDER BY role');

    console.log('Current roles in employee_roles table:');
    result.rows.forEach(row => {
      console.log(`- ${row.role}`);
    });

    console.log(`\nTotal distinct roles: ${result.rows.length}`);

    // Also check all records to see which employees have which roles
    const allRoles = await query(`
      SELECT er.role, e.first_name, e.last_name, e.email
      FROM employee_roles er
      JOIN employees e ON er.employee_id = e.id
      ORDER BY er.role, e.first_name
    `);

    console.log('\n📋 All role assignments:');
    allRoles.rows.forEach(row => {
      console.log(`${row.role}: ${row.first_name} ${row.last_name} (${row.email})`);
    });

  } catch (error) {
    console.error('❌ Error checking employee roles:', error);
  } finally {
    await closePool();
  }
}

checkEmployeeRoles();