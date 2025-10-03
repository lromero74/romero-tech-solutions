/**
 * Admin Permission Manager - Matrix View with Tree Structure
 *
 * Executive-only component for managing role permissions with a spreadsheet-like interface.
 * Features:
 * - Matrix view: Permissions (rows) × Roles (columns)
 * - Collapsible tree structure for easy navigation
 * - Visual inheritance indicators
 * - Bulk operations by role or permission
 * - Search and filter
 * - Real-time save
 *
 * Usage:
 *   <AdminPermissionManager />
 */

import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Square,
  Shield,
  Save,
  AlertCircle,
  Info,
  Search,
  RotateCcw,
  CheckCircle,
  Lock,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen
} from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import { permissionService } from '../../services/permissionService';
import AlertModal from '../shared/AlertModal';
import { themeClasses } from '../../contexts/ThemeContext';

interface Permission {
  id: string;
  permission_key: string;
  resource_type: string;
  action_type: string;
  description: string;
  is_active: boolean;
}

interface Role {
  id: string;
  name: string;
  display_name: string;
  permissions: Set<string>; // permission_keys
  inheritedPermissions: Set<string>; // permission_keys inherited from other roles
}

interface PermissionCategory {
  categoryName: string;
  permissions: Permission[];
}

interface PermissionGroup {
  resourceType: string;
  resourceName: string;
  categories: PermissionCategory[];
  expanded: boolean;
}

const AdminPermissionManager: React.FC = () => {
  const { isExecutive, loading: permissionLoading } = usePermission();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [errorModal, setErrorModal] = useState<{ show: boolean; message: string }>({ show: false, message: '' });
  const [successModal, setSuccessModal] = useState<{ show: boolean; message: string }>({ show: false, message: '' });

  // Role inheritance map (matches backend)
  const roleInheritance: { [key: string]: string[] } = {
    executive: ['admin', 'sales', 'technician'],
    admin: ['technician'],
    sales: [],
    technician: []
  };

  // Role display order
  const roleOrder = ['executive', 'admin', 'sales', 'technician'];

  // Load initial data
  useEffect(() => {
    if (!permissionLoading && isExecutive) {
      loadData();
    }
  }, [permissionLoading, isExecutive]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load all permissions and roles with their permissions in parallel (faster!)
      const [allPermissions, rolesData] = await Promise.all([
        permissionService.getAllPermissions(),
        permissionService.getRolesWithPermissions()
      ]);

      setPermissions(allPermissions || []);

      // Build role data structure using data already in rolesData (no additional API calls needed!)
      const rolesWithPerms: Role[] = [];

      for (const roleData of (rolesData?.roles || [])) {
        // Use permissions already in roleData instead of fetching again
        const directPermissions = new Set(
          (roleData.permissions || [])
            .filter((p: any) => p.is_granted)
            .map((p: any) => p.permission_key)
        );

        // Calculate inherited permissions
        const inheritedPerms = new Set<string>();
        const inheritedFrom = roleInheritance[roleData.name] || [];

        for (const inheritedRoleName of inheritedFrom) {
          const inheritedRole = (rolesData?.roles || []).find((r: any) => r.name === inheritedRoleName);
          if (inheritedRole) {
            // Use permissions already in inheritedRole instead of fetching again
            (inheritedRole.permissions || [])
              .filter((p: any) => p.is_granted)
              .forEach((p: any) => {
                if (!directPermissions.has(p.permission_key)) {
                  inheritedPerms.add(p.permission_key);
                }
              });
          }
        }

        rolesWithPerms.push({
          id: roleData.id.toString(),
          name: roleData.name,
          display_name: roleData.displayName || roleData.display_name || roleData.name,
          permissions: directPermissions,
          inheritedPermissions: inheritedPerms
        });
      }

      // Sort roles by hierarchy
      rolesWithPerms.sort((a, b) => roleOrder.indexOf(a.name) - roleOrder.indexOf(b.name));
      setRoles(rolesWithPerms);

      // Group permissions by resource type
      const groups = groupPermissions(allPermissions);
      setPermissionGroups(groups);

      // Expand all groups by default
      const allExpanded = new Set<string>();
      groups.forEach(group => {
        allExpanded.add(group.resourceType);
        group.categories.forEach(category => {
          allExpanded.add(`${group.resourceType}:${category.categoryName}`);
        });
      });
      setExpandedCategories(allExpanded);

      setHasChanges(false);
    } catch (error) {
      setErrorModal({
        show: true,
        message: error instanceof Error ? error.message : 'Failed to load permission data'
      });
    } finally {
      setLoading(false);
    }
  };

  const getActionCategory = (actionType: string): string => {
    if (actionType.includes('view') || actionType.includes('View')) return 'View Operations';
    if (actionType.includes('add') || actionType.includes('Add')) return 'Add Operations';
    if (actionType.includes('modify') || actionType.includes('Modify') || actionType.includes('edit') || actionType.includes('Edit')) return 'Modify Operations';
    if (actionType.includes('delete') || actionType.includes('Delete')) return 'Delete Operations';
    return 'Other Operations';
  };

  const groupPermissions = (perms: Permission[]): PermissionGroup[] => {
    if (!perms || !Array.isArray(perms)) {
      return [];
    }

    const resourceGroups: { [key: string]: Permission[] } = {};

    perms.forEach(perm => {
      if (!resourceGroups[perm.resource_type]) {
        resourceGroups[perm.resource_type] = [];
      }
      resourceGroups[perm.resource_type].push(perm);
    });

    return Object.entries(resourceGroups)
      .map(([resourceType, resourcePerms]) => {
        // Group by action category
        const categoryGroups: { [key: string]: Permission[] } = {};

        resourcePerms.forEach(perm => {
          const category = getActionCategory(perm.action_type);
          if (!categoryGroups[category]) {
            categoryGroups[category] = [];
          }
          categoryGroups[category].push(perm);
        });

        // Convert to categories array
        const categories = Object.entries(categoryGroups).map(([categoryName, categoryPerms]) => ({
          categoryName,
          permissions: categoryPerms.sort((a, b) => a.action_type.localeCompare(b.action_type))
        }));

        // Sort categories (View, Add, Modify, Delete, Other)
        const categoryOrder = ['View Operations', 'Add Operations', 'Modify Operations', 'Delete Operations', 'Other Operations'];
        categories.sort((a, b) => categoryOrder.indexOf(a.categoryName) - categoryOrder.indexOf(b.categoryName));

        return {
          resourceType,
          resourceName: formatResourceName(resourceType),
          categories,
          expanded: true
        };
      })
      .sort((a, b) => a.resourceName.localeCompare(b.resourceName));
  };

  const formatResourceName = (resourceType: string): string => {
    return resourceType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatActionName = (actionType: string): string => {
    return actionType
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const togglePermission = (roleId: string, permissionKey: string) => {
    setRoles(prevRoles => {
      const newRoles = prevRoles.map(role => {
        if (role.id === roleId) {
          const newPermissions = new Set(role.permissions);
          if (newPermissions.has(permissionKey)) {
            newPermissions.delete(permissionKey);
          } else {
            newPermissions.add(permissionKey);
          }
          return { ...role, permissions: newPermissions };
        }
        return role;
      });
      return newRoles;
    });
    setHasChanges(true);
  };

  const hasPermission = (role: Role, permissionKey: string): { has: boolean; inherited: boolean } => {
    if (role.permissions.has(permissionKey)) {
      return { has: true, inherited: false };
    }
    if (role.inheritedPermissions.has(permissionKey)) {
      return { has: true, inherited: true };
    }
    return { has: false, inherited: false };
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Save each role's permissions (except executive - it's immutable)
      for (const role of roles) {
        if (role.name === 'executive') {
          continue; // Skip executive role - it always has all permissions
        }

        await permissionService.updateRolePermissions(
          role.id,
          permissions,
          role.permissions
        );
      }

      setSuccessModal({ show: true, message: 'Role permissions updated successfully!' });
      setHasChanges(false);

      // Reload to refresh inherited permissions
      await loadData();
    } catch (error) {
      setErrorModal({
        show: true,
        message: error instanceof Error ? error.message : 'Failed to save permissions'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    loadData();
    setHasChanges(false);
  };

  const toggleAllPermissionsForRole = (roleId: string, enable: boolean) => {
    setRoles(prevRoles => {
      const newRoles = prevRoles.map(role => {
        if (role.id === roleId) {
          if (enable) {
            // Add all non-inherited permissions
            const allPerms = new Set(role.permissions);
            permissions.forEach(p => {
              if (!role.inheritedPermissions.has(p.permission_key)) {
                allPerms.add(p.permission_key);
              }
            });
            return { ...role, permissions: allPerms };
          } else {
            // Remove all permissions
            return { ...role, permissions: new Set() };
          }
        }
        return role;
      });
      return newRoles;
    });
    setHasChanges(true);
  };

  const toggleResourceGroup = (resourceType: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(resourceType)) {
        newSet.delete(resourceType);
        // Also collapse all categories under this resource
        const group = permissionGroups.find(g => g.resourceType === resourceType);
        if (group) {
          group.categories.forEach(cat => {
            newSet.delete(`${resourceType}:${cat.categoryName}`);
          });
        }
      } else {
        newSet.add(resourceType);
      }
      return newSet;
    });
  };

  const toggleCategory = (resourceType: string, categoryName: string) => {
    const key = `${resourceType}:${categoryName}`;
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    const allExpanded = new Set<string>();
    permissionGroups.forEach(group => {
      allExpanded.add(group.resourceType);
      group.categories.forEach(category => {
        allExpanded.add(`${group.resourceType}:${category.categoryName}`);
      });
    });
    setExpandedCategories(allExpanded);
  };

  const collapseAll = () => {
    setExpandedCategories(new Set());
  };

  // Filter permissions by search
  const filteredGroups = permissionGroups
    .map(group => ({
      ...group,
      categories: group.categories
        .map(category => ({
          ...category,
          permissions: category.permissions.filter(perm =>
            searchQuery === '' ||
            perm.action_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
            perm.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            group.resourceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            category.categoryName.toLowerCase().includes(searchQuery.toLowerCase())
          )
        }))
        .filter(category => category.permissions.length > 0)
    }))
    .filter(group => group.categories.length > 0);

  if (permissionLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className={`animate-spin rounded-full h-12 w-12 border-b-2 ${themeClasses.border.focus} mx-auto`}></div>
          <p className={`mt-4 ${themeClasses.text.secondary}`}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!isExecutive) {
    return (
      <div className={`bg-yellow-50 dark:bg-yellow-900/20 border ${themeClasses.border.primary} rounded-lg p-6 text-center`}>
        <AlertCircle className={`w-12 h-12 ${themeClasses.text.warning} mx-auto mb-4`} />
        <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-2`}>Access Denied</h3>
        <p className={themeClasses.text.secondary}>
          Only users with the <strong>Executive</strong> role can manage permissions.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className={`animate-spin rounded-full h-12 w-12 border-b-2 ${themeClasses.border.focus} mx-auto`}></div>
          <p className={`mt-4 ${themeClasses.text.secondary}`}>Loading permission data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${themeClasses.bg.card} rounded-lg ${themeClasses.shadow.sm} border ${themeClasses.border.primary} p-6`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className={`w-6 h-6 ${themeClasses.text.accent}`} />
          <div>
            <h2 className={`text-xl font-bold ${themeClasses.text.primary}`}>Permission Matrix</h2>
            <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
              Manage permissions for all roles in one view
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <button
              onClick={handleReset}
              disabled={saving}
              className={`flex items-center gap-2 px-4 py-2 border ${themeClasses.border.primary} ${themeClasses.text.secondary} rounded-lg hover:${themeClasses.bg.hover} disabled:opacity-50 transition-colors`}
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`flex items-center gap-2 px-6 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium ${
              hasChanges ? 'ring-2 ring-green-300 dark:ring-green-800' : ''
            }`}
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes {hasChanges && '(*)'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Instructions */}
      <div className={`mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r`}>
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className={`text-sm font-semibold ${themeClasses.text.primary} mb-1`}>How to use:</h3>
            <ul className={`text-sm ${themeClasses.text.secondary} space-y-1 list-disc list-inside`}>
              <li>Click folder icons to expand/collapse permission groups</li>
              <li>Check/uncheck boxes to grant or revoke permissions for each role</li>
              <li>Use column header buttons to select/deselect all permissions for a role</li>
              <li>Grayed checkboxes with lock icons are inherited from other roles</li>
              <li>Changes are highlighted - click "Save Changes" when ready</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Search Bar & Controls */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${themeClasses.text.muted}`} />
          <input
            type="text"
            placeholder="Search permissions by name or resource..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-10 pr-4 py-2 border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} rounded-lg focus:ring-2 ${themeClasses.ring.primary} focus:border-transparent`}
          />
        </div>
        <button
          onClick={expandAll}
          className={`px-4 py-2 border ${themeClasses.border.primary} ${themeClasses.text.secondary} rounded-lg hover:${themeClasses.bg.hover} transition-colors whitespace-nowrap`}
        >
          Expand All
        </button>
        <button
          onClick={collapseAll}
          className={`px-4 py-2 border ${themeClasses.border.primary} ${themeClasses.text.secondary} rounded-lg hover:${themeClasses.bg.hover} transition-colors whitespace-nowrap`}
        >
          Collapse All
        </button>
      </div>

      {/* Permission Matrix Table */}
      <div className={`border ${themeClasses.border.primary} rounded-lg overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            {/* Table Header */}
            <thead className={`${themeClasses.bg.tertiary} sticky top-0 z-10`}>
              <tr>
                <th className={`px-4 py-3 text-left ${themeClasses.text.primary} font-semibold border-r ${themeClasses.border.primary} min-w-[350px]`}>
                  Permission
                </th>
                {roles.map(role => (
                  <th
                    key={role.id}
                    className={`px-4 py-3 text-center ${themeClasses.text.primary} font-semibold border-r ${themeClasses.border.primary} min-w-[140px] ${
                      role.name === 'executive' ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex items-center gap-2">
                        <div className="font-bold">{role.display_name}</div>
                        {role.name === 'executive' && (
                          <Lock className="w-4 h-4 text-blue-500" title="Executive role always has all permissions" />
                        )}
                      </div>
                      <div className="text-xs font-normal">
                        <span className={themeClasses.text.success}>
                          {role.permissions.size}
                        </span>
                        {role.inheritedPermissions.size > 0 && (
                          <span className={themeClasses.text.tertiary}>
                            {' '}+ {role.inheritedPermissions.size} inherited
                          </span>
                        )}
                      </div>
                      {role.name !== 'executive' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => toggleAllPermissionsForRole(role.id, true)}
                            className={`text-xs px-2 py-1 rounded ${themeClasses.bg.primary} hover:${themeClasses.bg.hover} ${themeClasses.text.secondary} border ${themeClasses.border.primary}`}
                            title="Select all"
                          >
                            All
                          </button>
                          <button
                            onClick={() => toggleAllPermissionsForRole(role.id, false)}
                            className={`text-xs px-2 py-1 rounded ${themeClasses.bg.primary} hover:${themeClasses.bg.hover} ${themeClasses.text.secondary} border ${themeClasses.border.primary}`}
                            title="Clear all"
                          >
                            None
                          </button>
                        </div>
                      )}
                      {role.name === 'executive' && (
                        <div className="text-xs text-blue-600 dark:text-blue-400">
                          Read-only
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody>
              {filteredGroups.map((group) => {
                const isResourceExpanded = expandedCategories.has(group.resourceType);
                const totalPermissions = group.categories.reduce((sum, cat) => sum + cat.permissions.length, 0);

                return (
                  <React.Fragment key={group.resourceType}>
                    {/* Resource Group Header */}
                    <tr className={`${themeClasses.bg.secondary} border-t-2 ${themeClasses.border.primary}`}>
                      <td
                        colSpan={roles.length + 1}
                        className="px-4 py-2"
                      >
                        <button
                          onClick={() => toggleResourceGroup(group.resourceType)}
                          className="flex items-center gap-2 w-full hover:opacity-75 transition-opacity"
                        >
                          {isResourceExpanded ? (
                            <FolderOpen className={`w-5 h-5 ${themeClasses.text.accent}`} />
                          ) : (
                            <Folder className={`w-5 h-5 ${themeClasses.text.accent}`} />
                          )}
                          {isResourceExpanded ? (
                            <ChevronDown className={`w-5 h-5 ${themeClasses.text.tertiary}`} />
                          ) : (
                            <ChevronRight className={`w-5 h-5 ${themeClasses.text.tertiary}`} />
                          )}
                          <span className={`font-semibold ${themeClasses.text.primary}`}>
                            {group.resourceName}
                          </span>
                          <span className={`text-sm ${themeClasses.text.tertiary}`}>
                            ({totalPermissions} permissions)
                          </span>
                        </button>
                      </td>
                    </tr>

                    {/* Categories and Permissions */}
                    {isResourceExpanded && group.categories.map((category) => {
                      const categoryKey = `${group.resourceType}:${category.categoryName}`;
                      const isCategoryExpanded = expandedCategories.has(categoryKey);

                      return (
                        <React.Fragment key={categoryKey}>
                          {/* Category Header */}
                          <tr className={`${themeClasses.bg.tertiary} border-t ${themeClasses.border.primary}`}>
                            <td
                              colSpan={roles.length + 1}
                              className="px-4 py-2 pl-12"
                            >
                              <button
                                onClick={() => toggleCategory(group.resourceType, category.categoryName)}
                                className="flex items-center gap-2 w-full hover:opacity-75 transition-opacity"
                              >
                                {isCategoryExpanded ? (
                                  <ChevronDown className={`w-4 h-4 ${themeClasses.text.tertiary}`} />
                                ) : (
                                  <ChevronRight className={`w-4 h-4 ${themeClasses.text.tertiary}`} />
                                )}
                                <span className={`text-sm font-medium ${themeClasses.text.secondary}`}>
                                  {category.categoryName}
                                </span>
                                <span className={`text-xs ${themeClasses.text.tertiary}`}>
                                  ({category.permissions.length})
                                </span>
                              </button>
                            </td>
                          </tr>

                          {/* Permission Rows */}
                          {isCategoryExpanded && category.permissions.map((permission) => (
                            <tr
                              key={permission.id}
                              className={`border-t ${themeClasses.border.primary} hover:${themeClasses.bg.hover} transition-colors`}
                            >
                              {/* Permission Name & Description */}
                              <td className={`px-4 py-3 pl-20 border-r ${themeClasses.border.primary}`}>
                                <div>
                                  <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                                    {formatActionName(permission.action_type)}
                                  </div>
                                  <div className={`text-xs ${themeClasses.text.tertiary} mt-0.5`}>
                                    {permission.description}
                                  </div>
                                  <code className={`text-xs ${themeClasses.text.muted} mt-1 block`}>
                                    {permission.permission_key}
                                  </code>
                                </div>
                              </td>

                              {/* Role Checkboxes */}
                              {roles.map(role => {
                                const permState = hasPermission(role, permission.permission_key);
                                const isInherited = permState.inherited;
                                const isChecked = permState.has;
                                const isExecutive = role.name === 'executive';

                                return (
                                  <td
                                    key={role.id}
                                    className={`px-4 py-3 text-center border-r ${themeClasses.border.primary} ${
                                      isExecutive ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                                    }`}
                                  >
                                    {isExecutive ? (
                                      <div className="flex items-center justify-center gap-1" title="Executive role always has all permissions (read-only)">
                                        <CheckSquare className={`w-5 h-5 text-blue-500 opacity-60`} />
                                        <Lock className={`w-3 h-3 text-blue-500`} />
                                      </div>
                                    ) : isInherited ? (
                                      <div className="flex items-center justify-center gap-1" title="Inherited from other role">
                                        <CheckSquare className={`w-5 h-5 ${themeClasses.text.accent} opacity-50`} />
                                        <Lock className={`w-3 h-3 ${themeClasses.text.accent}`} />
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => togglePermission(role.id, permission.permission_key)}
                                        className="mx-auto hover:scale-110 transition-transform"
                                      >
                                        {isChecked ? (
                                          <CheckSquare className={`w-5 h-5 ${themeClasses.text.success} hover:text-green-800 dark:hover:text-green-600`} />
                                        ) : (
                                          <Square className={`w-5 h-5 ${themeClasses.text.muted} hover:${themeClasses.text.secondary}`} />
                                        )}
                                      </button>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}

              {filteredGroups.length === 0 && (
                <tr>
                  <td colSpan={roles.length + 1} className={`px-4 py-12 text-center ${themeClasses.text.tertiary}`}>
                    No permissions found matching "{searchQuery}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className={`mt-4 p-4 ${themeClasses.bg.secondary} rounded-lg`}>
        <h4 className={`text-sm font-semibold ${themeClasses.text.secondary} mb-2`}>Legend:</h4>
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm ${themeClasses.text.tertiary}`}>
          <div className="flex items-center gap-2">
            <CheckSquare className={`w-4 h-4 ${themeClasses.text.success}`} />
            <span>Direct permission (can be changed)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <CheckSquare className={`w-4 h-4 ${themeClasses.text.accent} opacity-50`} />
              <Lock className={`w-3 h-3 ${themeClasses.text.accent}`} />
            </div>
            <span>Inherited permission (automatic)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <CheckSquare className={`w-4 h-4 text-blue-500 opacity-60`} />
              <Lock className={`w-3 h-3 text-blue-500`} />
            </div>
            <span>Executive role (read-only, has all)</span>
          </div>
          <div className="flex items-center gap-2">
            <Square className={`w-4 h-4 ${themeClasses.text.muted}`} />
            <span>No permission</span>
          </div>
        </div>
      </div>

      {/* Save Reminder at Bottom */}
      {hasChanges && (
        <div className={`mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 rounded-r`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                You have unsaved changes. Click "Save Changes" to apply them.
              </p>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 disabled:opacity-50 transition-colors font-medium"
            >
              <Save className="w-4 h-4" />
              Save Now
            </button>
          </div>
        </div>
      )}

      {/* Error Modal */}
      <AlertModal
        isOpen={errorModal.show}
        onClose={() => setErrorModal({ show: false, message: '' })}
        title="Error"
        message={errorModal.message}
        type="error"
      />

      {/* Success Modal */}
      <AlertModal
        isOpen={successModal.show}
        onClose={() => setSuccessModal({ show: false, message: '' })}
        title="Success"
        message={successModal.message}
        type="success"
      />
    </div>
  );
};

export default AdminPermissionManager;
