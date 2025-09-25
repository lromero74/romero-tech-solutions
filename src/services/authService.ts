import {
  signUp,
  signIn as amplifySignIn,
  signOut,
  getCurrentUser,
  fetchAuthSession
} from 'aws-amplify/auth';
import { CognitoIdentityProviderClient, SignUpCommand, ConfirmSignUpCommand, ResendConfirmationCodeCommand } from '@aws-sdk/client-cognito-identity-provider';
import { AuthUser, UserRole, SignupRequest, LoginRequest } from '../types/database';
import { databaseService } from './databaseService';
import CryptoJS from 'crypto-js';

export class AuthService {
  private cognitoClient: CognitoIdentityProviderClient;

  constructor() {
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: import.meta.env.VITE_AWS_REGION || 'us-east-1'
    });
  }

  // Calculate SECRET_HASH for Cognito requests
  private calculateSecretHash(username: string): string {
    const clientSecret = import.meta.env.VITE_AWS_USER_POOL_CLIENT_SECRET;
    const clientId = import.meta.env.VITE_AWS_USER_POOL_CLIENT_ID;

    if (!clientSecret) {
      throw new Error('Client secret not configured');
    }

    const message = username + clientId;
    const hash = CryptoJS.HmacSHA256(message, clientSecret);
    return CryptoJS.enc.Base64.stringify(hash);
  }

  // Check if any admin users exist
  // Returns: { hasAdmins: boolean, canConnect: boolean }
  async hasAdminUsers(): Promise<{ hasAdmins: boolean; canConnect: boolean }> {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/auth/check-admin`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        console.error('Failed to check admin users - HTTP error:', response.status);
        // HTTP error means we connected but got an error response
        return { hasAdmins: true, canConnect: true }; // Assume admins exist on HTTP errors
      }

      const data = await response.json();
      return {
        hasAdmins: data.hasAdmins || false,
        canConnect: true
      };
    } catch (error) {
      console.error('Error checking admin users - network/connection error:', error);
      // Network error means we cannot connect to backend
      return { hasAdmins: false, canConnect: false };
    }
  }

  // Sign up new user (admin path only)
  async signUpAdmin(userData: SignupRequest): Promise<{ user: any; isFirstAdmin: boolean }> {
    try {
      // Check if this will be the first admin
      const hasAdmins = await this.hasAdminUsers();
      const isFirstAdmin = !hasAdmins;

      // Create Cognito user using AWS SDK with SECRET_HASH
      const secretHash = this.calculateSecretHash(userData.email);
      const clientId = import.meta.env.VITE_AWS_USER_POOL_CLIENT_ID;

      const command = new SignUpCommand({
        ClientId: clientId,
        Username: userData.email,
        Password: userData.password,
        SecretHash: secretHash,
        UserAttributes: [
          {
            Name: 'email',
            Value: userData.email
          },
          {
            Name: 'name',
            Value: userData.name
          }
        ]
      });

      const response = await this.cognitoClient.send(command);

      // TODO: Create user record in database when backend is available
      // await databaseService.createUser({
      //   cognitoId: response.UserSub,
      //   email: userData.email,
      //   name: userData.name,
      //   role: 'admin',
      //   isActive: true
      // });

      return { user: { userId: response.UserSub }, isFirstAdmin };
    } catch (error) {
      console.error('Error signing up admin:', error);
      throw error;
    }
  }

  // Sign in user
  async signIn(credentials: LoginRequest): Promise<AuthUser> {
    try {
      // For now, let's use a backend API approach instead of direct Cognito
      // This bypasses the CLIENT_SECRET issues with frontend Cognito calls

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      const data = await response.json();

      // Check if MFA is required for admin users
      if (data.requiresMfa) {
        // Throw a special error that indicates MFA is required
        const mfaError = new Error('MFA_REQUIRED');
        (mfaError as any).requiresMfa = true;
        (mfaError as any).email = data.email;
        throw mfaError;
      }

      const authUser = {
        id: data.user.id,
        email: data.user.email,
        role: data.user.role || 'admin',
        name: data.user.name || data.user.email,
        isFirstAdmin: data.user.isFirstAdmin || true
      };

      // Store authentication state and session token in localStorage for persistence
      localStorage.setItem('authUser', JSON.stringify(authUser));
      localStorage.setItem('authTimestamp', Date.now().toString());
      if (data.session && data.session.sessionToken) {
        localStorage.setItem('sessionToken', data.session.sessionToken);
      }

      return authUser;
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  }

  // Send MFA code for admin login
  async sendAdminMfaCode(email: string, password: string): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/auth/admin-login-mfa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send MFA code');
      }

      const data = await response.json();
      console.log('MFA code sent successfully:', data.message);
    } catch (error) {
      console.error('Error sending MFA code:', error);
      throw error;
    }
  }

  // Verify MFA code and complete admin login
  async verifyAdminMfaCode(email: string, mfaCode: string): Promise<AuthUser> {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/auth/verify-admin-mfa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          mfaCode
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'MFA verification failed');
      }

      const data = await response.json();

      const authUser = {
        id: data.user.id,
        email: data.user.email,
        role: data.user.role || 'admin',
        name: data.user.name || data.user.email,
        isFirstAdmin: data.user.isFirstAdmin || true
      };

      // Store authentication state and session token in localStorage for persistence
      localStorage.setItem('authUser', JSON.stringify(authUser));
      localStorage.setItem('authTimestamp', Date.now().toString());
      if (data.session && data.session.sessionToken) {
        localStorage.setItem('sessionToken', data.session.sessionToken);
      }

      return authUser;
    } catch (error) {
      console.error('Error verifying MFA code:', error);
      throw error;
    }
  }

  // Sign out user
  async signOut(): Promise<void> {
    try {
      // Get session token for backend logout
      const sessionToken = localStorage.getItem('sessionToken');

      // Call backend logout if we have a session token
      if (sessionToken) {
        try {
          await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/auth/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sessionToken })
          });
        } catch (error) {
          console.warn('Failed to logout from backend:', error);
        }
      }

      // Clear localStorage authentication state
      localStorage.removeItem('authUser');
      localStorage.removeItem('authTimestamp');
      localStorage.removeItem('sessionToken');

      // Also clear Cognito session if it exists
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }

  // Get current authenticated user
  async getCurrentAuthUser(): Promise<AuthUser | null> {
    try {
      console.log('Attempting to get current user from localStorage...');

      // Check localStorage for stored authentication state
      const storedUser = localStorage.getItem('authUser');
      const storedTimestamp = localStorage.getItem('authTimestamp');

      if (!storedUser || !storedTimestamp) {
        console.log('No user found in localStorage');
        return null;
      }

      // Check if the stored session is still valid (24 hours max)
      const timestamp = parseInt(storedTimestamp);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

      if (now - timestamp > maxAge) {
        console.log('Stored auth session expired');
        localStorage.removeItem('authUser');
        localStorage.removeItem('authTimestamp');
        localStorage.removeItem('sessionToken');
        return null;
      }

      const authUser = JSON.parse(storedUser) as AuthUser;
      console.log('Returning stored auth user:', authUser);
      return authUser;
    } catch (error) {
      console.log('Error reading stored auth user:', error.message);
      // Clean up invalid localStorage data
      localStorage.removeItem('authUser');
      localStorage.removeItem('authTimestamp');
      localStorage.removeItem('sessionToken');
      return null;
    }
  }

  // Create user by admin
  async createUserByAdmin(userData: {
    email: string;
    name: string;
    role: UserRole;
    temporaryPassword: string;
    additionalData?: any;
  }): Promise<any> {
    try {
      // Create Cognito user with temporary password
      const secretHash = this.calculateSecretHash(userData.email);
      const { user } = await signUp({
        username: userData.email,
        password: userData.temporaryPassword,
        options: {
          userAttributes: {
            email: userData.email,
            name: userData.name,
            'custom:role': userData.role,
            'custom:createdByAdmin': 'true'
          },
          clientMetadata: {
            SECRET_HASH: secretHash
          }
        }
      });

      // Create user record in database
      await databaseService.createUser({
        cognitoId: user.userId,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        isActive: true,
        ...userData.additionalData
      });

      return user;
    } catch (error) {
      console.error('Error creating user by admin:', error);
      throw error;
    }
  }

  // Check if user has permission
  hasPermission(userRole: UserRole, requiredRole: UserRole | UserRole[]): boolean {
    const roleHierarchy = {
      admin: 3,
      technician: 2,
      client: 1
    };

    const userLevel = roleHierarchy[userRole];

    if (Array.isArray(requiredRole)) {
      return requiredRole.some(role => userLevel >= roleHierarchy[role]);
    }

    return userLevel >= roleHierarchy[requiredRole];
  }

  // Check if current user is admin
  async isCurrentUserAdmin(): Promise<boolean> {
    try {
      const user = await this.getCurrentAuthUser();
      return user?.role === 'admin';
    } catch (error) {
      return false;
    }
  }

  // Check if current user is technician or admin
  async isCurrentUserTechnicianOrAdmin(): Promise<boolean> {
    try {
      const user = await this.getCurrentAuthUser();
      return user?.role === 'admin' || user?.role === 'technician';
    } catch (error) {
      return false;
    }
  }

  // Confirm sign up
  async confirmSignUp(username: string, confirmationCode: string): Promise<any> {
    try {
      const secretHash = this.calculateSecretHash(username);
      const clientId = import.meta.env.VITE_AWS_USER_POOL_CLIENT_ID;

      const command = new ConfirmSignUpCommand({
        ClientId: clientId,
        Username: username,
        ConfirmationCode: confirmationCode,
        SecretHash: secretHash
      });

      return await this.cognitoClient.send(command);
    } catch (error) {
      console.error('Error confirming sign up:', error);
      throw error;
    }
  }

  // Resend confirmation code
  async resendConfirmationCode(username: string): Promise<any> {
    try {
      const secretHash = this.calculateSecretHash(username);
      const clientId = import.meta.env.VITE_AWS_USER_POOL_CLIENT_ID;

      const command = new ResendConfirmationCodeCommand({
        ClientId: clientId,
        Username: username,
        SecretHash: secretHash
      });

      return await this.cognitoClient.send(command);
    } catch (error) {
      console.error('Error resending confirmation code:', error);
      throw error;
    }
  }

  // Forgot password - request reset code (using database API)
  async forgotPassword(email: string): Promise<any> {
    try {
      console.log('🔐 Requesting password reset for:', email);

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Password reset request failed');
      }

      const data = await response.json();
      console.log('✅ Password reset request successful');

      return data;
    } catch (error) {
      console.error('Error requesting password reset:', error);
      throw error;
    }
  }

  // Confirm forgot password - submit new password with reset code (using database API)
  async confirmForgotPassword(email: string, confirmationCode: string, newPassword: string): Promise<any> {
    try {
      console.log('🔐 Confirming password reset for:', email);

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          resetCode: confirmationCode,
          newPassword
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Password reset failed');
      }

      const data = await response.json();
      console.log('✅ Password reset successful');

      return data;
    } catch (error) {
      console.error('Error confirming password reset:', error);
      throw error;
    }
  }

  // Change password for authenticated user
  async changePassword(currentPassword: string, newPassword: string): Promise<any> {
    try {
      console.log('🔐 Changing password for authenticated user');

      // Get session token from localStorage
      const sessionToken = localStorage.getItem('sessionToken');
      if (!sessionToken) {
        throw new Error('No active session found. Please log in again.');
      }

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Password change failed');
      }

      const data = await response.json();
      console.log('✅ Password changed successfully');

      return data;
    } catch (error) {
      console.error('Error changing password:', error);
      throw error;
    }
  }

  // Generate temporary password
  generateTemporaryPassword(): string {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';

    // Ensure at least one of each type
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // Uppercase
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // Lowercase
    password += '0123456789'[Math.floor(Math.random() * 10)]; // Number
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // Special

    // Fill the rest
    for (let i = 4; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }

    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  // Session management methods
  async extendSession(): Promise<{ success: boolean; session?: any; message?: string }> {
    // Import apiService dynamically to avoid circular dependencies
    const { apiService } = await import('./apiService');
    return apiService.extendSession();
  }

  // Get stored session token
  getToken(): string | null {
    return localStorage.getItem('sessionToken');
  }

  // Session heartbeat (for periodic activity sync)
  async sessionHeartbeat(): Promise<{ success: boolean; session?: any; message?: string }> {
    // Import apiService dynamically to avoid circular dependencies
    const { apiService } = await import('./apiService');
    return apiService.sessionHeartbeat();
  }
}

export const authService = new AuthService();
export default authService;