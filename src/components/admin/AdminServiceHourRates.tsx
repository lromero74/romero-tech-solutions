import React, { useState, useEffect } from 'react';
import { Clock, Save, X } from 'lucide-react';
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

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIER_LEVELS = [
  { value: 1, label: 'Standard', defaultColor: '#28a745', multiplier: 1.0 },
  { value: 2, label: 'Premium', defaultColor: '#ffc107', multiplier: 1.5 },
  { value: 3, label: 'Emergency', defaultColor: '#dc3545', multiplier: 2.0 }
];

// Generate 24 hours (0-23)
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const formatHour = (hour: number): string => {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
};

const AdminServiceHourRates: React.FC = () => {
  const { user } = useEnhancedAuth();
  const [rateTiers, setRateTiers] = useState<ServiceHourRateTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState<{ day: number; hour: number } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [activeTierLevel, setActiveTierLevel] = useState<number | null>(null);

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

  // Get the tier for a specific day and hour
  const getTierForCell = (dayOfWeek: number, hour: number): ServiceHourRateTier | null => {
    const timeStart = `${String(hour).padStart(2, '0')}:00:00`;
    const timeEnd = `${String(hour + 1).padStart(2, '0')}:00:00`;

    // First, try to find an exact match (1-hour tier for this specific hour)
    const exactMatch = rateTiers.find(tier =>
      tier.dayOfWeek === dayOfWeek &&
      tier.isActive &&
      tier.timeStart === timeStart &&
      tier.timeEnd === timeEnd
    );

    if (exactMatch) return exactMatch;

    // If no exact match, find any tier that covers this hour
    return rateTiers.find(tier =>
      tier.dayOfWeek === dayOfWeek &&
      tier.isActive &&
      tier.timeStart <= timeStart &&
      tier.timeEnd > timeStart
    ) || null;
  };

  // Handle cell click
  const handleCellClick = (day: number, hour: number) => {
    if (!isExecutive) return;

    // If active tier is set, apply it immediately
    if (activeTierLevel !== null) {
      applyTierToCell(day, hour, activeTierLevel);
    } else {
      // Otherwise, open modal to choose tier
      setSelectedCell({ day, hour });
    }
  };

  // Apply tier to a cell directly
  const applyTierToCell = async (day: number, hour: number, tierLevel: number) => {
    setSaveStatus('saving');
    try {
      const selectedTier = TIER_LEVELS.find(t => t.value === tierLevel);
      if (!selectedTier) return;

      const timeStart = `${String(hour).padStart(2, '0')}:00:00`;
      const timeEnd = `${String(hour + 1).padStart(2, '0')}:00:00`;

      // Find existing tier with EXACT same time range (not just overlapping)
      const exactMatchTier = rateTiers.find(tier =>
        tier.dayOfWeek === day &&
        tier.isActive &&
        tier.timeStart === timeStart &&
        tier.timeEnd === timeEnd
      );

      const tierData = {
        tierName: selectedTier.label,
        tierLevel: selectedTier.value,
        dayOfWeek: day,
        timeStart: `${String(hour).padStart(2, '0')}:00`,
        timeEnd: `${String(hour + 1).padStart(2, '0')}:00`,
        rateMultiplier: selectedTier.multiplier,
        colorCode: selectedTier.defaultColor,
        description: '',
        isActive: true
      };

      let response;
      if (exactMatchTier) {
        // Update existing tier with exact same time range
        response = await apiService.put(`/admin/service-hour-rates/${exactMatchTier.id}`, tierData);

        // Optimistically update the state
        if (response.success) {
          setRateTiers(prev => prev.map(tier =>
            tier.id === exactMatchTier.id
              ? { ...tier, ...response.data }
              : tier
          ));
        }
      } else {
        // Create new tier for this specific hour
        response = await apiService.post('/admin/service-hour-rates', tierData);

        // Optimistically add to state
        if (response.success) {
          setRateTiers(prev => [...prev, response.data]);
        }
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1000);
    } catch (error) {
      console.error('Failed to save rate tier:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  // Handle tier selection from modal
  const handleTierSelect = async (tierLevel: number) => {
    if (!selectedCell) return;

    const { day, hour } = selectedCell;

    // Set this as the active tier for subsequent clicks
    setActiveTierLevel(tierLevel);

    // Apply to current cell
    await applyTierToCell(day, hour, tierLevel);

    // Close modal
    setSelectedCell(null);
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
                  {isExecutive
                    ? activeTierLevel !== null
                      ? `Paint mode: Click cells to apply ${TIER_LEVELS.find(t => t.value === activeTierLevel)?.label} tier`
                      : 'Select a tier below, then click cells to paint the schedule'
                    : 'View-only access - showing current rate tier schedule'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6 pr-2">
          {/* Legend / Tier Selector */}
          <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-4`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-sm font-medium ${themeClasses.text.primary}`}>
                {isExecutive ? 'Select Rate Tier (Click to Paint)' : 'Rate Tier Legend'}
              </h3>
              {isExecutive && activeTierLevel !== null && (
                <button
                  onClick={() => setActiveTierLevel(null)}
                  className="text-xs px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  Clear Selection
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              {TIER_LEVELS.map(tier => {
                const isActive = activeTierLevel === tier.value;
                return (
                  <button
                    key={tier.value}
                    onClick={() => isExecutive && setActiveTierLevel(tier.value)}
                    disabled={!isExecutive}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all ${
                      isExecutive ? 'cursor-pointer hover:scale-105' : 'cursor-default'
                    } ${
                      isActive
                        ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-800 shadow-lg'
                        : 'hover:shadow-md'
                    }`}
                    style={{
                      backgroundColor: isActive ? `${tier.defaultColor}30` : 'transparent',
                      border: `2px solid ${isActive ? tier.defaultColor : 'transparent'}`
                    }}
                  >
                    <div
                      className="w-6 h-6 rounded flex-shrink-0"
                      style={{ backgroundColor: tier.defaultColor }}
                    ></div>
                    <span className={`text-sm font-medium ${themeClasses.text.primary}`}>
                      {tier.label} ({tier.multiplier}x)
                    </span>
                    {isActive && (
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-500 text-white font-medium">
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {isExecutive && (
              <p className={`text-xs ${themeClasses.text.muted} mt-3`}>
                {activeTierLevel !== null
                  ? '✓ Click cells to apply selected tier. Click "Clear Selection" to choose different tiers for each cell.'
                  : 'Click a tier above to select it, then click cells in the grid to apply that tier quickly.'}
              </p>
            )}
          </div>

          {/* 24x7 Grid */}
          {loading ? (
            <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-8 text-center`}>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className={`mt-4 ${themeClasses.text.secondary}`}>Loading rate tiers...</p>
            </div>
          ) : (
            <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
              <div className={`px-6 py-4 border-b ${themeClasses.border.primary}`}>
                <h2 className={`text-lg font-medium ${themeClasses.text.primary}`}>Weekly Schedule Grid</h2>
                <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
                  24-hour view across all days of the week
                </p>
              </div>

              <div className="p-6">
                <div className="inline-block min-w-full">
                  <table className="w-full border-collapse">
                    <thead className="block w-full">
                      <tr className="flex w-full">
                        <th className={`sticky left-0 z-20 ${themeClasses.bg.card} p-2 text-xs font-medium ${themeClasses.text.secondary} text-left border ${themeClasses.border.primary} w-[100px] flex-shrink-0`}>
                          Time
                        </th>
                        {DAYS_OF_WEEK.map((day, index) => (
                          <th
                            key={index}
                            className={`${themeClasses.bg.card} p-2 text-xs font-medium ${themeClasses.text.secondary} text-center border ${themeClasses.border.primary} flex-1 min-w-[80px]`}
                          >
                            {day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="block w-full overflow-y-auto max-h-[600px]">
                      {HOURS.map(hour => (
                        <tr key={hour} className="flex w-full">
                          <td className={`sticky left-0 z-10 ${themeClasses.bg.card} p-2 text-xs font-medium ${themeClasses.text.secondary} border ${themeClasses.border.primary} w-[100px] flex-shrink-0`}>
                            {formatHour(hour)}
                          </td>
                          {DAYS_OF_WEEK.map((_, dayIndex) => {
                            const tier = getTierForCell(dayIndex, hour);
                            const bgColor = tier ? tier.colorCode : 'transparent';
                            const isUnassigned = !tier;

                            return (
                              <td
                                key={dayIndex}
                                onClick={() => handleCellClick(dayIndex, hour)}
                                className={`p-2 border ${themeClasses.border.primary} text-center transition-all flex-1 min-w-[80px] ${
                                  isExecutive ? 'cursor-pointer hover:ring-2 hover:ring-blue-500 hover:ring-inset' : ''
                                } ${isUnassigned ? 'bg-gray-200 dark:bg-gray-700' : ''}`}
                                style={{
                                  backgroundColor: isUnassigned ? undefined : `${bgColor}40`,
                                  borderColor: tier ? bgColor : undefined,
                                  borderWidth: tier ? '2px' : undefined,
                                  outline: 'none',
                                  boxShadow: 'none'
                                }}
                                title={tier ? `${tier.tierName} (${tier.rateMultiplier}x)` : 'Unassigned'}
                              >
                                {tier && (
                                  <div className="flex flex-col items-center justify-center h-8">
                                    <span className={`text-xs font-medium ${themeClasses.text.primary}`}>
                                      {tier.tierName.charAt(0)}
                                    </span>
                                    <span className="text-[10px] text-gray-600 dark:text-gray-400">
                                      {tier.rateMultiplier}x
                                    </span>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Information Panel */}
          <div className={`${themeClasses.bg.secondary} border ${themeClasses.border.primary} rounded-lg p-4`}>
            <h3 className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>How the Grid Works</h3>
            <ul className={`text-sm ${themeClasses.text.secondary} space-y-1`}>
              <li>• Each cell represents one hour on a specific day of the week</li>
              <li>• Color-coded cells show which rate tier applies to that time slot</li>
              <li>• S = Standard (1.0x), P = Premium (1.5x), E = Emergency (2.0x)</li>
              {isExecutive && <li>• Click any cell to change the rate tier for that hour</li>}
              <li>• Gray cells are unassigned (default to standard rate)</li>
              <li>• Rate multipliers are applied when clients schedule appointments</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Tier Selection Modal */}
      {selectedCell && isExecutive && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => setSelectedCell(null)}
            ></div>

            {/* Modal panel */}
            <div className={`inline-block align-bottom ${themeClasses.bg.card} rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full`}>
              {/* Header */}
              <div className={`px-6 py-4 border-b ${themeClasses.border.primary}`}>
                <div className="flex items-center justify-between">
                  <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>
                    Select Rate Tier
                  </h3>
                  <button
                    onClick={() => setSelectedCell(null)}
                    className={`${themeClasses.text.secondary} hover:text-gray-700`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
                  {DAYS_OF_WEEK[selectedCell.day]} at {formatHour(selectedCell.hour)}
                </p>
              </div>

              {/* Tier Options */}
              <div className="px-6 py-4 space-y-3">
                {TIER_LEVELS.map(tier => {
                  const currentTier = getTierForCell(selectedCell.day, selectedCell.hour);
                  const isActive = currentTier?.tierLevel === tier.value;

                  return (
                    <button
                      key={tier.value}
                      onClick={() => handleTierSelect(tier.value)}
                      disabled={saveStatus === 'saving'}
                      className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                        isActive
                          ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
                          : `border-gray-300 dark:border-gray-600 ${themeClasses.bg.hover}`
                      } ${saveStatus === 'saving' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-400'}`}
                      style={{
                        backgroundColor: `${tier.defaultColor}15`
                      }}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-8 h-8 rounded flex-shrink-0"
                          style={{ backgroundColor: tier.defaultColor }}
                        ></div>
                        <div className="text-left">
                          <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                            {tier.label}
                          </div>
                          <div className={`text-xs ${themeClasses.text.muted}`}>
                            {tier.multiplier}x multiplier
                          </div>
                        </div>
                      </div>
                      {isActive && (
                        <div className="flex items-center">
                          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                            Current
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Footer */}
              <div className={`px-6 py-4 border-t ${themeClasses.border.primary} flex justify-end`}>
                <button
                  onClick={() => setSelectedCell(null)}
                  className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.hover}`}
                >
                  Cancel
                </button>
              </div>

              {/* Save Status */}
              {saveStatus !== 'idle' && (
                <div className={`px-6 py-3 ${
                  saveStatus === 'saved' ? 'bg-green-50 dark:bg-green-900/20' :
                  saveStatus === 'error' ? 'bg-red-50 dark:bg-red-900/20' :
                  'bg-blue-50 dark:bg-blue-900/20'
                }`}>
                  <p className={`text-sm text-center ${
                    saveStatus === 'saved' ? 'text-green-600 dark:text-green-400' :
                    saveStatus === 'error' ? 'text-red-600 dark:text-red-400' :
                    'text-blue-600 dark:text-blue-400'
                  }`}>
                    {saveStatus === 'saving' && 'Saving...'}
                    {saveStatus === 'saved' && '✓ Saved successfully'}
                    {saveStatus === 'error' && '✗ Failed to save'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminServiceHourRates;
