import React, { useState, useEffect } from 'react';
import { X, Clock, TrendingUp, BarChart3, Activity, Calendar } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { agentService } from '../../services/agentService';

interface AgentAlertAggregationModalProps {
  agentId: string;
  agentName: string;
  currentLevel?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

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

const AgentAlertAggregationModal: React.FC<AgentAlertAggregationModalProps> = ({
  agentId,
  agentName,
  currentLevel,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [selectedLevel, setSelectedLevel] = useState<string>(currentLevel || 'raw');
  const [effectiveLevel, setEffectiveLevel] = useState<string | null>(null);
  const [userDefault, setUserDefault] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Load current aggregation settings
  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen, agentId]);

  const loadSettings = async () => {
    try {
      setLoadingSettings(true);
      const response = await agentService.getAgentAggregationSettings(agentId);

      if (response.success && response.data) {
        setEffectiveLevel(response.data.effective_level);
        setUserDefault(response.data.user_default);
        setSelectedLevel(response.data.device_override || 'use_default');
      }
    } catch (err) {
      console.error('Error loading aggregation settings:', err);
    } finally {
      setLoadingSettings(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      // If "use_default" selected, pass null to remove device override
      const levelToSave = selectedLevel === 'use_default' ? null : selectedLevel;

      const response = await agentService.updateAgentAggregationLevel(agentId, levelToSave);

      if (response.success) {
        onSuccess?.();
        onClose();
      } else {
        setError(response.message || 'Failed to update aggregation level');
      }
    } catch (err) {
      console.error('Error updating aggregation level:', err);
      setError(err instanceof Error ? err.message : 'Failed to update aggregation level');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={`${themeClasses.bg.card} rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${themeClasses.border.primary}`}>
          <div>
            <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>
              Alert Sensitivity Settings
            </h2>
            <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
              Configure alert aggregation for <span className="font-semibold">{agentName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className={`${themeClasses.text.secondary} hover:${themeClasses.text.primary} transition-colors`}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loadingSettings ? (
            <div className={`text-center py-8 ${themeClasses.text.secondary}`}>
              Loading settings...
            </div>
          ) : (
            <>
              {/* Current Status */}
              {effectiveLevel && (
                <div className={`mb-6 p-4 rounded-lg ${themeClasses.bg.secondary} border ${themeClasses.border.primary}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm font-medium ${themeClasses.text.secondary}`}>
                        Current Effective Level
                      </p>
                      <p className={`text-lg font-bold ${themeClasses.text.primary}`}>
                        {AGGREGATION_LEVELS.find(l => l.level === effectiveLevel)?.interval || effectiveLevel}
                      </p>
                    </div>
                    {userDefault && !currentLevel && (
                      <div className={`text-xs ${themeClasses.text.secondary}`}>
                        Using account default: {AGGREGATION_LEVELS.find(l => l.level === userDefault)?.interval}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Explanation */}
              <div className={`mb-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800`}>
                <h3 className={`text-sm font-semibold ${themeClasses.text.primary} mb-2`}>
                  How Alert Sensitivity Works
                </h3>
                <p className={`text-sm ${themeClasses.text.secondary}`}>
                  Alert sensitivity controls how metric data is analyzed before triggering alerts.
                  <strong className="font-medium"> Finer granularity</strong> means alerts respond faster but may have more false alarms.
                  <strong className="font-medium"> Coarser granularity</strong> reduces false alarms but delays notification.
                </p>
              </div>

              {/* Use Account Default Option */}
              <div className="mb-4">
                <label className="flex items-center p-4 rounded-lg border-2 border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors">
                  <input
                    type="radio"
                    name="aggregation_level"
                    value="use_default"
                    checked={selectedLevel === 'use_default'}
                    onChange={(e) => setSelectedLevel(e.target.value)}
                    className="mr-3 w-4 h-4"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Activity className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      <span className={`font-semibold ${themeClasses.text.primary}`}>
                        Use Account Default
                      </span>
                    </div>
                    <p className={`text-sm ${themeClasses.text.secondary} mt-1 ml-7`}>
                      {userDefault
                        ? `Currently: ${AGGREGATION_LEVELS.find(l => l.level === userDefault)?.interval} (${AGGREGATION_LEVELS.find(l => l.level === userDefault)?.description})`
                        : 'Use your account-wide default setting'
                      }
                    </p>
                  </div>
                </label>
              </div>

              {/* Aggregation Level Options */}
              <div className="space-y-3">
                {AGGREGATION_LEVELS.map((level) => {
                  const isSelected = selectedLevel === level.level;
                  const isCurrentlyActive = effectiveLevel === level.level;

                  return (
                    <label
                      key={level.level}
                      className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : `${themeClasses.border.primary} hover:border-blue-300 dark:hover:border-blue-700`
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
                      <div className={`mr-3 ${isSelected ? 'text-blue-600 dark:text-blue-400' : themeClasses.text.secondary}`}>
                        {level.icon}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${themeClasses.text.primary}`}>
                            {level.interval}
                          </span>
                          {isCurrentlyActive && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded-full">
                              Active
                            </span>
                          )}
                          {level.level === '30min' && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
                          {level.description}
                        </p>
                        <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                          {level.tradeOff}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-3 p-6 border-t ${themeClasses.border.primary}`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg ${themeClasses.button.secondary} transition-colors`}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || loadingSettings}
            className={`px-4 py-2 rounded-lg ${themeClasses.button.primary} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentAlertAggregationModal;
