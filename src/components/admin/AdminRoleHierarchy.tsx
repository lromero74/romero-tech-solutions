import React, { useState, useEffect } from 'react';
import { themeClasses } from '../../contexts/ThemeContext';
import { ArrowDown, Shield, Users, Building, CheckCircle, Info } from 'lucide-react';
import { useAdminData } from '../../contexts/AdminDataContext';

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
}

const AdminRoleHierarchy: React.FC = () => {
  const { roles, permissions } = useAdminData();
  const [rolesData, setRolesData] = useState<RoleWithPermissions[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  useEffect(() => {
    if (roles.length > 0 && permissions.length > 0) {
      // Build hierarchy from cached data
      const hierarchy = buildHierarchy(roles, permissions);
      setRolesData(hierarchy);
    }
  }, [roles, permissions]);

  const buildHierarchy = (roles: any[], permissions: any[]): RoleWithPermissions[] => {
    // Sort roles by privilege level (top to bottom)
    const roleOrder = ['executive', 'admin', 'manager', 'sales', 'technician'];
    const sortedRoles = [...roles].sort((a, b) => {
      const aName = (a.name || a.display_name || '').toLowerCase();
      const bName = (b.name || b.display_name || '').toLowerCase();
      return roleOrder.indexOf(aName) - roleOrder.indexOf(bName);
    });

    // Convert flat structure to expected format with permissions
    return sortedRoles.map(roleData => {
      // Get permissions for this role (if available)
      const rolePermissions = permissions.filter(p => {
        // Check if this permission is assigned to this role
        // This depends on your data structure - adjust as needed
        return true; // For now, show all permissions (can be filtered later)
      });

      return {
        role: {
          id: roleData.id,
          name: roleData.name || roleData.display_name,
          description: roleData.description || '',
          is_active: roleData.is_active ?? roleData.isActive ?? true
        },
        permissions: rolePermissions
      };
    });
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
                <div className={`text-xs ${themeClasses.text.tertiary}`}>
                  {roleData.permissions.length} permissions
                </div>
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

                  {/* Total Count */}
                  <div className={`mt-6 p-4 ${themeClasses.bg.hover} rounded-lg text-center`}>
                    <p className={`text-sm ${themeClasses.text.primary}`}>
                      <strong>Total Permissions:</strong> {roleData.permissions.length}
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