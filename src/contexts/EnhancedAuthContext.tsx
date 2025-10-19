import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { AuthUser, UserRole, ClientRegistrationRequest } from '../types/database';
import { authService } from '../services/authService';
import { clientRegistrationService } from '../services/clientRegistrationService';
import { Hub } from 'aws-amplify/utils';
import SessionManager, { SessionConfig } from '../utils/sessionManager';
import { systemSettingsService } from '../services/systemSettingsService';
import ConfirmationDialog from '../components/common/ConfirmationDialog';
import { RoleBasedStorage } from '../utils/roleBasedStorage';

interface EnhancedAuthContextType {
  user: AuthUser | null;
  authUser: AuthUser | null; // Alias for backwards compatibility
  isLoading: boolean;
  isAuthenticated: boolean;
  role: UserRole | null;
  isAdmin: boolean;
  isTechnician: boolean;
  isExecutive: boolean;
  isSales: boolean;
  isClient: boolean;
  isFirstAdmin: boolean;
  isSigningOut: boolean;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signUpAdmin: (userData: { email: string; password: string; name: string }) => Promise<{ user: AuthUser; isFirstAdmin: boolean }>;
  signUpClient: (registrationData: ClientRegistrationRequest) => Promise<{ success: boolean; message: string; emailConfirmationSent: boolean }>;
  confirmClientEmail: (token: string, email: string) => Promise<{ success: boolean; message: string; user?: AuthUser }>;
  resendConfirmationEmail: (email: string) => Promise<{ success: boolean; message: string }>;
  signOut: () => Promise<void>;
  hasPermission: (requiredRole: UserRole | UserRole[]) => boolean;
  refreshUser: () => Promise<void>;
  // MFA methods
  sendAdminMfaCode: (email: string, password: string) => Promise<{ email: string; phoneNumber?: string; message: string }>;
  verifyAdminMfaCode: (email: string, mfaCode: string) => Promise<AuthUser>;
  verifyClientMfaCode: (email: string, mfaCode: string) => Promise<AuthUser>;
  // Trusted device methods
  setUserFromTrustedDevice: (userData: AuthUser, sessionToken?: string) => Promise<void>;
  // Session management
  sessionConfig: SessionConfig | null;
  updateSessionConfig: (config: Partial<SessionConfig>) => void;
  extendSession: () => void;
  isSessionActive: boolean;
  sessionWarning: { isVisible: boolean; timeLeft: number };
  updateSessionWarningTime: (timeLeftSeconds: number) => void;
  sessionToken: string | null;
}

const EnhancedAuthContext = createContext<EnhancedAuthContextType | undefined>(undefined);

interface EnhancedAuthProviderProps {
  children: ReactNode;
}

export const EnhancedAuthProvider: React.FC<EnhancedAuthProviderProps> = ({ children }) => {
  const [user, setUserState] = useState<AuthUser | null>(null);

  const setUser = (newUser: AuthUser | null) => {
    setUserState(newUser);
  };
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [sessionManager] = useState(() => SessionManager.getInstance());
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const sessionConfigRef = useRef<SessionConfig | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionWarning, setSessionWarning] = useState({ isVisible: false, timeLeft: 0 });
  const [showTimeoutDialog, setShowTimeoutDialog] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const timeoutUserRoleRef = useRef<UserRole | null>(null); // Store user role for timeout redirect

  // Helper function to determine if a user requires MFA
  // NOTE: These role checks are appropriate here because:
  // 1. They check against RBAC permission 'require.mfa.enable' via backend
  // 2. The backend enforces MFA based on that permission for each role
  // 3. This is authentication/security boundary logic, not operational permissions
  const requiresMfa = async (user: AuthUser | unknown): Promise<boolean> => {
    if (!user) return false;

    // Clients are not subject to MFA (they have separate authentication flow)
    if (user.role === 'client') {
      return false;
    }

    try {
      // Check if MFA is required based on system settings
      // Backend checks 'require.mfa.enable' permission for the user's role
      const mfaRequired = await systemSettingsService.getMfaRequired();

      // MFA applies to all employees when enabled in system settings
      // These roles have 'require.mfa.enable' permission in RBAC system
      if (mfaRequired && (user.role === 'admin' || user.role === 'technician' || user.role === 'sales')) {
        return true;
      }

      return false;
    } catch (error: any) {
      // If permission denied (403), default to false (no MFA required)
      if (error.message?.includes('Insufficient permissions') || error.message?.includes('403')) {
        console.log('ℹ️ Cannot check MFA settings (insufficient permissions), defaulting to no MFA');
        return false;
      }
      console.error('Error checking MFA requirement:', error);
      // Default to requiring MFA for admin users for security (fallback)
      return user.role === 'admin';
    }
  };

  const checkAuthState = async () => {
    try {
      setIsLoading(true);
      setHasError(false);

      // First get the stored user to determine the role, then read the session token with that role
      let storedSessionToken: string | null = null;
      const storedAuthUser = RoleBasedStorage.getItem('authUser');

      if (storedAuthUser) {
        try {
          const parsedUser = JSON.parse(storedAuthUser);
          const userRole = parsedUser.role;
          storedSessionToken = RoleBasedStorage.getItem('sessionToken', userRole);
        } catch (error) {
          console.error('Failed to parse stored user:', error);
          // Fall back to checking without role
          storedSessionToken = RoleBasedStorage.getItem('sessionToken');
        }
      } else {
        // No stored user, try reading session token without role
        storedSessionToken = RoleBasedStorage.getItem('sessionToken');
      }

      setSessionToken(storedSessionToken);
      let currentUser = null;

      if (storedSessionToken) {
        // PERFORMANCE FIX: Trust the localStorage session and let heartbeat mechanism validate it
        // This eliminates the excessive /auth/validate-session calls on every page load/render
        // The session heartbeat (every 2 minutes) will detect invalid sessions and trigger logout
        try {
          // Get current user from localStorage/Cognito
          currentUser = await authService.getCurrentAuthUser();

          // PERFORMANCE OPTIMIZATION: Skip MFA check for existing sessions
          // MFA verification should only be required during initial login, not page refreshes
          const mfaVerified = RoleBasedStorage.getItem('mfaVerified');
          const storedTimestamp = RoleBasedStorage.getItem('authTimestamp');

          if (currentUser && !mfaVerified && await requiresMfa(currentUser)) {
            // Only check MFA for sessions that haven't been verified yet
            if (storedTimestamp) {
              const timeSinceAuth = Date.now() - parseInt(storedTimestamp);
              const maxAge = 24 * 60 * 60 * 1000; // 24 hours

              // If the stored session is old, force re-authentication with MFA
              if (timeSinceAuth > maxAge) {
                console.log('🔒 User session too old, forcing re-authentication with MFA');
                RoleBasedStorage.removeItem('sessionToken');
                setSessionToken(null);
                RoleBasedStorage.removeItem('user');
                RoleBasedStorage.removeItem('authUser');
                RoleBasedStorage.removeItem('authTimestamp');
                RoleBasedStorage.removeItem('mfaVerified');
                currentUser = null;
              }
            }
          } else if (currentUser && mfaVerified) {
            console.log('⚡ Skipping MFA check - already verified in this session');
          }
        } catch (error) {
          console.warn('EnhancedAuthContext: Failed to get current user:', error);
          // Clear invalid session data
          RoleBasedStorage.removeItem('sessionToken');
          setSessionToken(null);
          RoleBasedStorage.removeItem('user');
          RoleBasedStorage.removeItem('authUser');
          RoleBasedStorage.removeItem('authTimestamp');
          currentUser = null;
        }
      } else {
        // No session token - check if there's a stored user with MFA that should be forced to re-authenticate
        const storedUser = RoleBasedStorage.getItem('authUser');
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            if (parsedUser && await requiresMfa(parsedUser)) {
              console.log('🔒 User with MFA without session token detected, forcing re-login with MFA');
              RoleBasedStorage.removeItem('user');
              RoleBasedStorage.removeItem('authUser');
              RoleBasedStorage.removeItem('authTimestamp');
              currentUser = null;
            } else {
              // Users without MFA can try Cognito restoration
              currentUser = await authService.getCurrentAuthUser();
            }
          } catch {
            // If we can't parse the stored user, clear everything
            RoleBasedStorage.removeItem('user');
            RoleBasedStorage.removeItem('authUser');
            RoleBasedStorage.removeItem('authTimestamp');
            currentUser = null;
          }
        } else {
          currentUser = null;
        }
      }

      setUser(currentUser);

      // Initialize session management if user is authenticated
      if (currentUser) {
        const defaultConfig: SessionConfig = {
          timeout: 15, // 15 minutes default
          warningTime: 2 // 2 minutes warning
        };

        // PERFORMANCE OPTIMIZATION: Cache session config to avoid database calls on refresh
        let sessionConfig: SessionConfig;

        // First check if we already have the config in context (fastest)
        if (sessionConfigRef.current) {
          sessionConfig = sessionConfigRef.current;
          console.log('⚡ Using cached session config for faster loading');
        } else {
          // Check localStorage cache first (faster than database)
          const cachedConfig = RoleBasedStorage.getItem('sessionConfig');
          if (cachedConfig) {
            try {
              sessionConfig = JSON.parse(cachedConfig);
              console.log('📦 Using localStorage cached session config');
            } catch {
              sessionConfig = defaultConfig;
            }
          } else {
            // Only load from database if no cache exists AND user is not a client
            // Clients use default config - admin system settings don't apply to client sessions
            if (currentUser.role === 'client') {
              console.log('👤 Client user detected, using default session config');
              sessionConfig = defaultConfig;
            } else {
              try {
                console.log('🔍 Loading session config from database...');
                const dbConfig = await systemSettingsService.getSessionConfig();
                if (dbConfig) {
                  sessionConfig = dbConfig;
                  // Cache in localStorage for next time
                  RoleBasedStorage.setItem('sessionConfig', JSON.stringify(dbConfig));
                  console.log('📥 Loaded and cached session config from database');
                } else {
                  sessionConfig = defaultConfig;
                }
              } catch (error) {
                console.warn('⚠️ Failed to load database config, using default:', error);
                sessionConfig = defaultConfig;
              }
            }
          }
        }

        setSessionConfig(sessionConfig);
        sessionConfigRef.current = sessionConfig;

        // Reset session warning state for new session
        setSessionWarning({ isVisible: false, timeLeft: 0 });

        // Initialize session if not already active
        if (!sessionManager.isSessionActive()) {
          sessionManager.initSession(sessionConfig);
        }

        setIsSessionActive(true);
      } else {
        sessionManager.endSession();
        setIsSessionActive(false);
        setSessionConfig(null);
      }
    } catch (error) {
      console.error('EnhancedAuthContext: Error checking auth state:', error);
      // For now, don't throw error if backend/API is not available
      // This allows the auth form to still render
      setUser(null);
      setHasError(false); // Don't consider this an error, just no user
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    await checkAuthState();
  };

  const handleTimeout = async () => {
    // Store user role before clearing auth state for proper redirect
    timeoutUserRoleRef.current = user?.role || null;

    setUser(null);
    setIsSessionActive(false);
    setSessionWarning({ isVisible: false, timeLeft: 0 });
    sessionManager.endSession();

    // SECURITY FIX: Clear all authentication data from localStorage
    try {
      await authService.signOut();
    } catch (error) {
      console.error('Error during logout:', error);
      // Even if signOut fails, still clear localStorage manually for security
      RoleBasedStorage.removeItem('authUser');
      RoleBasedStorage.removeItem('authTimestamp');
      RoleBasedStorage.removeItem('sessionToken');
      RoleBasedStorage.removeItem('mfaVerified');
      RoleBasedStorage.removeItem('sessionConfig');
    }

    setShowTimeoutDialog(true);
  };

  const handleTimeoutConfirm = () => {
    setShowTimeoutDialog(false);

    // Determine redirect URL based on user role stored before timeout
    // All employee types (admin, executive, sales, technician) use /employee
    let redirectUrl = '/employee'; // Default for all employee roles
    if (timeoutUserRoleRef.current === 'client') {
      redirectUrl = '/clogin';
    }

    // Use replace() instead of href to prevent back button issues
    window.location.replace(redirectUrl);
  };

  // Database settings are now loaded during checkAuthState, so this useEffect is no longer needed
  // Keeping this comment as a reminder that we load DB config during login instead of after

  useEffect(() => {
    // Initialize auth state check with error handling
    const initializeAuth = async () => {
      try {
        await checkAuthState();
      } catch (error) {
        console.error('Failed to initialize auth:', error);
        setIsLoading(false);
        setUser(null);
      }
    };

    initializeAuth();

    // Set up API service unauthorized handler
    const setupApiService = async () => {
      const { apiService } = await import('../services/apiService');
      apiService.setUnauthorizedHandler(() => {
        console.log('🔐 API service detected unauthorized response');
        // Only show timeout dialog if user was actually logged in
        const currentUser = RoleBasedStorage.getItem('authUser');
        const sessionToken = RoleBasedStorage.getItem('sessionToken');

        if (currentUser && sessionToken) {
          console.log('🔐 User was logged in - showing timeout dialog');
          handleTimeout().catch(error => console.error('Error in handleTimeout:', error));
        } else {
          console.log('🔐 User was not logged in - ignoring 401 response');
        }
      });
    };

    setupApiService();

    // Set up session management event handlers
    sessionManager.onExpired(() => {
      handleTimeout().catch(error => console.error('Error in session timeout:', error));
    });

    sessionManager.onWarning((timeLeft) => {
      console.log(`🚨 Session warning triggered - ${timeLeft} minutes remaining`);
      setSessionWarning({ isVisible: true, timeLeft });
    });

    // Set up auth event listener with error handling
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = Hub.listen('auth', ({ payload }) => {
        try {
          switch (payload.event) {
            case 'signInWithRedirect':
            case 'signedIn':
              checkAuthState();
              break;
            case 'signedOut':
              setUser(null);
              sessionManager.endSession();
              setIsSessionActive(false);
              setSessionConfig(null);
              setSessionWarning({ isVisible: false, timeLeft: 0 });
              break;
            default:
              break;
          }
        } catch (error) {
          console.error('Error handling auth event:', error);
        }
      });
    } catch (error) {
      console.error('Error setting up auth listener:', error);
    }

    return () => {
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (error) {
          console.error('Error cleaning up auth listener:', error);
        }
      }
      sessionManager.cleanup();
    };
  }, []);

  const handleSignIn = async (email: string, password: string): Promise<AuthUser> => {
    try {
      // Determine login type based on current URL
      const currentPath = window.location.pathname;
      const loginType: 'employee' | 'client' =
        (currentPath.includes('/employee') || currentPath.includes('/technician') || currentPath.includes('/sales'))
          ? 'employee'
          : 'client';

      const user = await authService.signIn({ email, password, loginType });
      setUser(user);

      // Update sessionToken from localStorage after successful sign in
      const newSessionToken = RoleBasedStorage.getItem('sessionToken', user.role);
      setSessionToken(newSessionToken);

      return user;
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  };

  const handleSignUpAdmin = async (userData: { email: string; password: string; name: string }) => {
    try {
      const result = await authService.signUpAdmin(userData);
      // Don't automatically sign in after signup, let admin confirm email first
      return result;
    } catch (error) {
      console.error('Error signing up admin:', error);
      throw error;
    }
  };

  const handleSignUpClient = async (registrationData: ClientRegistrationRequest) => {
    try {
      const result = await clientRegistrationService.registerClient(registrationData);
      return {
        success: result.success,
        message: result.message,
        emailConfirmationSent: result.emailConfirmationSent
      };
    } catch (error: unknown) {
      console.error('Error registering client:', error);
      throw new Error(error instanceof Error ? error.message : 'Client registration failed');
    }
  };

  const handleConfirmClientEmail = async (token: string, email: string) => {
    try {
      const result = await clientRegistrationService.confirmClientEmail(token, email);
      if (result.success && result.user) {
        setUser(result.user);
      }
      return result;
    } catch (error: unknown) {
      console.error('Error confirming client email:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Email confirmation failed'
      };
    }
  };

  const handleResendConfirmationEmail = async (email: string) => {
    try {
      const result = await clientRegistrationService.resendConfirmationEmail(email);
      return result;
    } catch (error: unknown) {
      console.error('Error resending confirmation email:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to resend confirmation email');
    }
  };

  const handleSignOut = async (): Promise<void> => {
    try {
      // Set signing out state to prevent "Authentication Required" flash
      setIsSigningOut(true);

      // Store current user role before clearing user state
      const currentUserRole = user?.role;

      // Disable unauthorized handling to prevent timeout dialogs during logout
      const { apiService } = await import('../services/apiService');
      apiService.disableUnauthorizedHandling();

      // CRITICAL: Complete ALL logout operations before navigating
      await authService.signOut();

      // DOUBLE-CHECK: Force clear ALL role-based localStorage entries
      // Instead of hardcoding roles, find and remove all keys matching the pattern
      const authKeys = ['authUser', 'authTimestamp', 'sessionToken', 'mfaVerified', 'sessionConfig', 'user'];
      const keysToRemove: string[] = [];

      // Scan all localStorage keys and find role-prefixed auth keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          // Check if this key matches any of our auth key patterns (role_keyname)
          for (const authKey of authKeys) {
            if (key.endsWith(`_${authKey}`)) {
              keysToRemove.push(key);
              break;
            }
          }
        }
      }

      // Remove all found keys
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });

      // Also clear currentPage and clientData to prevent navigation loop
      localStorage.removeItem('currentPage');
      sessionStorage.removeItem('clientData');

      // Immediately clear React state
      setUser(null);
      setSessionToken(null);
      sessionManager.endSession();
      setIsSessionActive(false);
      setSessionConfig(null);
      setSessionWarning({ isVisible: false, timeLeft: 0 });

      // Re-enable for next login (after a delay to let pending requests complete)
      setTimeout(() => {
        apiService.enableUnauthorizedHandling();
      }, 1000);

      // Determine redirect URL based on user role
      // All employee types (admin, executive, sales, technician) use /employee
      let redirectUrl = '/employee'; // Default for all employee roles
      if (currentUserRole === 'client') {
        redirectUrl = '/clogin';
      }


      // Use replace() instead of href to prevent back button from restoring session
      // Force the redirect to happen even if there's an error
      window.location.replace(redirectUrl);
    } catch (error) {
      console.error('Error signing out:', error);
      // Still redirect even if there was an error during logout
      window.location.replace('/employee');
    } finally {
      // Reset signing out flag
      setIsSigningOut(false);
    }
  };

  const hasPermission = (requiredRole: UserRole | UserRole[]): boolean => {
    if (!user) return false;
    return authService.hasPermission(user.role, requiredRole);
  };

  // Session management methods
  const updateSessionConfig = async (config: Partial<SessionConfig>) => {
    // Handle both initial load (when sessionConfig is null) and updates (when it exists)
    const newConfig = sessionConfig ? { ...sessionConfig, ...config } : config as SessionConfig;

    setSessionConfig(newConfig);
    sessionConfigRef.current = newConfig;
    sessionManager.updateConfig(newConfig);
    console.log('✅ Session config updated in context:', newConfig);

    // Also save to database (skip if this is just an initial load, not a user change)
    if (sessionConfig) {
      try {
        await systemSettingsService.updateSessionConfig(newConfig);
        console.log('✅ Session config saved to database:', newConfig);

        // Update localStorage cache so it's correct on next page load
        RoleBasedStorage.setItem('sessionConfig', JSON.stringify(newConfig));
        console.log('✅ Session config cache updated in localStorage');
      } catch (error) {
        console.error('❌ Failed to save session config to database:', error);
        // Don't revert local changes - they'll still work for this session
      }
    } else {
      // Initial load - just cache it, don't save to database
      RoleBasedStorage.setItem('sessionConfig', JSON.stringify(newConfig));
      console.log('💾 Session config cached in localStorage (initial load)');
    }
  };

  const extendSession = async () => {
    try {
      // Call backend to extend session
      const result = await authService.extendSession();

      if (result.success) {
        // Update local session manager with the extended session info
        sessionManager.extendSession();
        setSessionWarning({ isVisible: false, timeLeft: 0 });
      } else {
        console.error('❌ Failed to extend session on server:', result.message);
        // Still hide the warning since user tried to extend
        setSessionWarning({ isVisible: false, timeLeft: 0 });
      }
    } catch (error) {
      console.error('❌ Error extending session:', error);
      // Still hide the warning since user tried to extend
      setSessionWarning({ isVisible: false, timeLeft: 0 });
    }
  };

  const updateSessionWarningTime = (timeLeftSeconds: number) => {
    setSessionWarning({
      isVisible: true,
      timeLeft: timeLeftSeconds
    });
  };

  // MFA handlers
  const handleSendAdminMfaCode = async (email: string, password: string) => {
    try {
      return await authService.sendAdminMfaCode(email, password);
    } catch (error) {
      console.error('Error sending admin MFA code:', error);
      throw error;
    }
  };

  const handleVerifyAdminMfaCode = async (email: string, mfaCode: string) => {
    try {
      const user = await authService.verifyAdminMfaCode(email, mfaCode);
      setUser(user);

      // Update sessionToken from localStorage after successful MFA
      const newSessionToken = RoleBasedStorage.getItem('sessionToken');
      setSessionToken(newSessionToken);

      // Initialize session management after successful MFA
      const defaultConfig: SessionConfig = {
        timeout: 15, // 15 minutes default
        warningTime: 2 // 2 minutes warning
      };

      // Try to load config: localStorage cache first (fast), then database, then default
      let sessionConfig: SessionConfig;

      // First, check localStorage cache
      const cachedConfigStr = RoleBasedStorage.getItem('sessionConfig');
      if (cachedConfigStr) {
        try {
          sessionConfig = JSON.parse(cachedConfigStr);
          console.log('📥 [MFA] Using cached session config from localStorage:', sessionConfig);
        } catch (error) {
          console.warn('⚠️ [MFA] Failed to parse cached config, will try database');
        }
      }

      // If no cached config, try database
      if (!sessionConfig) {
        try {
          console.log('🔍 [MFA] Attempting to load session config from database...');
          const dbConfig = await systemSettingsService.getSessionConfig();
          console.log('🔍 [MFA] Database response:', dbConfig);
          if (dbConfig) {
            sessionConfig = dbConfig;
            console.log('📥 [MFA] Using database session config:', sessionConfig);
          } else {
            console.log('⚠️ [MFA] No database config found, using default');
            sessionConfig = defaultConfig;
            console.log('📥 [MFA] Using default session config:', sessionConfig);
          }
        } catch (error) {
          console.warn('⚠️ [MFA] Failed to load database config, using default:', error);
          sessionConfig = defaultConfig;
          console.log('📥 [MFA] Using default session config (fallback):', sessionConfig);
        }
      }

      setSessionConfig(sessionConfig);
      sessionConfigRef.current = sessionConfig; // Update ref immediately
      console.log('✅ [MFA] Session config set in state:', sessionConfig);

      // Save session config to localStorage for future use
      RoleBasedStorage.setItem('sessionConfig', JSON.stringify(sessionConfig));
      console.log('💾 [MFA] Saved session config to localStorage:', sessionConfig);

      // Reset session warning state for new session
      setSessionWarning({ isVisible: false, timeLeft: 0 });

      // Initialize session if not already active
      if (!sessionManager.isSessionActive()) {
        sessionManager.initSession(sessionConfig);
      }

      setIsSessionActive(true);

      return user;
    } catch (error) {
      console.error('Error verifying admin MFA code:', error);
      throw error;
    }
  };

  // Verify client MFA code and complete client login
  const handleVerifyClientMfaCode = async (email: string, mfaCode: string): Promise<AuthUser> => {
    try {
      const user = await authService.verifyClientMfaCode(email, mfaCode);
      setUser(user);

      // PERFORMANCE OPTIMIZATION: Mark MFA as verified for this session
      RoleBasedStorage.setItem('mfaVerified', 'true');
      console.log('⚡ MFA verification flag set for faster future page loads');

      // Update sessionToken from localStorage after successful MFA
      const storedToken = RoleBasedStorage.getItem('sessionToken');
      if (storedToken) {
        setSessionToken(storedToken);
      }

      // Initialize session management for the client
      const defaultConfig: SessionConfig = {
        timeout: 15 * 60 * 1000, // 15 minutes
        warningTime: 2 * 60 * 1000, // 2 minutes
        checkInterval: 60 * 1000  // 1 minute
      };

      let sessionConfig = defaultConfig;

      try {
        console.log('🔍 [Client MFA] Attempting to load session config from database...');
        const dbConfig = await systemSettingsService.getSessionConfig();
        console.log('🔍 [Client MFA] Database response:', dbConfig);
        if (dbConfig) {
          sessionConfig = dbConfig;
          console.log('📥 [Client MFA] Using database session config:', sessionConfig);
        } else {
          console.log('⚠️ [Client MFA] No database config found, checking local storage...');
          const existingConfig = sessionManager.getConfig();
          if (existingConfig) {
            sessionConfig = existingConfig;
            console.log('📥 [Client MFA] Using local session config:', sessionConfig);
          } else {
            sessionConfig = defaultConfig;
            console.log('📥 [Client MFA] Using default session config:', sessionConfig);
          }
        }
      } catch (error) {
        console.warn('⚠️ [Client MFA] Failed to load database config, using fallback:', error);
        const existingConfig = sessionManager.getConfig();
        if (existingConfig) {
          sessionConfig = existingConfig;
          console.log('📥 [Client MFA] Using local session config (fallback):', sessionConfig);
        } else {
          sessionConfig = defaultConfig;
          console.log('📥 [Client MFA] Using default session config (fallback):', sessionConfig);
        }
      }

      setSessionConfig(sessionConfig);

      // Reset session warning state for new session
      setSessionWarning({ isVisible: false, timeLeft: 0 });

      // Initialize session if not already active
      if (!sessionManager.isSessionActive()) {
        sessionManager.initSession(sessionConfig);
      }

      setIsSessionActive(true);

      return user;
    } catch (error) {
      console.error('Error verifying client MFA code:', error);
      throw error;
    }
  };

  // Set user from trusted device authentication - bypasses MFA requirement
  const setUserFromTrustedDevice = async (userData: AuthUser, sessionToken?: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔄 [Trusted Device] Setting user directly from trusted device authentication');

        // Store authentication state in localStorage for persistence (same as normal MFA flow)
        RoleBasedStorage.setItem('authUser', JSON.stringify(userData));
        RoleBasedStorage.setItem('authTimestamp', Date.now().toString());
        console.log('💾 [Trusted Device] Stored authUser and authTimestamp in localStorage');

        // PERFORMANCE OPTIMIZATION: Mark MFA as verified for this session since trusted device bypassed it
        RoleBasedStorage.setItem('mfaVerified', 'true');
        console.log('⚡ MFA verification flag set for trusted device authentication');

        // Update sessionToken if provided
        // CRITICAL: Store in localStorage first (synchronous), then update React state
        if (sessionToken) {
          console.log('🔐 [Trusted Device] Storing session token (length:', sessionToken.length, ')');
          RoleBasedStorage.setItem('sessionToken', sessionToken);
          setSessionToken(sessionToken);
          console.log('🔐 [Trusted Device] Session token stored in localStorage and state updated');
        } else {
          console.warn('⚠️ [Trusted Device] No session token provided!');
          // Check if there's already a token in localStorage
          const existingToken = RoleBasedStorage.getItem('sessionToken');
          if (existingToken) {
            setSessionToken(existingToken);
            console.log('🔐 [Trusted Device] Using existing session token from localStorage');
          } else {
            console.error('❌ [Trusted Device] No session token available - this will cause authentication to fail');
          }
        }

        // Initialize session management after trusted device authentication
        const defaultConfig: SessionConfig = {
          timeout: 15, // 15 minutes default
          warningTime: 2 // 2 minutes warning
        };

        // Try to load config from database first, then local storage, then default
        let sessionConfig: SessionConfig;

        (async () => {
          try {
            console.log('🔍 [Trusted Device] Attempting to load session config from database...');
            const dbConfig = await systemSettingsService.getSessionConfig();
            console.log('🔍 [Trusted Device] Database response:', dbConfig);
            if (dbConfig) {
              sessionConfig = dbConfig;
              console.log('📥 [Trusted Device] Using database session config:', sessionConfig);
            } else {
              console.log('⚠️ [Trusted Device] No database config found, checking local storage...');
              const existingConfig = sessionManager.getConfig();
              if (existingConfig) {
                sessionConfig = existingConfig;
                console.log('📥 [Trusted Device] Using local session config:', sessionConfig);
              } else {
                sessionConfig = defaultConfig;
                console.log('📥 [Trusted Device] Using default session config:', sessionConfig);
              }
            }
          } catch (error) {
            console.warn('⚠️ [Trusted Device] Failed to load database config, using fallback:', error);
            const existingConfig = sessionManager.getConfig();
            if (existingConfig) {
              sessionConfig = existingConfig;
              console.log('📥 [Trusted Device] Using local session config (fallback):', sessionConfig);
            } else {
              sessionConfig = defaultConfig;
              console.log('📥 [Trusted Device] Using default session config (fallback):', sessionConfig);
            }
          }

          setSessionConfig(sessionConfig);

          // Reset session warning state for new session
          setSessionWarning({ isVisible: false, timeLeft: 0 });

          // Initialize session if not already active
          if (!sessionManager.isSessionActive()) {
            sessionManager.initSession(sessionConfig);
          }

          setIsSessionActive(true);

          // Set user state - this triggers React re-render
          // We resolve the promise after setting state to ensure caller waits for state update
          setUser(userData);

          console.log('✅ [Trusted Device] User authentication state updated successfully');

          // Resolve promise on next tick to ensure React has processed state update
          setTimeout(() => resolve(), 0);
        })().catch(reject);

      } catch (error) {
        console.error('❌ [Trusted Device] Error setting user from trusted device:', error);
        reject(error);
      }
    });
  };

  // Computed properties
  const isAuthenticated = !!user;
  const role = user?.role || null;
  const isAdmin = user?.role === 'admin';
  const isTechnician = user?.role === 'technician';
  const isExecutive = user?.role === 'executive';
  const isSales = user?.role === 'sales';
  const isClient = user?.role === 'client';
  const isFirstAdmin = user?.isFirstAdmin || false;

  const value: EnhancedAuthContextType = {
    user,
    authUser: user, // Alias for backwards compatibility
    isLoading,
    isAuthenticated,
    role,
    isAdmin,
    isTechnician,
    isExecutive,
    isSales,
    isClient,
    isFirstAdmin,
    isSigningOut,
    signIn: handleSignIn,
    signUpAdmin: handleSignUpAdmin,
    signUpClient: handleSignUpClient,
    confirmClientEmail: handleConfirmClientEmail,
    resendConfirmationEmail: handleResendConfirmationEmail,
    signOut: handleSignOut,
    hasPermission,
    refreshUser,
    // MFA methods
    sendAdminMfaCode: handleSendAdminMfaCode,
    verifyAdminMfaCode: handleVerifyAdminMfaCode,
    verifyClientMfaCode: handleVerifyClientMfaCode,
    // Trusted device methods
    setUserFromTrustedDevice,
    // Session management
    sessionConfig,
    updateSessionConfig,
    extendSession,
    isSessionActive,
    sessionWarning,
    updateSessionWarningTime,
    sessionToken
  };

  // Add error boundary behavior
  if (hasError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Authentication Error</h1>
          <p className="text-gray-600 mb-4">There was an issue initializing authentication.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <EnhancedAuthContext.Provider value={value}>
      {children}
      <ConfirmationDialog
        isOpen={showTimeoutDialog}
        onClose={handleTimeoutConfirm}
        onConfirm={handleTimeoutConfirm}
        title="Session Timeout"
        message="Your session has expired due to inactivity. You have been signed out for security."
        confirmButtonText="OK"
        confirmButtonColor="grey"
        iconType="timeout"
        showCancelButton={false}
      />
    </EnhancedAuthContext.Provider>
  );
};

export const useEnhancedAuth = () => {
  const context = useContext(EnhancedAuthContext);
  if (context === undefined) {
    throw new Error('useEnhancedAuth must be used within an EnhancedAuthProvider');
  }
  return context;
};

// Higher-order component for role-based route protection
export const withRoleProtection = <P extends object>(
  Component: React.ComponentType<P>,
  requiredRoles: UserRole | UserRole[],
  fallbackComponent?: React.ComponentType
) => {
  return (props: P) => {
    const { hasPermission, isLoading } = useEnhancedAuth();

    if (isLoading) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      );
    }

    if (!hasPermission(requiredRoles)) {
      if (fallbackComponent) {
        const FallbackComponent = fallbackComponent;
        return <FallbackComponent />;
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">🔒</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
            <p className="text-gray-600">You don't have permission to access this page.</p>
          </div>
        </div>
      );
    }

    return <Component {...props} />;
  };
};

export default EnhancedAuthContext;