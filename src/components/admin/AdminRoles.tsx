import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  Save,
  X,
  AlertTriangle,
  Settings,
  Users
} from 'lucide-react';
import { Role } from '../../types/database';
import { themeClasses, useTheme } from '../../contexts/ThemeContext';
import { adminService } from '../../services/adminService';
import { applyDarkModeMuting } from '../../utils/colorUtils';

interface EditingRole extends Partial<Role> {
  name: string;
  display_name: string;
  description?: string;
  text_color: string;
  background_color: string;
  border_color: string;
  sort_order: number;
}

const AdminRoles: React.FC = () => {
  const { theme } = useTheme();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingRole, setEditingRole] = useState<EditingRole | null>(null);
  const [deletingRole, setDeletingRole] = useState<Role | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Sorting state
  const [sortBy, setSortBy] = useState<'role' | 'name' | 'sort_order' | 'created'>('sort_order');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Default values for new roles
  const defaultRoleValues: EditingRole = {
    name: '',
    display_name: '',
    description: '',
    text_color: '#000000',
    background_color: '#f3f4f6',
    border_color: '#d1d5db',
    sort_order: 99
  };

  // Load roles on component mount
  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminService.getRoles();
      setRoles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingRole(defaultRoleValues);
    setIsCreating(true);
  };

  const handleEdit = (role: Role) => {
    setEditingRole({
      id: role.id,
      name: role.name,
      display_name: role.display_name,
      description: role.description || '',
      text_color: role.text_color,
      background_color: role.background_color,
      border_color: role.border_color,
      sort_order: role.sort_order
    });
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!editingRole) return;

    try {
      setError(null);

      if (isCreating) {
        // Create new role
        const newRole = await adminService.createRole({
          name: editingRole.name,
          displayName: editingRole.display_name,
          description: editingRole.description,
          textColor: editingRole.text_color,
          backgroundColor: editingRole.background_color,
          borderColor: editingRole.border_color,
          sortOrder: editingRole.sort_order
        });
        setRoles([...roles, newRole]);
      } else {
        // Update existing role
        const updatedRole = await adminService.updateRole(editingRole.id!, {
          name: editingRole.name,
          displayName: editingRole.display_name,
          description: editingRole.description,
          textColor: editingRole.text_color,
          backgroundColor: editingRole.background_color,
          borderColor: editingRole.border_color,
          isActive: true,
          sortOrder: editingRole.sort_order
        });
        setRoles(roles.map(role =>
          role.id === editingRole.id ? updatedRole : role
        ));
      }

      setEditingRole(null);
      setIsCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save role');
    }
  };

  const handleDelete = (role: Role) => {
    setDeletingRole(role);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!deletingRole) return;

    try {
      setError(null);
      await adminService.deleteRole(deletingRole.id);
      setRoles(roles.filter(role => role.id !== deletingRole.id));
      setShowDeleteConfirm(false);
      setDeletingRole(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete role');
      setShowDeleteConfirm(false);
      setDeletingRole(null);
    }
  };

  const cancelEdit = () => {
    setEditingRole(null);
    setIsCreating(false);
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeletingRole(null);
  };

  const validateForm = () => {
    return editingRole?.name.trim() && editingRole?.display_name.trim();
  };

  const getRolePreview = (role: EditingRole) => {
    return (
      <span
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium"
        style={{
          color: applyDarkModeMuting(role.text_color, theme === 'dark'),
          backgroundColor: applyDarkModeMuting(role.background_color, theme === 'dark'),
          borderColor: applyDarkModeMuting(role.border_color, theme === 'dark'),
          borderWidth: '1px',
          borderStyle: 'solid'
        }}
      >
        {role.display_name || 'Preview'}
      </span>
    );
  };

  // Sorting functionality
  const handleSort = (field: 'role' | 'name' | 'sort_order' | 'created') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Helper function to get sort indicator
  const getSortIndicator = (field: 'role' | 'name' | 'sort_order' | 'created') => {
    if (sortBy === field) {
      return sortOrder === 'asc' ? '↑' : '↓';
    }
    return '↕'; // Show bidirectional arrow when not actively sorted
  };

  const getSortedRoles = () => {
    const sortedRoles = [...roles].sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'role':
          aValue = a.display_name.toLowerCase();
          bValue = b.display_name.toLowerCase();
          break;
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'sort_order':
          aValue = a.sort_order;
          bValue = b.sort_order;
          break;
        case 'created':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        default:
          aValue = a.sort_order;
          bValue = b.sort_order;
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return sortedRoles;
  };

  const SortableHeader = ({
    field,
    children,
    className = ""
  }: {
    field: 'role' | 'name' | 'sort_order' | 'created';
    children: React.ReactNode;
    className?: string;
  }) => (
    <th
      className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider cursor-pointer ${themeClasses.bg.hover} transition-colors ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        <span className={`ml-1 ${themeClasses.text.muted}`}>{getSortIndicator(field)}</span>
      </div>
    </th>
  );

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-center mt-4 text-gray-600">Loading roles...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className={`text-3xl font-bold ${themeClasses.text.primary} flex items-center`}>
              <Settings className="w-8 h-8 mr-3 text-blue-600" />
              Role Management
            </h1>
            <p className={`${themeClasses.text.secondary} mt-2`}>
              Manage user roles and permissions. Add, edit, or remove roles as needed.
            </p>
          </div>

          <button
            onClick={handleCreate}
            disabled={!!editingRole}
            className={`${themeClasses.button.primary} disabled:bg-gray-400 dark:disabled:bg-gray-600 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors`}
          >
            <Plus className="w-4 h-4" />
            <span>Add Role</span>
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex">
            <AlertTriangle className="w-5 h-5 text-red-400 mr-3 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Error</h3>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Roles Table */}
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className={`min-w-full divide-y ${themeClasses.border.primary}`}>
            <thead className={themeClasses.bg.secondary}>
              <tr>
                <SortableHeader field="role">
                  Role
                </SortableHeader>
                <SortableHeader field="name">
                  Name
                </SortableHeader>
                <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                  Description
                </th>
                <SortableHeader field="sort_order">
                  Sort Order
                </SortableHeader>
                <SortableHeader field="created">
                  Created
                </SortableHeader>
                <th className={`px-6 py-3 text-right text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className={`${themeClasses.bg.primary} divide-y ${themeClasses.border.primary}`}>
              {/* Editing Row (Create/Edit) */}
              {editingRole && (
                <tr className={`${themeClasses.bg.hover}`}>
                  <td className={`px-6 py-4 whitespace-nowrap`}>
                    {getRolePreview(editingRole)}
                  </td>
                  <td className={`px-6 py-4`}>
                    <div className="space-y-3">
                      <div>
                        <label className={`block text-xs font-medium ${themeClasses.text.secondary} mb-1`}>Role Name</label>
                        <input
                          type="text"
                          value={editingRole.name}
                          onChange={(e) => setEditingRole({
                            ...editingRole,
                            name: e.target.value
                          })}
                          placeholder="e.g., 'manager'"
                          className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md text-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                        />
                      </div>
                      <div>
                        <label className={`block text-xs font-medium ${themeClasses.text.secondary} mb-1`}>Display Name</label>
                        <input
                          type="text"
                          value={editingRole.display_name}
                          onChange={(e) => setEditingRole({
                            ...editingRole,
                            display_name: e.target.value
                          })}
                          placeholder="e.g., 'Manager'"
                          className={`w-full px-3 py-2 border ${themeClasses.border.primary} rounded-md text-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                        />
                      </div>
                    </div>
                  </td>
                  <td className={`px-6 py-4`}>
                    <div>
                      <label className={`block text-xs font-medium ${themeClasses.text.secondary} mb-1`}>Description</label>
                      <textarea
                        value={editingRole.description}
                        onChange={(e) => setEditingRole({
                          ...editingRole,
                          description: e.target.value
                        })}
                        placeholder="Role description..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </td>
                  <td className={`px-6 py-4`}>
                    <div>
                      <label className={`block text-xs font-medium ${themeClasses.text.secondary} mb-1`}>Sort Order</label>
                      <input
                        type="number"
                        value={editingRole.sort_order}
                        onChange={(e) => setEditingRole({
                          ...editingRole,
                          sort_order: parseInt(e.target.value) || 0
                        })}
                        className={`w-24 px-3 py-2 border ${themeClasses.border.primary} rounded-md text-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
                      />
                    </div>
                  </td>
                  <td className={`px-6 py-4`}>
                    <div>
                      <label className={`block text-xs font-medium ${themeClasses.text.secondary} mb-2`}>Colors</label>
                      <div className="grid grid-cols-1 gap-2">
                        <div className="flex items-center space-x-2">
                          <label className={`text-xs ${themeClasses.text.secondary} w-16`}>Text:</label>
                          <input
                            type="color"
                            value={editingRole.text_color}
                            onChange={(e) => setEditingRole({
                              ...editingRole,
                              text_color: e.target.value
                            })}
                            className={`w-12 h-8 border ${themeClasses.border.primary} rounded cursor-pointer`}
                          />
                        </div>
                        <div className="flex items-center space-x-2">
                          <label className={`text-xs ${themeClasses.text.secondary} w-16`}>Background:</label>
                          <input
                            type="color"
                            value={editingRole.background_color}
                            onChange={(e) => setEditingRole({
                              ...editingRole,
                              background_color: e.target.value
                            })}
                            className={`w-12 h-8 border ${themeClasses.border.primary} rounded cursor-pointer`}
                          />
                        </div>
                        <div className="flex items-center space-x-2">
                          <label className={`text-xs ${themeClasses.text.secondary} w-16`}>Border:</label>
                          <input
                            type="color"
                            value={editingRole.border_color}
                            onChange={(e) => setEditingRole({
                              ...editingRole,
                              border_color: e.target.value
                            })}
                            className={`w-12 h-8 border ${themeClasses.border.primary} rounded cursor-pointer`}
                          />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={`px-6 py-4 text-right`}>
                    <div className="flex space-x-2 justify-end">
                      <button
                        onClick={handleSave}
                        disabled={!validateForm()}
                        className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white p-2 rounded transition-colors"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="bg-gray-500 hover:bg-gray-600 text-white p-2 rounded transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Existing Roles */}
              {getSortedRoles().map((role) => (
                <tr key={role.id} className={`${themeClasses.bg.hover}`}>
                  <td className={`px-6 py-4 whitespace-nowrap`}>
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium"
                      style={{
                        color: applyDarkModeMuting(role.text_color, theme === 'dark'),
                        backgroundColor: applyDarkModeMuting(role.background_color, theme === 'dark'),
                        borderColor: applyDarkModeMuting(role.border_color, theme === 'dark'),
                        borderWidth: '1px',
                        borderStyle: 'solid'
                      }}
                    >
                      {role.display_name}
                    </span>
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap`}>
                    <div className={`text-sm font-medium ${themeClasses.text.primary}`}>{role.name}</div>
                    <div className={`text-sm ${themeClasses.text.secondary}`}>{role.display_name}</div>
                  </td>
                  <td className={`px-6 py-4`}>
                    <div className={`text-sm ${themeClasses.text.primary} max-w-xs truncate`}>
                      {role.description || 'No description'}
                    </div>
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap`}>
                    <div className={`text-sm ${themeClasses.text.primary}`}>{role.sort_order}</div>
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap`}>
                    <div className={`text-sm ${themeClasses.text.primary}`}>
                      {new Date(role.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className={`px-6 py-4 text-right`}>
                    <div className="flex space-x-2 justify-end">
                      <button
                        onClick={() => handleEdit(role)}
                        disabled={!!editingRole}
                        className="text-blue-600 hover:text-blue-900 disabled:text-gray-400 p-1 transition-colors"
                        title="Edit role"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(role)}
                        disabled={!!editingRole}
                        className="text-red-600 hover:text-red-900 disabled:text-gray-400 p-1 transition-colors"
                        title="Delete role"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {/* Empty State */}
              {roles.length === 0 && !editingRole && (
                <tr>
                  <td colSpan={6} className={`px-6 py-12 text-center`}>
                    <Users className={`mx-auto h-12 w-12 ${themeClasses.text.muted}`} />
                    <h3 className={`mt-2 text-sm font-medium ${themeClasses.text.primary}`}>No roles found</h3>
                    <p className={`mt-1 text-sm ${themeClasses.text.secondary}`}>
                      Get started by creating a new role.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deletingRole && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className={`relative ${themeClasses.bg.modal} rounded-lg ${themeClasses.shadow.xl} max-w-md w-full mx-4`}>
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-4">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Delete Role</h3>
                  <p className={`text-sm ${themeClasses.text.secondary}`}>This action cannot be undone</p>
                </div>
              </div>

              <div className="mb-6">
                <p className={`text-sm ${themeClasses.text.secondary}`}>
                  Are you sure you want to delete the role "
                  <span className="font-medium">{deletingRole.display_name}</span>"?
                </p>
                <p className={`text-sm ${themeClasses.text.muted} mt-2`}>
                  This role will be permanently removed and cannot be recovered.
                </p>
              </div>

              <div className="flex space-x-3 justify-end">
                <button
                  onClick={cancelDelete}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                >
                  Delete Role
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminRoles;