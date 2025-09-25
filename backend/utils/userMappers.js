/**
 * User Mapping and Transform Utilities
 *
 * This module contains functions for transforming database query results into
 * consistent response objects for both employees and clients.
 */

import { formatDateForUI } from './adminHelpers.js';

/**
 * Map a database user row to a standardized response format
 * @param {Object} user - Raw database user object
 * @returns {Object} Mapped user object for API response
 */
export function mapDatabaseToResponseUser(user) {
  const mapped = {
    id: user.id,
    email: user.email,
    role: user.role,
    roles: user.roles || [],
    name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    middleInitial: user.middle_initial,
    preferredName: user.preferred_name,
    phone: user.phone,
    employeeNumber: user.employee_number,
    department: user.department_detailed,
    jobTitle: user.job_title,
    hireDate: formatDateForUI(user.hire_date),
    employeeStatus: user.employee_status,
    businessName: user.business_name,
    businessId: user.business_id,
    isActive: user.is_active,
    emailVerified: user.email_verified,
    workingStatus: user.working_status,
    workingStatusDisplay: user.working_status_display,
    workingStatusColor: user.working_status_color,
    isAvailableForWork: user.is_available_for_work,
    isOnVacation: user.is_on_vacation || false,
    isOutSick: user.is_out_sick || false,
    isOnOtherLeave: user.is_on_other_leave || false,
    softDelete: user.soft_delete || false,
    userType: user.user_type,
    createdAt: user.created_at,
    lastLogin: user.last_login,
    photo: user.profile_photo_url,
    photoPositionX: user.photo_position_x,
    photoPositionY: user.photo_position_y,
    photoScale: user.photo_scale,
    address: mapEmployeeAddress(user),
    emergencyContact: mapEmployeeEmergencyContact(user)
  };

  return mapped;
}

/**
 * Map employee-specific data from database result
 * @param {Object} employee - Raw database employee object
 * @returns {Object} Mapped employee object
 */
export function mapEmployeeData(employee) {
  return {
    id: employee.id,
    email: employee.email,
    role: employee.role,
    roles: employee.roles || [],
    firstName: employee.first_name,
    lastName: employee.last_name,
    middleInitial: employee.middle_initial,
    preferredName: employee.preferred_name,
    phone: employee.phone,
    employeeNumber: employee.employee_number,
    department: employee.department_detailed,
    jobTitle: employee.job_title,
    hireDate: formatDateForUI(employee.hire_date),
    employeeStatus: employee.employee_status,
    employeeStatusDisplay: employee.employee_status_display,
    pronouns: employee.pronouns,
    pronounsDisplay: employee.pronouns_display,
    workingStatus: employee.working_status,
    workingStatusDisplay: employee.working_status_display,
    workingStatusColor: employee.working_status_color,
    isAvailableForWork: employee.is_available_for_work,
    isActive: employee.is_active,
    isOnVacation: employee.is_on_vacation || false,
    isOutSick: employee.is_out_sick || false,
    isOnOtherLeave: employee.is_on_other_leave || false,
    softDelete: employee.soft_delete || false,
    emailVerified: employee.email_verified,
    createdAt: employee.created_at,
    lastLogin: employee.last_login,
    terminationDate: employee.termination_date,
    userType: 'employee',
    photo: employee.profile_photo_url,
    photoPositionX: employee.photo_position_x,
    photoPositionY: employee.photo_position_y,
    photoScale: employee.photo_scale,
    address: mapEmployeeAddress(employee),
    emergencyContact: mapEmployeeEmergencyContact(employee)
  };
}

/**
 * Map client-specific data from database result
 * @param {Object} client - Raw database client object
 * @returns {Object} Mapped client object
 */
export function mapClientData(client) {
  return {
    id: client.id,
    email: client.email,
    role: client.role || 'client',
    roles: ['client'],
    firstName: client.first_name,
    lastName: client.last_name,
    name: `${client.first_name || ''} ${client.last_name || ''}`.trim() || client.email,
    phone: client.phone,
    businessName: client.business_name,
    businessId: client.business_id,
    isActive: client.is_active,
    emailVerified: client.email_verified,
    softDelete: client.soft_delete || false,
    createdAt: client.created_at,
    lastLogin: client.last_login,
    userType: 'client',
    photo: client.profile_photo_url,
    photoPositionX: client.photo_position_x,
    photoPositionY: client.photo_position_y,
    photoScale: client.photo_scale,
    photoBackgroundColor: client.photo_background_color
  };
}

/**
 * Map employee address data if it exists
 * @param {Object} user - User object with address fields
 * @returns {Object|null} Address object or null if no address data
 */
export function mapEmployeeAddress(user) {
  if (user.user_type === 'employee' &&
      (user.address_street || user.address_street_2 || user.address_city ||
       user.address_state || user.address_zip_code || user.address_country)) {
    return {
      street: user.address_street,
      street2: user.address_street_2,
      city: user.address_city,
      state: user.address_state,
      zipCode: user.address_zip_code,
      country: user.address_country
    };
  }
  return null;
}

/**
 * Map employee emergency contact data if it exists
 * @param {Object} user - User object with emergency contact fields
 * @returns {Object|null} Emergency contact object or null if no contact data
 */
export function mapEmployeeEmergencyContact(user) {
  if (user.user_type === 'employee' &&
      (user.emergency_contact_first_name || user.emergency_contact_last_name)) {
    return {
      firstName: user.emergency_contact_first_name,
      lastName: user.emergency_contact_last_name,
      relationship: user.emergency_contact_relationship,
      phone: user.emergency_contact_phone,
      email: user.emergency_contact_email
    };
  }
  return null;
}

/**
 * Format user data for UI display with consistent naming
 * @param {Object} user - Raw or partially mapped user object
 * @returns {Object} User object formatted for UI consumption
 */
export function formatUserForUI(user) {
  const formatted = {
    ...user,
    name: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
    displayName: user.preferredName || user.firstName || user.email,
    fullName: `${user.firstName || ''} ${user.middleInitial ? user.middleInitial + '. ' : ''}${user.lastName || ''}`.trim()
  };

  // Ensure consistent boolean values
  formatted.isActive = Boolean(formatted.isActive);
  formatted.emailVerified = Boolean(formatted.emailVerified);
  formatted.isOnVacation = Boolean(formatted.isOnVacation);
  formatted.isOutSick = Boolean(formatted.isOutSick);
  formatted.isOnOtherLeave = Boolean(formatted.isOnOtherLeave);
  formatted.softDelete = Boolean(formatted.softDelete);
  formatted.isAvailableForWork = Boolean(formatted.isAvailableForWork);

  return formatted;
}

/**
 * Map array of database users to response format
 * @param {Array} users - Array of raw database user objects
 * @returns {Array} Array of mapped user objects
 */
export function mapUsersArray(users) {
  return users.map(user => {
    const mapped = mapDatabaseToResponseUser(user);

    // Debug logging for specific user (Louis)
    if (user.email === 'louis@romerotechsolutions.com') {
      console.log('🔍 BACKEND DEBUG - Louis record from DB query:');
      console.log('  department_detailed:', user.department_detailed);
      console.log('  user_type:', user.user_type);
      console.log('  id:', user.id);

      console.log('🔍 BACKEND DEBUG - Louis after mapping:');
      console.log('  department:', mapped.department);
      console.log('  department type:', typeof mapped.department);
      console.log('  mapped object:', JSON.stringify(mapped, null, 2));
    }

    return mapped;
  });
}

/**
 * Create response data for updated user (used in PUT endpoint)
 * @param {Object} updatedUser - Updated user from database
 * @param {boolean} isEmployee - Whether the user is an employee
 * @returns {Object} Response data object
 */
export function createUpdateResponseData(updatedUser, isEmployee = false) {
  const responseData = {
    id: updatedUser.id,
    email: updatedUser.email,
    role: updatedUser.role,
    roles: updatedUser.roles || [],
    firstName: updatedUser.first_name,
    lastName: updatedUser.last_name,
    name: `${updatedUser.first_name || ''} ${updatedUser.last_name || ''}`.trim() || updatedUser.email,
    isActive: updatedUser.is_active,
    phone: updatedUser.phone,
    photo: updatedUser.profile_photo_url
  };

  // Add employee-specific fields
  if (isEmployee) {
    responseData.middleInitial = updatedUser.middle_initial;
    responseData.preferredName = updatedUser.preferred_name;
    responseData.pronouns = updatedUser.pronouns;
    responseData.employeeNumber = updatedUser.employee_number;
    responseData.jobTitle = updatedUser.job_title;
    responseData.hireDate = formatDateForUI(updatedUser.hire_date);
    responseData.employeeStatus = updatedUser.employee_status;
    responseData.terminationDate = updatedUser.termination_date;
    responseData.isOnVacation = updatedUser.is_on_vacation || false;
    responseData.isOutSick = updatedUser.is_out_sick || false;
    responseData.isOnOtherLeave = updatedUser.is_on_other_leave || false;
  }

  return responseData;
}

/**
 * Create response data for newly created user
 * @param {Object} newUser - Newly created user from database
 * @param {boolean} isClient - Whether the user is a client
 * @param {Array} rolesArray - Array of user roles
 * @param {string} department - Department name (for employees)
 * @param {string} businessName - Business name (for clients)
 * @returns {Object} Response data object
 */
export function createNewUserResponseData(newUser, isClient, rolesArray = [], department = null, businessName = null) {
  const responseData = {
    id: newUser.id,
    email: newUser.email,
    roles: isClient ? ['client'] : rolesArray,
    firstName: newUser.first_name,
    lastName: newUser.last_name,
    name: `${newUser.first_name} ${newUser.last_name}`.trim(),
    phone: newUser.phone,
    userType: isClient ? 'client' : 'employee',
    isActive: true,
    createdAt: newUser.created_at
  };

  // Add employee-specific fields
  if (!isClient) {
    responseData.employeeNumber = newUser.employee_number;
    responseData.jobTitle = newUser.job_title;
    responseData.hireDate = newUser.hire_date;
    responseData.employeeStatus = newUser.employee_status;
    responseData.department = department;
  }

  // Add business name for clients
  if (isClient && businessName) {
    responseData.businessName = businessName;
  }

  return responseData;
}

export default {
  mapDatabaseToResponseUser,
  mapEmployeeData,
  mapClientData,
  mapEmployeeAddress,
  mapEmployeeEmergencyContact,
  formatUserForUI,
  mapUsersArray,
  createUpdateResponseData,
  createNewUserResponseData
};