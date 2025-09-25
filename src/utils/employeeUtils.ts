import { UserRole, Department } from '../types/database';

export interface EmployeeNumberConfig {
  prefix: string; // e.g., "RT" for Romero Tech
  useYear: boolean; // Include year in the format
  useDepartment: boolean; // Include department code
  padding: number; // Number of digits for sequence (e.g., 3 for "001")
}

// Default configuration for Romero Tech Solutions
export const DEFAULT_EMPLOYEE_CONFIG: EmployeeNumberConfig = {
  prefix: 'RT',
  useYear: true,
  useDepartment: false,
  padding: 3
};

// Department codes for employee numbering
export const DEPARTMENT_CODES: Record<Department, string> = {
  administration: 'ADM',
  technical: 'TEC',
  customer_service: 'CS',
  management: 'MGT',
  other: 'OTH'
};

// Role-based prefixes
export const ROLE_PREFIXES: Record<UserRole, string> = {
  admin: 'A',
  technician: 'T',
  client: 'C' // Clients typically don't get employee numbers, but included for completeness
};

/**
 * Generate an employee number based on configuration and existing employees
 * Format examples:
 * - RT-2024-001 (prefix-year-sequence)
 * - RT-A-2024-001 (prefix-role-year-sequence)
 * - RT-TEC-001 (prefix-department-sequence)
 * - RT-A-TEC-2024-001 (prefix-role-department-year-sequence)
 */
export function generateEmployeeNumber(
  role: UserRole,
  department?: Department,
  existingNumbers: string[] = [],
  config: EmployeeNumberConfig = DEFAULT_EMPLOYEE_CONFIG
): string {
  const currentYear = new Date().getFullYear();
  const parts: string[] = [config.prefix];

  // Add role prefix for admins and technicians (not clients)
  if (role !== 'client') {
    parts.push(ROLE_PREFIXES[role]);
  }

  // Add department code if configured and department is provided
  if (config.useDepartment && department) {
    parts.push(DEPARTMENT_CODES[department]);
  }

  // Add year if configured
  if (config.useYear) {
    parts.push(currentYear.toString());
  }

  // Generate the base pattern without sequence number
  const basePattern = parts.join('-');

  // Find the highest existing sequence number for this pattern
  const pattern = new RegExp(`^${basePattern}-(\\d+)$`);
  let maxSequence = 0;

  existingNumbers.forEach(empNum => {
    const match = empNum.match(pattern);
    if (match) {
      const sequence = parseInt(match[1], 10);
      maxSequence = Math.max(maxSequence, sequence);
    }
  });

  // Generate next sequence number with padding
  const nextSequence = (maxSequence + 1).toString().padStart(config.padding, '0');

  return `${basePattern}-${nextSequence}`;
}

/**
 * Validate an employee number format
 */
export function validateEmployeeNumber(
  employeeNumber: string,
  config: EmployeeNumberConfig = DEFAULT_EMPLOYEE_CONFIG
): boolean {
  // Build regex pattern based on config
  let pattern = `^${config.prefix}`;

  // Role is optional but if present, should be valid
  pattern += '(?:-[ATC])?';

  // Department is optional but if present, should be valid
  if (config.useDepartment) {
    pattern += '(?:-(?:ADM|TEC|CS|MGT|OTH))?';
  }

  // Year if configured
  if (config.useYear) {
    pattern += '-\\d{4}';
  }

  // Sequence number with proper padding
  pattern += `-\\d{${config.padding}}$`;

  const regex = new RegExp(pattern);
  return regex.test(employeeNumber);
}

/**
 * Parse an employee number to extract its components
 */
export function parseEmployeeNumber(employeeNumber: string): {
  prefix: string;
  role?: UserRole;
  department?: Department;
  year?: number;
  sequence: number;
  isValid: boolean;
} {
  const parts = employeeNumber.split('-');
  const result = {
    prefix: '',
    role: undefined as UserRole | undefined,
    department: undefined as Department | undefined,
    year: undefined as number | undefined,
    sequence: 0,
    isValid: false
  };

  if (parts.length < 2) {
    return result;
  }

  let index = 0;
  result.prefix = parts[index++];

  // Check for role
  if (index < parts.length && ['A', 'T', 'C'].includes(parts[index])) {
    const roleCode = parts[index++];
    result.role = roleCode === 'A' ? 'admin' : roleCode === 'T' ? 'technician' : 'client';
  }

  // Check for department
  if (index < parts.length && ['ADM', 'TEC', 'CS', 'MGT', 'OTH'].includes(parts[index])) {
    const deptCode = parts[index++];
    const deptMap: Record<string, Department> = {
      'ADM': 'administration',
      'TEC': 'technical',
      'CS': 'customer_service',
      'MGT': 'management',
      'OTH': 'other'
    };
    result.department = deptMap[deptCode];
  }

  // Check for year (4 digits)
  if (index < parts.length && /^\d{4}$/.test(parts[index])) {
    result.year = parseInt(parts[index++], 10);
  }

  // Last part should be sequence number
  if (index < parts.length && /^\d+$/.test(parts[index])) {
    result.sequence = parseInt(parts[index], 10);
    result.isValid = true;
  }

  return result;
}

/**
 * Get formatted display name for employee
 */
export function getEmployeeDisplayName(employee: {
  name: string;
  employeeNumber?: string;
  jobTitle?: string;
}): string {
  let displayName = employee.name;

  if (employee.employeeNumber) {
    displayName += ` (${employee.employeeNumber})`;
  }

  if (employee.jobTitle) {
    displayName += ` - ${employee.jobTitle}`;
  }

  return displayName;
}

/**
 * Get department display name
 */
export function getDepartmentDisplayName(department: Department): string {
  const displayNames: Record<Department, string> = {
    administration: 'Administration',
    technical: 'Technical Services',
    customer_service: 'Customer Service',
    management: 'Management',
    other: 'Other'
  };

  return displayNames[department];
}

/**
 * Get available managers for a given employee (excludes self and subordinates)
 */
export function getAvailableManagers(
  currentEmployeeId: string,
  allEmployees: Array<{ id: string; name: string; role: UserRole; managerId?: string }>
): Array<{ id: string; name: string; role: UserRole }> {
  // Get all subordinates of current employee
  const getSubordinates = (managerId: string): string[] => {
    const direct = allEmployees.filter(emp => emp.managerId === managerId).map(emp => emp.id);
    const indirect = direct.flatMap(id => getSubordinates(id));
    return [...direct, ...indirect];
  };

  const subordinateIds = getSubordinates(currentEmployeeId);

  // Return employees who are not the current employee and not subordinates
  // Typically only admins and managers can be managers
  return allEmployees
    .filter(emp =>
      emp.id !== currentEmployeeId &&
      !subordinateIds.includes(emp.id) &&
      (emp.role === 'admin' || emp.role === 'technician') // Add management role when available
    );
}