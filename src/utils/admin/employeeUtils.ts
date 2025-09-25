/**
 * Generate employee number based on role and department
 */
export const generateEmployeeNumber = (
  role: 'admin' | 'technician',
  department?: string,
  existingNumbers: string[] = []
): string => {
  // Get role prefix
  const rolePrefix = role === 'admin' ? 'ADM' : 'TEC';

  // Get department code (first 3 letters of department, uppercase)
  const deptCode = department
    ? department.substring(0, 3).toUpperCase()
    : 'GEN'; // General if no department

  // Generate sequential number
  let counter = 1;
  let employeeNumber: string;

  do {
    const paddedCounter = counter.toString().padStart(3, '0');
    employeeNumber = `${rolePrefix}-${deptCode}-${paddedCounter}`;
    counter++;
  } while (existingNumbers.includes(employeeNumber));

  return employeeNumber;
};

/**
 * Parse employee number to extract role and department
 */
export const parseEmployeeNumber = (employeeNumber: string): {
  role: string;
  department: string;
  sequence: string;
} | null => {
  const match = employeeNumber.match(/^(ADM|TEC)-([A-Z]{3})-(\d{3})$/);

  if (!match) {
    return null;
  }

  const [, rolePrefix, deptCode, sequence] = match;

  return {
    role: rolePrefix === 'ADM' ? 'admin' : 'technician',
    department: deptCode,
    sequence
  };
};

/**
 * Validate employee data
 */
export const validateEmployeeData = (employee: {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  department?: string;
}): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!employee.firstName?.trim()) {
    errors.push('First name is required');
  }

  if (!employee.lastName?.trim()) {
    errors.push('Last name is required');
  }

  if (!employee.email?.trim()) {
    errors.push('Email is required');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email.trim())) {
    errors.push('Please enter a valid email address');
  }

  if (!employee.role?.trim()) {
    errors.push('Role is required');
  } else if (!['admin', 'technician'].includes(employee.role.trim())) {
    errors.push('Role must be either admin or technician');
  }

  if (!employee.department?.trim()) {
    errors.push('Department is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Format employee name for display
 */
export const formatEmployeeName = (firstName: string, lastName: string): string => {
  return `${firstName.trim()} ${lastName.trim()}`;
};

/**
 * Get employee display role
 */
export const getEmployeeDisplayRole = (role: string): string => {
  switch (role.toLowerCase()) {
    case 'admin':
      return 'Administrator';
    case 'technician':
      return 'Technician';
    default:
      return role;
  }
};

/**
 * Check if employee has admin privileges
 */
export const hasAdminPrivileges = (role: string): boolean => {
  return role.toLowerCase() === 'admin';
};