/**
 * Frontend Permission Service
 *
 * Client-side permission checking service that works with PermissionContext.
 * Provides cached permission checks and API calls to backend.
 *
 * Usage:
 *   import { permissionService } from '../services/permissionService';
 *   const canDelete = await permissionService.checkPermission('hardDelete.businesses.enable');
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

// Helper function to get auth headers
const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('token') || localStorage.getItem('sessionToken');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

// Helper function to handle fetch responses
const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
};

export interface Permission {
  id: string;
  permission_key: string;
  resource_type: string;
  action_type: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  name: string;
  displayName: string;
}

export interface UserPermissions {
  employeeId: string;
  roles: Role[];
  permissions: string[];
  isExecutive: boolean;
  permissionCount: number;
}

export interface RoleWithPermissions {
  id: string;
  name: string;
  display_name: string;
  description: string;
  permission_count: number;
}

export interface RolePermissionDetail {
  role: {
    id: string;
    name: string;
    displayName: string;
    description: string;
  };
  permissions: Array<{
    id: string;
    permission_key: string;
    resource_type: string;
    action_type: string;
    description: string;
    is_granted: boolean;
    role_permission_id: string | null;
  }>;
  grantedCount: number;
  totalCount: number;
}

export interface AuditLogEntry {
  log_id: string;
  action_timestamp: string;
  employee_id: string;
  permission_key: string;
  result: 'granted' | 'denied';
  role_used: string | null;
  action_details: any;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  role_name: string | null;
  role_display_name: string | null;
}

export interface AuditLogStats {
  resultStats: Array<{ result: string; count: string }>;
  topPermissions: Array<{ permission_key: string; result: string; count: string }>;
  topUsers: Array<{ id: string; first_name: string; last_name: string; email: string; attempt_count: string }>;
  recentDenied: Array<AuditLogEntry>;
}

class PermissionService {
  private apiBaseUrl: string;

  constructor() {
    this.apiBaseUrl = API_BASE_URL;
  }

  /**
   * Check if user has a specific permission (cached check via context)
   * This should be called from usePermission hook which has context access
   * @param permissionKey - Permission key to check
   * @param userPermissions - User's permissions from context
   * @returns boolean
   */
  hasPermission(permissionKey: string, userPermissions: string[]): boolean {
    return userPermissions.includes(permissionKey);
  }

  /**
   * Get all permissions for current user from backend
   * @returns Promise<UserPermissions>
   */
  async getUserPermissions(): Promise<UserPermissions> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/admin/permissions/user-permissions`, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      const data = await handleResponse(response);

      if (data.success) {
        return data.data;
      }

      throw new Error(data.message || 'Failed to fetch user permissions');
    } catch (error: any) {
      console.error('Error fetching user permissions:', error);
      throw error;
    }
  }

  /**
   * Get all permissions in the system
   * @returns Promise<Permission[]>
   */
  async getAllPermissions(): Promise<Permission[]> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/admin/permissions`, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      const data = await handleResponse(response);

      if (data.success) {
        return data.data.permissions;
      }

      throw new Error(data.message || 'Failed to fetch permissions');
    } catch (error: any) {
      console.error('Error fetching permissions:', error);
      throw error;
    }
  }

  /**
   * Get all roles with permission counts
   * @returns Promise<{ roles: any[] }>
   */
  async getRolesWithPermissions(): Promise<{ roles: any[] }> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/admin/roles-with-permissions`, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      const data = await handleResponse(response);

      if (data.success && data.data) {
        return { roles: data.data.roles || [] };
      }

      throw new Error(data.message || 'Failed to fetch roles');
    } catch (error: any) {
      console.error('Error fetching roles:', error);
      throw error;
    }
  }

  /**
   * Get permissions for a specific role
   * @param roleId - Role name (e.g., 'admin', 'technician')
   * @returns Promise<{ permissions: Permission[] }>
   */
  async getRolePermissions(roleId: string): Promise<{ permissions: Permission[] }> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/admin/role-permissions/${roleId}`, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      const data = await handleResponse(response);

      if (data.success) {
        return { permissions: data.permissions };
      }

      throw new Error(data.message || 'Failed to fetch role permissions');
    } catch (error: any) {
      console.error('Error fetching role permissions:', error);
      throw error;
    }
  }

  /**
   * Update permissions for a role (executive only)
   * @param roleId - Role name (e.g., 'admin', 'technician')
   * @param permissionIds - Array of permission IDs to grant
   * @returns Promise<any>
   */
  async updateRolePermissions(
    roleId: string,
    permissionIds: string[]
  ): Promise<any> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/admin/role-permissions/${roleId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ permissionIds })
      });

      const data = await handleResponse(response);

      if (data.success) {
        return data.data;
      }

      throw new Error(data.message || 'Failed to update role permissions');
    } catch (error: any) {
      console.error('Error updating role permissions:', error);
      throw error;
    }
  }

  /**
   * Get permission audit log
   * @param filters - Optional filters {employeeId, result, startDate, endDate, page, limit}
   * @returns Promise with logs and pagination
   */
  async getAuditLog(filters?: {
    employeeId?: string;
    result?: 'granted' | 'denied';
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{ logs: AuditLogEntry[]; pagination: any }> {
    try {
      const params = new URLSearchParams();
      if (filters?.employeeId) params.append('employeeId', filters.employeeId);
      if (filters?.result) params.append('result', filters.result);
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);
      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());

      const response = await fetch(
        `${this.apiBaseUrl}/admin/permission-audit-log?${params.toString()}`,
        {
          method: 'GET',
          headers: getAuthHeaders(),
          credentials: 'include'
        }
      );

      const data = await handleResponse(response);

      if (data.success) {
        return data.data;
      }

      throw new Error(data.message || 'Failed to fetch audit log');
    } catch (error: any) {
      console.error('Error fetching audit log:', error);
      throw error;
    }
  }

  /**
   * Get audit log statistics
   * @returns Promise<AuditLogStats>
   */
  async getAuditLogStats(): Promise<AuditLogStats> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/admin/permission-audit-log/stats`, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include'
      });

      const data = await handleResponse(response);

      if (data.success) {
        return data.data;
      }

      throw new Error(data.message || 'Failed to fetch audit log stats');
    } catch (error: any) {
      console.error('Error fetching audit log stats:', error);
      throw error;
    }
  }

  /**
   * Handle 403 Permission Denied errors
   * Extracts useful information from error response
   */
  handlePermissionDenied(error: any): {
    message: string;
    requiredPermission?: string;
    userRoles?: string;
    reason?: string;
    code?: string;
  } {
    if (error.response?.status === 403) {
      const data = error.response.data;
      return {
        message: data.message || 'Permission denied',
        requiredPermission: data.requiredPermission,
        userRoles: data.userRoles,
        reason: data.reason,
        code: data.code
      };
    }

    return {
      message: 'An error occurred'
    };
  }
}

// Export singleton instance
export const permissionService = new PermissionService();
export default permissionService;