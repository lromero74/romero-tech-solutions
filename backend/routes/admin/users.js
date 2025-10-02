import express from 'express';
import { query } from '../../config/database.js';
import { sessionService } from '../../services/sessionService.js';
import { websocketService } from '../../services/websocketService.js';
import { buildUserListQuery } from '../../services/userQueryService.js';
import { mapUsersArray, createUpdateResponseData, createNewUserResponseData } from '../../utils/userMappers.js';
import { validateUserUpdateData, validateNewUserData, checkUserExists } from '../../utils/userValidation.js';
import { requirePermission, requireLastRecordProtection, requirePermissionOrSelf } from '../../middleware/permissionMiddleware.js';
import {
  formatDateForUI,
  generateEmployeeNumber,
  updateEmployeeRoles,
  upsertEmployeeAddress,
  upsertEmployeeEmergencyContact,
  updateEmployeeDepartment,
  updateEmployeeJobTitle,
  updateEmployeeStatus,
  updateEmployeePronouns,
  upsertEmployeePhoto
} from '../../utils/adminHelpers.js';

const router = express.Router();

// GET /users - Get all users and employees with pagination and filtering
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search, sortBy = 'created_at', sortOrder = 'DESC', userType = 'all' } = req.query;

    // Use the extracted query service
    const filters = { role, search, userType };
    const pagination = { page: parseInt(page), limit: parseInt(limit) };
    const sorting = { sortBy, sortOrder };

    const result = await buildUserListQuery(filters, pagination, sorting);
    const mappedUsers = mapUsersArray(result.users);

    // Debug logging for the final mapped users array
    const exampleMapped = mappedUsers.find(user => user.email === 'john@example.com');
    if (exampleMapped) {
      console.log('🔍 BACKEND DEBUG - Final example user in response:');
      console.log('  department:', exampleMapped.department);
    }

    res.status(200).json({
      success: true,
      data: {
        users: mappedUsers,
        pagination: result.pagination
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PUT /users/:id - Update user (employee or client)
router.put('/users/:id',
  requirePermissionOrSelf('modify.users.enable', (req) => req.params.id),
  async (req, res) => {
  try {
    const { id } = req.params;
    const {
      role,
      roles,
      isActive,
      firstName,
      lastName,
      name,
      email,
      businessId,
      businessName,
      middleInitial,
      preferredName,
      pronouns,
      phone,
      isOnVacation,
      isOutSick,
      isOnOtherLeave,
      employeeNumber,
      department,
      jobTitle,
      hireDate,
      employeeStatus,
      terminationDate,
      closeActiveSessions,
      address,
      emergencyContact,
      photo,
      photoPositionX,
      photoPositionY,
      photoScale,
      photoBackgroundColor
    } = req.body;


    // Check if user exists and get user type
    const userExistsResult = await checkUserExists(id);
    if (!userExistsResult.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isEmployee = userExistsResult.isEmployee;
    const rolesArray = roles || (role ? [role] : []);

    // Validate update data using validation utilities
    const validation = await validateUserUpdateData({ role, roles, email, phone }, isEmployee);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    let updateResult;

    if (isEmployee) {
      // Update employee with comprehensive data

      // Build the update query with all possible fields
      const updateFields = [];
      const updateValues = [];
      let paramCount = 0;

      // Roles are now managed through employee_roles table only - JSONB column removed

      if (isActive !== undefined) {
        updateFields.push(`is_active = $${++paramCount}`);
        updateValues.push(isActive);
      }

      if (firstName !== undefined) {
        updateFields.push(`first_name = $${++paramCount}`);
        updateValues.push(firstName);
      }

      if (lastName !== undefined) {
        updateFields.push(`last_name = $${++paramCount}`);
        updateValues.push(lastName);
      }

      // Extended fields
      if (middleInitial !== undefined) {
        updateFields.push(`middle_initial = $${++paramCount}`);
        updateValues.push(middleInitial);
      }

      if (preferredName !== undefined) {
        updateFields.push(`preferred_name = $${++paramCount}`);
        updateValues.push(preferredName);
      }

      // Pronouns are now handled via normalized employee_pronouns table - removed direct column update

      if (phone !== undefined) {
        updateFields.push(`phone = $${++paramCount}`);
        updateValues.push(phone);
      }

      if (employeeNumber !== undefined) {
        updateFields.push(`employee_number = $${++paramCount}`);
        updateValues.push(employeeNumber);
      }

      // Note: Department field is now handled separately via normalized departments table
      // Department updates will be processed after employee update via updateEmployeeDepartment()

      // Job title is now handled via normalized employee_job_titles table - removed direct column update

      if (hireDate !== undefined) {
        updateFields.push(`hire_date = $${++paramCount}`);
        updateValues.push(hireDate);
      }

      // Employee status is now handled via normalized employee_employment_statuses table - removed direct column update

      if (terminationDate !== undefined) {
        updateFields.push(`termination_date = $${++paramCount}`);
        updateValues.push(terminationDate);
      }

      // Note: Address fields are now handled separately via normalized employee_addresses table
      // Address updates will be processed after employee update via upsertEmployeeAddress()

      // Note: Emergency contact fields are now handled separately via normalized employee_emergency_contacts table
      // Emergency contact updates will be processed after employee update via upsertEmployeeEmergencyContact()

      // Photo fields are now handled via normalized employee_photos table - removed direct column updates

      // Employee status fields
      if (isOnVacation !== undefined) {
        updateFields.push(`is_on_vacation = $${++paramCount}`);
        updateValues.push(isOnVacation);
      }

      if (isOutSick !== undefined) {
        updateFields.push(`is_out_sick = $${++paramCount}`);
        updateValues.push(isOutSick);
      }

      if (isOnOtherLeave !== undefined) {
        updateFields.push(`is_on_other_leave = $${++paramCount}`);
        updateValues.push(isOnOtherLeave);
      }


      // Always update the timestamp
      updateFields.push(`updated_at = NOW()`);

      // Add the WHERE clause parameter
      updateValues.push(id);
      const whereParamIndex = ++paramCount;

      const updateQuery = `
        UPDATE employees
        SET ${updateFields.join(', ')}
        WHERE id = $${whereParamIndex}
        RETURNING id, email, first_name, last_name, middle_initial, preferred_name,
                  phone, employee_number, hire_date, termination_date,
                  is_active, is_on_vacation, is_out_sick, is_on_other_leave
      `;

      console.log('Update query:', updateQuery);
      console.log('Update values:', updateValues);

      updateResult = await query(updateQuery, updateValues);

      // Debug: Check what the database actually returned
      console.log('🔍 DATABASE UPDATE RESULT - Raw returned data:');
      console.log('updateResult.rows[0]:', JSON.stringify(updateResult.rows[0], null, 2));

      // Update the employee_roles junction table - only if roles were updated
      if (updateResult.rows.length > 0 && (roles !== undefined || role !== undefined)) {
        await updateEmployeeRoles(id, rolesArray);
      }

      // Update the employee address in normalized employee_addresses table
      if (updateResult.rows.length > 0 && address !== undefined) {
        await upsertEmployeeAddress(id, address);
      }

      // Update the employee emergency contact in normalized employee_emergency_contacts table
      if (updateResult.rows.length > 0 && emergencyContact !== undefined) {
        await upsertEmployeeEmergencyContact(id, emergencyContact);
      }

      // Update the employee department reference in normalized departments table
      if (updateResult.rows.length > 0 && department !== undefined) {
        await updateEmployeeDepartment(id, department);
      }

      // Update job title reference in normalized employee_job_titles table
      if (updateResult.rows.length > 0 && jobTitle !== undefined) {
        await updateEmployeeJobTitle(id, jobTitle);
      }

      // Update employee status reference in normalized employee_employment_statuses table
      if (updateResult.rows.length > 0 && employeeStatus !== undefined) {
        await updateEmployeeStatus(id, employeeStatus);
      }

      // Update pronouns reference in normalized employee_pronouns table
      if (updateResult.rows.length > 0 && pronouns !== undefined) {
        await updateEmployeePronouns(id, pronouns);
      }

      // Update photo data in normalized employee_photos table
      if (updateResult.rows.length > 0 && (photo !== undefined || photoPositionX !== undefined || photoPositionY !== undefined || photoScale !== undefined || photoBackgroundColor !== undefined)) {
        await upsertEmployeePhoto(id, {
          url: photo,
          positionX: photoPositionX,
          positionY: photoPositionY,
          scale: photoScale,
          backgroundColor: photoBackgroundColor
        });
      }

      if (updateResult.rows.length > 0) {
        // Close active sessions if requested (for termination)
        if (closeActiveSessions) {
          try {
            const closedSessions = await sessionService.endAllUserSessions(id);
            console.log(`🚪 Closed ${closedSessions} active sessions for terminated employee: ${updateResult.rows[0].email}`);
          } catch (sessionError) {
            console.error('❌ Error closing sessions for terminated employee:', sessionError);
            // Don't fail the entire operation if session closing fails
          }
        }
      }
    } else {
      // Update client (no vacation/sick fields or extended employee data)
      // Role validation already done above

      // Build dynamic query for client updates
      const updateFields = [];
      const updateValues = [];
      let paramCount = 0;

      // Always update the role to 'client' to ensure consistency
      updateFields.push(`role = $${++paramCount}`);
      updateValues.push('client');

      if (isActive !== undefined) {
        updateFields.push(`is_active = $${++paramCount}`);
        updateValues.push(isActive);
      }

      // Handle name field (can be full name that needs to be split)
      if (name !== undefined) {
        const nameParts = name.trim().split(/\s+/);
        const firstNamePart = nameParts[0] || '';
        const lastNamePart = nameParts.slice(1).join(' ') || '';

        updateFields.push(`first_name = $${++paramCount}`);
        updateValues.push(firstNamePart);
        updateFields.push(`last_name = $${++paramCount}`);
        updateValues.push(lastNamePart);
      } else {
        // Use individual firstName/lastName if provided
        if (firstName !== undefined) {
          updateFields.push(`first_name = $${++paramCount}`);
          updateValues.push(firstName);
        }
        if (lastName !== undefined) {
          updateFields.push(`last_name = $${++paramCount}`);
          updateValues.push(lastName);
        }
      }

      if (email !== undefined) {
        updateFields.push(`email = $${++paramCount}`);
        updateValues.push(email);
      }
      if (phone !== undefined) {
        updateFields.push(`phone = $${++paramCount}`);
        updateValues.push(phone);
      }

      // Business association for clients
      if (businessId !== undefined) {
        updateFields.push(`business_id = $${++paramCount}`);
        updateValues.push(businessId || null);
      }

      // Photo field for clients
      if (photo !== undefined) {
        updateFields.push(`profile_photo_url = $${++paramCount}`);
        updateValues.push(photo);
      }

      // Photo positioning fields for clients
      if (photoPositionX !== undefined) {
        updateFields.push(`photo_position_x = $${++paramCount}`);
        updateValues.push(photoPositionX);
      }
      if (photoPositionY !== undefined) {
        updateFields.push(`photo_position_y = $${++paramCount}`);
        updateValues.push(photoPositionY);
      }
      if (photoScale !== undefined) {
        updateFields.push(`photo_scale = $${++paramCount}`);
        updateValues.push(photoScale);
      }
      if (photoBackgroundColor !== undefined) {
        updateFields.push(`photo_background_color = $${++paramCount}`);
        updateValues.push(photoBackgroundColor);
      }

      // Always update timestamp
      updateFields.push(`updated_at = NOW()`);

      // Add ID as last parameter
      updateValues.push(id);

      const updateQuery = `
        UPDATE users
        SET ${updateFields.join(', ')}
        WHERE id = $${updateValues.length}
        RETURNING id, email, role, first_name, last_name, phone, is_active, profile_photo_url, photo_position_x, photo_position_y, photo_scale, photo_background_color
      `;

      updateResult = await query(updateQuery, updateValues);

      if (updateResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
    }

    const updatedUser = updateResult.rows[0];

    // Debug: Check the updatedUser object
    console.log('🔍 BEFORE MAPPING - updatedUser object:');
    console.log('updatedUser.department_detailed:', updatedUser.department_detailed);
    console.log('typeof updatedUser.department_detailed:', typeof updatedUser.department_detailed);

    // Build response data using mapping utility
    const responseData = createUpdateResponseData(updatedUser, isEmployee);

    // Add employee-specific fields if it's an employee
    if (isEmployee) {
      // Get department from normalized departments table
      const departmentQuery = await query(
        'SELECT name FROM departments WHERE id = (SELECT department_id FROM employees WHERE id = $1)',
        [updatedUser.id]
      );

      if (departmentQuery.rows.length > 0) {
        responseData.department = departmentQuery.rows[0].name;
        console.log('🔍 MAPPING - Setting responseData.department to:', departmentQuery.rows[0].name);
      } else {
        responseData.department = null;
        console.log('🔍 MAPPING - No department found, setting to null');
      }

      // Get address from normalized employee_addresses table
      const addressQuery = await query(
        'SELECT street, street_2, city, state, zip_code, country FROM employee_addresses WHERE employee_id = $1 AND is_primary = true',
        [updatedUser.id]
      );

      if (addressQuery.rows.length > 0) {
        const addressData = addressQuery.rows[0];
        responseData.address = {
          street: addressData.street,
          street2: addressData.street_2,
          city: addressData.city,
          state: addressData.state,
          zipCode: addressData.zip_code,
          country: addressData.country
        };
      }

      // Get emergency contact from normalized employee_emergency_contacts table
      const emergencyContactQuery = await query(
        'SELECT first_name, last_name, relationship, phone, email FROM employee_emergency_contacts WHERE employee_id = $1 AND is_primary = true',
        [updatedUser.id]
      );

      if (emergencyContactQuery.rows.length > 0) {
        const emergencyContactData = emergencyContactQuery.rows[0];
        responseData.emergencyContact = {
          firstName: emergencyContactData.first_name,
          lastName: emergencyContactData.last_name,
          relationship: emergencyContactData.relationship,
          phone: emergencyContactData.phone,
          email: emergencyContactData.email
        };
      }
    }

    console.log('=== BACKEND RESPONSE ===');
    console.log('Response data:', JSON.stringify(responseData, null, 2));

    // Broadcast update to other admin clients via WebSocket
    if (isEmployee) {
      websocketService.broadcastEmployeeUpdate(id, 'updated');
    } else {
      websocketService.broadcastClientUpdate(id, 'updated');
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: {
        user: responseData
      }
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE /users/:id - Delete user (soft delete by default, hard delete with ?hardDelete=true)
router.delete('/users/:id',
  requirePermission('hardDelete.users.enable'),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { hardDelete } = req.query;

    // Check if user exists and get user type
    const userExistsResult = await checkUserExists(id);
    if (!userExistsResult.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let deleteResult;

    if (userExistsResult.isEmployee) {
      if (hardDelete === 'true') {
        // Hard delete employee from database
        deleteResult = await query(`
          DELETE FROM employees
          WHERE id = $1
          RETURNING id, email
        `, [id]);
      } else {
        // Soft delete employee by setting is_active to false
        deleteResult = await query(`
          UPDATE employees
          SET is_active = false, updated_at = NOW()
          WHERE id = $1
          RETURNING id, email
        `, [id]);
      }
    } else {
      if (hardDelete === 'true') {
        // Delete related records first to avoid foreign key constraints

        // 1. Delete service requests where user is the client
        const serviceRequestsDeleted = await query(`
          DELETE FROM service_requests
          WHERE client_id = $1
          RETURNING id
        `, [id]);

        if (serviceRequestsDeleted.rows.length > 0) {
          console.log(`Deleted ${serviceRequestsDeleted.rows.length} service request(s) for client ${id}`);
        }

        // 2. Delete file access log entries
        const fileAccessDeleted = await query(`
          DELETE FROM t_client_file_access_log
          WHERE accessed_by_user_id = $1
          RETURNING id
        `, [id]);

        if (fileAccessDeleted.rows.length > 0) {
          console.log(`Deleted ${fileAccessDeleted.rows.length} file access log(s) for user ${id}`);
        }

        // 3. Hard delete client from database
        deleteResult = await query(`
          DELETE FROM users
          WHERE id = $1
          RETURNING id, email
        `, [id]);
      } else {
        // Soft delete client by setting is_active to false
        deleteResult = await query(`
          UPDATE users
          SET is_active = false, updated_at = NOW()
          WHERE id = $1
          RETURNING id, email
        `, [id]);
      }
    }

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Broadcast delete to other admin clients via WebSocket
    const action = hardDelete === 'true' ? 'deleted' : 'updated'; // Soft delete is really an update
    if (userExistsResult.isEmployee) {
      websocketService.broadcastEmployeeUpdate(id, action);
    } else {
      websocketService.broadcastClientUpdate(id, action);
    }

    res.status(200).json({
      success: true,
      message: hardDelete === 'true' ? 'User deleted permanently' : 'User deactivated successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PATCH /users/:id/soft-delete - Soft delete user (toggle soft_delete field)
router.patch('/users/:id/soft-delete',
  requirePermission('softDelete.users.enable'),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { restore = false } = req.body; // restore = true to undelete, false to soft delete

    // Add soft_delete columns if they don't exist
    try {
      await query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS soft_delete BOOLEAN DEFAULT false');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS soft_delete BOOLEAN DEFAULT false');
    } catch (err) {
      // Columns might already exist, ignore error
    }

    // Check if user exists and get user type
    const userExistsResult = await checkUserExists(id);
    if (!userExistsResult.exists) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let updateResult;

    if (userExistsResult.isEmployee) {

      // Set soft delete status for employee: restore=true means undelete, restore=false means soft delete
      const newSoftDeleteStatus = !restore;
      const newActiveStatus = restore; // If restoring, set active to true; if soft deleting, set active to false
      updateResult = await query(`
        UPDATE employees
        SET soft_delete = $1, is_active = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id, email, soft_delete, is_active
      `, [newSoftDeleteStatus, newActiveStatus, id]);
    } else {
      // Set soft delete status for client: restore=true means undelete, restore=false means soft delete
      const newSoftDeleteStatus = !restore;
      const newActiveStatus = restore; // If restoring, set active to true; if soft deleting, set active to false
      updateResult = await query(`
        UPDATE users
        SET soft_delete = $1, is_active = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id, email, soft_delete, is_active
      `, [newSoftDeleteStatus, newActiveStatus, id]);
    }

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = updateResult.rows[0];

    // Broadcast soft delete/restore to other admin clients via WebSocket
    const action = user.soft_delete ? 'deleted' : 'restored';
    if (userExistsResult.isEmployee) {
      websocketService.broadcastEmployeeUpdate(id, action);
    } else {
      websocketService.broadcastClientUpdate(id, action);
    }

    res.status(200).json({
      success: true,
      message: user.soft_delete ? 'User soft deleted successfully' : 'User restored successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Soft delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to soft delete user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /users - Create a new user (employee or client)
router.post('/users', requirePermission('add.users.enable'), async (req, res) => {
  try {
    const {
      name,
      email,
      role,
      roles,
      userType,
      employeeNumber,
      department,
      jobTitle,
      hireDate,
      employeeStatus,
      phone,
      businessId,
      businessName,
      photo,
      photoPositionX,
      photoPositionY,
      photoScale,
      photoBackgroundColor
    } = req.body;

    console.log('🆕 Creating new user:', req.body);

    // Validate new user data using validation utilities
    const validation = await validateNewUserData({
      name, email, role, roles, userType, businessId, phone
    });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    const isClient = validation.isClient;
    const rolesArray = validation.rolesArray;

    // Parse name into first and last name
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';

    let createResult;
    let newUser;

    if (isClient) {
      // Create client in users table
      createResult = await query(`
        INSERT INTO users (
          email, first_name, last_name, role, phone, business_id, profile_photo_url, photo_position_x, photo_position_y, photo_scale, photo_background_color
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, email, first_name, last_name, role, phone, business_id, profile_photo_url, photo_position_x, photo_position_y, photo_scale, photo_background_color, created_at
      `, [
        email,
        firstName,
        lastName,
        'client',
        phone || null,
        businessId || null,
        photo || null,
        photoPositionX || 50,
        photoPositionY || 50,
        photoScale || 100,
        photoBackgroundColor || null
      ]);

      newUser = createResult.rows[0];
    } else {
      // Generate employee number if not provided
      const finalEmployeeNumber = employeeNumber || await generateEmployeeNumber();

      // Create employee in employees table (without redundant role column)
      createResult = await query(`
        INSERT INTO employees (
          email, first_name, last_name, employee_number, hire_date, phone
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, email, first_name, last_name, employee_number, hire_date, phone, created_at
      `, [
        email,
        firstName,
        lastName,
        finalEmployeeNumber,
        hireDate || null,
        phone || null
      ]);

      newUser = createResult.rows[0];

      // Update all normalized references
      await updateEmployeeRoles(newUser.id, rolesArray);

      if (department) {
        await updateEmployeeDepartment(newUser.id, department);
      }

      if (jobTitle) {
        await updateEmployeeJobTitle(newUser.id, jobTitle);
      }

      if (employeeStatus) {
        await updateEmployeeStatus(newUser.id, employeeStatus);
      }

      // Handle photo data if provided
      if (photo || photoPositionX || photoPositionY || photoScale) {
        await upsertEmployeePhoto(newUser.id, {
          url: photo,
          positionX: photoPositionX || 50,
          positionY: photoPositionY || 50,
          scale: photoScale || 100
        });
      }
    }

    // Create response data using mapping utility
    const responseData = createNewUserResponseData(newUser, isClient, rolesArray, department, businessName);

    console.log(`✅ ${isClient ? 'Client' : 'Employee'} created successfully:`, responseData);

    // Broadcast creation to other admin clients via WebSocket
    if (isClient) {
      websocketService.broadcastClientUpdate(newUser.id, 'created');
    } else {
      websocketService.broadcastEmployeeUpdate(newUser.id, 'created');
    }

    res.status(201).json({
      success: true,
      data: {
        user: responseData
      },
      message: `${isClient ? 'Client' : 'Employee'} created successfully`
    });

  } catch (error) {
    console.error('❌ Error creating user:', error);

    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;