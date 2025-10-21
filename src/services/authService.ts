import {
  signUp,
  signOut
} from 'aws-amplify/auth';
import { CognitoIdentityProviderClient, SignUpCommand, ConfirmSignUpCommand, ResendConfirmationCodeCommand } from '@aws-sdk/client-cognito-identity-provider';
import { AuthUser, UserRole, SignupRequest, LoginRequest } from '../types/database';
import { getCurrentDeviceFingerprint } from '../utils/deviceFingerprinting';

// Service-specific types
interface SignUpResult {
  user: AuthUser;
  isFirstAdmin: boolean;
}

// Removed unused interface UserCreationData

interface SessionData {
  success: boolean;
  session?: Record<string, unknown>;
  message?: string;
}

interface CognitoResponse {
  UserSub?: string;
  [key: string]: unknown;
}
import { databaseService } from './databaseService';
import CryptoJS from 'crypto-js';
import { RoleBasedStorage } from '../utils/roleBasedStorage';
import { apiService } from './apiService';

export class AuthService {
  private cognitoClient: CognitoIdentityProviderClient;

  constructor() {
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: import.meta.env.VITE_AWS_REGION || 'us-east-1'
    });
  }

  // Use RoleBasedStorage utility for all localStorage operations
  private setStorageItem(key: string, value: string, role?: UserRole | string): void {
    RoleBasedStorage.setItem(key, value, role);
  }

  private getStorageItem(key: string, role?: UserRole | string): string | null {
    return RoleBasedStorage.getItem(key, role);
  }

  private removeStorageItem(key: string, role?: UserRole | string): void {
    RoleBasedStorage.removeItem(key, role);
  }

  private clearRoleStorage(role: UserRole | string): void {
    RoleBasedStorage.clearRoleStorage(role);
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
  async signUpAdmin(userData: SignupRequest): Promise<SignUpResult> {
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

  // Generate device fingerprint for trusted device detection using the shared utility
  private generateDeviceFingerprint(): string {
    // Use the same fingerprinting method used by trustedDeviceService for consistency
    const fingerprint = getCurrentDeviceFingerprint();
    console.log('🔍 Generated device fingerprint:', fingerprint);
    return fingerprint;
  }

  // Sign in user
  async signIn(credentials: LoginRequest): Promise<AuthUser> {
    try {
      // Determine the correct endpoint based on loginType
      const endpoint = credentials.loginType === 'employee'
        ? '/auth/admin-login-mfa'  // Employee login uses admin-login-mfa endpoint
        : '/auth/client-login';    // Client login uses client-login endpoint

      // Generate device fingerprint for trusted device detection
      const deviceFingerprint = this.generateDeviceFingerprint();

      // Use apiService which handles CSRF tokens automatically
      const data = await apiService.post(endpoint, {
        email: credentials.email,
        password: credentials.password,
        deviceFingerprint: deviceFingerprint
      }, { skipAuth: true }); // Skip auth since we're logging in

      // Check if MFA is required for admin users or client users
      if (data.requiresMfa) {
        // Throw a special error that indicates MFA is required
        const mfaError = new Error('MFA_REQUIRED');
        (mfaError as Error & {
          requiresMfa: boolean;
          email: string;
          userType?: string;
          mfaEmail?: string;
          phoneNumber?: string;
        }).requiresMfa = true;
        (mfaError as Error & {
          requiresMfa: boolean;
          email: string;
          userType?: string;
          mfaEmail?: string;
          phoneNumber?: string;
        }).email = data.email;
        (mfaError as Error & {
          requiresMfa: boolean;
          email: string;
          userType?: string;
          mfaEmail?: string;
          phoneNumber?: string;
        }).userType = data.userType;
        (mfaError as Error & {
          requiresMfa: boolean;
          email: string;
          userType?: string;
          mfaEmail?: string;
          phoneNumber?: string;
        }).mfaEmail = data.mfaEmail;
        (mfaError as Error & {
          requiresMfa: boolean;
          email: string;
          userType?: string;
          mfaEmail?: string;
          phoneNumber?: string;
        }).phoneNumber = data.phoneNumber;
        throw mfaError;
      }

      console.log('📥 signIn response data:', {
        hasUser: !!data.user,
        hasSession: !!data.session,
        hasSessionToken: !!data.session?.sessionToken,
        sessionTokenLength: data.session?.sessionToken?.length,
        userEmail: data.user?.email,
        userRole: data.user?.role
      });

      const authUser = {
        id: data.user.id,
        email: data.user.email,
        role: data.user.role || 'admin',
        name: data.user.name || data.user.email,
        businessName: data.user.businessName,
        businessId: data.user.businessId,
        isFirstAdmin: data.user.isFirstAdmin || true
      };

      // Clear all other role sessions to prevent conflicts (e.g., logging in as client after being logged in as employee)
      const allRoles = ['admin', 'executive', 'employee', 'client', 'technician', 'sales'];
      allRoles.forEach(role => {
        if (role !== authUser.role) {
          this.clearRoleStorage(role);
        }
      });

      // Store authentication state and session token in localStorage for persistence
      this.setStorageItem('authUser', JSON.stringify(authUser), authUser.role);
      this.setStorageItem('authTimestamp', Date.now().toString(), authUser.role);

      console.log('🔍 Checking for session token:', {
        hasSession: !!data.session,
        hasSessionToken: !!data.session?.sessionToken,
        sessionToken: data.session?.sessionToken?.substring(0, 20) + '...'
      });

      if (data.session && data.session.sessionToken) {
        console.log('💾 Storing session token in localStorage');
        this.setStorageItem('sessionToken', data.session.sessionToken, authUser.role);
        console.log('✅ Session token stored successfully');
      } else {
        console.warn('⚠️ No session token in response data!');
      }

      // CRITICAL: Refresh CSRF token after authentication (non-MFA flow)
      // The token generated before login used a different session identifier
      // Now that we're authenticated, we need a new token with the session_token cookie as identifier
      console.log('🔄 Refreshing CSRF token after successful login...');
      await apiService.refreshCsrfToken();
      console.log('✅ CSRF token refreshed with authenticated session');

      return authUser;
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  }

  // Send MFA code for admin login
  async sendAdminMfaCode(email: string, password: string): Promise<{ email: string; phoneNumber?: string; message: string }> {
    try {
      // Generate device fingerprint for trusted device detection
      const deviceFingerprint = this.generateDeviceFingerprint();
      console.log('🔍 [sendAdminMfaCode] Including device fingerprint for trusted device check');

      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/auth/admin-login-mfa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          deviceFingerprint
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send MFA code');
      }

      const data = await response.json();
      console.log('MFA code sent successfully:', data.message);
      return {
        email: data.email,
        phoneNumber: data.phoneNumber,
        message: data.message
      };
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
        credentials: 'include', // CRITICAL: Allow browser to store HttpOnly session cookie
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
        businessName: data.user.businessName,
        businessId: data.user.businessId,
        isFirstAdmin: data.user.isFirstAdmin || true
      };

      // Clear all other role sessions to prevent conflicts
      const allRoles = ['admin', 'executive', 'employee', 'client', 'technician', 'sales'];
      allRoles.forEach(role => {
        if (role !== authUser.role) {
          this.clearRoleStorage(role);
        }
      });

      // Store authentication state and session token in localStorage for persistence
      this.setStorageItem('authUser', JSON.stringify(authUser), authUser.role);
      this.setStorageItem('authTimestamp', Date.now().toString(), authUser.role);
      if (data.session && data.session.sessionToken) {
        this.setStorageItem('sessionToken', data.session.sessionToken, authUser.role);
      }

      // CRITICAL: Refresh CSRF token after authentication
      // The token generated before login used a different session identifier
      // Now that we're authenticated, we need a new token with the session_token cookie as identifier
      console.log('🔄 Refreshing CSRF token after successful admin MFA verification...');
      await apiService.refreshCsrfToken();
      console.log('✅ CSRF token refreshed with authenticated session');

      return authUser;
    } catch (error) {
      console.error('Error verifying MFA code:', error);
      throw error;
    }
  }

  // Resend MFA code for client login
  async resendClientMfaCode(email: string): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/auth/resend-client-mfa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to resend MFA code');
      }
    } catch (error) {
      console.error('Error resending client MFA code:', error);
      throw error;
    }
  }

  // Verify MFA code and complete client login
  async verifyClientMfaCode(email: string, mfaCode: string): Promise<AuthUser> {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/auth/verify-client-mfa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
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
        role: data.user.role || 'client',
        name: data.user.name || data.user.email,
        businessName: data.user.businessName,
        businessId: data.user.businessId,
        isFirstAdmin: data.user.isFirstAdmin || false
      };

      // Clear all other role sessions to prevent conflicts
      const allRoles = ['admin', 'executive', 'employee', 'client', 'technician', 'sales'];
      allRoles.forEach(role => {
        if (role !== authUser.role) {
          this.clearRoleStorage(role);
        }
      });

      // Store authentication state and session token in localStorage for persistence
      this.setStorageItem('authUser', JSON.stringify(authUser), authUser.role);
      this.setStorageItem('authTimestamp', Date.now().toString(), authUser.role);
      if (data.session && data.session.sessionToken) {
        this.setStorageItem('sessionToken', data.session.sessionToken, authUser.role);
      }

      // CRITICAL: Refresh CSRF token after authentication
      // The token generated before login used a different session identifier
      // Now that we're authenticated, we need a new token with the session_token cookie as identifier
      console.log('🔄 Refreshing CSRF token after successful client MFA verification...');
      await apiService.refreshCsrfToken();
      console.log('✅ CSRF token refreshed with authenticated session');

      return authUser;
    } catch (error) {
      console.error('Error verifying client MFA code:', error);
      throw error;
    }
  }

  // Sign out user
  async signOut(): Promise<void> {
    try {
      // Determine current role from stored user
      let currentRole: UserRole | string | undefined;
      const storedUser = this.getStorageItem('authUser');
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          currentRole = parsedUser.role;
        } catch (e) {
          // Ignore parsing errors
        }
      }

      // Get session token for backend logout
      const sessionToken = this.getStorageItem('sessionToken', currentRole);

      // Call backend logout if we have a session token
      if (sessionToken) {
        try {
          await apiService.post('/auth/logout', { sessionToken });
        } catch (error) {
          console.warn('Failed to logout from backend:', error);
        }
      }

      // Clear role-specific localStorage authentication state
      if (currentRole) {
        this.clearRoleStorage(currentRole);
      }

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
      // CRITICAL: Skip loading auth when processing magic link
      // This allows magic link authentication to work without interference from existing sessions
      const urlParams = new URLSearchParams(window.location.search);
      const hasMagicLinkToken = urlParams.has('token');
      const isAgentLoginPath = window.location.pathname.includes('/agent/login') ||
                               window.location.pathname === '/agent-magic-login';

      if (hasMagicLinkToken && isAgentLoginPath) {
        console.log('🚫 Skipping auth load - magic link token detected, allowing fresh authentication');
        return null;
      }

      console.log('Attempting to get current user from localStorage...');

      // Check localStorage for stored authentication state (role-based)
      const storedUser = this.getStorageItem('authUser');
      const storedTimestamp = this.getStorageItem('authTimestamp');

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
        const authUser = JSON.parse(storedUser) as AuthUser;
        this.clearRoleStorage(authUser.role);
        return null;
      }

      const authUser = JSON.parse(storedUser) as AuthUser;
      console.log('Returning stored auth user:', authUser);
      return authUser;
    } catch (error) {
      console.log('Error reading stored auth user:', (error as Error).message);
      // Clean up invalid localStorage data - try to determine role first
      const storedUser = this.getStorageItem('authUser');
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          this.clearRoleStorage(parsedUser.role);
        } catch (e) {
          // If we can't parse, just clear without role
        }
      }
      return null;
    }
  }

  // Create user by admin
  async createUserByAdmin(userData: {
    email: string;
    name: string;
    role: UserRole;
    temporaryPassword: string;
    additionalData?: Record<string, unknown>;
  }): Promise<CognitoResponse> {
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
  // @deprecated Use permission-based checks via usePermission() hook instead
  // This method uses hardcoded role checks which bypass the RBAC system
  // Example: const { checkPermission } = usePermission(); checkPermission('your.permission.key')
  async isCurrentUserAdmin(): Promise<boolean> {
    try {
      const user = await this.getCurrentAuthUser();
      return user?.role === 'admin';
    } catch {
      return false;
    }
  }

  // Check if current user is technician or admin
  // @deprecated Use permission-based checks via usePermission() hook instead
  // This method uses hardcoded role checks which bypass the RBAC system
  // Example: const { checkPermission } = usePermission(); checkPermission('your.permission.key')
  async isCurrentUserTechnicianOrAdmin(): Promise<boolean> {
    try {
      const user = await this.getCurrentAuthUser();
      return user?.role === 'admin' || user?.role === 'technician';
    } catch {
      return false;
    }
  }

  // Confirm sign up
  async confirmSignUp(username: string, confirmationCode: string): Promise<CognitoResponse> {
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
  async resendConfirmationCode(username: string): Promise<CognitoResponse> {
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
  async forgotPassword(email: string): Promise<Response> {
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
  async confirmForgotPassword(email: string, confirmationCode: string, newPassword: string): Promise<Response> {
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
  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message?: string }> {
    try {
      console.log('🔐 Changing password for authenticated user');

      // Get session token from localStorage (role-based)
      const sessionToken = this.getStorageItem('sessionToken');
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
  async extendSession(): Promise<SessionData> {
    // Import apiService dynamically to avoid circular dependencies
    const { apiService } = await import('./apiService');
    return apiService.extendSession();
  }

  // Get stored session token
  getToken(): string | null {
    return this.getStorageItem('sessionToken');
  }

  // Session heartbeat (for periodic activity sync)
  async sessionHeartbeat(): Promise<SessionData> {
    // Import apiService dynamically to avoid circular dependencies
    const { apiService } = await import('./apiService');
    return apiService.sessionHeartbeat();
  }
}

export const authService = new AuthService();
export default authService;