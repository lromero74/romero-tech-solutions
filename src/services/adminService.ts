import { Role, Service, ServiceRequest } from '../types/database';

interface DashboardStatistics {
  totalUsers: number;
  totalBusinesses: number;
  totalClients: number;
  totalAdmins: number;
}

interface RecentUser {
  id: string;
  email: string;
  role: string;
  name: string;
  businessName?: string;
  userType: string;
  createdAt: string;
}

interface UserTrend {
  date: string;
  count: string;
}

interface UsersByRole {
  role: string;
  count: string;
}


interface DashboardData {
  statistics: DashboardStatistics;
  recentUsers: RecentUser[];
  userTrends: UserTrend[];
  usersByRole: UsersByRole[];
}

interface User {
  id: string;
  email: string;
  role: string;
  roles?: string[]; // Multiple roles support
  // Name fields
  firstName: string;
  lastName: string;
  middleInitial?: string;
  preferredName?: string; // Nickname/preferred name (e.g., "John" for "Jonathan")
  pronouns?: string;
  // Basic info
  photo?: string;
  phone?: string;
  businessName?: string;
  businessId?: string;
  isActive: boolean;
  emailVerified: boolean;
  isOnVacation: boolean;
  isOutSick: boolean;
  isOnOtherLeave: boolean;
  softDelete?: boolean;
  userType: string;
  createdAt: string;
  lastLogin?: string;
  // Real-time login status fields
  isLoggedIn?: boolean;
  activeSessions?: number;
  lastActivity?: string;
  isRecentlyActive?: boolean;
  // Address fields
  address?: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  // Employee-specific fields
  employeeNumber?: string;
  hireDate?: string;
  department?: string;
  jobTitle?: string;
  managerId?: string;
  employeeStatus?: string;
  terminationDate?: string;
  emergencyContact?: {
    firstName: string;
    lastName: string;
    relationship: string;
    phone: string;
    email?: string;
  };
}

interface UsersResponse {
  users: User[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalUsers: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

interface AuthorizedDomain {
  domain: string;
  description?: string;
}

interface ServiceLocation {
  id: string;
  business_id: string;
  address_label: string;
  location_name?: string;
  location_type: string;
  street: string;
  street_address_2?: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  contact_person?: string;
  contact_phone?: string;
  notes?: string;
  is_headquarters: boolean;
  soft_delete?: boolean;
  is_active?: boolean;
}

interface LocationContact {
  id: string;
  service_location_id: string;
  user_id: string;
  contact_role?: string;
  is_primary_contact?: boolean;
  notes?: string;
}

interface LocationHierarchy {
  location_type: string;
  location_id: number;
  notes?: string;
}

interface LocationChildren {
  children: unknown[];
}

interface LocationTypeCategory {
  categories: unknown[];
}

interface LocationType {
  id: string;
  name: string;
  category?: string;
}

interface Business {
  id: string;
  businessName: string;
  domainEmails: string;
  logo?: string;
  logoPositionX?: number;
  logoPositionY?: number;
  logoScale?: number;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  locationCount: number;
  isActive: boolean;
  softDelete?: boolean;
  createdAt: string;
}

interface BusinessesResponse {
  businesses: Business[];
}

export class AdminService {
  private apiService: typeof import('./apiService').apiService | null = null;

  // Initialize apiService dynamically to avoid circular dependencies
  private async getApiService() {
    if (!this.apiService) {
      const { apiService } = await import('./apiService');
      this.apiService = apiService;
    }
    return this.apiService;
  }
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/admin`;
  }

  // Get dashboard overview data
  async getDashboardData(): Promise<DashboardData> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get('/admin/dashboard');
      return result.data;
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw error;
    }
  }

  // Get all users with pagination and filtering
  async getUsers(params?: {
    page?: number;
    limit?: number;
    role?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
    userType?: string;
  }): Promise<UsersResponse> {
    try {
      const queryParams = new URLSearchParams();

      if (params?.page) queryParams.append('page', params.page.toString());
      if (params?.limit) queryParams.append('limit', params.limit.toString());
      if (params?.role) queryParams.append('role', params.role);
      if (params?.search) queryParams.append('search', params.search);
      if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
      if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
      if (params?.userType) queryParams.append('userType', params.userType);

      const apiService = await this.getApiService();
      const result = await apiService.get(`/admin/users?${queryParams}`);
      return result.data;
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  }

  // Get all businesses
  async getBusinesses(): Promise<BusinessesResponse> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get('/admin/businesses');
      return result.data;
    } catch (error) {
      console.error('Error fetching businesses:', error);
      throw error;
    }
  }

  // Update business
  async updateBusiness(businessId: string, data: {
    businessName: string;
    authorizedDomains?: Array<{
      id?: string;
      domain: string;
      description?: string;
      is_active?: boolean;
    }>;
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
    };
    isActive: boolean;
    logo?: string;
    logoPositionX?: number;
    logoPositionY?: number;
    logoScale?: number;
    logoBackgroundColor?: string;
    rateCategoryId?: string;
  }): Promise<{ business: Business }> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.put(`/admin/businesses/${businessId}`, data);
      return result.data;
    } catch (error) {
      console.error('Error updating business:', error);
      throw error;
    }
  }

  // Delete business
  async deleteBusiness(businessId: string): Promise<void> {
    try {
      const apiService = await this.getApiService();
      await apiService.delete(`/admin/businesses/${businessId}`);
    } catch (error) {
      console.error('Error deleting business:', error);
      throw error;
    }
  }

  // Update user
  async updateUser(userId: string, data: {
    role?: string;
    roles?: string[];
    isActive?: boolean;
    name?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    middleInitial?: string;
    preferredName?: string;
    pronouns?: string;
    photo?: string;
    photoPositionX?: number;
    photoPositionY?: number;
    photoScale?: number;
    photoBackgroundColor?: string;
    phone?: string;
    isOnVacation?: boolean;
    isOutSick?: boolean;
    isOnOtherLeave?: boolean;
    employeeNumber?: string;
    department?: string;
    jobTitle?: string;
    hireDate?: string;
    employeeStatus?: string;
    terminationDate?: string;
    closeActiveSessions?: boolean;
    address?: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
      country: string;
    };
    emergencyContact?: {
      firstName: string;
      lastName: string;
      relationship: string;
      phone: string;
      email?: string;
    };
  }): Promise<User> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.put(`/admin/users/${userId}`, data);
      return result.data.user;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  // Delete user (soft delete by default, hard delete optional)
  async deleteUser(userId: string, hardDelete = false): Promise<void> {
    try {
      const apiService = await this.getApiService();
      const endpoint = hardDelete
        ? `/admin/users/${userId}?hardDelete=true`
        : `/admin/users/${userId}`;
      await apiService.delete(endpoint);
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  // Soft delete user (toggle soft_delete field)
  async softDeleteUser(userId: string, restore = false): Promise<void> {
    try {
      console.log(`🔧 AdminService.softDeleteUser called: userId=${userId}, restore=${restore}`);
      const apiService = await this.getApiService();
      console.log(`📡 Making PATCH request to: /admin/users/${userId}/soft-delete`);
      console.log(`📤 Request body:`, { restore });

      const result = await apiService.patch(`/admin/users/${userId}/soft-delete`, { restore });
      console.log(`📥 API response:`, result);
    } catch (error) {
      console.error('Error soft deleting user:', error);
      throw error;
    }
  }

  // Create user
  async createUser(userData: {
    name: string;
    email: string;
    role?: string;
    roles: string[];
    userType?: string;
    employeeNumber?: string;
    department?: string;
    jobTitle?: string;
    hireDate?: string;
    employeeStatus?: string;
    phone?: string;
  }): Promise<User> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.post('/admin/users', userData);
      return result.data.user;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  // Create service
  async createService(serviceData: {
    name: string;
    description: string;
    basePrice: number;
    estimatedHours: number;
  }): Promise<Service> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.post('/admin/services', serviceData);
      return result.data.service;
    } catch (error) {
      console.error('Error creating service:', error);
      throw error;
    }
  }

  // Get services
  async getServices(): Promise<{ services: Service[] }> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get('/admin/services');
      return result.data;
    } catch (error) {
      console.error('Error fetching services:', error);
      throw error;
    }
  }

  // Get service requests
  async getServiceRequests(): Promise<{ serviceRequests: ServiceRequest[] }> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get('/admin/service-requests');
      return result.data;
    } catch (error) {
      console.error('Error fetching service requests:', error);
      throw error;
    }
  }

  // Get single service request by ID (for selective refresh)
  async getServiceRequest(serviceRequestId: string): Promise<{ success: boolean; data: ServiceRequest }> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get(`/admin/service-requests/${serviceRequestId}`);
      return { success: true, data: result.data };
    } catch (error) {
      console.error('Error fetching service request:', error);
      return { success: false, data: null as any };
    }
  }

  // Get employees with real-time login status
  async getEmployeesWithLoginStatus(): Promise<{ employees: User[] }> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get('/admin/employees-login-status');
      return { employees: result.data };
    } catch (error) {
      console.error('Error fetching employees with login status:', error);
      throw error;
    }
  }

  // Get single employee with full data (for selective refresh)
  async getEmployeeFull(employeeId: string): Promise<User> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get(`/admin/employees/${employeeId}/full`);
      return result.data;
    } catch (error) {
      console.error('Error fetching single employee:', error);
      throw error;
    }
  }

  // Get all available roles
  async getRoles(): Promise<Role[]> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get('/admin/roles');
      return result.data;
    } catch (error) {
      console.error('Error fetching roles:', error);
      throw error;
    }
  }

  // Create a new role
  async createRole(roleData: {
    name: string;
    displayName: string;
    description?: string;
    textColor?: string;
    backgroundColor?: string;
    borderColor?: string;
    sortOrder?: number;
  }): Promise<Role> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.post('/admin/roles', roleData);
      return result.data;
    } catch (error) {
      console.error('Error creating role:', error);
      throw error;
    }
  }

  // Update an existing role
  async updateRole(roleId: string, roleData: {
    name: string;
    displayName: string;
    description?: string;
    textColor?: string;
    backgroundColor?: string;
    borderColor?: string;
    isActive?: boolean;
    sortOrder?: number;
  }): Promise<Role> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.put(`/admin/roles/${roleId}`, roleData);
      return result.data;
    } catch (error) {
      console.error('Error updating role:', error);
      throw error;
    }
  }

  // Delete a role (soft delete)
  async deleteRole(roleId: string): Promise<void> {
    try {
      const apiService = await this.getApiService();
      await apiService.delete(`/admin/roles/${roleId}`);
    } catch (error) {
      console.error('Error deleting role:', error);
      throw error;
    }
  }

  // Get authorized domains for a business
  async getAuthorizedDomains(businessId: string): Promise<{ authorizedDomains: AuthorizedDomain[] }> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get(`/admin/businesses/${businessId}/authorized-domains`);
      return result.data;
    } catch (error) {
      console.error('Error fetching authorized domains:', error);
      throw error;
    }
  }

  // Update authorized domains for a business
  async updateAuthorizedDomains(businessId: string, domains: AuthorizedDomain[]): Promise<void> {
    try {
      const apiService = await this.getApiService();
      await apiService.put(`/admin/businesses/${businessId}/authorized-domains`, { domains });
    } catch (error) {
      console.error('Error updating authorized domains:', error);
      throw error;
    }
  }

  // Get businesses by email domain
  async getBusinessesByEmailDomain(email: string): Promise<{ businesses: Business[] }> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get(`/admin/businesses/by-email-domain/${encodeURIComponent(email)}`);
      return result.data;
    } catch (error) {
      console.error('Error fetching businesses:', error);
      throw error;
    }
  }

  // Soft delete business (toggle soft_delete field)
  async softDeleteBusiness(businessId: string, restore = false): Promise<void> {
    try {
      const apiService = await this.getApiService();
      await apiService.patch(`/admin/businesses/${businessId}/soft-delete`, { restore });
    } catch (error) {
      console.error('Error soft deleting business:', error);
      throw error;
    }
  }

  // Create new business
  async createBusiness(data: {
    businessName: string;
    authorizedDomains: Array<{
      domain: string;
      description?: string;
    }>;
    address: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
      country?: string;
    };
  }): Promise<{ business: Business }> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.post('/admin/businesses', data);
      return result.data;
    } catch (error) {
      console.error('Error creating business:', error);
      throw error;
    }
  }

  // Service Locations methods
  async getServiceLocations(): Promise<{ serviceLocations: ServiceLocation[] }> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get('/admin/service-locations');
      return result.data;
    } catch (error) {
      console.error('Error fetching service locations:', error);
      throw error;
    }
  }

  async softDeleteServiceLocation(serviceLocationId: string, restore = false, businessId?: string): Promise<void> {
    try {
      const apiService = await this.getApiService();
      await apiService.patch(`/admin/service-locations/${serviceLocationId}/soft-delete`, { restore, business_id: businessId });
    } catch (error) {
      console.error('Error soft deleting service location:', error);
      throw error;
    }
  }

  async toggleServiceLocationStatus(serviceLocationId: string): Promise<void> {
    try {
      const apiService = await this.getApiService();
      await apiService.patch(`/admin/service-locations/${serviceLocationId}/toggle-status`);
    } catch (error) {
      console.error('Error toggling service location status:', error);
      throw error;
    }
  }

  async updateServiceLocation(serviceLocationId: string, updates: Partial<ServiceLocation>): Promise<ServiceLocation> {
    try {
      console.log('=== ADMIN SERVICE UPDATE SERVICE LOCATION ===');
      console.log('Service Location ID:', serviceLocationId);
      console.log('Updates:', updates);

      const apiService = await this.getApiService();
      const result = await apiService.put(`/admin/service-locations/${serviceLocationId}`, updates);
      console.log('Update service location result:', result);
      return result;
    } catch (error) {
      console.error('Error updating service location:', error);
      throw error;
    }
  }

  async deleteServiceLocation(serviceLocationId: string, businessId?: string): Promise<void> {
    try {
      const apiService = await this.getApiService();
      const params = businessId ? { params: { business_id: businessId } } : {};
      await apiService.delete(`/admin/service-locations/${serviceLocationId}`, params);
    } catch (error) {
      console.error('Error deleting service location:', error);
      throw error;
    }
  }

  async createServiceLocation(serviceLocationData: {
    business_id: string;
    address_label: string;
    location_name?: string;
    location_type: string;
    street: string;
    city: string;
    state: string;
    zip_code: string;
    country: string;
    contact_person?: string;
    contact_phone?: string;
    notes?: string;
    is_headquarters: boolean;
  }): Promise<ServiceLocation> {
    try {
      console.log('=== ADMIN SERVICE CREATE SERVICE LOCATION ===');
      console.log('Service Location Data:', serviceLocationData);

      const apiService = await this.getApiService();
      const result = await apiService.post('/admin/service-locations', serviceLocationData);
      console.log('Create service location result:', result);
      return result;
    } catch (error) {
      console.error('Error creating service location:', error);
      throw error;
    }
  }

  async getLocationContacts(serviceLocationId: string): Promise<{ locationContacts: LocationContact[] }> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get(`/admin/location-contacts/${serviceLocationId}`);
      return { locationContacts: result.data || [] };
    } catch (error) {
      console.error('Error fetching location contacts:', error);
      throw error;
    }
  }

  async hasLocationContacts(serviceLocationId: string): Promise<{ hasContacts: boolean }> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get(`/admin/location-contacts/${serviceLocationId}/exists`);
      return result;
    } catch (error) {
      console.error('Error checking location contacts:', error);
      throw error;
    }
  }

  async createLocationContact(contactData: {
    service_location_id: string;
    user_id: string;
    contact_role?: string;
    is_primary_contact?: boolean;
    notes?: string;
  }): Promise<LocationContact> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.post('/admin/location-contacts', contactData);
      return result;
    } catch (error) {
      console.error('Error creating location contact:', error);
      throw error;
    }
  }

  // Service Area Management Methods
  async getServedLocations(): Promise<{ servedLocations: LocationHierarchy[] }> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get('/locations/served');
      return result;
    } catch (error) {
      console.error('Error fetching served locations:', error);
      throw error;
    }
  }

  async getAllLocations(): Promise<{ locations: LocationHierarchy[] }> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get('/locations/all');
      return result;
    } catch (error) {
      console.error('Error fetching all locations:', error);
      throw error;
    }
  }

  async updateServedLocations(selections: Array<{
    location_type: string;
    location_id: number;
    notes?: string;
  }>): Promise<{ success: boolean; servedLocations: LocationHierarchy[]; message: string }> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.post('/locations/served', { selections });
      return result;
    } catch (error) {
      console.error('Error updating served locations:', error);
      throw error;
    }
  }

  async getLocationChildren(locationType: string, parentId: number): Promise<LocationChildren> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get(`/locations/children/${locationType}/${parentId}`);
      return result;
    } catch (error) {
      console.error('Error fetching location children:', error);
      throw error;
    }
  }

  // Service Area Validation Methods
  async getServiceAreas(): Promise<LocationHierarchy[]> {
    try {
      const apiService = await this.getApiService();
      const result = await apiService.get('/admin/service-areas');
      return result;
    } catch (error) {
      console.error('Error fetching service areas:', error);
      throw error;
    }
  }

  async validateServiceArea(address: {
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  }): Promise<{
    isValid: boolean;
    reason?: string;
    suggestedAreas?: string[];
  }> {
    try {
      console.log('🌍 AdminService: Validating service area for:', address);
      const apiService = await this.getApiService();
      console.log('🌍 AdminService: Making API call to /public/service-areas/validate');
      const result = await apiService.post('/public/service-areas/validate', address);
      console.log('🌍 AdminService: API response:', result);
      return result;
    } catch (error) {
      console.error('🌍 AdminService: Error validating service area:', error);
      // For testing, let's throw the error instead of masking it
      throw error;
    }
  }

  async lookupZipCode(zipCode: string): Promise<{
    found: boolean;
    data?: {
      zipCode: string;
      city: string;
      state: string;
      country: string;
    };
    message?: string;
  }> {
    try {
      console.log('🔍 AdminService.lookupZipCode: Entry point, ZIP:', zipCode);
      console.log('🔍 AdminService.lookupZipCode: Getting API service...');
      const apiService = await this.getApiService();
      console.log('🔍 AdminService.lookupZipCode: API service obtained, making request to:', `/admin/service-areas/lookup-zip/${zipCode}`);
      const result = await apiService.get(`/admin/service-areas/lookup-zip/${zipCode}`);
      console.log('🔍 AdminService.lookupZipCode: Raw API response:', result);
      return result;
    } catch (error) {
      console.error('🔍 AdminService.lookupZipCode: Error occurred:', error);
      throw error;
    }
  }

  async getLocationTypes(): Promise<{
    locationTypes: LocationType[];
    totalCount: number;
  }> {
    try {
      console.log('📋 AdminService: Fetching location types...');
      const apiService = await this.getApiService();
      const result = await apiService.get('/admin/location-types');
      console.log('📋 AdminService: Location types response:', result);
      return result;
    } catch (error) {
      console.error('📋 AdminService: Error fetching location types:', error);
      throw error;
    }
  }

  async getLocationTypesByCategory(): Promise<LocationTypeCategory> {
    try {
      console.log('📋 AdminService: Fetching location types by category...');
      const apiService = await this.getApiService();
      const result = await apiService.get('/admin/location-types/categories');
      console.log('📋 AdminService: Location types categories response:', result);
      return result;
    } catch (error) {
      console.error('📋 AdminService: Error fetching location types categories:', error);
      throw error;
    }
  }

  async getServiceTypes(): Promise<{
    data: {
      serviceTypes: any[];
    };
  }> {
    try {
      console.log('📋 AdminService: Fetching service types...');
      const apiService = await this.getApiService();
      const result = await apiService.get('/service-types/admin');
      console.log('📋 AdminService: Service types response:', result);
      return result;
    } catch (error) {
      console.error('📋 AdminService: Error fetching service types:', error);
      throw error;
    }
  }
}

export const adminService = new AdminService();
export default adminService;