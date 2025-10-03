import React, { useState, useEffect } from 'react';
import { themeClasses } from '../../contexts/ThemeContext';
import { ArrowDown, Shield, Users, Building, CheckCircle, Info } from 'lucide-react';
import { permissionService } from '../../services/permissionService';

interface Role {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
}

interface Permission {
  id: number;
  permission_key: string;
  action_type: string;
  resource_type: string;
  description: string;
  is_active: boolean;
}

interface RoleWithPermissions {
  role: Role;
  permissions: Permission[];
  inheritedFrom: string[];
}

const AdminRoleHierarchy: React.FC = () => {
  const [rolesData, setRolesData] = useState<RoleWithPermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  useEffect(() => {
    fetchRoleHierarchy();
  }, []);

  const fetchRoleHierarchy = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await permissionService.getRolesWithPermissions();

      // Build hierarchy with inheritance information
      const hierarchy = buildHierarchy(data.roles);
      setRolesData(hierarchy);
    } catch (err) {
      console.error('Error fetching role hierarchy:', err);
      setError(err instanceof Error ? err.message : 'Failed to load role hierarchy');
    } finally {
      setLoading(false);
    }
  };

  const buildHierarchy = (roles: any[]): RoleWithPermissions[] => {
    // Define inheritance structure
    const inheritanceMap: Record<string, string[]> = {
      'executive': ['admin', 'sales', 'technician'],
      'admin': ['technician'],
      'sales': [],
      'technician': []
    };

    // Sort roles by hierarchy level (top to bottom)
    const roleOrder = ['executive', 'admin', 'sales', 'technician'];
    const sortedRoles = roles.sort((a, b) => {
      return roleOrder.indexOf(a.name) - roleOrder.indexOf(b.name);
    });

    // Convert flat structure to expected format with inheritance information
    return sortedRoles.map(roleData => ({
      role: {
        id: roleData.id,
        name: roleData.name,
        description: roleData.description,
        is_active: roleData.isActive
      },
      permissions: roleData.permissions || [],
      inheritedFrom: inheritanceMap[roleData.name] || []
    }));
  };

  const getRoleIcon = (roleName: string) => {
    switch (roleName) {
      case 'executive':
        return <Shield className="w-6 h-6 text-purple-500" />;
      case 'admin':
        return <Users className="w-6 h-6 text-blue-500" />;
      case 'sales':
        return <Building className="w-6 h-6 text-green-500" />;
      case 'technician':
        return <CheckCircle className="w-6 h-6 text-orange-500" />;
      default:
        return <Shield className="w-6 h-6 text-gray-500" />;
    }
  };

  const getRoleColor = (roleName: string) => {
    switch (roleName) {
      case 'executive':
        return 'border-purple-500 bg-purple-50 dark:bg-purple-900/20';
      case 'admin':
        return 'border-blue-500 bg-blue-50 dark:bg-blue-900/20';
      case 'sales':
        return 'border-green-500 bg-green-50 dark:bg-green-900/20';
      case 'technician':
        return 'border-orange-500 bg-orange-50 dark:bg-orange-900/20';
      default:
        return 'border-gray-500 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  const getRoleTextColor = (roleName: string) => {
    switch (roleName) {
      case 'executive':
        return 'text-purple-600 dark:text-purple-400';
      case 'admin':
        return 'text-blue-600 dark:text-blue-400';
      case 'sales':
        return 'text-green-600 dark:text-green-400';
      case 'technician':
        return 'text-orange-600 dark:text-orange-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getPermissionsByCategory = (permissions: Permission[]) => {
    const categories: Record<string, Permission[]> = {};
    permissions.forEach(perm => {
      const category = perm.resource_type;
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(perm);
    });
    return categories;
  };

  const formatResourceName = (resourceType: string) => {
    return resourceType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatActionType = (actionType: string) => {
    return actionType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (loading) {
    return (
      <div className={`p-6 ${themeClasses.bg.primary}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className={themeClasses.text.secondary}>Loading role hierarchy...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-6 ${themeClasses.bg.primary}`}>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong className="font-bold">Error: </strong>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 ${themeClasses.bg.primary}`}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-8 h-8 text-blue-500" />
          <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Role Hierarchy</h1>
        </div>
        <div className={`p-4 ${themeClasses.bg.secondary} rounded-lg border ${themeClasses.border.primary} flex items-start gap-3`}>
          <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className={`text-sm ${themeClasses.text.primary} mb-1`}>
              <strong>Permission Inheritance:</strong> Higher-level roles automatically inherit permissions from lower-level roles.
            </p>
            <p className={`text-sm ${themeClasses.text.secondary}`}>
              Click on a role to view its permissions. Inherited permissions are marked with "Inherited from [Role]".
            </p>
          </div>
        </div>
      </div>

      {/* Hierarchy Diagram */}
      <div className="flex flex-col items-center gap-6 mb-8">
        {rolesData.map((roleData, index) => (
          <React.Fragment key={roleData.role.id}>
            {/* Role Card */}
            <div
              className={`w-full max-w-md cursor-pointer transition-all ${
                selectedRole === roleData.role.name ? 'scale-105' : 'hover:scale-102'
              }`}
              onClick={() => setSelectedRole(selectedRole === roleData.role.name ? null : roleData.role.name)}
            >
              <div
                className={`p-6 rounded-lg border-2 ${getRoleColor(roleData.role.name)} ${themeClasses.shadow.md}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    {getRoleIcon(roleData.role.name)}
                    <h2 className={`text-2xl font-bold ${getRoleTextColor(roleData.role.name)}`}>
                      {roleData.role.name.charAt(0).toUpperCase() + roleData.role.name.slice(1)}
                    </h2>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRoleTextColor(roleData.role.name)} ${themeClasses.bg.secondary}`}>
                    {roleData.permissions.length} permissions
                  </span>
                </div>
                <p className={`text-sm ${themeClasses.text.secondary} mb-3`}>
                  {roleData.role.description}
                </p>
                {roleData.inheritedFrom.length > 0 && (
                  <div className={`text-xs ${themeClasses.text.tertiary} flex items-center gap-1`}>
                    <ArrowDown className="w-3 h-3" />
                    <span>Inherits from: {roleData.inheritedFrom.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(', ')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Arrow (except after last role) */}
            {index < rolesData.length - 1 && (
              <ArrowDown className="w-8 h-8 text-gray-400" />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Permissions Detail Panel */}
      {selectedRole && (
        <div className={`mt-8 p-6 ${themeClasses.bg.secondary} rounded-lg border ${themeClasses.border.primary}`}>
          <h3 className={`text-xl font-bold ${themeClasses.text.primary} mb-4`}>
            {selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)} Permissions
          </h3>

          {rolesData
            .filter(rd => rd.role.name === selectedRole)
            .map(roleData => {
              const categories = getPermissionsByCategory(roleData.permissions);

              return (
                <div key={roleData.role.id} className="space-y-4">
                  {Object.entries(categories).map(([category, perms]) => (
                    <div key={category}>
                      <h4 className={`text-lg font-semibold ${themeClasses.text.primary} mb-2`}>
                        {formatResourceName(category)}
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {perms.map(perm => (
                          <div
                            key={perm.id}
                            className={`p-3 ${themeClasses.bg.primary} rounded border ${themeClasses.border.primary}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                                  {formatActionType(perm.action_type)}
                                </p>
                                <code className={`text-xs ${themeClasses.text.tertiary}`}>
                                  {perm.permission_key}
                                </code>
                              </div>
                              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Show Inherited Permissions */}
                  {roleData.inheritedFrom.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-gray-300 dark:border-gray-700">
                      <h4 className={`text-lg font-semibold ${themeClasses.text.primary} mb-2`}>
                        Inherited Permissions
                      </h4>
                      <div className="space-y-4">
                        {roleData.inheritedFrom.map(inheritedRoleName => {
                          const inheritedRole = rolesData.find(rd => rd.role.name === inheritedRoleName);
                          if (!inheritedRole) return null;

                          const inheritedCategories = getPermissionsByCategory(inheritedRole.permissions);

                          return (
                            <div key={inheritedRoleName} className={`p-4 ${themeClasses.bg.hover} rounded-lg`}>
                              <p className={`text-sm font-semibold ${themeClasses.text.secondary} mb-3`}>
                                From {inheritedRoleName.charAt(0).toUpperCase() + inheritedRoleName.slice(1)}:
                              </p>
                              {Object.entries(inheritedCategories).map(([category, perms]) => (
                                <div key={category} className="mb-3">
                                  <p className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>
                                    {formatResourceName(category)}
                                  </p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {perms.map(perm => (
                                      <div
                                        key={perm.id}
                                        className={`p-2 ${themeClasses.bg.secondary} rounded border ${themeClasses.border.primary} opacity-75`}
                                      >
                                        <p className={`text-xs font-medium ${themeClasses.text.secondary}`}>
                                          {formatActionType(perm.action_type)}
                                        </p>
                                        <code className={`text-xs ${themeClasses.text.tertiary}`}>
                                          {perm.permission_key}
                                        </code>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Total Count */}
                  <div className={`mt-6 p-4 ${themeClasses.bg.hover} rounded-lg text-center`}>
                    <p className={`text-sm ${themeClasses.text.primary}`}>
                      <strong>Total Permissions:</strong>{' '}
                      {roleData.permissions.length +
                        roleData.inheritedFrom.reduce((sum, inheritedRoleName) => {
                          const inheritedRole = rolesData.find(rd => rd.role.name === inheritedRoleName);
                          return sum + (inheritedRole?.permissions.length || 0);
                        }, 0)}
                      {' '}
                      ({roleData.permissions.length} direct + {
                        roleData.inheritedFrom.reduce((sum, inheritedRoleName) => {
                          const inheritedRole = rolesData.find(rd => rd.role.name === inheritedRoleName);
                          return sum + (inheritedRole?.permissions.length || 0);
                        }, 0)
                      } inherited)
                    </p>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};

export default AdminRoleHierarchy;