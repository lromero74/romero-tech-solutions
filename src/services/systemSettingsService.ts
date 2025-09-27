import { authService } from './authService';

interface SystemSetting {
  key: string;
  value: unknown;
  type: string;
  description: string;
  updatedAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

class SystemSettingsService {
  private baseUrl = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/admin`;

  async getSystemSetting(key: string): Promise<SystemSetting | null> {
    try {
      const token = authService.getToken();

      if (!token) {
        console.warn('No authentication token available for system settings');
        return null;
      }

      const response = await fetch(`${this.baseUrl}/system-settings/${key}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn(`System settings endpoint returned non-JSON response (status: ${response.status})`);
        return null; // Graceful fallback for authentication issues
      }

      const result: ApiResponse<SystemSetting> = await response.json();

      if (result.success && result.data) {
        return result.data;
      }

      // Handle authentication errors gracefully
      if (response.status === 401 || response.status === 403) {
        console.warn('Authentication failed for system settings, using fallback');
        return null;
      }

      throw new Error(result.message || 'Failed to get system setting');
    } catch (error) {
      console.error(`Error getting system setting ${key}:`, error);
      throw error;
    }
  }

  async updateSystemSetting(key: string, value: unknown): Promise<SystemSetting> {
    try {
      const token = authService.getToken();

      if (!token) {
        throw new Error('No authentication token available for updating system settings');
      }

      const response = await fetch(`${this.baseUrl}/system-settings/${key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ value })
      });

      const result: ApiResponse<SystemSetting> = await response.json();

      if (result.success && result.data) {
        return result.data;
      }

      throw new Error(result.message || 'Failed to update system setting');
    } catch (error) {
      console.error(`Error updating system setting ${key}:`, error);
      throw error;
    }
  }

  async getAllSystemSettings(): Promise<SystemSetting[]> {
    try {
      const token = authService.getToken();

      if (!token) {
        throw new Error('No authentication token available for getting system settings');
      }

      const response = await fetch(`${this.baseUrl}/system-settings`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const result: ApiResponse<{ settings: SystemSetting[] }> = await response.json();

      if (result.success && result.data) {
        return result.data.settings;
      }

      throw new Error(result.message || 'Failed to get system settings');
    } catch (error) {
      console.error('Error getting all system settings:', error);
      throw error;
    }
  }

  // Convenience method for session configuration
  async getSessionConfig(): Promise<{ timeout: number; warningTime: number } | null> {
    try {
      const setting = await this.getSystemSetting('session_config');
      return setting ? setting.value : null;
    } catch (error) {
      console.error('Error getting session config:', error);
      return null;
    }
  }

  async updateSessionConfig(config: { timeout: number; warningTime: number }): Promise<void> {
    await this.updateSystemSetting('session_config', config);
  }

  // Convenience method for MFA requirement setting
  async getMfaRequired(): Promise<boolean> {
    try {
      const setting = await this.getSystemSetting('mfa_required');
      return setting ? setting.value === 'true' || setting.value === true : true; // Default to true if not found
    } catch (error) {
      console.error('Error getting MFA requirement setting:', error);
      return true; // Default to requiring MFA for security
    }
  }

  async updateMfaRequired(required: boolean): Promise<void> {
    await this.updateSystemSetting('mfa_required', required.toString());
  }
}

export const systemSettingsService = new SystemSettingsService();
export type { SystemSetting };