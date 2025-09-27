/**
 * Helper utility to systematically update adminService methods from fetch to apiService
 *
 * Usage: This file contains patterns and templates for updating remaining adminService methods.
 * Copy the patterns below and replace the corresponding methods in adminService.ts
 */

// Templates for updating adminService methods (commented to avoid unused variable errors)
/*
// Template for GET requests
const getTemplate = `
async methodName(): Promise<ReturnType> {
  try {
    const apiService = await this.getApiService();
    const result = await apiService.get('/admin/endpoint');
    return result.data || result;
  } catch (error) {
    console.error('Error message:', error);
    throw error;
  }
}`;

// Template for POST requests
const postTemplate = `
async methodName(data: DataType): Promise<ReturnType> {
  try {
    const apiService = await this.getApiService();
    const result = await apiService.post('/admin/endpoint', data);
    return result.data || result;
  } catch (error) {
    console.error('Error message:', error);
    throw error;
  }
}`;

// Template for PUT requests
const putTemplate = `
async methodName(id: string, data: DataType): Promise<ReturnType> {
  try {
    const apiService = await this.getApiService();
    const result = await apiService.put('/admin/endpoint/\${id}', data);
    return result.data || result;
  } catch (error) {
    console.error('Error message:', error);
    throw error;
  }
}`;

// Template for DELETE requests
const deleteTemplate = `
async methodName(id: string): Promise<void> {
  try {
    const apiService = await this.getApiService();
    await apiService.delete('/admin/endpoint/\${id}');
  } catch (error) {
    console.error('Error message:', error);
    throw error;
  }
}`;
*/

/**
 * Remaining methods to update (when time permits):
 *
 * BUSINESS METHODS:
 * - updateAuthorizedDomains()
 * - getBusinessesByEmailDomain()
 * - softDeleteBusiness()
 * - createBusiness()
 *
 * USER METHODS:
 * - updateUser()
 * - changeUserPassword()
 * - softDeleteUser()
 * - createUser()
 *
 * ROLE METHODS:
 * - getRoles()
 * - createRole()
 * - updateRole()
 * - deleteRole()
 *
 * SERVICE LOCATION METHODS:
 * - softDeleteServiceLocation()
 * - toggleServiceLocationStatus()
 * - updateServiceLocation()
 * - createServiceLocation()
 */

export const migrationStatus = {
  completed: [
    'getDashboardData',
    'getUsers',
    'getBusinesses',
    'getEmployeesWithLoginStatus',
    'getServices',
    'getServiceRequests',
    'getServiceLocations',
    'getLocationContacts',
    'hasLocationContacts',
    'createLocationContact',
    'updateBusiness',
    'deleteBusiness',
    'getAuthorizedDomains'
  ],
  remaining: [
    'updateAuthorizedDomains',
    'getBusinessesByEmailDomain',
    'softDeleteBusiness',
    'createBusiness',
    'updateUser',
    'changeUserPassword',
    'softDeleteUser',
    'createUser',
    'createService',
    'getRoles',
    'createRole',
    'updateRole',
    'deleteRole',
    'softDeleteServiceLocation',
    'toggleServiceLocationStatus',
    'updateServiceLocation',
    'createServiceLocation'
  ]
};

console.log('AdminService Migration Status:');
console.log(`✅ Completed: ${migrationStatus.completed.length} methods`);
console.log(`⏳ Remaining: ${migrationStatus.remaining.length} methods`);
console.log(`📊 Progress: ${Math.round((migrationStatus.completed.length / (migrationStatus.completed.length + migrationStatus.remaining.length)) * 100)}%`);