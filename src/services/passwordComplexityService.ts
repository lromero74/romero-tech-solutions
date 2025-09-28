import { PasswordComplexityRequirements, DEFAULT_PASSWORD_REQUIREMENTS } from '../types/passwordComplexity';

export class PasswordComplexityService {
  private baseURL: string;

  constructor() {
    // Environment-aware API base URL handling
    // Works in both Vite (import.meta.env) and Jest (process.env) environments
    this.baseURL = this.getApiBaseUrl();
  }

  private getApiBaseUrl(): string {
    // Environment-aware API base URL handling
    // This approach works in all environments:
    // - Jest: process.env is available
    // - Browser with Vite: Vite injects environment variables
    // - Production: Values are replaced at build time

    // Check for environment variable in the safest way possible
    let apiBaseUrl = 'http://localhost:3001/api'; // Default fallback

    try {
      // Try to get from process.env if available (Node.js/Jest)
      if (typeof process !== 'undefined' && process.env && process.env.VITE_API_BASE_URL) {
        apiBaseUrl = process.env.VITE_API_BASE_URL;
      }
      // In Vite browser builds, environment variables are injected at build time
      // so the process.env check above should work in browser too
    } catch {
      // If anything fails, use the default
      console.warn('Failed to get API base URL from environment, using default');
    }

    return apiBaseUrl;
  }

  // Get session token for authenticated requests
  private getSessionToken(): string | null {
    return localStorage.getItem('sessionToken');
  }

  // Get authentication headers
  private getAuthHeaders(): HeadersInit {
    const token = this.getSessionToken();
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  }

  // Get current password complexity requirements
  async getPasswordComplexityRequirements(): Promise<PasswordComplexityRequirements> {
    try {
      const response = await fetch(`${this.baseURL}/admin/password-complexity`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        if (response.status === 404) {
          // No configuration found, return defaults
          return DEFAULT_PASSWORD_REQUIREMENTS;
        }
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch password complexity requirements');
      }

      const data = await response.json();
      return data.requirements || DEFAULT_PASSWORD_REQUIREMENTS;
    } catch (error) {
      console.error('Error fetching password complexity requirements:', error);
      // Return defaults if API is not available
      return DEFAULT_PASSWORD_REQUIREMENTS;
    }
  }

  // Update password complexity requirements
  async updatePasswordComplexityRequirements(requirements: PasswordComplexityRequirements): Promise<PasswordComplexityRequirements> {
    try {
      const response = await fetch(`${this.baseURL}/admin/password-complexity`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ requirements })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update password complexity requirements');
      }

      const data = await response.json();
      return data.requirements;
    } catch (error) {
      console.error('Error updating password complexity requirements:', error);
      throw error;
    }
  }

  // Create new password complexity configuration
  async createPasswordComplexityRequirements(requirements: PasswordComplexityRequirements): Promise<PasswordComplexityRequirements> {
    try {
      const response = await fetch(`${this.baseURL}/admin/password-complexity`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ requirements })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create password complexity requirements');
      }

      const data = await response.json();
      return data.requirements;
    } catch (error) {
      console.error('Error creating password complexity requirements:', error);
      throw error;
    }
  }

  // Get all password complexity configurations (for admin)
  async getAllPasswordComplexityConfigurations(): Promise<PasswordComplexityRequirements[]> {
    try {
      const response = await fetch(`${this.baseURL}/admin/password-complexity/all`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch password complexity configurations');
      }

      const data = await response.json();
      return data.configurations || [];
    } catch (error) {
      console.error('Error fetching password complexity configurations:', error);
      throw error;
    }
  }

  // Activate a specific password complexity configuration
  async activatePasswordComplexityConfiguration(id: string): Promise<PasswordComplexityRequirements> {
    try {
      const response = await fetch(`${this.baseURL}/admin/password-complexity/${id}/activate`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to activate password complexity configuration');
      }

      const data = await response.json();
      return data.requirements;
    } catch (error) {
      console.error('Error activating password complexity configuration:', error);
      throw error;
    }
  }

  // Delete a password complexity configuration
  async deletePasswordComplexityConfiguration(id: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseURL}/admin/password-complexity/${id}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete password complexity configuration');
      }
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
      const response = await fetch(`${this.baseURL}/auth/validate-password`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ password, userInfo })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to validate password');
      }

      const data = await response.json();
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
      const response = await fetch(`${this.baseURL}/auth/password-history`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ userId, passwordHash })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to add password to history');
      }
    } catch (error) {
      console.error('Error adding password to history:', error);
      // Don't throw here as this is not critical for the user experience
    }
  }

  // Check if password was used recently
  async checkPasswordHistory(userId: string, passwordHash: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/auth/password-history/check`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ userId, passwordHash })
      });

      if (!response.ok) {
        // If API is not available, assume password is not in history
        return false;
      }

      const data = await response.json();
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
      const response = await fetch(`${this.baseURL}/auth/password-expiration/${userId}`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to get password expiration info');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting password expiration info:', error);
      throw error;
    }
  }
}

export const passwordComplexityService = new PasswordComplexityService();
export default passwordComplexityService;