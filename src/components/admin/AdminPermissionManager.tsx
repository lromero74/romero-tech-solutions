/**
 * Admin Permission Manager
 *
 * Executive-only component for managing role permissions with inheritance visualization.
 * Features:
 * - Hierarchical permission tree (Resource > Operation Category > Permission)
 * - Search/filter permissions
 * - Multi-select with parent-child propagation
 * - Inheritance visualization (inherited permissions shown but disabled)
 * - Role selector to manage permissions for different roles
 *
 * Usage:
 *   <AdminPermissionManager />
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckSquare,
  Square,
  MinusSquare,
  ChevronRight,
  ChevronDown,
  Search,
  Shield,
  Save,
  X,
  AlertCircle,
  Info,
  Copy,
  CheckCircle,
  RotateCcw
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
}

interface PermissionNode {
  id: string;
  name: string;
  description?: string;
  permissionKey?: string;
  children?: PermissionNode[];
  level: 'resource' | 'category' | 'permission';
  selected: boolean;
  indeterminate: boolean;
  inherited?: boolean; // If this permission comes from role inheritance
  inheritedFrom?: string; // Which role it's inherited from
}

const AdminPermissionManager: React.FC = () => {
  const { isExecutive, loading: permissionLoading } = usePermission();
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [permissionTree, setPermissionTree] = useState<PermissionNode[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [inheritedPermissions, setInheritedPermissions] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorModal, setErrorModal] = useState<{ show: boolean; message: string }>({ show: false, message: '' });
  const [successModal, setSuccessModal] = useState<{ show: boolean; message: string }>({ show: false, message: '' });

  // Role inheritance map (matches backend permissionService.js)
  const roleInheritance: { [key: string]: string[] } = {
    executive: ['admin', 'sales', 'technician'],
    admin: ['technician'],
    sales: [],
    technician: []
  };

  // Load initial data
  useEffect(() => {
    if (!permissionLoading && isExecutive) {
      loadInitialData();
    }
  }, [permissionLoading, isExecutive]);

  const loadInitialData = async () => {
    try {
      setLoading(true);

      // Load roles
      const rolesData = await permissionService.getRolesWithPermissions();
      setRoles(rolesData.roles);

      // Load all permissions
      const permsData = await permissionService.getAllPermissions();
      setPermissions(permsData.permissions);

      // Set initial role to admin
      if (rolesData.roles.length > 0) {
        const adminRole = rolesData.roles.find((r: Role) => r.name === 'admin');
        if (adminRole) {
          setSelectedRole(adminRole.id);
        } else {
          setSelectedRole(rolesData.roles[0].id);
        }
      }
    } catch (error) {
      setErrorModal({
        show: true,
        message: error instanceof Error ? error.message : 'Failed to load permission data'
      });
    } finally {
      setLoading(false);
    }
  };

  // Load role permissions when role changes
  useEffect(() => {
    if (selectedRole && permissions && permissions.length > 0) {
      loadRolePermissions(selectedRole);
    }
  }, [selectedRole, permissions]);

  const loadRolePermissions = async (roleId: string) => {
    try {
      const roleData = await permissionService.getRolePermissions(roleId);
      const role = roles.find(r => r.id === roleId);

      // Get direct permissions for this role
      const directPermissionKeys = new Set(roleData.permissions.map((p: Permission) => p.permission_key));
      setSelectedPermissions(directPermissionKeys);

      // Calculate inherited permissions
      if (role) {
        const inheritedRoles = roleInheritance[role.name] || [];
        const inheritedPerms = new Set<string>();

        for (const inheritedRoleName of inheritedRoles) {
          const inheritedRole = roles.find(r => r.name === inheritedRoleName);
          if (inheritedRole) {
            const inheritedRoleData = await permissionService.getRolePermissions(inheritedRole.id);
            inheritedRoleData.permissions.forEach((p: Permission) => {
              inheritedPerms.add(p.permission_key);
            });
          }
        }

        setInheritedPermissions(inheritedPerms);
      }

      // Build permission tree
      buildPermissionTree(permissions, directPermissionKeys, inheritedPerms);
    } catch (error) {
      setErrorModal({
        show: true,
        message: error instanceof Error ? error.message : 'Failed to load role permissions'
      });
    }
  };

  const buildPermissionTree = (
    perms: Permission[],
    selected: Set<string>,
    inherited: Set<string>
  ) => {
    // Group permissions by resource type
    const resourceGroups: { [key: string]: Permission[] } = {};

    perms.forEach(perm => {
      if (!resourceGroups[perm.resource_type]) {
        resourceGroups[perm.resource_type] = [];
      }
      resourceGroups[perm.resource_type].push(perm);
    });

    // Build tree structure
    const tree: PermissionNode[] = Object.entries(resourceGroups).map(([resourceType, resourcePerms]) => {
      // Group by action category
      const actionCategories: { [key: string]: Permission[] } = {};

      resourcePerms.forEach(perm => {
        const category = getActionCategory(perm.action_type);
        if (!actionCategories[category]) {
          actionCategories[category] = [];
        }
        actionCategories[category].push(perm);
      });

      // Build category nodes
      const categoryNodes: PermissionNode[] = Object.entries(actionCategories).map(([category, categoryPerms]) => {
        // Build permission leaf nodes
        const permissionNodes: PermissionNode[] = categoryPerms.map(perm => {
          const isInherited = inherited.has(perm.permission_key) && !selected.has(perm.permission_key);
          return {
            id: perm.id,
            name: formatPermissionName(perm.action_type),
            description: perm.description,
            permissionKey: perm.permission_key,
            level: 'permission' as const,
            selected: selected.has(perm.permission_key),
            indeterminate: false,
            inherited: isInherited,
            inheritedFrom: isInherited ? getInheritedFromRole(perm.permission_key) : undefined
          };
        });

        // Calculate category selection state
        const selectedCount = permissionNodes.filter(n => n.selected).length;
        const categorySelected = selectedCount === permissionNodes.length && permissionNodes.length > 0;
        const categoryIndeterminate = selectedCount > 0 && selectedCount < permissionNodes.length;

        return {
          id: `${resourceType}-${category}`,
          name: category,
          level: 'category' as const,
          children: permissionNodes,
          selected: categorySelected,
          indeterminate: categoryIndeterminate
        };
      });

      // Calculate resource selection state
      const allPermissionNodes = categoryNodes.flatMap(cat => cat.children || []);
      const selectedCount = allPermissionNodes.filter(n => n.selected).length;
      const resourceSelected = selectedCount === allPermissionNodes.length && allPermissionNodes.length > 0;
      const resourceIndeterminate = selectedCount > 0 && selectedCount < allPermissionNodes.length;

      return {
        id: resourceType,
        name: formatResourceName(resourceType),
        level: 'resource' as const,
        children: categoryNodes,
        selected: resourceSelected,
        indeterminate: resourceIndeterminate
      };
    });

    setPermissionTree(tree);
  };

  const rebuildTree = (selected: Set<string>, inherited: Set<string>) => {
    buildPermissionTree(permissions, selected, inherited);
  };

  const getActionCategory = (actionType: string): string => {
    if (actionType.includes('add')) return 'Add Operations';
    if (actionType.includes('modify')) return 'Modify Operations';
    if (actionType.includes('delete') || actionType.includes('Delete')) {
      return 'Delete Operations';
    }
    if (actionType.includes('view')) return 'View Operations';
    return 'Other Operations';
  };

  const formatResourceName = (resourceType: string): string => {
    return resourceType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatPermissionName = (actionType: string): string => {
    return actionType
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getInheritedFromRole = (permissionKey: string): string => {
    const role = roles.find(r => r.id === selectedRole);
    if (!role) return '';

    const inheritedRoles = roleInheritance[role.name] || [];
    return inheritedRoles.join(', ');
  };

  const handleNodeToggle = (node: PermissionNode, path: number[]) => {
    const newSelected = new Set(selectedPermissions);

    if (node.level === 'permission') {
      // Toggle leaf node
      if (node.permissionKey) {
        if (newSelected.has(node.permissionKey)) {
          newSelected.delete(node.permissionKey);
        } else {
          newSelected.add(node.permissionKey);
        }
      }
    } else {
      // Toggle parent node - propagate to all children
      const newState = !node.selected && !node.indeterminate;
      toggleNodeChildren(node, newState, newSelected);
    }

    setSelectedPermissions(newSelected);
    buildPermissionTree(permissions, newSelected, inheritedPermissions);
  };

  const toggleNodeChildren = (node: PermissionNode, select: boolean, selectedSet: Set<string>) => {
    if (node.level === 'permission' && node.permissionKey) {
      if (select) {
        selectedSet.add(node.permissionKey);
      } else {
        selectedSet.delete(node.permissionKey);
      }
    }

    if (node.children) {
      node.children.forEach(child => toggleNodeChildren(child, select, selectedSet));
    }
  };

  const handleSave = async () => {
    if (!selectedRole) {
      setErrorModal({ show: true, message: 'Please select a role first' });
      return;
    }

    try {
      setSaving(true);

      // Get permission IDs from selected keys
      const selectedPermissionIds = permissions
        .filter(p => selectedPermissions.has(p.permission_key))
        .map(p => p.id);

      await permissionService.updateRolePermissions(selectedRole, selectedPermissionIds);

      setSuccessModal({ show: true, message: 'Role permissions updated successfully!' });

      // Reload role permissions
      await loadRolePermissions(selectedRole);
    } catch (error) {
      setErrorModal({
        show: true,
        message: error instanceof Error ? error.message : 'Failed to save role permissions'
      });
    } finally {
      setSaving(false);
    }
  };

  // Bulk operation: Copy permissions from another role
  const handleCopyFromRole = async (sourceRoleName: string) => {
    if (!selectedRole || sourceRoleName === selectedRole) {
      return;
    }

    try {
      // Find the source role's permissions
      const sourceRoleData = roles.find(r => r.name === sourceRoleName);
      if (!sourceRoleData) {
        setErrorModal({ show: true, message: 'Source role not found' });
        return;
      }

      // Load permissions for source role
      const sourcePermissionsData = await permissionService.getRolePermissions(sourceRoleName);
      const sourcePermissionKeys = new Set(sourcePermissionsData.permissions.map((p: Permission) => p.permission_key));

      // Merge with current selections
      const merged = new Set([...selectedPermissions, ...sourcePermissionKeys]);
      setSelectedPermissions(merged);
      rebuildTree(merged, inheritedPermissions);

      setSuccessModal({ show: true, message: `Copied ${sourcePermissionKeys.size} permissions from ${sourceRoleName}` });
    } catch (error) {
      setErrorModal({
        show: true,
        message: error instanceof Error ? error.message : 'Failed to copy permissions'
      });
    }
  };

  // Bulk operation: Select all permissions in a category
  const handleSelectAllInCategory = (categoryNode: PermissionNode) => {
    const newSelections = new Set(selectedPermissions);

    // Add all non-inherited permissions in this category
    if (categoryNode.children) {
      categoryNode.children.forEach(permNode => {
        if (permNode.permissionKey && !permNode.inherited) {
          newSelections.add(permNode.permissionKey);
        }
      });
    }

    setSelectedPermissions(newSelections);
    rebuildTree(newSelections, inheritedPermissions);
  };

  // Bulk operation: Deselect all permissions in a category
  const handleDeselectAllInCategory = (categoryNode: PermissionNode) => {
    const newSelections = new Set(selectedPermissions);

    // Remove all permissions in this category
    if (categoryNode.children) {
      categoryNode.children.forEach(permNode => {
        if (permNode.permissionKey) {
          newSelections.delete(permNode.permissionKey);
        }
      });
    }

    setSelectedPermissions(newSelections);
    rebuildTree(newSelections, inheritedPermissions);
  };

  // Bulk operation: Reset to default role permissions
  const handleResetToDefault = async () => {
    if (!selectedRole) {
      return;
    }

    try {
      // Reload fresh from database
      await loadRolePermissions(selectedRole);
      setSuccessModal({ show: true, message: 'Permissions reset to saved state' });
    } catch (error) {
      setErrorModal({
        show: true,
        message: error instanceof Error ? error.message : 'Failed to reset permissions'
      });
    }
  };

  const renderCheckbox = (node: PermissionNode, path: number[]) => {
    if (node.inherited) {
      // Inherited permissions shown as checked but disabled
      return (
        <div className="relative" title={`Inherited from ${node.inheritedFrom}`}>
          <CheckSquare className={`w-5 h-5 ${themeClasses.text.accent} opacity-50`} />
          <Info className={`w-3 h-3 ${themeClasses.text.accent} absolute -top-1 -right-1`} />
        </div>
      );
    }

    if (node.indeterminate) {
      return (
        <MinusSquare
          className={`w-5 h-5 ${themeClasses.text.secondary} cursor-pointer hover:${themeClasses.text.primary}`}
          onClick={() => handleNodeToggle(node, path)}
        />
      );
    }

    if (node.selected) {
      return (
        <CheckSquare
          className={`w-5 h-5 ${themeClasses.text.success} cursor-pointer hover:text-green-800 dark:hover:text-green-600`}
          onClick={() => handleNodeToggle(node, path)}
        />
      );
    }

    return (
      <Square
        className={`w-5 h-5 ${themeClasses.text.muted} cursor-pointer hover:${themeClasses.text.secondary}`}
        onClick={() => handleNodeToggle(node, path)}
      />
    );
  };

  // Separate component for tree nodes to properly use hooks
  const PermissionTreeNode: React.FC<{
    node: PermissionNode;
    path: number[];
    depth: number;
    searchQuery: string;
    onToggle: (node: PermissionNode, path: number[]) => void;
    renderCheckbox: (node: PermissionNode, path: number[]) => JSX.Element;
  }> = ({ node, path, depth, searchQuery, onToggle, renderCheckbox }) => {
    const [expanded, setExpanded] = useState(true);

    // Filter by search query
    if (searchQuery) {
      const matchesSearch =
        node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const hasMatchingChildren = node.children?.some(child =>
        child.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        child.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );

      if (!matchesSearch && !hasMatchingChildren) {
        return null;
      }
    }

    return (
      <div key={node.id} className="w-full">
        <div
          className={`flex items-center gap-2 py-2 px-3 ${themeClasses.bg.hover} rounded ${
            depth === 0 ? 'font-semibold' : depth === 1 ? 'font-medium' : ''
          }`}
          style={{ paddingLeft: `${depth * 24 + 12}px` }}
        >
          {node.children && node.children.length > 0 && (
            <button onClick={() => setExpanded(!expanded)} className="p-0.5">
              {expanded ? (
                <ChevronDown className={`w-4 h-4 ${themeClasses.text.tertiary}`} />
              ) : (
                <ChevronRight className={`w-4 h-4 ${themeClasses.text.tertiary}`} />
              )}
            </button>
          )}

          {!node.children && <div className="w-5" />}

          {renderCheckbox(node, path)}

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={node.inherited ? themeClasses.text.accent : themeClasses.text.primary}>
                {node.name}
              </span>
              {node.inherited && (
                <span className={`text-xs ${themeClasses.text.accent} bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded`}>
                  Inherited
                </span>
              )}
            </div>
            {node.description && (
              <div className={`text-xs ${themeClasses.text.tertiary} mt-0.5`}>{node.description}</div>
            )}
          </div>
        </div>

        {expanded && node.children && (
          <div>
            {node.children.map((child, index) => (
              <PermissionTreeNode
                key={child.id}
                node={child}
                path={[...path, index]}
                depth={depth + 1}
                searchQuery={searchQuery}
                onToggle={onToggle}
                renderCheckbox={renderCheckbox}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className={`w-6 h-6 ${themeClasses.text.accent}`} />
          <h2 className={`text-xl font-bold ${themeClasses.text.primary}`}>Permission Management</h2>
        </div>
      </div>

      {/* Role Selector */}
      <div className="mb-6">
        <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
          Select Role to Manage
        </label>
        <select
          value={selectedRole}
          onChange={(e) => setSelectedRole(e.target.value)}
          className={`w-full max-w-md px-3 py-2 border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} rounded-lg focus:ring-2 ${themeClasses.ring.primary} focus:border-transparent`}
          disabled={saving}
        >
          <option value="">Choose a role...</option>
          {roles && roles.map(role => (
            <option key={role.id} value={role.id}>
              {role.display_name}
            </option>
          ))}
        </select>
      </div>

      {selectedRole && (
        <>
          {/* Search Bar */}
          <div className="mb-4">
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${themeClasses.text.muted}`} />
              <input
                type="text"
                placeholder="Search permissions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} rounded-lg focus:ring-2 ${themeClasses.ring.primary} focus:border-transparent`}
              />
            </div>
          </div>

          {/* Permission Tree */}
          <div className={`border ${themeClasses.border.primary} rounded-lg max-h-[600px] overflow-y-auto mb-4`}>
            {permissionTree.length > 0 ? (
              <div className="py-2">
                {permissionTree.map((node, index) => (
                  <PermissionTreeNode
                    key={node.id}
                    node={node}
                    path={[index]}
                    depth={0}
                    searchQuery={searchQuery}
                    onToggle={handleNodeToggle}
                    renderCheckbox={renderCheckbox}
                  />
                ))}
              </div>
            ) : (
              <div className={`text-center py-12 ${themeClasses.text.tertiary}`}>
                No permissions found
              </div>
            )}
          </div>

          {/* Bulk Operations */}
          <div className={`p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border ${themeClasses.border.primary} mb-4`}>
            <h4 className={`text-sm font-semibold ${themeClasses.text.secondary} mb-3`}>Bulk Operations</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {/* Copy from Role */}
              <div>
                <label className={`block text-xs ${themeClasses.text.tertiary} mb-1`}>Copy From Role:</label>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleCopyFromRole(e.target.value);
                      e.target.value = ''; // Reset dropdown
                    }
                  }}
                  className={`w-full px-3 py-2 text-sm border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} rounded-lg hover:border-blue-400 dark:hover:border-blue-500 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 ${themeClasses.ring.primary}`}
                  disabled={!selectedRole}
                >
                  <option value="">Select a role...</option>
                  {roles
                    .filter(r => r.name !== selectedRole)
                    .map(role => (
                      <option key={role.id} value={role.name}>
                        {role.display_name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Select All */}
              <button
                onClick={() => {
                  // Select all non-inherited permissions
                  const allPerms = new Set<string>();
                  permissions.forEach(p => {
                    if (!inheritedPermissions.has(p.permission_key)) {
                      allPerms.add(p.permission_key);
                    }
                  });
                  setSelectedPermissions(allPerms);
                  rebuildTree(allPerms, inheritedPermissions);
                }}
                disabled={!selectedRole}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Select All
              </button>

              {/* Reset to Default */}
              <button
                onClick={handleResetToDefault}
                disabled={!selectedRole}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm bg-orange-600 dark:bg-orange-700 text-white rounded-lg hover:bg-orange-700 dark:hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Reset to Saved
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className={`flex items-center justify-between pt-4 border-t ${themeClasses.border.primary}`}>
            <div className={`text-sm ${themeClasses.text.secondary}`}>
              <span className="font-medium">{selectedPermissions.size}</span> direct permissions selected
              {inheritedPermissions.size > 0 && (
                <> + <span className="font-medium">{inheritedPermissions.size}</span> inherited</>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Permissions
                </>
              )}
            </button>
          </div>

          {/* Legend */}
          <div className={`mt-4 p-4 ${themeClasses.bg.secondary} rounded-lg`}>
            <h4 className={`text-sm font-semibold ${themeClasses.text.secondary} mb-2`}>Legend:</h4>
            <div className={`grid grid-cols-3 gap-4 text-xs ${themeClasses.text.tertiary}`}>
              <div className="flex items-center gap-2">
                <CheckSquare className={`w-4 h-4 ${themeClasses.text.success}`} />
                <span>Direct Permission</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <CheckSquare className={`w-4 h-4 ${themeClasses.text.accent} opacity-50`} />
                  <Info className={`w-2 h-2 ${themeClasses.text.accent} absolute -top-0.5 -right-0.5`} />
                </div>
                <span>Inherited Permission</span>
              </div>
              <div className="flex items-center gap-2">
                <MinusSquare className={`w-4 h-4 ${themeClasses.text.secondary}`} />
                <span>Partially Selected</span>
              </div>
            </div>
          </div>
        </>
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