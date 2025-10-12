import React, { useState, useEffect } from 'react';
import { X, Save, AlertTriangle } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import api from '../../services/apiService';

// Import modular configuration components
import RSIConfiguration from './AlertConfiguration/RSIConfiguration';
import StochasticConfiguration from './AlertConfiguration/StochasticConfiguration';
import WilliamsRConfiguration from './AlertConfiguration/WilliamsRConfiguration';
import MACDConfiguration from './AlertConfiguration/MACDConfiguration';
import ROCConfiguration from './AlertConfiguration/ROCConfiguration';
import ATRConfiguration from './AlertConfiguration/ATRConfiguration';
import IndicatorToggle from './AlertConfiguration/IndicatorToggle';

interface AlertConfiguration {
  id?: number;
  alert_name: string;
  alert_type: string;
  enabled: boolean;
  min_indicator_count: number;
  require_extreme_for_single: boolean;
  rsi_thresholds: any;
  stochastic_thresholds: any;
  williams_r_thresholds: any;
  macd_settings: any;
  roc_settings: any;
  atr_settings: any;
  notify_email: boolean;
  notify_dashboard: boolean;
  notify_websocket: boolean;
}

interface AlertConfigurationEditorModalProps {
  configuration: AlertConfiguration | null;
  onSave: () => void;
  onCancel: () => void;
}

const defaultConfiguration: Omit<AlertConfiguration, 'id'> = {
  alert_name: '',
  alert_type: 'high_utilization',
  enabled: true,
  min_indicator_count: 2,
  require_extreme_for_single: true,
  rsi_thresholds: {
    low_moderate: 30,
    low_extreme: 20,
    high_moderate: 70,
    high_extreme: 80,
    enabled: true,
  },
  stochastic_thresholds: {
    low_moderate: 20,
    low_extreme: 10,
    high_moderate: 80,
    high_extreme: 90,
    detect_crossovers: true,
    enabled: true,
  },
  williams_r_thresholds: {
    low_moderate: -80,
    low_extreme: -90,
    high_moderate: -20,
    high_extreme: -10,
    enabled: true,
  },
  macd_settings: {
    detect_crossovers: true,
    momentum_threshold_multiplier: 0.5,
    enabled: true,
  },
  roc_settings: {
    extreme_multiplier: 2.0,
    lookback_periods: 20,
    enabled: true,
  },
  atr_settings: {
    volatility_multiplier: 1.5,
    lookback_periods: 20,
    enabled: true,
  },
  notify_email: false,
  notify_dashboard: true,
  notify_websocket: true,
};

const AlertConfigurationEditorModal: React.FC<AlertConfigurationEditorModalProps> = ({
  configuration,
  onSave,
  onCancel,
}) => {
  const [formData, setFormData] = useState<Omit<AlertConfiguration, 'id'>>(
    configuration || defaultConfiguration
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (configuration) {
      setFormData(configuration);
    }
  }, [configuration]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (configuration?.id) {
        // Update existing configuration
        await api.put(`/admin/alerts/configurations/${configuration.id}`, formData);
      } else {
        // Create new configuration
        await api.post('/admin/alerts/configurations', formData);
      }
      onSave();
    } catch (err: any) {
      console.error('Failed to save alert configuration:', err);
      setError(err.response?.data?.message || 'Failed to save configuration');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className={`${themeClasses.bg.card} rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b ${themeClasses.border.primary} flex items-center justify-between`}>
          <div className="flex items-center">
            <AlertTriangle className="w-6 h-6 text-orange-500 mr-3" />
            <div>
              <h2 className={`text-xl font-semibold ${themeClasses.text.primary}`}>
                {configuration ? 'Edit Alert Configuration' : 'New Alert Configuration'}
              </h2>
              <p className={`text-sm ${themeClasses.text.secondary}`}>
                Configure indicator confluence detection thresholds
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className={`p-2 ${themeClasses.text.secondary} hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}

            {/* Basic Settings */}
            <div className="space-y-4">
              <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Basic Settings</h3>

              {/* Alert Name */}
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                  Alert Name
                </label>
                <input
                  type="text"
                  value={formData.alert_name}
                  onChange={(e) => setFormData({ ...formData, alert_name: e.target.value })}
                  className={`block w-full rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                  placeholder="e.g., CPU Overbought Alert"
                  required
                />
              </div>

              {/* Alert Type */}
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                  Alert Type
                </label>
                <select
                  value={formData.alert_type}
                  onChange={(e) => setFormData({ ...formData, alert_type: e.target.value })}
                  className={`block w-full rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                >
                  <option value="high_utilization">High Utilization</option>
                  <option value="low_utilization">Low Utilization</option>
                  <option value="rising_trend">Rising Trend</option>
                  <option value="declining_trend">Declining Trend</option>
                  <option value="volatility_spike">Volatility Spike</option>
                </select>
              </div>

              {/* Enabled Toggle */}
              <IndicatorToggle
                label="Enabled"
                description="Enable or disable this alert configuration"
                enabled={formData.enabled}
                onChange={(enabled) => setFormData({ ...formData, enabled })}
              />
            </div>

            {/* Confluence Settings */}
            <div className="space-y-4">
              <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Confluence Settings</h3>

              {/* Minimum Indicator Count */}
              <div>
                <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                  Minimum Indicators for Confluence
                </label>
                <input
                  type="number"
                  value={formData.min_indicator_count}
                  onChange={(e) => setFormData({ ...formData, min_indicator_count: parseInt(e.target.value) || 1 })}
                  min="1"
                  max="6"
                  className={`block w-full rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.bg.primary} ${themeClasses.text.primary} border ${themeClasses.border.primary}`}
                />
                <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                  Number of indicators that must signal simultaneously (1-6)
                </p>
              </div>

              {/* Require Extreme for Single */}
              <IndicatorToggle
                label="Require Extreme for Single Indicator"
                description="Single indicator must be at extreme threshold to trigger alert"
                enabled={formData.require_extreme_for_single}
                onChange={(enabled) => setFormData({ ...formData, require_extreme_for_single: enabled })}
              />
            </div>

            {/* Indicator Thresholds */}
            <div className="space-y-4">
              <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Indicator Thresholds</h3>

              <RSIConfiguration
                thresholds={formData.rsi_thresholds}
                onChange={(rsi_thresholds) => setFormData({ ...formData, rsi_thresholds })}
              />

              <StochasticConfiguration
                thresholds={formData.stochastic_thresholds}
                onChange={(stochastic_thresholds) => setFormData({ ...formData, stochastic_thresholds })}
              />

              <WilliamsRConfiguration
                thresholds={formData.williams_r_thresholds}
                onChange={(williams_r_thresholds) => setFormData({ ...formData, williams_r_thresholds })}
              />

              <MACDConfiguration
                settings={formData.macd_settings}
                onChange={(macd_settings) => setFormData({ ...formData, macd_settings })}
              />

              <ROCConfiguration
                settings={formData.roc_settings}
                onChange={(roc_settings) => setFormData({ ...formData, roc_settings })}
              />

              <ATRConfiguration
                settings={formData.atr_settings}
                onChange={(atr_settings) => setFormData({ ...formData, atr_settings })}
              />
            </div>

            {/* Notification Settings */}
            <div className="space-y-4">
              <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>Notification Settings</h3>

              <div className={`${themeClasses.bg.secondary} rounded-lg p-4 space-y-3`}>
                <IndicatorToggle
                  label="Dashboard Notifications"
                  description="Show alerts in the admin dashboard"
                  enabled={formData.notify_dashboard}
                  onChange={(enabled) => setFormData({ ...formData, notify_dashboard: enabled })}
                />

                <IndicatorToggle
                  label="WebSocket Notifications"
                  description="Send real-time alerts via WebSocket"
                  enabled={formData.notify_websocket}
                  onChange={(enabled) => setFormData({ ...formData, notify_websocket: enabled })}
                />

                <IndicatorToggle
                  label="Email Notifications"
                  description="Send alert emails (future enhancement)"
                  enabled={formData.notify_email}
                  onChange={(enabled) => setFormData({ ...formData, notify_email: enabled })}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={`px-6 py-4 border-t ${themeClasses.border.primary} flex items-center justify-end space-x-3 bg-gray-50 dark:bg-gray-800/50`}>
            <button
              type="button"
              onClick={onCancel}
              className={`px-4 py-2 text-sm font-medium rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.primary} border ${themeClasses.border.primary} hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !formData.alert_name}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                saving || !formData.alert_name
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Configuration
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AlertConfigurationEditorModal;
