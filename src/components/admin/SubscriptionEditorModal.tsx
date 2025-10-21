import React, { useState, useEffect } from 'react';
import { X, Save, Bell, AlertTriangle } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import api from '../../services/apiService';

interface AlertSubscription {
  id?: number;
  employee_id?: string;
  business_id?: string;
  business_name?: string;
  service_location_id?: string;
  location_name?: string;
  agent_id?: string;
  agent_name?: string;
  min_severity: string[];
  alert_types: string[];
  metric_types: string[];
  notify_email: boolean;
  notify_sms: boolean;
  notify_websocket: boolean;
  notify_browser: boolean;
  email?: string;
  phone_number?: string;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  quiet_hours_timezone: string;
  enabled: boolean;
}

interface Business {
  id: string;
  business_name: string;
}

interface ServiceLocation {
  id: string;
  location_name: string;
  business_id: string;
}

interface Agent {
  id: string;
  device_name: string;
  service_location_id: string;
}

interface SubscriptionEditorModalProps {
  subscription: AlertSubscription | null;
  onClose: () => void;
  onSave: () => void;
}

const defaultSubscription: Omit<AlertSubscription, 'id' | 'employee_id'> = {
  business_id: undefined,
  service_location_id: undefined,
  agent_id: undefined,
  min_severity: ['medium', 'high', 'critical'],
  alert_types: ['high_utilization', 'low_utilization', 'rising_trend', 'declining_trend', 'volatility_spike'],
  metric_types: ['cpu', 'memory', 'disk'],
  notify_email: true,
  notify_sms: false,
  notify_websocket: true,
  notify_browser: true,
  email: '',
  phone_number: '',
  quiet_hours_start: '',
  quiet_hours_end: '',
  quiet_hours_timezone: 'America/New_York',
  enabled: true,
};

const SubscriptionEditorModal: React.FC<SubscriptionEditorModalProps> = ({
  subscription,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<Omit<AlertSubscription, 'id' | 'employee_id'>>(
    subscription || defaultSubscription
  );
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [serviceLocations, setServiceLocations] = useState<ServiceLocation[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filteredLocations, setFilteredLocations] = useState<ServiceLocation[]>([]);
  const [filteredAgents, setFilteredAgents] = useState<Agent[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    if (subscription) {
      setFormData(subscription);
    }
  }, [subscription]);

  useEffect(() => {
    // Filter service locations based on selected business
    if (formData.business_id) {
      setFilteredLocations(serviceLocations.filter(loc => loc.business_id === formData.business_id));
      // Clear service location and agent if business changes
      if (subscription?.business_id !== formData.business_id) {
        setFormData(prev => ({ ...prev, service_location_id: undefined, agent_id: undefined }));
      }
    } else {
      setFilteredLocations(serviceLocations);
    }
  }, [formData.business_id, serviceLocations, subscription]);

  useEffect(() => {
    // Filter agents based on selected service location
    if (formData.service_location_id) {
      setFilteredAgents(agents.filter(agent => agent.service_location_id === formData.service_location_id));
      // Clear agent if service location changes
      if (subscription?.service_location_id !== formData.service_location_id) {
        setFormData(prev => ({ ...prev, agent_id: undefined }));
      }
    } else if (formData.business_id) {
      // Show all agents for the selected business's service locations
      const businessLocationIds = filteredLocations.map(loc => loc.id);
      setFilteredAgents(agents.filter(agent => businessLocationIds.includes(agent.service_location_id)));
    } else {
      setFilteredAgents(agents);
    }
  }, [formData.service_location_id, formData.business_id, agents, filteredLocations, subscription]);

  const loadOptions = async () => {
    try {
      setLoading(true);
      const [businessesRes, locationsRes, agentsRes] = await Promise.all([
        api.get('/admin/businesses'),
        api.get('/admin/service-locations'),
        api.get('/admin/agents'),
      ]);

      setBusinesses(businessesRes.data.businesses || []);
      setServiceLocations(locationsRes.data.serviceLocations || []);
      setAgents(agentsRes.data.agents || []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load options:', err);
      setError('Failed to load businesses, locations, and agents');
    } finally {
      setLoading(false);
    }
  };

  const handleSeverityToggle = (severity: string) => {
    const newSeverities = formData.min_severity.includes(severity)
      ? formData.min_severity.filter(s => s !== severity)
      : [...formData.min_severity, severity];

    setFormData({ ...formData, min_severity: newSeverities });
  };

  const handleAlertTypeToggle = (alertType: string) => {
    const newTypes = formData.alert_types.includes(alertType)
      ? formData.alert_types.filter(t => t !== alertType)
      : [...formData.alert_types, alertType];

    setFormData({ ...formData, alert_types: newTypes });
  };

  const handleMetricTypeToggle = (metricType: string) => {
    const newMetrics = formData.metric_types.includes(metricType)
      ? formData.metric_types.filter(m => m !== metricType)
      : [...formData.metric_types, metricType];

    setFormData({ ...formData, metric_types: newMetrics });
  };

  const validateForm = (): string | null => {
    if (formData.min_severity.length === 0) {
      return 'At least one severity level must be selected';
    }

    if (!formData.notify_email && !formData.notify_sms && !formData.notify_websocket && !formData.notify_browser) {
      return 'At least one notification channel must be enabled';
    }

    if (formData.notify_email && !formData.email) {
      return 'Email address is required when email notifications are enabled';
    }

    if (formData.notify_sms && !formData.phone_number) {
      return 'Phone number is required when SMS notifications are enabled';
    }

    if (formData.quiet_hours_start && !formData.quiet_hours_end) {
      return 'Quiet hours end time is required when start time is set';
    }

    if (formData.quiet_hours_end && !formData.quiet_hours_start) {
      return 'Quiet hours start time is required when end time is set';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (subscription?.id) {
        // Update existing subscription
        await api.put(`/admin/alerts/subscriptions/${subscription.id}`, formData);
      } else {
        // Create new subscription
        await api.post('/admin/alerts/subscriptions', formData);
      }
      onSave();
    } catch (err: any) {
      console.error('Failed to save alert subscription:', err);
      setError(err.response?.data?.message || 'Failed to save subscription');
      setSaving(false);
    }
  };

  const handleScopeChange = (field: 'business_id' | 'service_location_id' | 'agent_id', value: string) => {
    const updates: Partial<typeof formData> = { [field]: value || undefined };

    // Clear child selections when parent changes
    if (field === 'business_id') {
      updates.service_location_id = undefined;
      updates.agent_id = undefined;
    } else if (field === 'service_location_id') {
      updates.agent_id = undefined;
    }

    setFormData({ ...formData, ...updates });
  };

  const timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Phoenix',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu',
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className={`${themeClasses.cardBg} rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b ${themeClasses.border} flex items-center justify-between`}>
          <div className="flex items-center">
            <Bell className="w-6 h-6 text-blue-500 mr-3" />
            <div>
              <h2 className={`text-xl font-semibold ${themeClasses.text}`}>
                {subscription ? 'Edit Alert Subscription' : 'New Alert Subscription'}
              </h2>
              <p className={`text-sm ${themeClasses.mutedText}`}>
                Configure your alert notification preferences
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 ${themeClasses.mutedText} hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors`}
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
                <div className="flex items-start">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                <span className={`ml-3 ${themeClasses.mutedText}`}>Loading options...</span>
              </div>
            )}

            {!loading && (
              <>
                {/* Scope Selection */}
                <div className="space-y-4">
                  <h3 className={`text-lg font-medium ${themeClasses.text}`}>Subscription Scope</h3>
                  <p className={`text-sm ${themeClasses.mutedText}`}>
                    Choose what you want to receive alerts for. Leave all blank to receive alerts for all agents.
                  </p>

                  {/* Business Selection */}
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.mutedText} mb-2`}>
                      Business (Optional)
                    </label>
                    <select
                      value={formData.business_id || ''}
                      onChange={(e) => handleScopeChange('business_id', e.target.value)}
                      className={`block w-full rounded-md shadow-sm px-3 py-2 focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
                    >
                      <option value="">All Businesses</option>
                      {businesses.map(business => (
                        <option key={business.id} value={business.id}>
                          {business.business_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Service Location Selection */}
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.mutedText} mb-2`}>
                      Service Location (Optional)
                    </label>
                    <select
                      value={formData.service_location_id || ''}
                      onChange={(e) => handleScopeChange('service_location_id', e.target.value)}
                      className={`block w-full rounded-md shadow-sm px-3 py-2 focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
                      disabled={!formData.business_id && filteredLocations.length === 0}
                    >
                      <option value="">All Locations</option>
                      {filteredLocations.map(location => (
                        <option key={location.id} value={location.id}>
                          {location.location_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Agent Selection */}
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.mutedText} mb-2`}>
                      Specific Agent (Optional)
                    </label>
                    <select
                      value={formData.agent_id || ''}
                      onChange={(e) => handleScopeChange('agent_id', e.target.value)}
                      className={`block w-full rounded-md shadow-sm px-3 py-2 focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
                      disabled={filteredAgents.length === 0}
                    >
                      <option value="">All Agents</option>
                      {filteredAgents.map(agent => (
                        <option key={agent.id} value={agent.id}>
                          {agent.device_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Severity Levels */}
                <div className="space-y-4">
                  <h3 className={`text-lg font-medium ${themeClasses.text}`}>Severity Levels</h3>
                  <p className={`text-sm ${themeClasses.mutedText}`}>
                    Select which severity levels you want to be notified about
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { value: 'critical', label: 'Critical', color: 'red' },
                      { value: 'high', label: 'High', color: 'orange' },
                      { value: 'medium', label: 'Medium', color: 'yellow' },
                      { value: 'low', label: 'Low', color: 'green' },
                    ].map(severity => (
                      <label
                        key={severity.value}
                        className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                          formData.min_severity.includes(severity.value)
                            ? `border-${severity.color}-500 bg-${severity.color}-50 dark:bg-${severity.color}-900/20`
                            : `border-gray-300 dark:border-gray-600 ${themeClasses.cardBg}`
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.min_severity.includes(severity.value)}
                          onChange={() => handleSeverityToggle(severity.value)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                        />
                        <span className={`text-sm font-medium ${themeClasses.text}`}>{severity.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Alert Types */}
                <div className="space-y-4">
                  <h3 className={`text-lg font-medium ${themeClasses.text}`}>Alert Types</h3>
                  <p className={`text-sm ${themeClasses.mutedText}`}>
                    Choose which types of alerts to monitor
                  </p>

                  <div className="space-y-2">
                    {[
                      { value: 'high_utilization', label: 'High Utilization' },
                      { value: 'low_utilization', label: 'Low Utilization' },
                      { value: 'rising_trend', label: 'Rising Trend' },
                      { value: 'declining_trend', label: 'Declining Trend' },
                      { value: 'volatility_spike', label: 'Volatility Spike' },
                    ].map(alertType => (
                      <label
                        key={alertType.value}
                        className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                          formData.alert_types.includes(alertType.value)
                            ? `border-blue-500 bg-blue-50 dark:bg-blue-900/20`
                            : `${themeClasses.border} ${themeClasses.cardBg}`
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.alert_types.includes(alertType.value)}
                          onChange={() => handleAlertTypeToggle(alertType.value)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-3"
                        />
                        <span className={`text-sm font-medium ${themeClasses.text}`}>{alertType.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Metric Types */}
                <div className="space-y-4">
                  <h3 className={`text-lg font-medium ${themeClasses.text}`}>Metric Types</h3>
                  <p className={`text-sm ${themeClasses.mutedText}`}>
                    Select which metrics to monitor
                  </p>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: 'cpu', label: 'CPU' },
                      { value: 'memory', label: 'Memory' },
                      { value: 'disk', label: 'Disk' },
                    ].map(metric => (
                      <label
                        key={metric.value}
                        className={`flex items-center p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                          formData.metric_types.includes(metric.value)
                            ? `border-purple-500 bg-purple-50 dark:bg-purple-900/20`
                            : `border-gray-300 dark:border-gray-600 ${themeClasses.cardBg}`
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.metric_types.includes(metric.value)}
                          onChange={() => handleMetricTypeToggle(metric.value)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                        />
                        <span className={`text-sm font-medium ${themeClasses.text}`}>{metric.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Notification Channels */}
                <div className="space-y-4">
                  <h3 className={`text-lg font-medium ${themeClasses.text}`}>Notification Channels</h3>
                  <p className={`text-sm ${themeClasses.mutedText}`}>
                    Choose how you want to receive alerts
                  </p>

                  <div className="space-y-3">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.notify_email}
                        onChange={(e) => setFormData({ ...formData, notify_email: e.target.checked })}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className={`ml-2 text-sm ${themeClasses.text}`}>Email Notifications</span>
                    </label>

                    {formData.notify_email && (
                      <input
                        type="email"
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="email@example.com"
                        className={`block w-full rounded-md shadow-sm px-3 py-2 ml-6 focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
                      />
                    )}

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.notify_sms}
                        onChange={(e) => setFormData({ ...formData, notify_sms: e.target.checked })}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className={`ml-2 text-sm ${themeClasses.text}`}>SMS Notifications</span>
                    </label>

                    {formData.notify_sms && (
                      <input
                        type="tel"
                        value={formData.phone_number || ''}
                        onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                        placeholder="+1 (555) 123-4567"
                        className={`block w-full rounded-md shadow-sm px-3 py-2 ml-6 focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
                      />
                    )}

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.notify_websocket}
                        onChange={(e) => setFormData({ ...formData, notify_websocket: e.target.checked })}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className={`ml-2 text-sm ${themeClasses.text}`}>Real-time Dashboard Notifications</span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.notify_browser}
                        onChange={(e) => setFormData({ ...formData, notify_browser: e.target.checked })}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className={`ml-2 text-sm ${themeClasses.text}`}>Browser Push Notifications</span>
                    </label>
                  </div>
                </div>

                {/* Quiet Hours */}
                <div className="space-y-4">
                  <h3 className={`text-lg font-medium ${themeClasses.text}`}>Quiet Hours (Optional)</h3>
                  <p className={`text-sm ${themeClasses.mutedText}`}>
                    Set time periods when you don't want to receive notifications
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className={`block text-sm font-medium ${themeClasses.mutedText} mb-2`}>
                        Start Time
                      </label>
                      <input
                        type="time"
                        value={formData.quiet_hours_start || ''}
                        onChange={(e) => setFormData({ ...formData, quiet_hours_start: e.target.value })}
                        className={`block w-full rounded-md shadow-sm px-3 py-2 focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
                      />
                    </div>

                    <div>
                      <label className={`block text-sm font-medium ${themeClasses.mutedText} mb-2`}>
                        End Time
                      </label>
                      <input
                        type="time"
                        value={formData.quiet_hours_end || ''}
                        onChange={(e) => setFormData({ ...formData, quiet_hours_end: e.target.value })}
                        className={`block w-full rounded-md shadow-sm px-3 py-2 focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
                      />
                    </div>

                    <div>
                      <label className={`block text-sm font-medium ${themeClasses.mutedText} mb-2`}>
                        Timezone
                      </label>
                      <select
                        value={formData.quiet_hours_timezone}
                        onChange={(e) => setFormData({ ...formData, quiet_hours_timezone: e.target.value })}
                        className={`block w-full rounded-md shadow-sm px-3 py-2 focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
                      >
                        {timezones.map(tz => (
                          <option key={tz} value={tz}>
                            {tz.replace('America/', '').replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Enabled Toggle */}
                <div className="space-y-4">
                  <div className={`${themeClasses.cardBg} border ${themeClasses.border} rounded-lg p-4`}>
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <span className={`text-sm font-medium ${themeClasses.text}`}>Enable Subscription</span>
                        <p className={`text-xs ${themeClasses.mutedText} mt-1`}>
                          Temporarily disable this subscription without deleting it
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.enabled}
                        onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-5 w-5"
                      />
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className={`px-6 py-4 border-t ${themeClasses.border} flex items-center justify-end space-x-3 bg-gray-50 dark:bg-gray-800/50`}>
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-sm font-medium rounded-md ${themeClasses.mutedText} ${themeClasses.cardBg} border ${themeClasses.border} hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loading || formData.min_severity.length === 0}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                saving || loading || formData.min_severity.length === 0
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
                  Save Subscription
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SubscriptionEditorModal;
