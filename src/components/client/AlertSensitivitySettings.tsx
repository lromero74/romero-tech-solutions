import React, { useState, useEffect } from 'react';
import { Activity, Clock, TrendingUp, BarChart3, Calendar, Save, RefreshCw } from 'lucide-react';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';
import { apiService } from '../../services/apiService';

interface AggregationLevel {
  level: string;
  interval: string;
  minutes: number;
  description: string;
  icon: React.ReactNode;
  tradeOff: string;
}

const AGGREGATION_LEVELS: AggregationLevel[] = [
  {
    level: 'raw',
    interval: '5 minutes',
    minutes: 5,
    description: 'Raw data points - most sensitive, most false alarms',
    icon: <Activity className="w-5 h-5" />,
    tradeOff: '🔥 Very Fast Alerts | ⚠️ More False Alarms'
  },
  {
    level: '15min',
    interval: '15 minutes',
    minutes: 15,
    description: 'Very sensitive - fewer false alarms than raw, but still responsive',
    icon: <Clock className="w-5 h-5" />,
    tradeOff: '⚡ Fast Alerts | ✓ Balanced'
  },
  {
    level: '30min',
    interval: '30 minutes',
    minutes: 30,
    description: 'Balanced - good compromise between responsiveness and reliability',
    icon: <TrendingUp className="w-5 h-5" />,
    tradeOff: '⚖️ Best Balance | ✓ Recommended'
  },
  {
    level: '1hour',
    interval: '1 hour',
    minutes: 60,
    description: 'Conservative - fewer alerts, higher confidence',
    icon: <BarChart3 className="w-5 h-5" />,
    tradeOff: '🎯 High Confidence | ⏰ Slower Alerts'
  },
  {
    level: '4hour',
    interval: '4 hours',
    minutes: 240,
    description: 'Very conservative - minimal false alarms, delayed notifications',
    icon: <BarChart3 className="w-5 h-5" />,
    tradeOff: '🛡️ Minimal False Alarms | ⏳ Delayed'
  },
  {
    level: '1day',
    interval: '1 day',
    minutes: 1440,
    description: 'Daily trends - best for long-term monitoring',
    icon: <Calendar className="w-5 h-5" />,
    tradeOff: '📊 Trends Only | ⏰ Very Delayed'
  }
];

const AlertSensitivitySettings: React.FC = () => {
  const { isDarkMode } = useClientTheme();
  const { t } = useClientLanguage();
  const [selectedLevel, setSelectedLevel] = useState<string>('raw');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const themeClasses = {
    container: isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-white' : 'text-gray-900',
    textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    border: isDarkMode ? 'border-gray-700' : 'border-gray-200',
    card: isDarkMode ? 'bg-gray-750 border-gray-600' : 'bg-gray-50 border-gray-200',
    cardHover: isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
    button: isDarkMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white',
    buttonSecondary: isDarkMode ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-900',
  };

  useEffect(() => {
    loadDefaultLevel();
  }, []);

  const loadDefaultLevel = async () => {
    try {
      setLoading(true);
      const response = await apiService.get('/client/profile/default-aggregation-level');
      if (response.success && response.data) {
        setSelectedLevel(response.data.default_aggregation_level || 'raw');
      }
    } catch (error) {
      console.error('Error loading default aggregation level:', error);
      setMessage({
        type: 'error',
        text: 'Failed to load alert settings'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);

      const response = await apiService.put('/client/profile/default-aggregation-level', {
        aggregation_level: selectedLevel
      });

      if (response.success) {
        setMessage({
          type: 'success',
          text: 'Alert sensitivity settings saved successfully!'
        });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({
          type: 'error',
          text: response.message || 'Failed to save settings'
        });
      }
    } catch (error) {
      console.error('Error saving aggregation level:', error);
      setMessage({
        type: 'error',
        text: 'Failed to save alert sensitivity settings'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={`${themeClasses.container} rounded-lg shadow-md border p-6`}>
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
          <span className={`ml-2 ${themeClasses.text}`}>Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${themeClasses.container} rounded-lg shadow-md border`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h3 className={`text-lg font-semibold ${themeClasses.text}`}>
          Default Alert Sensitivity
        </h3>
        <p className={`text-sm ${themeClasses.textSecondary} mt-1`}>
          Configure how your system monitors and alerts you about device health issues.
          This setting applies to all your devices unless you configure device-specific overrides.
        </p>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Explanation */}
        <div className={`mb-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800`}>
          <h4 className={`text-sm font-semibold ${themeClasses.text} mb-2`}>
            How Alert Sensitivity Works
          </h4>
          <p className={`text-sm ${themeClasses.textSecondary}`}>
            Alert sensitivity controls how metric data is analyzed before triggering alerts.
            <strong className="font-medium"> Finer granularity</strong> means alerts respond faster but may have more false alarms.
            <strong className="font-medium"> Coarser granularity</strong> reduces false alarms but delays notification.
          </p>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-4 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {/* Aggregation Level Options */}
        <div className="space-y-3">
          {AGGREGATION_LEVELS.map((level) => {
            const isSelected = selectedLevel === level.level;

            return (
              <label
                key={level.level}
                className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : `border-gray-200 dark:border-gray-700 ${themeClasses.cardHover}`
                }`}
              >
                <input
                  type="radio"
                  name="aggregation_level"
                  value={level.level}
                  checked={isSelected}
                  onChange={(e) => setSelectedLevel(e.target.value)}
                  className="mr-3 w-4 h-4"
                />
                <div className={`mr-3 ${isSelected ? 'text-blue-600 dark:text-blue-400' : themeClasses.textSecondary}`}>
                  {level.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${themeClasses.text}`}>
                      {level.interval}
                    </span>
                    {level.level === '30min' && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${themeClasses.textSecondary} mt-1`}>
                    {level.description}
                  </p>
                  <p className={`text-xs ${themeClasses.textMuted} mt-1`}>
                    {level.tradeOff}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        {/* Device Override Note */}
        <div className={`mt-6 p-4 rounded-lg ${themeClasses.card} border ${themeClasses.border}`}>
          <p className={`text-sm ${themeClasses.textSecondary}`}>
            <strong className="font-medium">Note:</strong> You can override this default setting for individual devices
            in the Devices tab by configuring device-specific alert sensitivity.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
        <button
          onClick={loadDefaultLevel}
          disabled={saving}
          className={`px-4 py-2 rounded-lg ${themeClasses.buttonSecondary} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Reset
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-4 py-2 rounded-lg ${themeClasses.button} transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
        >
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default AlertSensitivitySettings;
