import { query } from '../config/database.js';

async function updateEmployeeNumbers() {
  try {
    console.log('Updating existing employee numbers to 5-digit format...');

    // Update Louis's employee number from EMP001 to EMP00001
    const updateResult = await query(`
      UPDATE employees
      SET employee_number = 'EMP00001'
      WHERE email = 'louis@romerotechsolutions.com'
      AND employee_number = 'EMP001'
      RETURNING email, employee_number
    `);

    if (updateResult.rows.length > 0) {
      console.log('✅ Successfully updated employee number:');
      console.log(`   ${updateResult.rows[0].email}: ${updateResult.rows[0].employee_number}`);
    } else {
      console.log('⚠️ No employee found with EMP001 or already updated');
    }

    // Check final state
    const allEmployees = await query('SELECT email, employee_number FROM employees ORDER BY employee_number');
    console.log('\nAll employees after update:');
    allEmployees.rows.forEach(emp => {
      console.log(`  ${emp.email}: ${emp.employee_number || 'NULL'}`);
    });

  } catch (error) {
    console.error('❌ Error updating employee numbers:', error.message);
  }
  process.exit(0);
}

updateEmployeeNumbers();