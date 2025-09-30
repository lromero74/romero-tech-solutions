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

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { permissionService, UserPermissions, Role } from '../services/permissionService';
import { useEnhancedAuth } from './EnhancedAuthContext';
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

const WEBSOCKET_URL = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:3001';

export const PermissionProvider: React.FC<PermissionProviderProps> = ({ children }) => {
  const { user, sessionToken } = useEnhancedAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isExecutive, setIsExecutive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

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
      console.error('❌ Error loading permissions:', err);
      setError(err.message || 'Failed to load permissions');

      // On error, set empty permissions (fail-safe)
      setPermissions([]);
      setRoles([]);
      setIsExecutive(false);
    } finally {
      setLoading(false);
    }
  }, [user]);

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
   */
  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

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
      return;
    }

    // 🚨 CRITICAL: Only connect WebSocket for employee roles
    // Client users don't need permission update notifications
    if (user.role === 'client') {
      console.log('ℹ️ Client user detected, skipping WebSocket connection for permissions');
      return;
    }

    // Connect to WebSocket server
    console.log('🔌 Connecting to WebSocket for permission updates:', WEBSOCKET_URL);
    const newSocket = io(WEBSOCKET_URL, {
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

    // Cleanup on unmount
    return () => {
      console.log('🔌 Cleaning up WebSocket connection');
      newSocket.disconnect();
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