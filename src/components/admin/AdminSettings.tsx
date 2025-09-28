import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Settings, Clock, Shield, Save, RotateCcw, MapPin, ChevronUp, ChevronDown, Minimize2, Calendar } from 'lucide-react';
import { useEnhancedAuth } from '../../contexts/EnhancedAuthContext';
import { SessionConfig } from '../../utils/sessionManager';
import { themeClasses } from '../../contexts/ThemeContext';
import ServiceLocationSelector from './ServiceLocationSelector';
import adminService from '../../services/adminService';

interface ServiceLocationSelection {
  location_type: string;
  location_id: number;
  notes?: string;
}

interface ServedLocationData {
  location_type: string;
  location_id: number;
  notes?: string;
}

interface SchedulerConfig {
  bufferBeforeHours: number;
  bufferAfterHours: number;
  defaultSlotDurationHours: number;
  minimumAdvanceHours: number;
}

const AdminSettings: React.FC = () => {
  const { sessionConfig, updateSessionConfig } = useEnhancedAuth();
  const [formData, setFormData] = useState<SessionConfig>({
    timeout: 15,
    warningTime: 2
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showValidationErrors, setShowValidationErrors] = useState(false);

  // Service Location Management state
  const [serviceLocationSelections, setServiceLocationSelections] = useState<ServiceLocationSelection[]>([]);
  const [serviceLocationHasChanges, setServiceLocationHasChanges] = useState(false);
  const [serviceLocationSaveStatus, setServiceLocationSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [servedLocationDetails, setServedLocationDetails] = useState<unknown[]>([]);
  const [highlightCityId, setHighlightCityId] = useState<number | null>(null);
  const [targetScrollY, setTargetScrollY] = useState<number | null>(null);
  const [expandedCount, setExpandedCount] = useState(0);
  const [collapseAllFn, setCollapseAllFn] = useState<(() => void) | null>(null);

  // Scroll indicators state
  const [scrollState, setScrollState] = useState({
    canScrollUp: false,
    canScrollDown: false,
    isNearTop: true,
    isNearBottom: false
  });

  // Scheduler Configuration state
  const [schedulerConfig, setSchedulerConfig] = useState<SchedulerConfig>({
    bufferBeforeHours: 2,
    bufferAfterHours: 1,
    defaultSlotDurationHours: 2,
    minimumAdvanceHours: 1
  });
  const [schedulerHasChanges, setSchedulerHasChanges] = useState(false);
  const [schedulerSaveStatus, setSchedulerSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Header measurement for scroll indicators
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(80); // fallback value

  // Load current config when component mounts or sessionConfig changes
  useEffect(() => {
    if (sessionConfig) {
      setFormData(sessionConfig);
      setHasChanges(false);
    }
  }, [sessionConfig]);

  // Load initial service location selections
  useEffect(() => {
    loadServiceLocationSelections();
  }, []);

  // Load scheduler configuration
  useEffect(() => {
    loadSchedulerConfiguration();
  }, []);

  // Measure header height for scroll indicators
  useEffect(() => {
    if (headerRef.current) {
      const height = headerRef.current.offsetHeight;
      setHeaderHeight(height);
    }
  }, [sessionConfig, serviceLocationSelections, schedulerConfig]); // Recalculate when data changes

  const loadServiceLocationSelections = async () => {
    try {
      const data = await adminService.getServedLocations();
      const selections: ServiceLocationSelection[] = data.servedLocations.map((loc: ServedLocationData) => ({
        location_type: loc.location_type,
        location_id: loc.location_id,
        notes: loc.notes
      }));
      setServiceLocationSelections(selections);
      setServedLocationDetails(data.servedLocations);
    } catch (error) {
      console.error('Failed to load service location selections:', error);
    }
  };

  const loadSchedulerConfiguration = async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

      // Load all scheduler settings
      const settingKeys = [
        'scheduler_buffer_before_hours',
        'scheduler_buffer_after_hours',
        'scheduler_default_slot_duration_hours',
        'scheduler_minimum_advance_hours'
      ];

      const configData: Partial<SchedulerConfig> = {};

      for (const key of settingKeys) {
        try {
          const response = await fetch(`${API_BASE_URL}/admin/system-settings/${key}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const result = await response.json();
            const value = parseInt(result.data.value) || 0;

            switch (key) {
              case 'scheduler_buffer_before_hours':
                configData.bufferBeforeHours = value;
                break;
              case 'scheduler_buffer_after_hours':
                configData.bufferAfterHours = value;
                break;
              case 'scheduler_default_slot_duration_hours':
                configData.defaultSlotDurationHours = value;
                break;
              case 'scheduler_minimum_advance_hours':
                configData.minimumAdvanceHours = value;
                break;
            }
          }
        } catch (error) {
          console.warn(`Failed to load setting ${key}:`, error);
        }
      }

      // Update state with loaded config, using defaults for missing values
      const finalConfig: SchedulerConfig = {
        bufferBeforeHours: configData.bufferBeforeHours ?? 2,
        bufferAfterHours: configData.bufferAfterHours ?? 1,
        defaultSlotDurationHours: configData.defaultSlotDurationHours ?? 2,
        minimumAdvanceHours: configData.minimumAdvanceHours ?? 1
      };

      setSchedulerConfig(finalConfig);
      setSchedulerHasChanges(false);
    } catch (error) {
      console.error('Failed to load scheduler configuration:', error);
    }
  };

  // Handle scroll events for fade indicators
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const scrollTop = target.scrollTop;
    const scrollHeight = target.scrollHeight;
    const clientHeight = target.clientHeight;
    const threshold = 10; // pixels

    const canScrollUp = scrollTop > threshold;
    const canScrollDown = scrollTop < scrollHeight - clientHeight - threshold;
    const isNearTop = scrollTop <= threshold;
    const isNearBottom = scrollTop >= scrollHeight - clientHeight - threshold;

    setScrollState({
      canScrollUp,
      canScrollDown,
      isNearTop,
      isNearBottom
    });
  };

  const handleCityBadgeClick = (cityId: number, event: React.MouseEvent) => {
    // Calculate the click position relative to the viewport
    const clickY = event.clientY;
    setHighlightCityId(cityId);
    setTargetScrollY(clickY);

    // Clear highlight after 3 seconds
    setTimeout(() => {
      setHighlightCityId(null);
      setTargetScrollY(null);
    }, 3000);
  };

  const handleExpandedCountChange = useCallback((count: number, collapseAllFunction: () => void) => {
    setExpandedCount(count);
    setCollapseAllFn(() => collapseAllFunction);
  }, []);

  const handleCollapseAllClick = () => {
    if (collapseAllFn) {
      collapseAllFn();
    }
  };

  // Handle scrolling the main container to position highlighted city at click position
  useEffect(() => {
    if (highlightCityId !== null && targetScrollY !== null) {
      setTimeout(() => {
        const highlightedElement = document.querySelector(`[data-city-id="${highlightCityId}"]`);
        // Target the specific main scroll container for AdminSettings
        const mainScrollContainer = document.querySelector('.h-full.overflow-y-auto') as HTMLDivElement;

        if (highlightedElement && mainScrollContainer) {
          const elementRect = highlightedElement.getBoundingClientRect();
          const containerRect = mainScrollContainer.getBoundingClientRect();

          // Calculate how much we need to scroll to position the center of the element at targetScrollY
          // Account for the container's position relative to the viewport
          const elementCenterY = elementRect.top + (elementRect.height / 2);
          const targetYRelativeToContainer = targetScrollY - containerRect.top;
          const scrollOffset = elementCenterY - containerRect.top - targetYRelativeToContainer;

          mainScrollContainer.scrollTo({
            top: mainScrollContainer.scrollTop + scrollOffset,
            behavior: 'smooth'
          });
        }
      }, 150); // Small delay to ensure DOM is updated after expansion
    }
  }, [highlightCityId, targetScrollY]);

  const handleInputChange = (field: keyof SessionConfig, value: string) => {
    const numericValue = parseInt(value) || 0;
    const newFormData = { ...formData, [field]: numericValue };
    setFormData(newFormData);

    // Check if there are changes
    if (sessionConfig) {
      const changed = newFormData.timeout !== sessionConfig.timeout ||
                     newFormData.warningTime !== sessionConfig.warningTime;
      setHasChanges(changed);
    }
  };

  const handleInputBlur = () => {
    setShowValidationErrors(true);
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      // Validate values
      if (formData.timeout <= 0 || formData.warningTime <= 0) {
        throw new Error('Values must be greater than 0');
      }
      if (formData.warningTime >= formData.timeout) {
        throw new Error('Warning time must be less than session timeout');
      }

      updateSessionConfig(formData);
      setHasChanges(false);
      setSaveStatus('saved');

      console.log(`⚙️ Session timeout settings updated immediately:`, formData);

      // Clear saved status after 3 seconds
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Error saving session config:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleReset = () => {
    if (sessionConfig) {
      setFormData(sessionConfig);
      setHasChanges(false);
    }
  };

  const handleSetDefaults = () => {
    const defaults: SessionConfig = {
      timeout: 15,
      warningTime: 2
    };
    setFormData(defaults);
    const changed = sessionConfig ?
      (defaults.timeout !== sessionConfig.timeout || defaults.warningTime !== sessionConfig.warningTime) :
      true;
    setHasChanges(changed);
  };

  const handleServiceLocationSelectionChange = (selections: ServiceLocationSelection[]) => {
    setServiceLocationSelections(selections);
    setServiceLocationHasChanges(true);
  };

  const handleSaveServiceLocations = async () => {
    setServiceLocationSaveStatus('saving');
    try {
      await adminService.updateServedLocations(serviceLocationSelections);

      setServiceLocationHasChanges(false);
      setServiceLocationSaveStatus('saved');
      console.log('✅ Service location selections saved successfully');

      // Refresh the served location details after save
      await loadServiceLocationSelections();

      // Clear saved status after 3 seconds
      setTimeout(() => setServiceLocationSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Error saving service locations:', error);
      setServiceLocationSaveStatus('error');
      setTimeout(() => setServiceLocationSaveStatus('idle'), 3000);
    }
  };

  const handleSchedulerInputChange = (field: keyof SchedulerConfig, value: string) => {
    const numericValue = parseInt(value) || 0;
    const newConfig = { ...schedulerConfig, [field]: numericValue };
    setSchedulerConfig(newConfig);
    setSchedulerHasChanges(true);
  };

  const handleSaveSchedulerConfig = async () => {
    setSchedulerSaveStatus('saving');
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

      // Map config fields to database setting keys
      const settingMappings = {
        bufferBeforeHours: 'scheduler_buffer_before_hours',
        bufferAfterHours: 'scheduler_buffer_after_hours',
        defaultSlotDurationHours: 'scheduler_default_slot_duration_hours',
        minimumAdvanceHours: 'scheduler_minimum_advance_hours'
      };

      // Save each setting
      for (const [configKey, settingKey] of Object.entries(settingMappings)) {
        const value = schedulerConfig[configKey as keyof SchedulerConfig];

        await fetch(`${API_BASE_URL}/admin/system-settings/${settingKey}`, {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ value }),
        });
      }

      setSchedulerHasChanges(false);
      setSchedulerSaveStatus('saved');
      console.log('✅ Scheduler configuration saved successfully:', schedulerConfig);

      // Clear saved status after 3 seconds
      setTimeout(() => setSchedulerSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Error saving scheduler configuration:', error);
      setSchedulerSaveStatus('error');
      setTimeout(() => setSchedulerSaveStatus('idle'), 3000);
    }
  };

  const handleResetSchedulerConfig = () => {
    // Reset to default values
    const defaults: SchedulerConfig = {
      bufferBeforeHours: 2,
      bufferAfterHours: 1,
      defaultSlotDurationHours: 2,
      minimumAdvanceHours: 1
    };
    setSchedulerConfig(defaults);
    setSchedulerHasChanges(true);
  };

  return (
    <div className="h-full relative" style={{ height: 'calc(100vh - 80px)' }}>
      <div className="h-full overflow-y-auto" onScroll={handleScroll}>
        {/* Sticky Header */}
        <div ref={headerRef} className={`sticky top-0 z-20 ${themeClasses.bg.primary} pb-4 pt-2 mb-6 flex items-center`}>
          <Settings className={`w-8 h-8 ${themeClasses.text.muted} mr-3`} />
          <div>
            <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Admin Settings</h1>
            <p className={`${themeClasses.text.secondary}`}>Configure system settings and security preferences</p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6 pr-2">

      {/* Session Management Settings */}
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg`}>
        <div className={`px-6 py-4 border-b ${themeClasses.border.primary}`}>
          <div className="flex items-center">
            <Clock className="w-5 h-5 text-blue-500 mr-2" />
            <h2 className={`text-lg font-medium ${themeClasses.text.primary}`}>Session Management</h2>
          </div>
          <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
            Configure automatic logout and session warning settings
          </p>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Session Timeout */}
            <div>
              <label htmlFor="timeout" className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Session Timeout (minutes)
              </label>
              <div className="relative">
                <input
                  type="number"
                  id="timeout"
                  min="1"
                  max="480"
                  value={formData.timeout || ''}
                  onChange={(e) => handleInputChange('timeout', e.target.value)}
                  onBlur={handleInputBlur}
                  className={`block w-full rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <Clock className={`h-4 w-4 ${themeClasses.text.muted}`} />
                </div>
              </div>
              <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                Time of inactivity before automatic logout (1-480 minutes)
              </p>
            </div>

            {/* Warning Time */}
            <div>
              <label htmlFor="warningTime" className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Warning Time (minutes)
              </label>
              <div className="relative">
                <input
                  type="number"
                  id="warningTime"
                  min="1"
                  max={formData.timeout - 1}
                  value={formData.warningTime || ''}
                  onChange={(e) => handleInputChange('warningTime', e.target.value)}
                  onBlur={handleInputBlur}
                  className={`block w-full rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <Shield className={`h-4 w-4 ${themeClasses.text.muted}`} />
                </div>
              </div>
              <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                Show warning this many minutes before session expires
              </p>
            </div>
          </div>

          {/* Current Values Display */}
          <div className={`${themeClasses.bg.secondary} rounded-lg p-4`}>
            <h3 className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>Current Settings Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className={`${themeClasses.text.secondary}`}>Sessions expire after:</span>
                <span className={`ml-2 font-medium ${themeClasses.text.primary}`}>{formData.timeout} minutes of inactivity</span>
              </div>
              <div>
                <span className={`${themeClasses.text.secondary}`}>Warning shown:</span>
                <span className={`ml-2 font-medium ${themeClasses.text.primary}`}>{formData.warningTime} minutes before expiry</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleSetDefaults}
                className={`inline-flex items-center px-3 py-2 border ${themeClasses.border.primary} shadow-sm text-sm font-medium rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset to Defaults
              </button>

              {hasChanges && (
                <button
                  onClick={handleReset}
                  className={`inline-flex items-center px-3 py-2 border ${themeClasses.border.primary} shadow-sm text-sm font-medium rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                >
                  Cancel Changes
                </button>
              )}
            </div>

            <button
              onClick={handleSave}
              disabled={!hasChanges || saveStatus === 'saving'}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                hasChanges && saveStatus !== 'saving'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {saveStatus === 'saving' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : saveStatus === 'saved' ? (
                <>
                  <span className="text-green-200 mr-2">✓</span>
                  Saved
                </>
              ) : saveStatus === 'error' ? (
                <>
                  <span className="text-red-200 mr-2">✗</span>
                  Error
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Settings
                </>
              )}
            </button>
          </div>

          {/* Validation Errors */}
          {showValidationErrors && formData.warningTime >= formData.timeout && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-600">
                ⚠️ Warning time must be less than session timeout
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Scheduler Configuration */}
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg`}>
        <div className={`px-6 py-4 border-b ${themeClasses.border.primary}`}>
          <div className="flex items-center">
            <Calendar className="w-5 h-5 text-indigo-500 mr-2" />
            <h2 className={`text-lg font-medium ${themeClasses.text.primary}`}>Scheduler Configuration</h2>
          </div>
          <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
            Configure buffer times and scheduling constraints for appointment booking
          </p>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Buffer Before Hours */}
            <div>
              <label htmlFor="bufferBefore" className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Buffer Before Appointment (hours)
              </label>
              <div className="relative">
                <input
                  type="number"
                  id="bufferBefore"
                  min="0"
                  max="24"
                  value={schedulerConfig.bufferBeforeHours || ''}
                  onChange={(e) => handleSchedulerInputChange('bufferBeforeHours', e.target.value)}
                  className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <Clock className={`h-4 w-4 ${themeClasses.text.muted}`} />
                </div>
              </div>
              <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                Minimum time required before another appointment can be scheduled
              </p>
            </div>

            {/* Buffer After Hours */}
            <div>
              <label htmlFor="bufferAfter" className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Buffer After Appointment (hours)
              </label>
              <div className="relative">
                <input
                  type="number"
                  id="bufferAfter"
                  min="0"
                  max="24"
                  value={schedulerConfig.bufferAfterHours || ''}
                  onChange={(e) => handleSchedulerInputChange('bufferAfterHours', e.target.value)}
                  className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <Clock className={`h-4 w-4 ${themeClasses.text.muted}`} />
                </div>
              </div>
              <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                Minimum time required after an appointment ends
              </p>
            </div>

            {/* Default Slot Duration */}
            <div>
              <label htmlFor="slotDuration" className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Default Slot Duration (hours)
              </label>
              <div className="relative">
                <input
                  type="number"
                  id="slotDuration"
                  min="0.5"
                  max="12"
                  step="0.5"
                  value={schedulerConfig.defaultSlotDurationHours || ''}
                  onChange={(e) => handleSchedulerInputChange('defaultSlotDurationHours', e.target.value)}
                  className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <Calendar className={`h-4 w-4 ${themeClasses.text.muted}`} />
                </div>
              </div>
              <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                Default duration for new appointment time slots
              </p>
            </div>

            {/* Minimum Advance Hours */}
            <div>
              <label htmlFor="minimumAdvance" className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Minimum Advance Notice (hours)
              </label>
              <div className="relative">
                <input
                  type="number"
                  id="minimumAdvance"
                  min="0"
                  max="168"
                  value={schedulerConfig.minimumAdvanceHours || ''}
                  onChange={(e) => handleSchedulerInputChange('minimumAdvanceHours', e.target.value)}
                  className={`block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <Shield className={`h-4 w-4 ${themeClasses.text.muted}`} />
                </div>
              </div>
              <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                How far in advance appointments must be scheduled
              </p>
            </div>
          </div>

          {/* Current Values Display */}
          <div className={`${themeClasses.bg.secondary} rounded-lg p-4`}>
            <h3 className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>Current Scheduler Settings Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className={`${themeClasses.text.secondary}`}>Buffer before appointments:</span>
                <span className={`ml-2 font-medium ${themeClasses.text.primary}`}>{schedulerConfig.bufferBeforeHours} hours</span>
              </div>
              <div>
                <span className={`${themeClasses.text.secondary}`}>Buffer after appointments:</span>
                <span className={`ml-2 font-medium ${themeClasses.text.primary}`}>{schedulerConfig.bufferAfterHours} hours</span>
              </div>
              <div>
                <span className={`${themeClasses.text.secondary}`}>Default slot duration:</span>
                <span className={`ml-2 font-medium ${themeClasses.text.primary}`}>{schedulerConfig.defaultSlotDurationHours} hours</span>
              </div>
              <div>
                <span className={`${themeClasses.text.secondary}`}>Minimum advance notice:</span>
                <span className={`ml-2 font-medium ${themeClasses.text.primary}`}>{schedulerConfig.minimumAdvanceHours} hours</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleResetSchedulerConfig}
                className={`inline-flex items-center px-3 py-2 border ${themeClasses.border.primary} shadow-sm text-sm font-medium rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset to Defaults
              </button>
            </div>

            <button
              onClick={handleSaveSchedulerConfig}
              disabled={!schedulerHasChanges || schedulerSaveStatus === 'saving'}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                schedulerHasChanges && schedulerSaveStatus !== 'saving'
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {schedulerSaveStatus === 'saving' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : schedulerSaveStatus === 'saved' ? (
                <>
                  <span className="text-green-200 mr-2">✓</span>
                  Saved
                </>
              ) : schedulerSaveStatus === 'error' ? (
                <>
                  <span className="text-red-200 mr-2">✗</span>
                  Error
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Scheduler Settings
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Service Location Management */}
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg`}>
        <div className={`px-6 py-4 border-b ${themeClasses.border.primary}`}>
          <div className="flex items-center">
            <MapPin className={`w-5 h-5 ${themeClasses.text.muted} mr-2`} />
            <div>
              <h2 className={`text-lg font-semibold ${themeClasses.text.primary}`}>Service Area Management</h2>
              <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
                Define the geographic areas where your company provides services
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-6">
          {/* Service Area Summary */}
          {serviceLocationSelections.length > 0 && (
            <div className={`mb-6 p-4 ${themeClasses.bg.secondary} rounded-lg border ${themeClasses.border.primary}`}>
              <h4 className={`text-sm font-medium ${themeClasses.text.primary} mb-3 flex items-center`}>
                <MapPin className="w-4 h-4 mr-2 text-blue-500" />
                Current Service Areas
              </h4>
              <div className="flex flex-wrap gap-2">
                {servedLocationDetails
                  .filter(loc => loc.location_type === 'city')
                  .sort((a, b) => (a.location_name || '').localeCompare(b.location_name || ''))
                  .slice(0, 8)
                  .map((location) => (
                    <button
                      key={`${location.location_type}-${location.location_id}`}
                      onClick={(event) => handleCityBadgeClick(location.location_id, event)}
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs cursor-pointer transition-colors duration-200 ${themeClasses.bg.primary} ${themeClasses.text.secondary} border ${themeClasses.border.primary} hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-600`}
                    >
                      <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                      {location.location_name}
                    </button>
                  ))}
                {servedLocationDetails.filter(loc => loc.location_type === 'city').length > 8 && (
                  <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${themeClasses.text.muted}`}>
                    +{servedLocationDetails.filter(loc => loc.location_type === 'city').length - 8} more
                  </div>
                )}
              </div>
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="inline-flex items-center mr-4">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                  Full Coverage
                </span>
                <span className="inline-flex items-center">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full mr-1"></div>
                  Partial Coverage
                </span>
              </div>
            </div>
          )}

          <ServiceLocationSelector
            initialSelections={serviceLocationSelections}
            onSelectionChange={handleServiceLocationSelectionChange}
            highlightCityId={highlightCityId}
            targetScrollY={targetScrollY}
            onExpandedCountChange={handleExpandedCountChange}
          />

          {/* Service Location Actions */}
          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {serviceLocationSelections.length > 0 ? (
                `${serviceLocationSelections.length} location${serviceLocationSelections.length !== 1 ? 's' : ''} selected for service coverage`
              ) : (
                'No service areas configured'
              )}
            </div>

            <button
              onClick={handleSaveServiceLocations}
              disabled={!serviceLocationHasChanges || serviceLocationSaveStatus === 'saving'}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                serviceLocationHasChanges && serviceLocationSaveStatus !== 'saving'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-400 cursor-not-allowed'
              }`}
            >
              {serviceLocationSaveStatus === 'saving' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : serviceLocationSaveStatus === 'saved' ? (
                <>
                  <span className="text-green-200 mr-2">✓</span>
                  Saved
                </>
              ) : serviceLocationSaveStatus === 'error' ? (
                <>
                  <span className="text-red-200 mr-2">✗</span>
                  Error
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Service Areas
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Information Panel */}
      <div className={`${themeClasses.bg.secondary} border ${themeClasses.border.primary} rounded-lg p-4`}>
        <h3 className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>How These Settings Work</h3>

        <div className="space-y-4">
          <div>
            <h4 className={`text-xs font-semibold ${themeClasses.text.primary} mb-1 uppercase tracking-wide`}>Session Management</h4>
            <ul className={`text-sm ${themeClasses.text.secondary} space-y-1`}>
              <li>• Sessions automatically track user activity (mouse movement, clicks, keyboard input)</li>
              <li>• A warning will appear {formData.warningTime} minutes before session expiry</li>
              <li>• Users can extend their session or will be logged out automatically</li>
              <li>• Changes take effect immediately for the current session</li>
              <li>• Settings are preserved across browser sessions</li>
            </ul>
          </div>

          <div>
            <h4 className={`text-xs font-semibold ${themeClasses.text.primary} mb-1 uppercase tracking-wide`}>Scheduler Configuration</h4>
            <ul className={`text-sm ${themeClasses.text.secondary} space-y-1`}>
              <li>• Buffer times prevent appointments from being scheduled too close together</li>
              <li>• Minimum advance notice ensures adequate preparation time</li>
              <li>• Default slot duration sets the initial time block for new appointments</li>
              <li>• Settings apply system-wide to all client scheduling requests</li>
              <li>• Changes take effect immediately for new appointment bookings</li>
            </ul>
          </div>
        </div>
        </div>
        </div>

        {/* Scroll Indicators */}
        {/* Top fade gradient - positioned exactly at the bottom edge of sticky header */}
        {scrollState.canScrollUp && (
          <div
            className="absolute left-0 right-0 h-12 bg-gradient-to-b from-white to-transparent dark:from-gray-800 dark:to-transparent pointer-events-none z-20"
            style={{ top: `${headerHeight - 1}px` }}
          />
        )}

        {/* Bottom fade gradient - positioned relative to the container, not scrollable content */}
        {scrollState.canScrollDown && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent dark:from-gray-800 dark:to-transparent pointer-events-none z-20" />
        )}

        {/* Scroll indicators - positioned just below the fade gradient */}
        {scrollState.canScrollUp && (
          <div
            className="absolute right-4 z-30 flex items-center space-x-1 text-gray-500 dark:text-gray-400 text-xs pointer-events-none"
            style={{ top: `${headerHeight + 4}px` }}
          >
            <ChevronUp className="w-3 h-3 animate-bounce" />
            <span className="font-medium">More above</span>
          </div>
        )}

        {/* Collapse All indicator - positioned below "More above" */}
        {expandedCount > 0 && (
          <div
            className="absolute right-4 z-30 flex items-center space-x-2"
            style={{ top: `${headerHeight + (scrollState.canScrollUp ? 28 : 4)}px` }}
          >
            <div className="flex items-center bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-md px-2 py-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></div>
              <span className="text-xs text-blue-700 dark:text-blue-300 font-medium mr-2">
                {expandedCount} expanded
              </span>
              <button
                onClick={handleCollapseAllClick}
                className="inline-flex items-center text-xs font-medium text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 transition-colors"
              >
                <Minimize2 className="w-3 h-3 mr-1" />
                Collapse All
              </button>
            </div>
          </div>
        )}

        {scrollState.canScrollDown && (
          <div className="absolute bottom-1 right-4 z-30 flex items-center space-x-1 text-gray-500 dark:text-gray-400 text-xs pointer-events-none">
            <ChevronDown className="w-3 h-3 animate-bounce" />
            <span className="font-medium">More below</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSettings;