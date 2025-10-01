import React, { useState, useEffect } from 'react';
import { Clock, Save, Plus, Edit2, Trash2, X } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { useEnhancedAuth } from '../../contexts/EnhancedAuthContext';
import apiService from '../../services/apiService';

interface ServiceHourRateTier {
  id: string;
  tierName: string;
  tierLevel: number;
  dayOfWeek: number;
  timeStart: string;
  timeEnd: string;
  rateMultiplier: number;
  colorCode: string;
  description: string;
  displayOrder: number;
  isActive: boolean;
}

interface RateTierFormData {
  id?: string;
  tierName: string;
  tierLevel: number;
  dayOfWeek: number;
  timeStart: string;
  timeEnd: string;
  rateMultiplier: number;
  colorCode: string;
  description: string;
  isActive: boolean;
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIER_LEVELS = [
  { value: 1, label: 'Standard', defaultColor: '#28a745' },
  { value: 2, label: 'Premium', defaultColor: '#ffc107' },
  { value: 3, label: 'Emergency', defaultColor: '#dc3545' }
];

const AdminServiceHourRates: React.FC = () => {
  const { user } = useEnhancedAuth();
  const [rateTiers, setRateTiers] = useState<ServiceHourRateTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [formData, setFormData] = useState<RateTierFormData>({
    tierName: 'Standard',
    tierLevel: 1,
    dayOfWeek: 1,
    timeStart: '08:00',
    timeEnd: '17:00',
    rateMultiplier: 1.0,
    colorCode: '#28a745',
    description: '',
    isActive: true
  });

  // Check if user has executive role
  const isExecutive = user?.role === 'executive';

  useEffect(() => {
    loadRateTiers();
  }, []);

  const loadRateTiers = async () => {
    try {
      setLoading(true);
      const response = await apiService.get('/admin/service-hour-rates');
      if (response.success) {
        setRateTiers(response.data);
      }
    } catch (error) {
      console.error('Failed to load service hour rate tiers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditMode(false);
    setFormData({
      tierName: 'Standard',
      tierLevel: 1,
      dayOfWeek: 1,
      timeStart: '08:00',
      timeEnd: '17:00',
      rateMultiplier: 1.0,
      colorCode: '#28a745',
      description: '',
      isActive: true
    });
    setShowModal(true);
  };

  const handleEdit = (tier: ServiceHourRateTier) => {
    setEditMode(true);
    setFormData({
      id: tier.id,
      tierName: tier.tierName,
      tierLevel: tier.tierLevel,
      dayOfWeek: tier.dayOfWeek,
      timeStart: tier.timeStart.substring(0, 5), // HH:MM format
      timeEnd: tier.timeEnd.substring(0, 5),
      rateMultiplier: tier.rateMultiplier,
      colorCode: tier.colorCode,
      description: tier.description,
      isActive: tier.isActive
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
      return;
    }

    try {
      const response = await apiService.delete(`/admin/service-hour-rates/${id}`);
      if (response.success) {
        await loadRateTiers();
        setDeleteConfirm(null);
      }
    } catch (error) {
      console.error('Failed to delete rate tier:', error);
    }
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      if (editMode && formData.id) {
        // Update existing
        const response = await apiService.put(`/admin/service-hour-rates/${formData.id}`, formData);
        if (response.success) {
          await loadRateTiers();
          setShowModal(false);
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
        }
      } else {
        // Create new
        const response = await apiService.post('/admin/service-hour-rates', formData);
        if (response.success) {
          await loadRateTiers();
          setShowModal(false);
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
        }
      }
    } catch (error) {
      console.error('Failed to save rate tier:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const handleInputChange = (field: keyof RateTierFormData, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Auto-update color based on tier level
    if (field === 'tierLevel') {
      const tierLevel = TIER_LEVELS.find(t => t.value === value);
      if (tierLevel) {
        setFormData(prev => ({
          ...prev,
          tierLevel: value as number,
          tierName: tierLevel.label,
          colorCode: tierLevel.defaultColor
        }));
      }
    }
  };

  // Group tiers by day for display
  const getTiersForDay = (dayOfWeek: number) => {
    return rateTiers
      .filter(tier => tier.dayOfWeek === dayOfWeek && tier.isActive)
      .sort((a, b) => {
        // Sort by time start
        if (a.timeStart < b.timeStart) return -1;
        if (a.timeStart > b.timeStart) return 1;
        return 0;
      });
  };

  return (
    <div className="h-full relative" style={{ height: 'calc(100vh - 80px)' }}>
      <div className="h-full overflow-y-auto">
        {/* Header */}
        <div className={`sticky top-0 z-20 ${themeClasses.bg.primary} pb-4 pt-2 mb-6`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Clock className={`w-8 h-8 ${themeClasses.text.muted} mr-3`} />
              <div>
                <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Service Hour Rate Tiers</h1>
                <p className={`${themeClasses.text.secondary}`}>
                  Configure pricing multipliers for Standard, Premium, and Emergency service hours
                </p>
              </div>
            </div>
            {isExecutive && (
              <button
                onClick={handleAdd}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Rate Tier
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6 pr-2">
          {/* Legend */}
          <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-4`}>
            <h3 className={`text-sm font-medium ${themeClasses.text.primary} mb-3`}>Rate Tier Legend</h3>
            <div className="flex flex-wrap gap-4">
              {TIER_LEVELS.map(tier => (
                <div key={tier.value} className="flex items-center space-x-2">
                  <div
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: tier.defaultColor }}
                  ></div>
                  <span className={`text-sm ${themeClasses.text.secondary}`}>{tier.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly Schedule View */}
          {loading ? (
            <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-8 text-center`}>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className={`mt-4 ${themeClasses.text.secondary}`}>Loading rate tiers...</p>
            </div>
          ) : (
            <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
              <div className={`px-6 py-4 border-b ${themeClasses.border.primary}`}>
                <h2 className={`text-lg font-medium ${themeClasses.text.primary}`}>Weekly Rate Schedule</h2>
                <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
                  {isExecutive ? 'Click any tier to edit' : 'View-only access'}
                </p>
              </div>

              <div className="p-6">
                <div className="space-y-6">
                  {DAYS_OF_WEEK.map((dayName, dayIndex) => {
                    const dayTiers = getTiersForDay(dayIndex);
                    return (
                      <div key={dayIndex} className={`border ${themeClasses.border.primary} rounded-lg p-4`}>
                        <h3 className={`text-sm font-semibold ${themeClasses.text.primary} mb-3`}>
                          {dayName}
                        </h3>
                        {dayTiers.length === 0 ? (
                          <p className={`text-sm ${themeClasses.text.muted} italic`}>No rate tiers configured</p>
                        ) : (
                          <div className="space-y-2">
                            {dayTiers.map(tier => (
                              <div
                                key={tier.id}
                                className={`flex items-center justify-between p-3 rounded-lg border ${themeClasses.border.primary}`}
                                style={{ backgroundColor: `${tier.colorCode}15` }}
                              >
                                <div className="flex items-center space-x-4 flex-1">
                                  <div
                                    className="w-4 h-4 rounded"
                                    style={{ backgroundColor: tier.colorCode }}
                                  ></div>
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2">
                                      <span className={`text-sm font-medium ${themeClasses.text.primary}`}>
                                        {tier.tierName}
                                      </span>
                                      <span className={`text-xs ${themeClasses.text.muted}`}>
                                        {tier.timeStart} - {tier.timeEnd}
                                      </span>
                                      <span className={`text-xs font-medium ${themeClasses.text.secondary}`}>
                                        {tier.rateMultiplier}x
                                      </span>
                                    </div>
                                    {tier.description && (
                                      <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                                        {tier.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {isExecutive && (
                                  <div className="flex items-center space-x-2">
                                    <button
                                      onClick={() => handleEdit(tier)}
                                      className={`p-2 rounded ${themeClasses.bg.hover} ${themeClasses.text.secondary} hover:text-blue-600`}
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(tier.id)}
                                      className={`p-2 rounded ${themeClasses.bg.hover} ${
                                        deleteConfirm === tier.id
                                          ? 'bg-red-100 dark:bg-red-900/30 text-red-600'
                                          : `${themeClasses.text.secondary} hover:text-red-600`
                                      }`}
                                    >
                                      {deleteConfirm === tier.id ? (
                                        <span className="text-xs font-medium px-2">Confirm?</span>
                                      ) : (
                                        <Trash2 className="w-4 h-4" />
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Information Panel */}
          <div className={`${themeClasses.bg.secondary} border ${themeClasses.border.primary} rounded-lg p-4`}>
            <h3 className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>How Rate Tiers Work</h3>
            <ul className={`text-sm ${themeClasses.text.secondary} space-y-1`}>
              <li>• Rate multipliers are applied to the base service rate when scheduling appointments</li>
              <li>• Standard hours (1.0x) are typically business hours with no premium</li>
              <li>• Premium hours (1.25x-1.5x) apply during early morning, evening, or weekend hours</li>
              <li>• Emergency hours (1.75x-2.0x) apply during late night or urgent service requests</li>
              <li>• Clients see color-coded time slots when scheduling appointments</li>
              <li>• Multiple tiers can exist for the same day to cover different time periods</li>
              {isExecutive && <li>• Only executives can modify rate tier configurations</li>}
            </ul>
          </div>
        </div>
      </div>

      {/* Modal for Add/Edit */}
      {showModal && isExecutive && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => setShowModal(false)}
            ></div>

            {/* Modal panel */}
            <div className={`inline-block align-bottom ${themeClasses.bg.card} rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full`}>
              {/* Header */}
              <div className={`px-6 py-4 border-b ${themeClasses.border.primary}`}>
                <div className="flex items-center justify-between">
                  <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
                    {editMode ? 'Edit Rate Tier' : 'Add Rate Tier'}
                  </h3>
                  <button
                    onClick={() => setShowModal(false)}
                    className={`${themeClasses.text.secondary} hover:text-gray-700`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Form */}
              <div className="px-6 py-4 space-y-4">
                {/* Tier Level */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Tier Level
                  </label>
                  <select
                    value={formData.tierLevel}
                    onChange={(e) => handleInputChange('tierLevel', parseInt(e.target.value))}
                    className={`block w-full rounded-md shadow-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                  >
                    {TIER_LEVELS.map(tier => (
                      <option key={tier.value} value={tier.value}>{tier.label}</option>
                    ))}
                  </select>
                </div>

                {/* Day of Week */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Day of Week
                  </label>
                  <select
                    value={formData.dayOfWeek}
                    onChange={(e) => handleInputChange('dayOfWeek', parseInt(e.target.value))}
                    className={`block w-full rounded-md shadow-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                  >
                    {DAYS_OF_WEEK.map((day, index) => (
                      <option key={index} value={index}>{day}</option>
                    ))}
                  </select>
                </div>

                {/* Time Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={formData.timeStart}
                      onChange={(e) => handleInputChange('timeStart', e.target.value)}
                      className={`block w-full rounded-md shadow-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                      End Time
                    </label>
                    <input
                      type="time"
                      value={formData.timeEnd}
                      onChange={(e) => handleInputChange('timeEnd', e.target.value)}
                      className={`block w-full rounded-md shadow-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                    />
                  </div>
                </div>

                {/* Rate Multiplier */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Rate Multiplier
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.5"
                    max="5.0"
                    value={formData.rateMultiplier}
                    onChange={(e) => handleInputChange('rateMultiplier', parseFloat(e.target.value))}
                    className={`block w-full rounded-md shadow-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                  />
                  <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                    1.0 = base rate, 1.5 = 50% premium, 2.0 = double rate
                  </p>
                </div>

                {/* Color Code */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Color Code
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={formData.colorCode}
                      onChange={(e) => handleInputChange('colorCode', e.target.value)}
                      className="h-10 w-16 rounded border border-gray-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.colorCode}
                      onChange={(e) => handleInputChange('colorCode', e.target.value)}
                      className={`flex-1 rounded-md shadow-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Description (Optional)
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    rows={2}
                    className={`block w-full rounded-md shadow-sm ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                  />
                </div>

                {/* Active Status */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => handleInputChange('isActive', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isActive" className={`ml-2 text-sm ${themeClasses.text.secondary}`}>
                    Active (visible to clients)
                  </label>
                </div>
              </div>

              {/* Footer */}
              <div className={`px-6 py-4 border-t ${themeClasses.border.primary} flex justify-end space-x-3`}>
                <button
                  onClick={() => setShowModal(false)}
                  className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.hover}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saveStatus === 'saving'}
                  className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md text-white ${
                    saveStatus === 'saving'
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {saveStatus === 'saving' ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      {editMode ? 'Update' : 'Create'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminServiceHourRates;
