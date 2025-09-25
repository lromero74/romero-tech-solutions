import { query } from '../config/database.js';

async function checkEmployeeNumbers() {
  try {
    console.log('Checking current employee numbers...');

    // Check current employee number for louis
    const louisResult = await query('SELECT employee_number FROM employees WHERE email = $1', ['louis@romerotechsolutions.com']);
    console.log('Current employee number for louis@romerotechsolutions.com:', louisResult.rows[0]?.employee_number || 'No employee found');

    // Get all employees
    const allEmployees = await query('SELECT email, employee_number FROM employees ORDER BY employee_number');
    console.log('All employees:');
    allEmployees.rows.forEach(emp => {
      console.log(`  ${emp.email}: ${emp.employee_number || 'NULL'}`);
    });

    // Check total count
    const count = await query('SELECT COUNT(*) as count FROM employees');
    console.log('Total employees:', count.rows[0].count);

  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

checkEmployeeNumbers();