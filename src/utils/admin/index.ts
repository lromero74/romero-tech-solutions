// Re-export all admin utilities for easier importing
export {
  enhanceClientsWithAddresses,
  openInMaps,
  formatAddress,
  validateAddress
} from './addressUtils';
export type { Address } from './addressUtils';

export {
  generateEmployeeNumber,
  parseEmployeeNumber,
  validateEmployeeData,
  formatEmployeeName,
  getEmployeeDisplayRole,
  hasAdminPrivileges
} from './employeeUtils';