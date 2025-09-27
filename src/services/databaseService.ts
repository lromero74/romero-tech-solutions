import { get, post, put, del } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';

export interface DashboardData {
  id?: string;
  userId: string;
  title: string;
  description: string;
  data: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserProfile {
  id?: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  preferences: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

class DatabaseService {
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

  // Dashboard Data Operations
  async getDashboardData(userId: string): Promise<DashboardData[]> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await get({
        apiName: this.apiName,
        path: `/dashboard/${userId}`,
        options: { headers }
      }).response;

      const data = await response.body.json();
      return data as DashboardData[];
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      throw error;
    }
  }

  async createDashboardData(data: Omit<DashboardData, 'id' | 'createdAt' | 'updatedAt'>): Promise<DashboardData> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await post({
        apiName: this.apiName,
        path: '/dashboard',
        options: {
          headers,
          body: data
        }
      }).response;

      const result = await response.body.json();
      return result as DashboardData;
    } catch (error) {
      console.error('Error creating dashboard data:', error);
      throw error;
    }
  }

  async updateDashboardData(id: string, data: Partial<DashboardData>): Promise<DashboardData> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await put({
        apiName: this.apiName,
        path: `/dashboard/${id}`,
        options: {
          headers,
          body: data
        }
      }).response;

      const result = await response.body.json();
      return result as DashboardData;
    } catch (error) {
      console.error('Error updating dashboard data:', error);
      throw error;
    }
  }

  async deleteDashboardData(id: string): Promise<void> {
    try {
      const headers = await this.getAuthHeaders();
      await del({
        apiName: this.apiName,
        path: `/dashboard/${id}`,
        options: { headers }
      }).response;
    } catch (error) {
      console.error('Error deleting dashboard data:', error);
      throw error;
    }
  }

  // User Profile Operations
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await get({
        apiName: this.apiName,
        path: `/users/${userId}`,
        options: { headers }
      }).response;

      const data = await response.body.json();
      return data as UserProfile;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  }

  async createUserProfile(profile: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserProfile> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await post({
        apiName: this.apiName,
        path: '/users',
        options: {
          headers,
          body: profile
        }
      }).response;

      const result = await response.body.json();
      return result as UserProfile;
    } catch (error) {
      console.error('Error creating user profile:', error);
      throw error;
    }
  }

  async updateUserProfile(userId: string, profile: Partial<UserProfile>): Promise<UserProfile> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await put({
        apiName: this.apiName,
        path: `/users/${userId}`,
        options: {
          headers,
          body: profile
        }
      }).response;

      const result = await response.body.json();
      return result as UserProfile;
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  }
}

export const databaseService = new DatabaseService();
export default databaseService;