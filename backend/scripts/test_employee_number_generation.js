import { query } from '../config/database.js';

// Copy the generateEmployeeNumber function from admin.js
async function generateEmployeeNumber() {
  try {
    // Get the highest existing employee number
    const result = await query(`
      SELECT employee_number
      FROM employees
      WHERE employee_number IS NOT NULL
      AND employee_number LIKE 'EMP%'
      ORDER BY employee_number DESC
      LIMIT 1
    `);

    let nextNumber = 1;
    if (result.rows.length > 0) {
      const lastEmployeeNumber = result.rows[0].employee_number;
      // Extract the numeric part (remove 'EMP' prefix)
      const numericPart = lastEmployeeNumber.replace('EMP', '');
      nextNumber = parseInt(numericPart, 10) + 1;
    }

    // Format with 5-digit padding: EMP00001, EMP00002, etc.
    return `EMP${nextNumber.toString().padStart(5, '0')}`;
  } catch (error) {
    console.error('Error generating employee number:', error);
    // Fallback to EMP00001 if there's an error
    return 'EMP00001';
  }
}

async function testEmployeeNumberGeneration() {
  try {
    console.log('Testing employee number generation...');

    // Show current state
    const current = await query('SELECT email, employee_number FROM employees ORDER BY employee_number');
    console.log('Current employees:');
    current.rows.forEach(emp => {
      console.log(`  ${emp.email}: ${emp.employee_number}`);
    });

    // Test the generation function
    console.log('\nTesting generateEmployeeNumber function:');
    for (let i = 1; i <= 5; i++) {
      const nextNumber = await generateEmployeeNumber();
      console.log(`  Test ${i}: ${nextNumber}`);

      // Simulate adding this employee to test incremental logic
      await query(`
        INSERT INTO employees (email, first_name, last_name, role, employee_number)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        `test${i}@example.com`,
        `Test${i}`,
        'User',
        'technician',
        nextNumber
      ]);
    }

    // Show final state
    const final = await query('SELECT email, employee_number FROM employees ORDER BY employee_number');
    console.log('\nFinal employees after test:');
    final.rows.forEach(emp => {
      console.log(`  ${emp.email}: ${emp.employee_number}`);
    });

    // Clean up test employees
    await query("DELETE FROM employees WHERE email LIKE 'test%@example.com'");
    console.log('\n✅ Test employees cleaned up');

  } catch (error) {
    console.error('❌ Error testing employee number generation:', error.message);
  }
  process.exit(0);
}

testEmployeeNumberGeneration();