import { ClientRegistrationRequest, AuthUser } from '../types/database';

class ClientRegistrationService {
  private apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

  /**
   * Register a new client business and primary contact
   */
  async registerClient(registrationData: ClientRegistrationRequest): Promise<{
    success: boolean;
    message: string;
    businessId?: string;
    userId?: string;
    emailConfirmationSent: boolean;
  }> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/clients/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registrationData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || `HTTP error! status: ${response.status}`);
      }

      return {
        success: result.success,
        message: result.message,
        businessId: result.data?.businessId,
        userId: result.data?.userId,
        emailConfirmationSent: result.data?.emailConfirmationSent || false
      };
    } catch (error: any) {
      console.error('Error registering client:', error);
      throw new Error(error.message || 'Registration failed');
    }
  }

  /**
   * Confirm client email and activate account
   */
  async confirmClientEmail(token: string, email: string): Promise<{
    success: boolean;
    message: string;
    user?: AuthUser;
  }> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/clients/confirm-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, email }),
      });

      const result = await response.json();

      return {
        success: result.success,
        message: result.message,
        user: result.data?.user
      };
    } catch (error: any) {
      console.error('Error confirming email:', error);
      return {
        success: false,
        message: error.message || 'Email confirmation failed'
      };
    }
  }

  /**
   * Resend confirmation email
   */
  async resendConfirmationEmail(email: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/clients/resend-confirmation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || `HTTP error! status: ${response.status}`);
      }

      return {
        success: result.success,
        message: result.message
      };
    } catch (error: any) {
      console.error('Error resending confirmation email:', error);
      throw new Error(error.message || 'Failed to resend confirmation email');
    }
  }

  /**
   * Check if email is already registered
   */
  async checkEmailExists(email: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/clients/check-email/${encodeURIComponent(email)}`);
      const result = await response.json();

      return result.success ? result.data?.exists || false : false;
    } catch (error: any) {
      console.error('Error checking email:', error);
      return false;
    }
  }

  /**
   * Validate business domain
   */
  async validateBusinessDomain(domainEmail: string): Promise<{
    valid: boolean;
    message?: string;
  }> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/clients/validate-domain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ domainEmail }),
      });

      const result = await response.json();

      return {
        valid: result.success ? result.data?.valid || false : false,
        message: result.data?.message
      };
    } catch (error: any) {
      console.error('Error validating domain:', error);
      return {
        valid: false,
        message: 'Domain validation failed'
      };
    }
  }
}

export const clientRegistrationService = new ClientRegistrationService();