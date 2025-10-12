import React, { useState, useEffect } from 'react';
import { AlertTriangle, Plus, Edit2, Power, Settings as SettingsIcon, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import AlertConfigurationEditorModal from './AlertConfigurationEditorModal';
import api from '../../services/apiService';

interface AlertConfiguration {
  id: number;
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
  created_at: string;
  updated_at: string;
}

const AlertConfigurationManager: React.FC = () => {
  const [configurations, setConfigurations] = useState<AlertConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<AlertConfiguration | null>(null);
  const [showEditorModal, setShowEditorModal] = useState(false);

  useEffect(() => {
    loadConfigurations();
  }, []);

  const loadConfigurations = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/alerts/configurations');
      setConfigurations(response.data || []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load alert configurations:', err);
      setError(err.message || 'Failed to load alert configurations');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async (config: AlertConfiguration) => {
    try {
      const response = await api.put(`/admin/alerts/configurations/${config.id}`, {
        enabled: !config.enabled,
      });

      if (response.data.success) {
        setConfigurations(prevConfigs =>
          prevConfigs.map(c =>
            c.id === config.id ? { ...c, enabled: !c.enabled } : c
          )
        );
      }
    } catch (err: any) {
      console.error('Failed to toggle alert configuration:', err);
      alert('Failed to update alert configuration');
    }
  };

  const handleEditConfig = (config: AlertConfiguration) => {
    setEditingConfig(config);
    setShowEditorModal(true);
  };

  const handleCreateNew = () => {
    setEditingConfig(null);
    setShowEditorModal(true);
  };

  const handleSaveConfig = async () => {
    await loadConfigurations();
    setShowEditorModal(false);
    setEditingConfig(null);
  };

  const getAlertTypeIcon = (type: string) => {
    switch (type) {
      case 'high_utilization':
        return <TrendingUp className="w-5 h-5 text-red-500" />;
      case 'low_utilization':
        return <TrendingDown className="w-5 h-5 text-green-500" />;
      case 'rising_trend':
        return <Activity className="w-5 h-5 text-green-600" />;
      case 'declining_trend':
        return <Activity className="w-5 h-5 text-red-600" />;
      case 'volatility_spike':
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      default:
        return <SettingsIcon className="w-5 h-5 text-gray-500" />;
    }
  };

  const getAlertTypeLabel = (type: string) => {
    switch (type) {
      case 'high_utilization':
        return 'High Utilization';
      case 'low_utilization':
        return 'Low Utilization';
      case 'rising_trend':
        return 'Rising Trend';
      case 'declining_trend':
        return 'Declining Trend';
      case 'volatility_spike':
        return 'Volatility Spike';
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className={`ml-3 ${themeClasses.text.secondary}`}>Loading alert configurations...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">Error: {error}</p>
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
            <AlertTriangle className="w-5 h-5 text-orange-500 mr-2" />
            <div>
              <h2 className={`text-lg font-medium ${themeClasses.text.primary}`}>
                Alert Configurations
              </h2>
              <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
                Manage indicator confluence alert rules and thresholds
              </p>
            </div>
          </div>
          <button
            onClick={handleCreateNew}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Configuration
          </button>
        </div>
      </div>

      {/* Configurations List */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {configurations.map((config) => (
          <div
            key={config.id}
            className={`px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4 flex-1">
                {/* Icon */}
                <div className="flex-shrink-0 mt-1">
                  {getAlertTypeIcon(config.alert_type)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-3">
                    <h3 className={`text-base font-medium ${themeClasses.text.primary}`}>
                      {config.alert_name}
                    </h3>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      config.enabled
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {config.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>

                  <div className={`mt-2 text-sm ${themeClasses.text.secondary}`}>
                    <span className="font-medium">Type:</span> {getAlertTypeLabel(config.alert_type)}
                  </div>

                  <div className={`mt-1 text-sm ${themeClasses.text.secondary}`}>
                    <span className="font-medium">Min indicators:</span> {config.min_indicator_count}
                    {config.require_extreme_for_single && (
                      <span className="ml-2 text-xs">(requires extreme for single)</span>
                    )}
                  </div>

                  {/* Notification Settings */}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {config.notify_dashboard && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                        Dashboard
                      </span>
                    )}
                    {config.notify_websocket && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                        WebSocket
                      </span>
                    )}
                    {config.notify_email && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                        Email
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={() => handleToggleEnabled(config)}
                  className={`p-2 rounded-md transition-colors ${
                    config.enabled
                      ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                      : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                  title={config.enabled ? 'Disable' : 'Enable'}
                >
                  <Power className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handleEditConfig(config)}
                  className={`p-2 rounded-md text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors`}
                  title="Edit Configuration"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {configurations.length === 0 && (
          <div className="px-6 py-12 text-center">
            <AlertTriangle className={`mx-auto h-12 w-12 ${themeClasses.text.muted}`} />
            <h3 className={`mt-2 text-sm font-medium ${themeClasses.text.primary}`}>
              No alert configurations
            </h3>
            <p className={`mt-1 text-sm ${themeClasses.text.secondary}`}>
              Get started by creating a new alert configuration.
            </p>
            <div className="mt-6">
              <button
                onClick={handleCreateNew}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Configuration
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {showEditorModal && (
        <AlertConfigurationEditorModal
          configuration={editingConfig}
          onSave={handleSaveConfig}
          onCancel={() => {
            setShowEditorModal(false);
            setEditingConfig(null);
          }}
        />
      )}
    </div>
  );
};

export default AlertConfigurationManager;
