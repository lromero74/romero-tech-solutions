import React, { useState, useEffect } from 'react';
import { Settings, Clock, Shield, Save, RotateCcw, MapPin } from 'lucide-react';
import { useEnhancedAuth } from '../../contexts/EnhancedAuthContext';
import { SessionConfig } from '../../utils/sessionManager';
import { useTheme, themeClasses } from '../../contexts/ThemeContext';
import ServiceLocationSelector from './ServiceLocationSelector';

interface ServiceLocationSelection {
  location_type: string;
  location_id: number;
  notes?: string;
}

const AdminSettings: React.FC = () => {
  const { theme } = useTheme();
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

  const loadServiceLocationSelections = async () => {
    try {
      const response = await fetch('/api/locations/served', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const selections: ServiceLocationSelection[] = data.servedLocations.map((loc: any) => ({
          location_type: loc.location_type,
          location_id: loc.location_id,
          notes: loc.notes
        }));
        setServiceLocationSelections(selections);
      }
    } catch (error) {
      console.error('Failed to load service location selections:', error);
    }
  };

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
      const response = await fetch('/api/locations/served', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ selections: serviceLocationSelections })
      });

      if (!response.ok) {
        throw new Error('Failed to save service location selections');
      }

      setServiceLocationHasChanges(false);
      setServiceLocationSaveStatus('saved');
      console.log('✅ Service location selections saved successfully');

      // Clear saved status after 3 seconds
      setTimeout(() => setServiceLocationSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Error saving service locations:', error);
      setServiceLocationSaveStatus('error');
      setTimeout(() => setServiceLocationSaveStatus('idle'), 3000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <Settings className={`w-8 h-8 ${themeClasses.text.muted} mr-3`} />
        <div>
          <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Admin Settings</h1>
          <p className={`${themeClasses.text.secondary}`}>Configure system settings and security preferences</p>
        </div>
      </div>

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
          <ServiceLocationSelector
            initialSelections={serviceLocationSelections}
            onSelectionChange={handleServiceLocationSelectionChange}
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
        <h3 className={`text-sm font-medium ${themeClasses.text.primary} mb-2`}>How Session Management Works</h3>
        <ul className={`text-sm ${themeClasses.text.secondary} space-y-1`}>
          <li>• Sessions automatically track user activity (mouse movement, clicks, keyboard input)</li>
          <li>• A warning will appear {formData.warningTime} minutes before session expiry</li>
          <li>• Users can extend their session or will be logged out automatically</li>
          <li>• Changes take effect immediately for the current session</li>
          <li>• Settings are preserved across browser sessions</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminSettings;