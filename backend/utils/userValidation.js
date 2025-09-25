/**
 * User Validation Utilities
 *
 * This module contains validation functions for user data including
 * role validation, user type validation, and required field validation.
 */

import { query } from '../config/database.js';

/**
 * Validate employee roles against the database
 * @param {Array} roles - Array of role names to validate
 * @returns {Promise<Object>} Validation result with isValid boolean and messages
 */
export async function validateEmployeeRoles(roles) {
  try {
    if (!roles || roles.length === 0) {
      return {
        isValid: false,
        message: 'At least one role is required for employees'
      };
    }

    // Get valid roles from database
    const validRolesResult = await query('SELECT name FROM roles WHERE is_active = true');
    const validRoles = validRolesResult.rows.map(row => row.name);

    // Check for invalid roles
    const invalidRoles = roles.filter(r => !validRoles.includes(r));
    if (invalidRoles.length > 0) {
      return {
        isValid: false,
        message: `Invalid role(s): ${invalidRoles.join(', ')}. Valid roles are: ${validRoles.join(', ')}`
      };
    }

    // Validate that employee has at least one valid employee role
    const employeeRoles = ['admin', 'sales', 'technician'];
    const validEmployeeRoles = roles.filter(r => employeeRoles.includes(r));
    if (validEmployeeRoles.length === 0) {
      return {
        isValid: false,
        message: 'Employees must have at least one of these roles: admin, sales, technician'
      };
    }

    // Check for client role being assigned to employee
    if (roles.includes('client')) {
      return {
        isValid: false,
        message: 'Cannot assign client role to employee. Create a new client user instead.'
      };
    }

    return {
      isValid: true,
      validRoles,
      employeeRoles: validEmployeeRoles
    };
  } catch (error) {
    console.error('Error validating employee roles:', error);
    return {
      isValid: false,
      message: 'Error validating roles'
    };
  }
}

/**
 * Validate client data and role
 * @param {string} role - Role to validate for client
 * @returns {Object} Validation result
 */
export function validateClientData(role = null) {
  // Client role should be 'client' if provided, but it's optional for updates
  if (role && role !== 'client') {
    return {
      isValid: false,
      message: 'Cannot change client role to employee role. Create a new employee instead.'
    };
  }

  return {
    isValid: true
  };
}

/**
 * Validate user type and determine if user is client or employee
 * @param {string|number} businessId - Business ID to check
 * @param {string} userType - Explicit user type
 * @returns {Object} Validation result with user type determination
 */
export function validateUserType(businessId, userType = null) {
  // Determine if this is a client based on businessId presence
  const isClient = Boolean(businessId);

  // If userType is explicitly provided, validate it matches businessId logic
  if (userType) {
    const normalizedUserType = userType.toLowerCase();
    if (normalizedUserType === 'client' && !isClient) {
      return {
        isValid: false,
        message: 'Client user type requires a business ID'
      };
    }
    if ((normalizedUserType === 'employee' || normalizedUserType === 'employees') && isClient) {
      return {
        isValid: false,
        message: 'Employee user type should not have a business ID'
      };
    }
  }

  return {
    isValid: true,
    isClient,
    userType: isClient ? 'client' : 'employee'
  };
}

/**
 * Validate required fields for user creation
 * @param {Object} userData - User data to validate
 * @param {boolean} isClient - Whether this is a client user
 * @returns {Object} Validation result
 */
export function validateRequiredFields(userData, isClient = false) {
  const { name, email, roles, role } = userData;

  if (!email) {
    return {
      isValid: false,
      message: 'Email is required'
    };
  }

  if (!name) {
    return {
      isValid: false,
      message: 'Name is required'
    };
  }

  // Only require roles for employees, not for clients
  if (!isClient) {
    const rolesArray = roles || (role ? [role] : []);
    if (!rolesArray || rolesArray.length === 0) {
      return {
        isValid: false,
        message: 'At least one role is required for employees'
      };
    }
  }

  return {
    isValid: true
  };
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {Object} Validation result
 */
export function validateEmail(email) {
  if (!email) {
    return {
      isValid: false,
      message: 'Email is required'
    };
  }

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      isValid: false,
      message: 'Invalid email format'
    };
  }

  return {
    isValid: true
  };
}

/**
 * Validate phone number format (if provided)
 * @param {string} phone - Phone number to validate
 * @returns {Object} Validation result
 */
export function validatePhone(phone) {
  if (!phone) {
    return { isValid: true }; // Phone is optional
  }

  // Basic phone validation - accepts various formats
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$|^[\(]?[\d\s\-\.\(\)]{10,}$/;
  if (!phoneRegex.test(phone.replace(/[\s\-\.\(\)]/g, ''))) {
    return {
      isValid: false,
      message: 'Invalid phone number format'
    };
  }

  return {
    isValid: true
  };
}

/**
 * Validate user update data based on user type
 * @param {Object} updateData - Data being updated
 * @param {boolean} isEmployee - Whether this is an employee
 * @returns {Promise<Object>} Validation result
 */
export async function validateUserUpdateData(updateData, isEmployee) {
  const { role, roles, email, phone } = updateData;

  // Validate email if provided
  if (email) {
    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      return emailValidation;
    }
  }

  // Validate phone if provided
  if (phone) {
    const phoneValidation = validatePhone(phone);
    if (!phoneValidation.isValid) {
      return phoneValidation;
    }
  }

  // Validate roles based on user type
  if (isEmployee) {
    // Only validate roles if they're being updated
    if (roles !== undefined || role !== undefined) {
      const rolesArray = roles || (role ? [role] : []);
      const roleValidation = await validateEmployeeRoles(rolesArray);
      if (!roleValidation.isValid) {
        return roleValidation;
      }
    }
  } else {
    // Client validation
    const clientValidation = validateClientData(role);
    if (!clientValidation.isValid) {
      return clientValidation;
    }
  }

  return {
    isValid: true
  };
}

/**
 * Validate new user creation data
 * @param {Object} userData - User creation data
 * @returns {Promise<Object>} Validation result
 */
export async function validateNewUserData(userData) {
  const { businessId, userType, roles, role } = userData;

  // Determine user type
  const userTypeValidation = validateUserType(businessId, userType);
  if (!userTypeValidation.isValid) {
    return userTypeValidation;
  }

  const isClient = userTypeValidation.isClient;

  // Validate required fields
  const requiredFieldsValidation = validateRequiredFields(userData, isClient);
  if (!requiredFieldsValidation.isValid) {
    return requiredFieldsValidation;
  }

  // Validate email format
  const emailValidation = validateEmail(userData.email);
  if (!emailValidation.isValid) {
    return emailValidation;
  }

  // Validate phone if provided
  if (userData.phone) {
    const phoneValidation = validatePhone(userData.phone);
    if (!phoneValidation.isValid) {
      return phoneValidation;
    }
  }

  // Validate roles
  const rolesArray = roles || (role ? [role] : []);

  if (!isClient && rolesArray.length > 0) {
    const roleValidation = await validateEmployeeRoles(rolesArray);
    if (!roleValidation.isValid) {
      return roleValidation;
    }
  }

  // Get valid roles for response
  let validRoles = [];
  try {
    const validRolesResult = await query('SELECT name FROM roles WHERE is_active = true');
    validRoles = validRolesResult.rows.map(row => row.name);
    validRoles.push('client'); // Add client as valid role
  } catch (error) {
    console.error('Error fetching valid roles:', error);
  }

  // Check for invalid roles
  const invalidRoles = rolesArray.filter(r => !validRoles.includes(r));
  if (invalidRoles.length > 0) {
    return {
      isValid: false,
      message: `Invalid role(s): ${invalidRoles.join(', ')}. Valid roles are: ${validRoles.join(', ')}`
    };
  }

  return {
    isValid: true,
    isClient,
    userType: isClient ? 'client' : 'employee',
    rolesArray,
    validRoles
  };
}

/**
 * Check if user exists in database
 * @param {string|number} userId - User ID to check
 * @returns {Promise<Object>} Result indicating if user exists and what type
 */
export async function checkUserExists(userId) {
  try {
    const employeeCheck = await query('SELECT id FROM employees WHERE id = $1', [userId]);
    const clientCheck = await query('SELECT id FROM users WHERE id = $1', [userId]);

    if (employeeCheck.rows.length > 0) {
      return {
        exists: true,
        isEmployee: true,
        isClient: false
      };
    }

    if (clientCheck.rows.length > 0) {
      return {
        exists: true,
        isEmployee: false,
        isClient: true
      };
    }

    return {
      exists: false,
      isEmployee: false,
      isClient: false
    };
  } catch (error) {
    console.error('Error checking if user exists:', error);
    return {
      exists: false,
      error: 'Database error while checking user existence'
    };
  }
}

export default {
  validateEmployeeRoles,
  validateClientData,
  validateUserType,
  validateRequiredFields,
  validateEmail,
  validatePhone,
  validateUserUpdateData,
  validateNewUserData,
  checkUserExists
};