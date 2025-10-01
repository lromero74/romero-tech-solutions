import React, { useState, useEffect } from 'react';
import { adminService } from '../../services/adminService';
import {
  Plus,
  Edit2,
  Power,
  Trash2,
  Globe,
  Tag,
  FileText,
  Save,
  X,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

interface ServiceType {
  id: string;
  type_code: string;
  category: string;
  name_key: string;
  description_key: string;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  name_en: string;
  description_en: string;
  name_es: string | null;
  description_es: string | null;
  name_current: string;
  description_current: string;
}

interface ServiceTypeFormData {
  type_code: string;
  category: string;
  name_en: string;
  description_en: string;
  name_es: string;
  description_es: string;
  sort_order: number;
}

const AdminServiceTypes: React.FC = () => {
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState<ServiceType | null>(null);
  const [formData, setFormData] = useState<ServiceTypeFormData>({
    type_code: '',
    category: 'General',
    name_en: '',
    description_en: '',
    name_es: '',
    description_es: '',
    sort_order: 100
  });
  const [categories, setCategories] = useState<string[]>(['Infrastructure', 'Security', 'Support', 'Data', 'General']);

  useEffect(() => {
    fetchServiceTypes();
  }, []);

  const fetchServiceTypes = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await adminService.get('/service-types/admin?lang=en');

      if (response.success) {
        setServiceTypes(response.data.serviceTypes);
      } else {
        setError('Failed to fetch service types');
      }
    } catch (err) {
      console.error('Error fetching service types:', err);
      setError('Failed to fetch service types');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    try {
      if (editingType) {
        // Update existing service type
        await adminService.put(`/service-types/${editingType.id}`, formData);
        setSuccessMessage('Service type updated successfully');
      } else {
        // Create new service type
        await adminService.post('/service-types', formData);
        setSuccessMessage('Service type created successfully');
      }

      // Refresh the list
      await fetchServiceTypes();

      // Reset form
      setShowForm(false);
      setEditingType(null);
      resetForm();
    } catch (err: any) {
      console.error('Error saving service type:', err);
      setError(err.response?.data?.message || 'Failed to save service type');
    }
  };

  const handleEdit = (serviceType: ServiceType) => {
    setEditingType(serviceType);
    setFormData({
      type_code: serviceType.type_code,
      category: serviceType.category,
      name_en: serviceType.name_en || '',
      description_en: serviceType.description_en || '',
      name_es: serviceType.name_es || '',
      description_es: serviceType.description_es || '',
      sort_order: serviceType.sort_order
    });
    setShowForm(true);
  };

  const handleToggleActive = async (serviceType: ServiceType) => {
    try {
      setError(null);
      await adminService.patch(`/service-types/${serviceType.id}/toggle`);
      setSuccessMessage(`Service type ${serviceType.is_active ? 'deactivated' : 'activated'} successfully`);
      await fetchServiceTypes();
    } catch (err: any) {
      console.error('Error toggling service type:', err);
      setError(err.response?.data?.message || 'Failed to toggle service type status');
    }
  };

  const handleDelete = async (serviceType: ServiceType) => {
    if (!confirm(`Are you sure you want to delete "${serviceType.name_en}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setError(null);
      await adminService.delete(`/service-types/${serviceType.id}`);
      setSuccessMessage('Service type deleted successfully');
      await fetchServiceTypes();
    } catch (err: any) {
      console.error('Error deleting service type:', err);
      setError(err.response?.data?.message || 'Failed to delete service type');
    }
  };

  const resetForm = () => {
    setFormData({
      type_code: '',
      category: 'General',
      name_en: '',
      description_en: '',
      name_es: '',
      description_es: '',
      sort_order: 100
    });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingType(null);
    resetForm();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Service Types</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Manage service types with multi-language support
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Service Type
          </button>
        )}
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
          <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
          <span className="text-green-800">{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            className="ml-auto text-green-600 hover:text-green-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center">
          <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
          <span className="text-red-800">{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-600 hover:text-red-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            {editingType ? 'Edit Service Type' : 'Add New Service Type'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Type Code and Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Tag className="h-4 w-4 inline mr-1" />
                  Type Code *
                </label>
                <input
                  type="text"
                  value={formData.type_code}
                  onChange={(e) => setFormData({ ...formData, type_code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="network-support"
                  required
                  disabled={!!editingType}
                />
                <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, and hyphens only</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Category *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sort Order */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Sort Order
              </label>
              <input
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                min="0"
                max="999"
              />
              <p className="text-xs text-gray-500 mt-1">Lower numbers appear first (0-999)</p>
            </div>

            {/* English Translations */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center">
                <Globe className="h-4 w-4 mr-2" />
                English (EN) *
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name_en}
                    onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Network Support"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description_en}
                    onChange={(e) => setFormData({ ...formData, description_en: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Network troubleshooting and maintenance"
                    rows={2}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Spanish Translations */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center">
                <Globe className="h-4 w-4 mr-2" />
                Spanish (ES)
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={formData.name_es}
                    onChange={(e) => setFormData({ ...formData, name_es: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Soporte de Red"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Descripción
                  </label>
                  <textarea
                    value={formData.description_es}
                    onChange={(e) => setFormData({ ...formData, description_es: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Solución de problemas y mantenimiento de red"
                    rows={2}
                  />
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Save className="h-4 w-4 mr-2" />
                {editingType ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Service Types List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Type Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Name (EN / ES)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Sort
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {serviceTypes.map((serviceType) => (
                <tr key={serviceType.id} className={!serviceType.is_active ? 'opacity-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Tag className="h-4 w-4 text-gray-400 mr-2" />
                      <span className="text-sm font-mono text-gray-900 dark:text-white">
                        {serviceType.type_code}
                      </span>
                      {serviceType.is_system && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                          System
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {serviceType.name_en || 'N/A'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {serviceType.name_es || 'No Spanish translation'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900 dark:text-white">{serviceType.category}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900 dark:text-white">{serviceType.sort_order}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        serviceType.is_active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {serviceType.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleEdit(serviceType)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(serviceType)}
                        className="text-yellow-600 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-300"
                        title={serviceType.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      {!serviceType.is_system && (
                        <button
                          onClick={() => handleDelete(serviceType)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminServiceTypes;
