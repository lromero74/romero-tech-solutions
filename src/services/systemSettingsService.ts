import { apiService } from './apiService';

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
  private baseUrl = '/admin'; // Relative to API base URL

  async getSystemSetting(key: string): Promise<SystemSetting | null> {
    try {
      const result = await apiService.get<ApiResponse<SystemSetting>>(`${this.baseUrl}/system-settings/${key}`);

      if (result.success && result.data) {
        return result.data;
      }

      throw new Error(result.message || 'Failed to get system setting');
    } catch (error) {
      console.error(`Error getting system setting ${key}:`, error);
      return null; // Graceful fallback
    }
  }

  async updateSystemSetting(key: string, value: unknown): Promise<SystemSetting> {
    try {
      const result = await apiService.put<ApiResponse<SystemSetting>>(`${this.baseUrl}/system-settings/${key}`, { value });

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
      const result = await apiService.get<ApiResponse<{ settings: SystemSetting[] }>>(`${this.baseUrl}/system-settings`);

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