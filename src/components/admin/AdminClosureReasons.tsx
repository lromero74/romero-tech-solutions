import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useTheme, themeClasses } from '../../contexts/ThemeContext';
import AlertModal from '../shared/AlertModal';
import DeleteConfirmModal from './shared/DeleteConfirmModal';
import apiService from '../../services/apiService';

interface ClosureReason {
  id: string;
  reason_name: string;
  reason_description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ClosureReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<ClosureReason>) => void;
  editData?: ClosureReason | null;
}

const ClosureReasonModal: React.FC<ClosureReasonModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editData
}) => {
  const { isDark } = useTheme();
  const [formData, setFormData] = useState({
    reason_name: '',
    reason_description: '',
    is_active: true
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (editData) {
      setFormData({
        reason_name: editData.reason_name,
        reason_description: editData.reason_description,
        is_active: editData.is_active
      });
    } else {
      setFormData({
        reason_name: '',
        reason_description: '',
        is_active: true
      });
    }
    setErrors({});
  }, [editData, isOpen]);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.reason_name.trim()) {
      newErrors.reason_name = 'Reason name is required';
    } else if (formData.reason_name.length > 100) {
      newErrors.reason_name = 'Reason name must not exceed 100 characters';
    }

    if (!formData.reason_description.trim()) {
      newErrors.reason_description = 'Reason description is required';
    } else if (formData.reason_description.length > 500) {
      newErrors.reason_description = 'Reason description must not exceed 500 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSave(formData);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.modal} rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto`}>
        <div className={`px-6 py-4 ${themeClasses.border.primary} border-b`}>
          <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
            {editData ? 'Edit Closure Reason' : 'Add New Closure Reason'}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Reason Name */}
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-1`}>
              Reason Name *
            </label>
            <input
              type="text"
              value={formData.reason_name}
              onChange={(e) => setFormData({ ...formData, reason_name: e.target.value })}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              } ${errors.reason_name ? 'border-red-500' : ''}`}
              placeholder="Enter reason name"
            />
            {errors.reason_name && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.reason_name}
              </p>
            )}
          </div>

          {/* Reason Description */}
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-1`}>
              Description *
            </label>
            <textarea
              value={formData.reason_description}
              onChange={(e) => setFormData({ ...formData, reason_description: e.target.value })}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'bg-white border-gray-300 text-gray-900'
              } ${errors.reason_description ? 'border-red-500' : ''}`}
              placeholder="Enter detailed description"
              rows={3}
            />
            {errors.reason_description && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.reason_description}
              </p>
            )}
          </div>

          {/* Active Status */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              <span className={`ml-2 text-sm ${themeClasses.text.secondary}`}>
                Active (available for selection)
              </span>
            </label>
          </div>

          {/* Buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-sm font-medium rounded-md ${themeClasses.bg.secondary} ${themeClasses.text.secondary} hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
            >
              {editData ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface AdminClosureReasonsProps {
  closureReasons?: ClosureReason[];
  loading?: boolean;
  error?: string | null;
  refreshClosureReasons?: () => Promise<void>;
}

const AdminClosureReasons: React.FC<AdminClosureReasonsProps> = ({
  closureReasons: propsClosureReasons = [],
  loading: propsLoading = false,
  error: propsError = null,
  refreshClosureReasons
}) => {
  const { isDark } = useTheme();
  // Use cached data from props
  const [closureReasons, setClosureReasons] = useState<ClosureReason[]>(propsClosureReasons);
  const [loading, setLoading] = useState(propsLoading);
  const [error, setError] = useState<string | null>(propsError);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReason, setEditingReason] = useState<ClosureReason | null>(null);
  const [deleteReason, setDeleteReason] = useState<ClosureReason | null>(null);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  const fetchClosureReasons = async () => {
    try {
      setLoading(true);
      const data = await apiService.get('/admin/closure-reasons');

      if (data.success) {
        setClosureReasons(data.data);
        setError(null);
      } else {
        setError(data.message || 'Failed to fetch closure reasons');
      }
    } catch (err) {
      setError('Failed to fetch closure reasons');
      console.error('Error fetching closure reasons:', err);
    } finally {
      setLoading(false);
    }
  };

  // Sync with props
  useEffect(() => {
    if (propsClosureReasons.length > 0) {
      setClosureReasons(propsClosureReasons);
      setLoading(false);
    }
  }, [propsClosureReasons]);

  useEffect(() => {
    if (propsError) {
      setError(propsError);
    }
  }, [propsError]);

  // Refresh on mount
  useEffect(() => {
    if (refreshClosureReasons) {
      refreshClosureReasons();
    } else {
      // Fallback if no refresh function provided
      fetchClosureReasons();
    }
  }, []);

  const handleSave = async (data: Partial<ClosureReason>) => {
    try {
      const result = editingReason
        ? await apiService.put(`/admin/closure-reasons/${editingReason.id}`, data)
        : await apiService.post('/admin/closure-reasons', data);

      if (result.success) {
        setAlertModal({
          isOpen: true,
          title: 'Success',
          message: result.message,
          type: 'success'
        });
        setIsModalOpen(false);
        setEditingReason(null);
        fetchClosureReasons();
      } else {
        setAlertModal({
          isOpen: true,
          title: 'Error',
          message: result.message || 'Failed to save closure reason',
          type: 'error'
        });
      }
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to save closure reason',
        type: 'error'
      });
      console.error('Error saving closure reason:', err);
    }
  };

  const handleDelete = async () => {
    if (!deleteReason) return;

    try {
      const result = await apiService.delete(`/admin/closure-reasons/${deleteReason.id}`);

      if (result.success) {
        setAlertModal({
          isOpen: true,
          title: 'Success',
          message: result.message,
          type: 'success'
        });
        setDeleteReason(null);
        fetchClosureReasons();
      } else {
        setAlertModal({
          isOpen: true,
          title: 'Error',
          message: result.message || 'Failed to delete closure reason',
          type: 'error'
        });
      }
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to delete closure reason',
        type: 'error'
      });
      console.error('Error deleting closure reason:', err);
    }
  };

  const handleToggleActive = async (reason: ClosureReason) => {
    try {
      const result = await apiService.patch(`/admin/closure-reasons/${reason.id}/toggle-active`);

      if (result.success) {
        setAlertModal({
          isOpen: true,
          title: 'Success',
          message: result.message,
          type: 'success'
        });
        fetchClosureReasons();
      } else {
        setAlertModal({
          isOpen: true,
          title: 'Error',
          message: result.message || 'Failed to update closure reason status',
          type: 'error'
        });
      }
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to update closure reason status',
        type: 'error'
      });
      console.error('Error toggling closure reason status:', err);
    }
  };

  const openCreateModal = () => {
    setEditingReason(null);
    setIsModalOpen(true);
  };

  const openEditModal = (reason: ClosureReason) => {
    setEditingReason(reason);
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className={`text-2xl font-bold ${themeClasses.text.primary}`}>
            Closure Reasons
          </h1>
          <p className={`mt-1 text-sm ${themeClasses.text.secondary}`}>
            Manage service request closure reasons
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Closure Reason
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
          <div className="flex">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Error</h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Closure Reasons Table */}
      <div className={`${themeClasses.bg.primary} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className={`${themeClasses.bg.secondary}`}>
              <tr>
                <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                  Reason Name
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                  Description
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                  Status
                </th>
                <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                  Created
                </th>
                <th className={`px-6 py-3 text-right text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
              {closureReasons.map((reason) => (
                <tr key={reason.id} className={`${themeClasses.bg.hover}`}>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${themeClasses.text.primary}`}>
                    {reason.reason_name}
                  </td>
                  <td className={`px-6 py-4 text-sm ${themeClasses.text.secondary}`}>
                    <div className="max-w-xs truncate" title={reason.reason_description}>
                      {reason.reason_description}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        reason.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                      }`}
                    >
                      {reason.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm ${themeClasses.text.secondary}`}>
                    {new Date(reason.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleToggleActive(reason)}
                        className={`p-1 rounded-md transition-colors ${
                          reason.is_active
                            ? 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                            : 'text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200'
                        }`}
                        title={reason.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {reason.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => openEditModal(reason)}
                        className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 rounded-md transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteReason(reason)}
                        className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200 rounded-md transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {closureReasons.length === 0 && (
            <div className="text-center py-12">
              <AlertCircle className={`mx-auto h-12 w-12 ${themeClasses.text.muted}`} />
              <h3 className={`mt-2 text-sm font-medium ${themeClasses.text.primary}`}>
                No closure reasons found
              </h3>
              <p className={`mt-1 text-sm ${themeClasses.text.secondary}`}>
                Get started by creating a new closure reason.
              </p>
              <div className="mt-6">
                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Closure Reason
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <ClosureReasonModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingReason(null);
        }}
        onSave={handleSave}
        editData={editingReason}
      />

      <DeleteConfirmModal
        isOpen={!!deleteReason}
        onClose={() => setDeleteReason(null)}
        onConfirm={handleDelete}
        title="Delete Closure Reason"
        message={`Are you sure you want to delete "${deleteReason?.reason_name}"? This action cannot be undone.`}
      />

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </div>
  );
};

export default AdminClosureReasons;