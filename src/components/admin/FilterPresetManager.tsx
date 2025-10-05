import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Filter, AlertCircle } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import apiService from '../../services/apiService';

interface FilterPreset {
  id: string;
  name: string;
  description: string;
  filter_type: string;
  criteria: {
    operator: string;
    value?: boolean | string;
    values?: string[];
  };
  display_order: number;
  is_active: boolean;
  created_by_name?: string;
  created_at: string;
}

interface OperatorOption {
  value: string;
  label: string;
  requiresValue: boolean;
  requiresValues: boolean;
  valueType?: 'boolean' | 'string';
}

const OPERATORS: OperatorOption[] = [
  { value: 'is_final_status', label: 'Is Final Status', requiresValue: true, requiresValues: false, valueType: 'boolean' },
  { value: 'in', label: 'Status In List', requiresValue: false, requiresValues: true },
  { value: 'not_in', label: 'Status Not In List', requiresValue: false, requiresValues: true },
  { value: 'equals', label: 'Status Equals', requiresValue: true, requiresValues: false, valueType: 'string' },
];

const FilterPresetManager: React.FC = () => {
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPreset, setEditingPreset] = useState<FilterPreset | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [availableStatuses, setAvailableStatuses] = useState<Array<{ id: string; name: string }>>([]);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    filter_type: 'status',
    operator: 'is_final_status',
    booleanValue: false,
    stringValue: '',
    statusValues: [] as string[],
    display_order: 0,
    is_active: true
  });

  useEffect(() => {
    fetchPresets();
    fetchStatuses();
  }, []);

  const fetchPresets = async () => {
    try {
      setLoading(true);
      const response = await apiService.get('/admin/service-requests/filter-presets/all');
      if (response.success) {
        setPresets(response.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load filter presets');
    } finally {
      setLoading(false);
    }
  };

  const fetchStatuses = async () => {
    try {
      const response = await apiService.get('/admin/service-requests/statuses');
      if (response.success) {
        setAvailableStatuses(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch statuses:', err);
    }
  };

  const handleAddPreset = () => {
    setFormData({
      name: '',
      description: '',
      filter_type: 'status',
      operator: 'is_final_status',
      booleanValue: false,
      stringValue: '',
      statusValues: [],
      display_order: 0,
      is_active: true
    });
    setEditingPreset(null);
    setShowAddModal(true);
  };

  const handleEditPreset = (preset: FilterPreset) => {
    const { criteria } = preset;
    setFormData({
      name: preset.name,
      description: preset.description || '',
      filter_type: preset.filter_type,
      operator: criteria.operator,
      booleanValue: criteria.value === true || criteria.value === false ? criteria.value : false,
      stringValue: typeof criteria.value === 'string' ? criteria.value : '',
      statusValues: criteria.values || [],
      display_order: preset.display_order,
      is_active: preset.is_active
    });
    setEditingPreset(preset);
    setShowAddModal(true);
  };

  const buildCriteria = () => {
    const selectedOperator = OPERATORS.find(op => op.value === formData.operator);

    if (!selectedOperator) return null;

    const criteria: any = { operator: formData.operator };

    if (selectedOperator.requiresValue) {
      if (selectedOperator.valueType === 'boolean') {
        criteria.value = formData.booleanValue;
      } else {
        criteria.value = formData.stringValue;
      }
    }

    if (selectedOperator.requiresValues) {
      criteria.values = formData.statusValues;
    }

    return criteria;
  };

  const handleSavePreset = async () => {
    try {
      const criteria = buildCriteria();

      if (!criteria) {
        alert('Invalid criteria configuration');
        return;
      }

      const payload = {
        name: formData.name,
        description: formData.description,
        filter_type: formData.filter_type,
        criteria,
        display_order: formData.display_order,
        is_active: formData.is_active
      };

      if (editingPreset) {
        // Update existing preset
        await apiService.put(`/admin/service-requests/filter-presets/${editingPreset.id}`, payload);
      } else {
        // Create new preset
        await apiService.post('/admin/service-requests/filter-presets', payload);
      }

      setShowAddModal(false);
      setEditingPreset(null);
      fetchPresets();
    } catch (err: any) {
      alert(err.message || 'Failed to save preset');
    }
  };

  const handleDeletePreset = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this filter preset?')) {
      return;
    }

    try {
      await apiService.delete(`/admin/service-requests/filter-presets/${id}`);
      fetchPresets();
    } catch (err: any) {
      alert(err.message || 'Failed to delete preset');
    }
  };

  const toggleStatusValue = (statusName: string) => {
    setFormData(prev => ({
      ...prev,
      statusValues: prev.statusValues.includes(statusName)
        ? prev.statusValues.filter(s => s !== statusName)
        : [...prev.statusValues, statusName]
    }));
  };

  const selectedOperator = OPERATORS.find(op => op.value === formData.operator);

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${themeClasses.text.secondary}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
        <span className="ml-2">Loading filter presets...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>
            Service Request Filter Presets
          </h2>
          <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
            Create custom filters that appear in the service requests dropdown with a * prefix
          </p>
        </div>
        <button
          onClick={handleAddPreset}
          className={`flex items-center gap-2 px-4 py-2 ${themeClasses.button.primary} rounded-lg`}
        >
          <Plus className="w-4 h-4" />
          Add Preset
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Presets Table */}
      <div className={`${themeClasses.bg.card} ${themeClasses.border.primary} border rounded-lg overflow-hidden`}>
        <table className="w-full">
          <thead className={`${themeClasses.bg.secondary}`}>
            <tr>
              <th className={`px-4 py-3 text-left text-sm font-semibold ${themeClasses.text.primary}`}>Name</th>
              <th className={`px-4 py-3 text-left text-sm font-semibold ${themeClasses.text.primary}`}>Description</th>
              <th className={`px-4 py-3 text-left text-sm font-semibold ${themeClasses.text.primary}`}>Criteria</th>
              <th className={`px-4 py-3 text-left text-sm font-semibold ${themeClasses.text.primary}`}>Order</th>
              <th className={`px-4 py-3 text-left text-sm font-semibold ${themeClasses.text.primary}`}>Status</th>
              <th className={`px-4 py-3 text-left text-sm font-semibold ${themeClasses.text.primary}`}>Created By</th>
              <th className={`px-4 py-3 text-right text-sm font-semibold ${themeClasses.text.primary}`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {presets.map(preset => (
              <tr key={preset.id} className={`hover:${themeClasses.bg.tertiary}`}>
                <td className={`px-4 py-3 text-sm font-medium ${themeClasses.text.primary}`}>
                  *{preset.name}
                </td>
                <td className={`px-4 py-3 text-sm ${themeClasses.text.secondary}`}>
                  {preset.description || '-'}
                </td>
                <td className={`px-4 py-3 text-sm ${themeClasses.text.secondary} font-mono`}>
                  {preset.criteria.operator}
                  {preset.criteria.value !== undefined && `: ${preset.criteria.value}`}
                  {preset.criteria.values && `: [${preset.criteria.values.join(', ')}]`}
                </td>
                <td className={`px-4 py-3 text-sm ${themeClasses.text.secondary}`}>
                  {preset.display_order}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                    preset.is_active
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                  }`}>
                    {preset.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className={`px-4 py-3 text-sm ${themeClasses.text.secondary}`}>
                  {preset.created_by_name || 'System'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleEditPreset(preset)}
                      className={`p-1 ${themeClasses.text.accent} hover:${themeClasses.text.primary}`}
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeletePreset(preset.id)}
                      className={`p-1 ${themeClasses.text.error} hover:opacity-80`}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {presets.length === 0 && (
              <tr>
                <td colSpan={7} className={`px-4 py-8 text-center ${themeClasses.text.secondary}`}>
                  No filter presets found. Click "Add Preset" to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${themeClasses.bg.card} rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto`}>
            <div className={`sticky top-0 ${themeClasses.bg.card} border-b ${themeClasses.border.primary} px-6 py-4 flex items-center justify-between`}>
              <h3 className={`text-lg font-semibold ${themeClasses.text.primary} flex items-center gap-2`}>
                <Filter className="w-5 h-5" />
                {editingPreset ? 'Edit Filter Preset' : 'Add Filter Preset'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className={`${themeClasses.text.secondary} hover:${themeClasses.text.primary}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Name */}
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
                  Preset Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
                  placeholder="e.g., Urgent, Needs Attention"
                />
                <p className={`text-xs ${themeClasses.text.secondary} mt-1`}>
                  This will appear as "*{formData.name || 'Name'}" in the filter dropdown
                </p>
              </div>

              {/* Description */}
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
                  placeholder="Brief description of what this filter shows"
                />
              </div>

              {/* Operator */}
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
                  Filter Operator <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.operator}
                  onChange={e => setFormData(prev => ({ ...prev, operator: e.target.value }))}
                  className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
                >
                  {OPERATORS.map(op => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
              </div>

              {/* Criteria Value */}
              {selectedOperator?.requiresValue && selectedOperator.valueType === 'boolean' && (
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
                    Value
                  </label>
                  <select
                    value={formData.booleanValue.toString()}
                    onChange={e => setFormData(prev => ({ ...prev, booleanValue: e.target.value === 'true' }))}
                    className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
                  >
                    <option value="false">False (Not Final / Open)</option>
                    <option value="true">True (Final / Closed)</option>
                  </select>
                </div>
              )}

              {selectedOperator?.requiresValue && selectedOperator.valueType === 'string' && (
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
                    Status Name
                  </label>
                  <select
                    value={formData.stringValue}
                    onChange={e => setFormData(prev => ({ ...prev, stringValue: e.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
                  >
                    <option value="">Select a status...</option>
                    {availableStatuses.map(status => (
                      <option key={status.id} value={status.name}>{status.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status List */}
              {selectedOperator?.requiresValues && (
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-2`}>
                    Select Statuses <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-3 border rounded-lg">
                    {availableStatuses.map(status => (
                      <label key={status.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.statusValues.includes(status.name)}
                          onChange={() => toggleStatusValue(status.name)}
                          className="rounded"
                        />
                        <span className={`text-sm ${themeClasses.text.primary}`}>{status.name}</span>
                      </label>
                    ))}
                  </div>
                  <p className={`text-xs ${themeClasses.text.secondary} mt-1`}>
                    Selected: {formData.statusValues.length > 0 ? formData.statusValues.join(', ') : 'None'}
                  </p>
                </div>
              )}

              {/* Display Order */}
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-1`}>
                  Display Order
                </label>
                <input
                  type="number"
                  value={formData.display_order}
                  onChange={e => setFormData(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
                  className={`w-full px-3 py-2 rounded-lg ${themeClasses.input}`}
                  placeholder="0"
                />
                <p className={`text-xs ${themeClasses.text.secondary} mt-1`}>
                  Lower numbers appear first in the dropdown
                </p>
              </div>

              {/* Active Status */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={e => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="is_active" className={`text-sm ${themeClasses.text.primary}`}>
                  Active (show in filter dropdown)
                </label>
              </div>
            </div>

            <div className={`border-t ${themeClasses.border.primary} px-6 py-4 flex items-center justify-end gap-3`}>
              <button
                onClick={() => setShowAddModal(false)}
                className={`px-4 py-2 ${themeClasses.button.secondary} rounded-lg flex items-center gap-2`}
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleSavePreset}
                className={`px-4 py-2 ${themeClasses.button.primary} rounded-lg flex items-center gap-2`}
                disabled={!formData.name || !formData.operator}
              >
                <Save className="w-4 h-4" />
                {editingPreset ? 'Update' : 'Create'} Preset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FilterPresetManager;
