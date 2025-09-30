/**
 * usePermission Hook
 *
 * Convenience hook for checking permissions in components.
 * Provides simple boolean check for any permission key.
 *
 * Usage:
 *   import { usePermission } from '../hooks/usePermission';
 *
 *   // Check single permission
 *   const { hasPermission } = usePermission('hardDelete.businesses.enable');
 *
 *   // Check multiple permissions
 *   const canDelete = usePermission('hardDelete.businesses.enable').hasPermission;
 *   const canEdit = usePermission('modify.businesses.enable').hasPermission;
 *
 *   // Access full context
 *   const { hasPermission, isExecutive, loading } = usePermission();
 */

import { usePermissionContext } from '../contexts/PermissionContext';

interface UsePermissionReturn {
  hasPermission: boolean;
  checkPermission: (permissionKey: string) => boolean;
  isExecutive: boolean;
  loading: boolean;
  error: string | null;
  refreshPermissions: () => Promise<void>;
  permissions: string[];
  roles: Array<{ id: string; name: string; displayName: string }>;
}

/**
 * Hook to check if user has a specific permission
 * @param permissionKey - Optional permission key to check immediately
 * @returns Object with permission check results and utilities
 */
export const usePermission = (permissionKey?: string): UsePermissionReturn => {
  const context = usePermissionContext();

  const hasPermission = permissionKey ? context.hasPermission(permissionKey) : false;

  return {
    hasPermission,
    checkPermission: context.hasPermission,
    isExecutive: context.isExecutive,
    loading: context.loading,
    error: context.error,
    refreshPermissions: context.refreshPermissions,
    permissions: context.permissions,
    roles: context.roles
  };
};

/**
 * Hook to check multiple permissions at once
 * @param permissionKeys - Array of permission keys to check
 * @returns Object with each permission check result
 */
export const usePermissions = (
  permissionKeys: string[]
): {
  permissions: Record<string, boolean>;
  hasAll: boolean;
  hasAny: boolean;
  isExecutive: boolean;
  loading: boolean;
} => {
  const context = usePermissionContext();

  const permissions: Record<string, boolean> = {};
  permissionKeys.forEach(key => {
    permissions[key] = context.hasPermission(key);
  });

  const hasAll = permissionKeys.every(key => context.hasPermission(key));
  const hasAny = permissionKeys.some(key => context.hasPermission(key));

  return {
    permissions,
    hasAll,
    hasAny,
    isExecutive: context.isExecutive,
    loading: context.loading
  };
};

export default usePermission;