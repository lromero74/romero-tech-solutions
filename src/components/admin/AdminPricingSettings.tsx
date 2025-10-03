import React, { useState, useEffect } from 'react';
import { DollarSign, Save, Plus, Edit2, Trash2, Check, X, AlertCircle } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import apiService from '../../services/apiService';
import { useEnhancedAuth } from '../../contexts/EnhancedAuthContext';
import { usePermissionContext } from '../../contexts/PermissionContext';
import { usePermission } from '../../hooks/usePermission';

interface RateCategory {
  id: string;
  categoryName: string;
  baseHourlyRate: number;
  description: string;
  isDefault: boolean;
  isActive: boolean;
  displayOrder: number;
}

const AdminPricingSettings: React.FC = () => {
  const { user } = useEnhancedAuth();
  const { hasPermission } = usePermissionContext();
  const { checkPermission } = usePermission();

  // Permission checks
  const canModifyPricingSettings = checkPermission('modify.pricing_settings.enable');

  // Permission check
  if (!hasPermission('view.pricing_settings.enable')) {
    return (
      <div className={`p-8 ${themeClasses.bg.primary}`}>
        <div className={`${themeClasses.bg.secondary} rounded-lg p-6 text-center`}>
          <AlertCircle className={`w-12 h-12 ${themeClasses.text.warning} mx-auto mb-4`} />
          <h3 className={`text-lg font-semibold ${themeClasses.text.primary} mb-2`}>
            Access Denied
          </h3>
          <p className={themeClasses.text.secondary}>
            You do not have permission to view pricing settings.
          </p>
        </div>
      </div>
    );
  }

  const [categories, setCategories] = useState<RateCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Form state for editing/adding
  const [formData, setFormData] = useState({
    categoryName: '',
    baseHourlyRate: 75,
    description: ''
  });

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.get<{ success: boolean; data: RateCategory[] }>('/admin/hourly-rate-categories');
      if (response.success && response.data) {
        setCategories(response.data);
      }
    } catch (error) {
      console.error('Failed to load rate categories:', error);
      setErrorMessage('Failed to load rate categories');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (category: RateCategory) => {
    setEditingId(category.id);
    setFormData({
      categoryName: category.categoryName,
      baseHourlyRate: category.baseHourlyRate,
      description: category.description || ''
    });
    setIsAddingNew(false);
  };

  const handleAddNew = () => {
    setIsAddingNew(true);
    setEditingId(null);
    setFormData({
      categoryName: '',
      baseHourlyRate: 75,
      description: ''
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setIsAddingNew(false);
    setFormData({ categoryName: '', baseHourlyRate: 75, description: '' });
    setErrorMessage('');
  };

  const handleSave = async () => {
    if (!formData.categoryName || formData.baseHourlyRate <= 0) {
      setErrorMessage('Category name and valid rate are required');
      return;
    }

    try {
      setSaveStatus('saving');
      setErrorMessage('');

      const payload = {
        categoryName: formData.categoryName,
        baseHourlyRate: formData.baseHourlyRate,
        description: formData.description
      };

      if (isAddingNew) {
        await apiService.post('/admin/hourly-rate-categories', payload);
      } else if (editingId) {
        await apiService.put(`/admin/hourly-rate-categories/${editingId}`, payload);
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);

      await loadCategories();
      handleCancel();

    } catch (error: any) {
      console.error('Failed to save rate category:', error);
      setSaveStatus('error');
      setErrorMessage(error.message || 'Failed to save rate category');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleDelete = async (id: string, categoryName: string) => {
    if (!confirm(`Are you sure you want to delete the "${categoryName}" rate category?`)) {
      return;
    }

    try {
      await apiService.delete(`/admin/hourly-rate-categories/${id}`);
      await loadCategories();
    } catch (error: any) {
      console.error('Failed to delete rate category:', error);
      setErrorMessage(error.message || 'Failed to delete rate category');
    }
  };

  if (isLoading) {
    return (
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${themeClasses.border.primary}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400 mr-2" />
            <div>
              <h2 className={`text-lg font-medium ${themeClasses.text.primary}`}>Base Hourly Rate Categories</h2>
              <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
                Manage different base hourly rates for different types of businesses. Rates are multiplied by tier multipliers (Standard, Premium, Emergency).
              </p>
            </div>
          </div>
          {canModifyPricingSettings && !isAddingNew && (
            <button
              onClick={handleAddNew}
              className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-md text-sm font-medium"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Category
            </button>
          )}
        </div>
      </div>

      {/* Categories List */}
      <div className="p-6">
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-600 rounded-md">
            <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
          </div>
        )}

        <div className="space-y-3">
          {categories.map((category) => (
            <div
              key={category.id}
              className={`p-4 rounded-lg border-2 ${
                category.isDefault
                  ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : `border-gray-200 dark:border-gray-700 ${themeClasses.bg.secondary}`
              }`}
            >
              {editingId === category.id ? (
                // Edit mode
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-1`}>
                        Category Name
                      </label>
                      <input
                        type="text"
                        value={formData.categoryName}
                        onChange={(e) => setFormData({ ...formData, categoryName: e.target.value })}
                        className={`w-full px-3 py-2 rounded-md ${themeClasses.input.base}`}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-1`}>
                        Base Hourly Rate (USD)
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className={themeClasses.text.secondary}>$</span>
                        </div>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={formData.baseHourlyRate}
                          onChange={(e) => setFormData({ ...formData, baseHourlyRate: parseFloat(e.target.value) || 0 })}
                          className={`w-full pl-7 pr-3 py-2 rounded-md ${themeClasses.input.base}`}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-1`}>
                      Description
                    </label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className={`w-full px-3 py-2 rounded-md ${themeClasses.input.base}`}
                      placeholder="Optional description"
                    />
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleSave}
                      disabled={saveStatus === 'saving'}
                      className="flex items-center px-3 py-1.5 bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 text-white rounded-md text-sm font-medium disabled:opacity-50"
                    >
                      <Check className="w-4 h-4 mr-1" />
                      {saveStatus === 'saving' ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={saveStatus === 'saving'}
                      className={`flex items-center px-3 py-1.5 ${themeClasses.button.secondary} rounded-md text-sm font-medium disabled:opacity-50`}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // View mode
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
                        {category.categoryName}
                        {category.isDefault && (
                          <span className="ml-2 px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                            Default
                          </span>
                        )}
                      </h3>
                      <span className={`text-xl font-bold ${themeClasses.text.primary}`}>
                        ${category.baseHourlyRate.toFixed(2)}/hr
                      </span>
                    </div>
                    {category.description && (
                      <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
                        {category.description}
                      </p>
                    )}
                  </div>
                  {canModifyPricingSettings && (
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEdit(category)}
                        className={`p-2 ${themeClasses.bg.hover} rounded-md`}
                        title="Edit category"
                      >
                        <Edit2 className={`w-4 h-4 ${themeClasses.text.secondary}`} />
                      </button>
                      {!category.isDefault && (
                        <button
                          onClick={() => handleDelete(category.id, category.categoryName)}
                          className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                          title="Delete category"
                        >
                          <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Add New Category Form */}
          {isAddingNew && (
            <div className={`p-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 ${themeClasses.bg.secondary}`}>
              <div className="space-y-3">
                <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>New Rate Category</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-1`}>
                      Category Name *
                    </label>
                    <input
                      type="text"
                      value={formData.categoryName}
                      onChange={(e) => setFormData({ ...formData, categoryName: e.target.value })}
                      className={`w-full px-3 py-2 rounded-md ${themeClasses.input.base}`}
                      placeholder="e.g., Enterprise, Startup"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-1`}>
                      Base Hourly Rate (USD) *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <span className={themeClasses.text.secondary}>$</span>
                      </div>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={formData.baseHourlyRate}
                        onChange={(e) => setFormData({ ...formData, baseHourlyRate: parseFloat(e.target.value) || 0 })}
                        className={`w-full pl-7 pr-3 py-2 rounded-md ${themeClasses.input.base}`}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-1`}>
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className={`w-full px-3 py-2 rounded-md ${themeClasses.input.base}`}
                    placeholder="Optional description"
                  />
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={handleSave}
                    disabled={saveStatus === 'saving' || !formData.categoryName || formData.baseHourlyRate <= 0}
                    className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saveStatus === 'saving' ? 'Creating...' : 'Create Category'}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={saveStatus === 'saving'}
                    className={`px-4 py-2 ${themeClasses.button.secondary} rounded-md text-sm font-medium disabled:opacity-50`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info Panel */}
        {categories.length > 0 && !isAddingNew && (
          <div className={`mt-6 p-4 ${themeClasses.bg.secondary} border ${themeClasses.border.primary} rounded-lg`}>
            <h3 className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>How It Works</h3>
            <ul className={`text-sm ${themeClasses.text.secondary} space-y-1`}>
              <li>• Each business can be assigned a rate category (Standard is default if not specified)</li>
              <li>• Base hourly rates are multiplied by tier multipliers when clients schedule appointments</li>
              <li>• Example: ${categories[0]?.baseHourlyRate || 75}/hr × 2.0 (Emergency) = ${((categories[0]?.baseHourlyRate || 75) * 2).toFixed(2)}/hr</li>
              <li>• Only Executives and Admins can change a business's rate category</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPricingSettings;
