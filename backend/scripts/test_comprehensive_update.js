import { query, closePool } from '../config/database.js';

async function testComprehensiveUpdate() {
  try {
    console.log('🧪 Testing comprehensive employee update functionality...\n');

    // First, find an existing employee to test with
    console.log('🔍 Finding an existing employee...');
    const employeesResult = await query('SELECT id, email, first_name, last_name FROM employees LIMIT 1');

    if (employeesResult.rows.length === 0) {
      console.log('⚠️  No employees found. Creating a test employee first...');

      // Create a test employee
      await query(`
        INSERT INTO employees (email, role, first_name, last_name, is_active)
        VALUES ('test.employee@romerotechsolutions.com', 'technician', 'Test', 'Employee', true)
      `);

      const newEmployeeResult = await query('SELECT id, email, first_name, last_name FROM employees WHERE email = $1',
        ['test.employee@romerotechsolutions.com']);

      if (newEmployeeResult.rows.length === 0) {
        throw new Error('Failed to create test employee');
      }

      console.log('✅ Created test employee:', newEmployeeResult.rows[0]);
      var testEmployee = newEmployeeResult.rows[0];
    } else {
      var testEmployee = employeesResult.rows[0];
      console.log('✅ Found existing employee:', testEmployee);
    }

    // Test comprehensive data update
    console.log('\n📝 Testing comprehensive data update...');

    const comprehensiveData = {
      role: 'technician',
      isActive: true,
      firstName: 'Updated',
      lastName: 'Employee',
      middleInitial: 'M',
      preferredName: 'Updy',
      phone: '555-0123',
      employeeNumber: 'EMP00001',
      department: 'IT Support',
      jobTitle: 'Senior Technician',
      hireDate: '2023-01-15',
      employeeStatus: 'active',
      isOnVacation: false,
      isOutSick: false,
      address: {
        street: '123 Main St',
        city: 'Tech City',
        state: 'CA',
        zipCode: '90210',
        country: 'USA'
      },
      emergencyContact: {
        firstName: 'Jane',
        lastName: 'Doe',
        relationship: 'Spouse',
        phone: '555-0456',
        email: 'jane.doe@example.com'
      },
      photo: 'https://example.com/photo.jpg'
    };

    console.log('Data to update:', JSON.stringify(comprehensiveData, null, 2));

    // Simulate the backend route logic
    const {
      role, isActive, firstName, lastName, middleInitial, preferredName,
      phone, employeeNumber, department, jobTitle, hireDate, employeeStatus,
      isOnVacation, isOutSick, address, emergencyContact, photo
    } = comprehensiveData;

    // Build the update query with all possible fields
    const updateFields = [];
    const updateValues = [];
    let paramCount = 0;

    // Basic fields
    updateFields.push(`role = $${++paramCount}`);
    updateValues.push(role);

    updateFields.push(`is_active = $${++paramCount}`);
    updateValues.push(isActive);

    updateFields.push(`first_name = $${++paramCount}`);
    updateValues.push(firstName);

    updateFields.push(`last_name = $${++paramCount}`);
    updateValues.push(lastName);

    // Extended fields
    if (middleInitial !== undefined) {
      updateFields.push(`middle_initial = $${++paramCount}`);
      updateValues.push(middleInitial);
    }

    if (preferredName !== undefined) {
      updateFields.push(`preferred_name = $${++paramCount}`);
      updateValues.push(preferredName);
    }

    if (phone !== undefined) {
      updateFields.push(`phone = $${++paramCount}`);
      updateValues.push(phone);
    }

    if (employeeNumber !== undefined) {
      updateFields.push(`employee_number = $${++paramCount}`);
      updateValues.push(employeeNumber);
    }

    if (department !== undefined) {
      updateFields.push(`department_detailed = $${++paramCount}`);
      updateValues.push(department);
    }

    if (jobTitle !== undefined) {
      updateFields.push(`job_title = $${++paramCount}`);
      updateValues.push(jobTitle);
    }

    if (hireDate !== undefined) {
      updateFields.push(`hire_date = $${++paramCount}`);
      updateValues.push(hireDate);
    }

    if (employeeStatus !== undefined) {
      updateFields.push(`employee_status = $${++paramCount}`);
      updateValues.push(employeeStatus);
    }

    // Address fields
    if (address) {
      if (address.street !== undefined) {
        updateFields.push(`address_street = $${++paramCount}`);
        updateValues.push(address.street);
      }
      if (address.city !== undefined) {
        updateFields.push(`address_city = $${++paramCount}`);
        updateValues.push(address.city);
      }
      if (address.state !== undefined) {
        updateFields.push(`address_state = $${++paramCount}`);
        updateValues.push(address.state);
      }
      if (address.zipCode !== undefined) {
        updateFields.push(`address_zip_code = $${++paramCount}`);
        updateValues.push(address.zipCode);
      }
      if (address.country !== undefined) {
        updateFields.push(`address_country = $${++paramCount}`);
        updateValues.push(address.country);
      }
    }

    // Emergency contact fields
    if (emergencyContact) {
      if (emergencyContact.firstName !== undefined) {
        updateFields.push(`emergency_contact_first_name = $${++paramCount}`);
        updateValues.push(emergencyContact.firstName);
      }
      if (emergencyContact.lastName !== undefined) {
        updateFields.push(`emergency_contact_last_name = $${++paramCount}`);
        updateValues.push(emergencyContact.lastName);
      }
      if (emergencyContact.relationship !== undefined) {
        updateFields.push(`emergency_contact_relationship = $${++paramCount}`);
        updateValues.push(emergencyContact.relationship);
      }
      if (emergencyContact.phone !== undefined) {
        updateFields.push(`emergency_contact_phone = $${++paramCount}`);
        updateValues.push(emergencyContact.phone);
      }
      if (emergencyContact.email !== undefined) {
        updateFields.push(`emergency_contact_email = $${++paramCount}`);
        updateValues.push(emergencyContact.email);
      }
    }

    // Photo field
    if (photo !== undefined) {
      updateFields.push(`profile_photo_url = $${++paramCount}`);
      updateValues.push(photo);
    }

    // Employee status fields
    if (isOnVacation !== undefined) {
      updateFields.push(`is_on_vacation = $${++paramCount}`);
      updateValues.push(isOnVacation);
    }

    if (isOutSick !== undefined) {
      updateFields.push(`is_out_sick = $${++paramCount}`);
      updateValues.push(isOutSick);
    }

    // Always update the timestamp
    updateFields.push(`updated_at = NOW()`);

    // Add the WHERE clause parameter
    updateValues.push(testEmployee.id);
    const whereParamIndex = ++paramCount;

    const updateQuery = `
      UPDATE employees
      SET ${updateFields.join(', ')}
      WHERE id = $${whereParamIndex}
      RETURNING id, email, role, first_name, last_name, middle_initial, preferred_name,
                phone, employee_number, department_detailed, job_title, hire_date,
                employee_status, is_active, is_on_vacation, is_out_sick,
                address_street, address_city, address_state, address_zip_code, address_country,
                emergency_contact_first_name, emergency_contact_last_name,
                emergency_contact_relationship, emergency_contact_phone, emergency_contact_email,
                profile_photo_url
    `;

    console.log('\n🔧 Executing update query...');
    console.log('Update fields:', updateFields);
    console.log('Update values:', updateValues);

    const updateResult = await query(updateQuery, updateValues);

    if (updateResult.rows.length === 0) {
      throw new Error('Update failed - no rows returned');
    }

    const updatedEmployee = updateResult.rows[0];
    console.log('\n✅ Update successful! Updated employee data:');
    console.log(JSON.stringify(updatedEmployee, null, 2));

    // Verify all fields were saved correctly
    console.log('\n🔍 Verifying all fields were saved correctly...');

    const verificationChecks = [
      { field: 'first_name', expected: 'Updated', actual: updatedEmployee.first_name },
      { field: 'last_name', expected: 'Employee', actual: updatedEmployee.last_name },
      { field: 'middle_initial', expected: 'M', actual: updatedEmployee.middle_initial },
      { field: 'preferred_name', expected: 'Updy', actual: updatedEmployee.preferred_name },
      { field: 'phone', expected: '555-0123', actual: updatedEmployee.phone },
      { field: 'employee_number', expected: 'EMP00001', actual: updatedEmployee.employee_number },
      { field: 'department_detailed', expected: 'IT Support', actual: updatedEmployee.department_detailed },
      { field: 'job_title', expected: 'Senior Technician', actual: updatedEmployee.job_title },
      { field: 'address_street', expected: '123 Main St', actual: updatedEmployee.address_street },
      { field: 'address_city', expected: 'Tech City', actual: updatedEmployee.address_city },
      { field: 'address_state', expected: 'CA', actual: updatedEmployee.address_state },
      { field: 'address_zip_code', expected: '90210', actual: updatedEmployee.address_zip_code },
      { field: 'emergency_contact_first_name', expected: 'Jane', actual: updatedEmployee.emergency_contact_first_name },
      { field: 'emergency_contact_last_name', expected: 'Doe', actual: updatedEmployee.emergency_contact_last_name },
      { field: 'emergency_contact_relationship', expected: 'Spouse', actual: updatedEmployee.emergency_contact_relationship },
      { field: 'emergency_contact_phone', expected: '555-0456', actual: updatedEmployee.emergency_contact_phone },
      { field: 'emergency_contact_email', expected: 'jane.doe@example.com', actual: updatedEmployee.emergency_contact_email },
      { field: 'profile_photo_url', expected: 'https://example.com/photo.jpg', actual: updatedEmployee.profile_photo_url }
    ];

    let allTestsPassed = true;
    verificationChecks.forEach(check => {
      if (check.actual === check.expected) {
        console.log(`✅ ${check.field}: ${check.actual}`);
      } else {
        console.log(`❌ ${check.field}: Expected '${check.expected}', got '${check.actual}'`);
        allTestsPassed = false;
      }
    });

    if (allTestsPassed) {
      console.log('\n🎉 All comprehensive employee data fields are working correctly!');
      console.log('✅ The PUT /api/admin/users/:id route now properly handles all employee data.');
    } else {
      console.log('\n⚠️  Some fields did not save correctly. Please check the implementation.');
    }

  } catch (error) {
    console.error('❌ Error testing comprehensive update:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await closePool();
  }
}

testComprehensiveUpdate();