/**
 * Permission Context
 *
 * Global state management for user permissions.
 * Loads permissions on auth, provides permission checking throughout app.
 * Listens for WebSocket events to refresh permissions in real-time.
 *
 * Usage:
 *   import { usePermission } from '../contexts/PermissionContext';
 *   const { hasPermission, isExecutive, loading } = usePermission();
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { permissionService, UserPermissions, Role } from '../services/permissionService';
import { useEnhancedAuth } from './EnhancedAuthContext';
import { RoleBasedStorage } from '../utils/roleBasedStorage';
import { io, Socket } from 'socket.io-client';

interface PermissionContextType {
  permissions: string[];
  roles: Role[];
  isExecutive: boolean;
  loading: boolean;
  error: string | null;
  hasPermission: (permissionKey: string) => boolean;
  refreshPermissions: () => Promise<void>;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

interface PermissionProviderProps {
  children: React.ReactNode;
}

export const PermissionProvider: React.FC<PermissionProviderProps> = ({ children }) => {
  const { user, sessionToken } = useEnhancedAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isExecutive, setIsExecutive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Construct WebSocket URL from API base URL (same logic as AdminDataContext)
  const getWebSocketUrl = () => {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

    if (apiBaseUrl.includes('api.romerotechsolutions.com')) {
      return 'https://api.romerotechsolutions.com';
    } else if (apiBaseUrl.includes('44.211.124.33:3001')) {
      return 'http://44.211.124.33:3001';
    } else if (apiBaseUrl.includes('localhost') || apiBaseUrl.includes('127.0.0.1')) {
      return 'http://localhost:3001';
    } else {
      // Fallback: try to construct from API URL by removing /api suffix
      return apiBaseUrl.replace('/api', '').replace(/\/$/, '');
    }
  };

  /**
   * Load permissions from backend
   */
  const loadPermissions = useCallback(async () => {
    if (!user) {
      // User not logged in, clear permissions
      setPermissions([]);
      setRoles([]);
      setIsExecutive(false);
      setLoading(false);
      return;
    }

    // 🚨 CRITICAL: Wait for sessionToken to be available before loading permissions
    // This prevents race condition where user is loaded from localStorage but session isn't validated yet
    // Try localStorage as fallback if context value is not yet available (timing issue after login)
    const activeSessionToken = sessionToken || RoleBasedStorage.getItem('sessionToken');

    if (!activeSessionToken) {
      console.log('⏳ Waiting for sessionToken (context or localStorage) before loading permissions...');
      setPermissions([]);
      setRoles([]);
      setIsExecutive(false);
      setLoading(false);
      return;
    }

    if (!sessionToken && activeSessionToken) {
      console.log('🔐 Using session token from localStorage for permissions (context not yet updated)');
    }

    // 🚨 CRITICAL: Only load permissions for employee roles
    // Client users don't have permissions in the employee permission system
    if (user.role === 'client') {
      console.log('ℹ️ Client user detected, skipping permission load');
      setPermissions([]);
      setRoles([]);
      setIsExecutive(false);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const userPermissions: UserPermissions = await permissionService.getUserPermissions();

      setPermissions(userPermissions.permissions);
      setRoles(userPermissions.roles);
      setIsExecutive(userPermissions.isExecutive);

      console.log('✅ Loaded permissions for user:', {
        roles: userPermissions.roles.map(r => r.displayName).join(', '),
        permissionCount: userPermissions.permissionCount,
        isExecutive: userPermissions.isExecutive
      });

    } catch (err: any) {
      // If it's a permission error (403), silently set empty permissions (user has no permissions)
      if (err.message?.includes('Insufficient permissions') || err.message?.includes('403')) {
        console.log('ℹ️ User has no permissions configured (403)');
        setPermissions([]);
        setRoles([]);
        setIsExecutive(false);
        setError(null); // Don't show error for permission-less users
      } else {
        console.error('❌ Error loading permissions:', err);
        setError(err.message || 'Failed to load permissions');

        // On other errors, set empty permissions (fail-safe)
        setPermissions([]);
        setRoles([]);
        setIsExecutive(false);
      }
    } finally {
      setLoading(false);
    }
  }, [user, sessionToken]);

  /**
   * Refresh permissions (force reload from backend)
   */
  const refreshPermissions = useCallback(async () => {
    console.log('🔄 Refreshing permissions...');
    await loadPermissions();
  }, [loadPermissions]);

  /**
   * Check if user has a specific permission
   */
  const hasPermission = useCallback((permissionKey: string): boolean => {
    // If executive, always return true (executive has all permissions)
    if (isExecutive) {
      return true;
    }

    // Check if permission exists in user's permission list
    return permissions.includes(permissionKey);
  }, [permissions, isExecutive]);

  /**
   * Load permissions on mount and when user changes
   * Add small delay to ensure browser has processed Set-Cookie header from auth response
   */
  useEffect(() => {
    // Small delay to ensure sessionToken cookie is set before making permissions request
    const timer = setTimeout(() => {
      loadPermissions();
    }, 100);

    return () => clearTimeout(timer);
  }, [loadPermissions]);

  // Track previous sessionToken and user.role to prevent unnecessary reconnections
  const prevSessionTokenRef = useRef<string | null>(null);
  const prevUserRoleRef = useRef<string | null>(null);

  /**
   * Setup WebSocket connection for real-time permission updates
   */
  useEffect(() => {
    if (!user || !sessionToken) {
      // Not authenticated, disconnect WebSocket if connected
      if (socket) {
        console.log('🔌 Disconnecting WebSocket (user logged out)');
        socket.disconnect();
        setSocket(null);
      }
      prevSessionTokenRef.current = null;
      prevUserRoleRef.current = null;
      return;
    }

    // 🚨 CRITICAL: Only connect WebSocket for employee roles
    // Client users don't need permission update notifications
    if (user.role === 'client') {
      console.log('ℹ️ Client user detected, skipping WebSocket connection for permissions');
      return;
    }

    // 🚀 OPTIMIZATION: Skip if sessionToken and role haven't changed
    if (prevSessionTokenRef.current === sessionToken && prevUserRoleRef.current === user.role && socket) {
      console.log('✅ SessionToken and role unchanged, reusing existing WebSocket connection');
      return;
    }

    // Update refs
    prevSessionTokenRef.current = sessionToken;
    prevUserRoleRef.current = user.role;

    // Connect to WebSocket server
    const websocketUrl = getWebSocketUrl();
    console.log('🔌 Connecting to WebSocket for permission updates:', websocketUrl);
    const newSocket = io(websocketUrl, {
      transports: ['websocket', 'polling'],
      withCredentials: true
    });

    newSocket.on('connect', () => {
      console.log('✅ WebSocket connected for permission updates');
      // Authenticate with session token
      newSocket.emit('admin-authenticate', { sessionToken });
    });

    newSocket.on('auth-success', () => {
      console.log('✅ WebSocket authenticated');
    });

    newSocket.on('auth-error', (data) => {
      console.error('❌ WebSocket authentication failed:', data);
    });

    // Listen for role permission updates
    newSocket.on('rolePermissionsUpdated', (data) => {
      console.log('📡 Received rolePermissionsUpdated event:', data);

      // Check if user has the role that was updated
      const userHasRole = roles.some(role => role.id === data.roleId);

      if (userHasRole) {
        console.log('🔄 User has updated role, refreshing permissions...');
        refreshPermissions();
      } else {
        console.log('ℹ️  User does not have updated role, no refresh needed');
      }
    });

    // Listen for generic permission updates
    newSocket.on('permissionUpdated', (data) => {
      console.log('📡 Received permissionUpdated event:', data);
      // Refresh permissions on any permission system change
      refreshPermissions();
    });

    newSocket.on('disconnect', () => {
      console.log('🔌 WebSocket disconnected');
    });

    newSocket.on('connect_error', (err) => {
      console.error('❌ WebSocket connection error:', err);
    });

    setSocket(newSocket);

    // Cleanup on unmount - only disconnect if session/role actually changed
    return () => {
      console.log('🔌 Permission WebSocket cleanup called');
      // Only disconnect on actual logout or role change, not on re-renders
      if (socket && (prevSessionTokenRef.current !== sessionToken || prevUserRoleRef.current !== user?.role)) {
        newSocket.disconnect();
      }
    };
  }, [user, sessionToken, roles, refreshPermissions]);

  const value: PermissionContextType = {
    permissions,
    roles,
    isExecutive,
    loading,
    error,
    hasPermission,
    refreshPermissions
  };

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
};

/**
 * Hook to use permission context
 * @throws Error if used outside PermissionProvider
 */
export const usePermissionContext = (): PermissionContextType => {
  const context = useContext(PermissionContext);

  if (context === undefined) {
    throw new Error('usePermissionContext must be used within a PermissionProvider');
  }

  return context;
};

export default PermissionContext;