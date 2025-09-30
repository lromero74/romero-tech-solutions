import { PasswordComplexityRequirements, DEFAULT_PASSWORD_REQUIREMENTS } from '../types/passwordComplexity';
import { apiService } from './apiService';

export class PasswordComplexityService {
  // Get current password complexity requirements
  async getPasswordComplexityRequirements(): Promise<PasswordComplexityRequirements> {
    try {
      const data = await apiService.get<{ requirements: PasswordComplexityRequirements }>('/admin/password-complexity');
      return data.requirements || DEFAULT_PASSWORD_REQUIREMENTS;
    } catch (error: any) {
      // Handle 404 or other errors gracefully
      if (error.status === 404 || error.status === 401) {
        // No configuration found or not authenticated yet, return defaults
        return DEFAULT_PASSWORD_REQUIREMENTS;
      }
      console.error('Error fetching password complexity requirements:', error);
      // Return defaults if API is not available
      return DEFAULT_PASSWORD_REQUIREMENTS;
    }
  }

  // Update password complexity requirements
  async updatePasswordComplexityRequirements(requirements: PasswordComplexityRequirements): Promise<PasswordComplexityRequirements> {
    try {
      const data = await apiService.put<{ requirements: PasswordComplexityRequirements }>(
        '/admin/password-complexity',
        { requirements }
      );
      return data.requirements;
    } catch (error) {
      console.error('Error updating password complexity requirements:', error);
      throw error;
    }
  }

  // Create new password complexity configuration
  async createPasswordComplexityRequirements(requirements: PasswordComplexityRequirements): Promise<PasswordComplexityRequirements> {
    try {
      const data = await apiService.post<{ requirements: PasswordComplexityRequirements }>(
        '/admin/password-complexity',
        { requirements }
      );
      return data.requirements;
    } catch (error) {
      console.error('Error creating password complexity requirements:', error);
      throw error;
    }
  }

  // Get all password complexity configurations (for admin)
  async getAllPasswordComplexityConfigurations(): Promise<PasswordComplexityRequirements[]> {
    try {
      const data = await apiService.get<{ configurations: PasswordComplexityRequirements[] }>(
        '/admin/password-complexity/all'
      );
      return data.configurations || [];
    } catch (error) {
      console.error('Error fetching password complexity configurations:', error);
      throw error;
    }
  }

  // Activate a specific password complexity configuration
  async activatePasswordComplexityConfiguration(id: string): Promise<PasswordComplexityRequirements> {
    try {
      const data = await apiService.post<{ requirements: PasswordComplexityRequirements }>(
        `/admin/password-complexity/${id}/activate`
      );
      return data.requirements;
    } catch (error) {
      console.error('Error activating password complexity configuration:', error);
      throw error;
    }
  }

  // Delete a password complexity configuration
  async deletePasswordComplexityConfiguration(id: string): Promise<void> {
    try {
      await apiService.delete(`/admin/password-complexity/${id}`);
    } catch (error) {
      console.error('Error deleting password complexity configuration:', error);
      throw error;
    }
  }

  // Validate password against current requirements
  async validatePassword(password: string, userInfo?: { name?: string; email?: string; }): Promise<{
    isValid: boolean;
    feedback: string[];
    strength: number;
  }> {
    try {
      const data = await apiService.post<{
        isValid: boolean;
        feedback: string[];
        strength: number;
      }>('/auth/validate-password', { password, userInfo });
      return data;
    } catch (error) {
      console.error('Error validating password:', error);
      // Fallback to client-side validation if API is not available
      const requirements = await this.getPasswordComplexityRequirements();
      const { evaluatePasswordStrength } = await import('../types/passwordComplexity');
      const result = evaluatePasswordStrength(password, requirements, userInfo);

      return {
        isValid: result.isValid,
        feedback: result.feedback,
        strength: result.score
      };
    }
  }

  // Add password to history (called after successful password change)
  async addPasswordToHistory(userId: string, passwordHash: string): Promise<void> {
    try {
      await apiService.post('/auth/password-history', { userId, passwordHash });
    } catch (error) {
      console.error('Error adding password to history:', error);
      // Don't throw here as this is not critical for the user experience
    }
  }

  // Check if password was used recently
  async checkPasswordHistory(userId: string, passwordHash: string): Promise<boolean> {
    try {
      const data = await apiService.post<{ isInHistory: boolean }>(
        '/auth/password-history/check',
        { userId, passwordHash }
      );
      return data.isInHistory || false;
    } catch (error) {
      console.error('Error checking password history:', error);
      // Default to allowing password if API is not available
      return false;
    }
  }

  // Get password expiration info for a user
  async getPasswordExpirationInfo(userId: string): Promise<{
    passwordChangedAt: string | null;
    passwordExpiresAt: string | null;
    daysUntilExpiration: number | null;
    isExpired: boolean;
    forcePasswordChange: boolean;
  }> {
    try {
      const data = await apiService.get<{
        passwordChangedAt: string | null;
        passwordExpiresAt: string | null;
        daysUntilExpiration: number | null;
        isExpired: boolean;
        forcePasswordChange: boolean;
      }>(`/auth/password-expiration/${userId}`);
      return data;
    } catch (error) {
      console.error('Error getting password expiration info:', error);
      throw error;
    }
  }
}

export const passwordComplexityService = new PasswordComplexityService();
export default passwordComplexityService;