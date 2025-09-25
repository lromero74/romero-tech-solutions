import { get, post, put, del } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import {
  User,
  Admin,
  Technician,
  Client,
  Service,
  Contract,
  WorkOrder,
  CreateUserRequest,
  CreateServiceRequest,
  PaginatedResponse,
  UserRole
} from '../types/database';

class EnhancedDatabaseService {
  private apiName = 'myapi';

  private async getAuthHeaders() {
    try {
      const session = await fetchAuthSession();
      return {
        Authorization: `Bearer ${session.tokens?.idToken?.toString()}`,
        'Content-Type': 'application/json'
      };
    } catch (error) {
      console.error('Error getting auth token:', error);
      throw new Error('Authentication required');
    }
  }

  // User Management
  async checkAdminExists(): Promise<{ exists: boolean }> {
    try {
      const response = await get({
        apiName: this.apiName,
        path: '/admin/check-exists'
      }).response;

      const data = await response.body.json();
      return data as { exists: boolean };
    } catch (error) {
      console.error('Error checking admin exists:', error);
      return { exists: false };
    }
  }

  async getUserByCognitoId(cognitoId: string): Promise<User | null> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await get({
        apiName: this.apiName,
        path: `/users/cognito/${cognitoId}`,
        options: { headers }
      }).response;

      const data = await response.body.json();
      return data as User;
    } catch (error) {
      console.error('Error fetching user by Cognito ID:', error);
      return null;
    }
  }

  async createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await post({
        apiName: this.apiName,
        path: '/users',
        options: {
          headers,
          body: userData
        }
      }).response;

      const result = await response.body.json();
      return result as User;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async updateUser(userId: string, userData: Partial<User>): Promise<User> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await put({
        apiName: this.apiName,
        path: `/users/${userId}`,
        options: {
          headers,
          body: userData
        }
      }).response;

      const result = await response.body.json();
      return result as User;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      const headers = await this.getAuthHeaders();
      await del({
        apiName: this.apiName,
        path: `/users/${userId}`,
        options: { headers }
      }).response;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  async getUsers(role?: UserRole, page = 1, limit = 20): Promise<PaginatedResponse<User>> {
    try {
      const headers = await this.getAuthHeaders();
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(role && { role })
      });

      const response = await get({
        apiName: this.apiName,
        path: `/users?${params.toString()}`,
        options: { headers }
      }).response;

      const data = await response.body.json();
      return data as PaginatedResponse<User>;
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  }

  // Admin specific methods
  async getAdmins(): Promise<Admin[]> {
    const response = await this.getUsers('admin');
    return response.data as Admin[];
  }

  async createAdmin(adminData: CreateUserRequest): Promise<Admin> {
    const user = await this.createUser({
      ...adminData,
      role: 'admin',
      isActive: true
    } as Omit<User, 'id' | 'createdAt' | 'updatedAt'>);
    return user as Admin;
  }

  // Technician specific methods
  async getTechnicians(): Promise<Technician[]> {
    const response = await this.getUsers('technician');
    return response.data as Technician[];
  }

  async createTechnician(technicianData: CreateUserRequest): Promise<Technician> {
    const user = await this.createUser({
      ...technicianData,
      role: 'technician',
      isActive: true
    } as Omit<User, 'id' | 'createdAt' | 'updatedAt'>);
    return user as Technician;
  }

  async promoteToAdmin(technicianId: string): Promise<Technician> {
    return await this.updateUser(technicianId, { isAdmin: true }) as Technician;
  }

  // Client specific methods
  async getClients(): Promise<Client[]> {
    const response = await this.getUsers('client');
    return response.data as Client[];
  }

  async createClient(clientData: CreateUserRequest): Promise<Client> {
    const user = await this.createUser({
      ...clientData,
      role: 'client',
      isActive: true
    } as Omit<User, 'id' | 'createdAt' | 'updatedAt'>);
    return user as Client;
  }

  // Service Management
  async getServices(includeInactive = false): Promise<Service[]> {
    try {
      const headers = await this.getAuthHeaders();
      const params = new URLSearchParams({
        includeInactive: includeInactive.toString()
      });

      const response = await get({
        apiName: this.apiName,
        path: `/services?${params.toString()}`,
        options: { headers }
      }).response;

      const data = await response.body.json();
      return data as Service[];
    } catch (error) {
      console.error('Error fetching services:', error);
      throw error;
    }
  }

  async createService(serviceData: CreateServiceRequest): Promise<Service> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await post({
        apiName: this.apiName,
        path: '/services',
        options: {
          headers,
          body: serviceData
        }
      }).response;

      const result = await response.body.json();
      return result as Service;
    } catch (error) {
      console.error('Error creating service:', error);
      throw error;
    }
  }

  async updateService(serviceId: string, serviceData: Partial<Service>): Promise<Service> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await put({
        apiName: this.apiName,
        path: `/services/${serviceId}`,
        options: {
          headers,
          body: serviceData
        }
      }).response;

      const result = await response.body.json();
      return result as Service;
    } catch (error) {
      console.error('Error updating service:', error);
      throw error;
    }
  }

  async deleteService(serviceId: string): Promise<void> {
    try {
      const headers = await this.getAuthHeaders();
      await del({
        apiName: this.apiName,
        path: `/services/${serviceId}`,
        options: { headers }
      }).response;
    } catch (error) {
      console.error('Error deleting service:', error);
      throw error;
    }
  }

  // Contract Management
  async getContracts(clientId?: string): Promise<Contract[]> {
    try {
      const headers = await this.getAuthHeaders();
      const params = new URLSearchParams();
      if (clientId) params.append('clientId', clientId);

      const response = await get({
        apiName: this.apiName,
        path: `/contracts?${params.toString()}`,
        options: { headers }
      }).response;

      const data = await response.body.json();
      return data as Contract[];
    } catch (error) {
      console.error('Error fetching contracts:', error);
      throw error;
    }
  }

  async createContract(contractData: Omit<Contract, 'id' | 'createdAt' | 'updatedAt'>): Promise<Contract> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await post({
        apiName: this.apiName,
        path: '/contracts',
        options: {
          headers,
          body: contractData
        }
      }).response;

      const result = await response.body.json();
      return result as Contract;
    } catch (error) {
      console.error('Error creating contract:', error);
      throw error;
    }
  }

  // Work Order Management
  async getWorkOrders(filters?: {
    clientId?: string;
    technicianId?: string;
    status?: string;
    priority?: string;
  }): Promise<WorkOrder[]> {
    try {
      const headers = await this.getAuthHeaders();
      const params = new URLSearchParams();

      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params.append(key, value);
        });
      }

      const response = await get({
        apiName: this.apiName,
        path: `/work-orders?${params.toString()}`,
        options: { headers }
      }).response;

      const data = await response.body.json();
      return data as WorkOrder[];
    } catch (error) {
      console.error('Error fetching work orders:', error);
      throw error;
    }
  }

  async createWorkOrder(workOrderData: Omit<WorkOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkOrder> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await post({
        apiName: this.apiName,
        path: '/work-orders',
        options: {
          headers,
          body: workOrderData
        }
      }).response;

      const result = await response.body.json();
      return result as WorkOrder;
    } catch (error) {
      console.error('Error creating work order:', error);
      throw error;
    }
  }

  async updateWorkOrder(workOrderId: string, updates: Partial<WorkOrder>): Promise<WorkOrder> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await put({
        apiName: this.apiName,
        path: `/work-orders/${workOrderId}`,
        options: {
          headers,
          body: updates
        }
      }).response;

      const result = await response.body.json();
      return result as WorkOrder;
    } catch (error) {
      console.error('Error updating work order:', error);
      throw error;
    }
  }

  // Dashboard Data
  async getDashboardStats(userRole: UserRole, userId?: string): Promise<any> {
    try {
      const headers = await this.getAuthHeaders();
      const params = new URLSearchParams({ role: userRole });
      if (userId) params.append('userId', userId);

      const response = await get({
        apiName: this.apiName,
        path: `/dashboard/stats?${params.toString()}`,
        options: { headers }
      }).response;

      const data = await response.body.json();
      return data;
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }
}

export const enhancedDatabaseService = new EnhancedDatabaseService();
export default enhancedDatabaseService;