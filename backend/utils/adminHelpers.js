import { query } from '../config/database.js';

// Helper function to format date without timezone issues
export function formatDateForUI(date) {
  if (!date) return null;
  // Use local timezone to format date as YYYY-MM-DD
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper function to generate next employee number with 5-digit padding
export async function generateEmployeeNumber() {
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

// Helper function to update employee roles in the junction table
export async function updateEmployeeRoles(employeeId, roles) {
  // Remove existing roles
  await query('DELETE FROM employee_roles WHERE employee_id = $1', [employeeId]);

  // Add new roles by looking up role_id from role name
  for (const roleName of roles) {
    const roleResult = await query('SELECT id FROM roles WHERE name = $1', [roleName]);
    if (roleResult.rows.length > 0) {
      const roleId = roleResult.rows[0].id;
      await query('INSERT INTO employee_roles (employee_id, role_id) VALUES ($1, $2)', [employeeId, roleId]);
    }
  }

  // JSONB roles column is now redundant - removed to use normalized employee_roles table only
}

// Helper function to upsert employee address in the employee_addresses table
export async function upsertEmployeeAddress(employeeId, address) {
  if (!address) return;

  console.log('=== UPSERTING ADDRESS ===');

  // Check if primary address exists
  const existingAddress = await query(
    'SELECT id FROM employee_addresses WHERE employee_id = $1 AND is_primary = true',
    [employeeId]
  );

  if (existingAddress.rows.length > 0) {
    // Update existing address
    console.log('Updating existing address');
    await query(`
      UPDATE employee_addresses
      SET street = $1, street_2 = $2, city = $3, state = $4, zip_code = $5, country = $6, updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $7 AND is_primary = true
    `, [
      address.street || null,
      address.street2 || null,
      address.city || null,
      address.state || null,
      address.zipCode || null,
      address.country || 'USA',
      employeeId
    ]);
  } else {
    // Insert new address
    console.log('Creating new address');
    await query(`
      INSERT INTO employee_addresses (employee_id, address_type, street, street_2, city, state, zip_code, country, is_primary)
      VALUES ($1, 'primary', $2, $3, $4, $5, $6, $7, true)
    `, [
      employeeId,
      address.street || null,
      address.street2 || null,
      address.city || null,
      address.state || null,
      address.zipCode || null,
      address.country || 'USA'
    ]);
  }

  console.log('=== ADDRESS UPSERTED ===');
}

// Helper function to upsert employee emergency contact in the employee_emergency_contacts table
export async function upsertEmployeeEmergencyContact(employeeId, emergencyContact) {
  if (!emergencyContact) return;

  console.log('=== UPSERTING EMERGENCY CONTACT ===');

  // Check if primary emergency contact exists
  const existingEmergencyContact = await query(
    'SELECT id FROM employee_emergency_contacts WHERE employee_id = $1 AND is_primary = true',
    [employeeId]
  );

  if (existingEmergencyContact.rows.length > 0) {
    // Update existing emergency contact
    console.log('Updating existing emergency contact');
    await query(`
      UPDATE employee_emergency_contacts
      SET first_name = $1, last_name = $2, relationship = $3, phone = $4, email = $5, updated_at = CURRENT_TIMESTAMP
      WHERE employee_id = $6 AND is_primary = true
    `, [
      emergencyContact.firstName || null,
      emergencyContact.lastName || null,
      emergencyContact.relationship || null,
      emergencyContact.phone || null,
      emergencyContact.email || null,
      employeeId
    ]);
  } else {
    // Insert new emergency contact
    console.log('Creating new emergency contact');
    await query(`
      INSERT INTO employee_emergency_contacts (employee_id, first_name, last_name, relationship, phone, email, is_primary, priority_order)
      VALUES ($1, $2, $3, $4, $5, $6, true, 1)
    `, [
      employeeId,
      emergencyContact.firstName || null,
      emergencyContact.lastName || null,
      emergencyContact.relationship || null,
      emergencyContact.phone || null,
      emergencyContact.email || null
    ]);
  }

  console.log('=== EMERGENCY CONTACT UPSERTED ===');
}

// Helper function to update employee department reference
export async function updateEmployeeDepartment(employeeId, departmentName) {
  if (!departmentName) return;

  console.log('=== UPDATING DEPARTMENT REFERENCE ===');

  // Find or create department
  let departmentResult = await query('SELECT id FROM departments WHERE name = $1', [departmentName]);

  if (departmentResult.rows.length === 0) {
    // Create new department if it doesn't exist
    console.log(`Creating new department: ${departmentName}`);
    departmentResult = await query(`
      INSERT INTO departments (name, description, is_active, sort_order)
      VALUES ($1, $2, true, 999)
      RETURNING id
    `, [departmentName, `${departmentName} department`]);
  }

  const departmentId = departmentResult.rows[0].id;

  // Update employee's department reference
  await query(`
    UPDATE employees
    SET department_id = $1
    WHERE id = $2
  `, [departmentId, employeeId]);

  console.log(`=== DEPARTMENT REFERENCE UPDATED TO: ${departmentName} ===`);
}

// Helper function to update employee job title reference
export async function updateEmployeeJobTitle(employeeId, jobTitle) {
  if (!jobTitle) return;

  console.log('=== UPDATING JOB TITLE REFERENCE ===');

  // Find or create job title
  let jobTitleResult = await query('SELECT id FROM employee_job_titles WHERE title = $1', [jobTitle]);

  if (jobTitleResult.rows.length === 0) {
    // Create new job title if it doesn't exist
    console.log(`Creating new job title: ${jobTitle}`);
    jobTitleResult = await query(`
      INSERT INTO employee_job_titles (title, description, level, is_active, sort_order)
      VALUES ($1, $2, 1, true, 999)
      RETURNING id
    `, [jobTitle, `${jobTitle} position`]);
  }

  const jobTitleId = jobTitleResult.rows[0].id;

  // Update employee's job title reference
  await query(`
    UPDATE employees
    SET job_title_id = $1
    WHERE id = $2
  `, [jobTitleId, employeeId]);

  console.log(`=== JOB TITLE REFERENCE UPDATED TO: ${jobTitle} ===`);
}

// Helper function to update employee status reference
export async function updateEmployeeStatus(employeeId, status) {
  if (!status) return;

  console.log('=== UPDATING EMPLOYEE STATUS REFERENCE ===');

  // Find status (should always exist)
  const statusResult = await query('SELECT id FROM employee_employment_statuses WHERE status_name = $1', [status]);

  if (statusResult.rows.length === 0) {
    console.log(`Warning: Status '${status}' not found in employee_employment_statuses table`);
    return;
  }

  const statusId = statusResult.rows[0].id;

  // Update employee's status reference
  await query(`
    UPDATE employees
    SET employee_status_id = $1
    WHERE id = $2
  `, [statusId, employeeId]);

  console.log(`=== EMPLOYEE STATUS REFERENCE UPDATED TO: ${status} ===`);
}

// Helper function to update employee pronouns reference
export async function updateEmployeePronouns(employeeId, pronouns) {
  if (!pronouns) return;

  console.log('=== UPDATING PRONOUNS REFERENCE ===');

  // Find pronouns (should exist or be null)
  const pronounsResult = await query('SELECT id FROM employee_pronouns WHERE pronoun_set = $1', [pronouns]);

  if (pronounsResult.rows.length === 0) {
    console.log(`Warning: Pronouns '${pronouns}' not found in employee_pronouns table`);
    return;
  }

  const pronounsId = pronounsResult.rows[0].id;

  // Update employee's pronouns reference
  await query(`
    UPDATE employees
    SET pronouns_id = $1
    WHERE id = $2
  `, [pronounsId, employeeId]);

  console.log(`=== PRONOUNS REFERENCE UPDATED TO: ${pronouns} ===`);
}

// Helper function to upsert employee photo in the employee_photos table
export async function upsertEmployeePhoto(employeeId, photoData) {
  if (!photoData || (!photoData.url && !photoData.filename && !photoData.positionX && !photoData.positionY && !photoData.scale && !photoData.backgroundColor)) return;

  console.log('=== UPSERTING EMPLOYEE PHOTO ===');

  // Check if primary photo exists
  const existingPhoto = await query(
    'SELECT id FROM employee_photos WHERE employee_id = $1 AND is_primary = true AND photo_type = $2',
    [employeeId, 'profile']
  );

  if (existingPhoto.rows.length > 0) {
    // Update existing photo
    console.log('Updating existing photo');

    // Build dynamic update query to only update provided fields
    const updateFields = [];
    const updateValues = [];
    let paramCount = 0;

    if (photoData.url !== undefined) {
      updateFields.push(`file_url = $${++paramCount}`);
      updateValues.push(photoData.url);
    }

    if (photoData.filename !== undefined) {
      updateFields.push(`filename = $${++paramCount}`);
      updateValues.push(photoData.filename);
    }

    if (photoData.positionX !== undefined) {
      updateFields.push(`position_x = $${++paramCount}`);
      updateValues.push(photoData.positionX);
    }

    if (photoData.positionY !== undefined) {
      updateFields.push(`position_y = $${++paramCount}`);
      updateValues.push(photoData.positionY);
    }

    if (photoData.scale !== undefined) {
      updateFields.push(`scale_factor = $${++paramCount}`);
      updateValues.push(photoData.scale);
    }

    if (photoData.backgroundColor !== undefined) {
      updateFields.push(`background_color = $${++paramCount}`);
      updateValues.push(photoData.backgroundColor);
    }

    // Always update timestamp
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

    if (updateFields.length > 1) { // More than just the timestamp
      updateValues.push(employeeId);
      await query(`
        UPDATE employee_photos
        SET ${updateFields.join(', ')}
        WHERE employee_id = $${++paramCount} AND is_primary = true AND photo_type = 'profile'
      `, updateValues);
    }
  } else {
    // Insert new photo
    console.log('Creating new photo');
    await query(`
      INSERT INTO employee_photos (employee_id, photo_type, file_url, filename, position_x, position_y, scale_factor, background_color, is_primary, is_active)
      VALUES ($1, 'profile', $2, $3, $4, $5, $6, $7, true, true)
    `, [
      employeeId,
      photoData.url || null,
      photoData.filename || null,
      photoData.positionX || 50.00,
      photoData.positionY || 50.00,
      photoData.scale || 100.00,
      photoData.backgroundColor || null
    ]);
  }

  console.log('=== EMPLOYEE PHOTO UPSERTED ===');
}