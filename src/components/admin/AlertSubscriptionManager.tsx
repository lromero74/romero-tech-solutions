import React, { useState, useEffect } from 'react';
import { Bell, Plus, Edit2, Trash2, Mail, MessageSquare, Globe, BellRing, Clock, Shield } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import api from '../../services/apiService';
import SubscriptionEditorModal from './SubscriptionEditorModal';

interface AlertSubscription {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  employee_email: string;
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
  created_at: string;
}

const AlertSubscriptionManager: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<AlertSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSubscription, setEditingSubscription] = useState<AlertSubscription | null>(null);
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    loadSubscriptions();
    loadStats();
  }, []);

  const loadSubscriptions = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/alerts/subscriptions');
      setSubscriptions(response.data.data || []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load alert subscriptions:', err);
      setError(err.message || 'Failed to load alert subscriptions');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.get('/admin/alerts/subscription-stats');
      setStats(response.data.data);
    } catch (err: any) {
      console.error('Failed to load subscription stats:', err);
    }
  };

  const handleCreateSubscription = () => {
    setEditingSubscription(null);
    setShowEditorModal(true);
  };

  const handleEditSubscription = (subscription: AlertSubscription) => {
    setEditingSubscription(subscription);
    setShowEditorModal(true);
  };

  const handleDeleteSubscription = async (subscription: AlertSubscription) => {
    if (!confirm(`Are you sure you want to delete this alert subscription?`)) {
      return;
    }

    try {
      await api.delete(`/admin/alerts/subscriptions/${subscription.id}`);
      await loadSubscriptions();
      await loadStats();
    } catch (err: any) {
      console.error('Failed to delete subscription:', err);
      alert('Failed to delete alert subscription');
    }
  };

  const handleSaveSubscription = async () => {
    await loadSubscriptions();
    await loadStats();
    setShowEditorModal(false);
    setEditingSubscription(null);
  };

  const getScopeLabel = (subscription: AlertSubscription): string => {
    if (subscription.agent_name) {
      return `Agent: ${subscription.agent_name}`;
    }
    if (subscription.location_name) {
      return `Location: ${subscription.location_name}`;
    }
    if (subscription.business_name) {
      return `Business: ${subscription.business_name}`;
    }
    return 'All Agents';
  };

  const getChannelIcons = (subscription: AlertSubscription) => {
    const icons = [];
    if (subscription.notify_email) icons.push(<Mail key="email" className="w-4 h-4 text-blue-500" title="Email" />);
    if (subscription.notify_sms) icons.push(<MessageSquare key="sms" className="w-4 h-4 text-green-500" title="SMS" />);
    if (subscription.notify_websocket) icons.push(<Globe key="ws" className="w-4 h-4 text-purple-500" title="WebSocket" />);
    if (subscription.notify_browser) icons.push(<BellRing key="browser" className="w-4 h-4 text-orange-500" title="Browser" />);
    return icons;
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${themeClasses.cardBg} rounded-lg`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={themeClasses.text}>Loading subscriptions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg`}>
        <p className="text-red-700 dark:text-red-300">Error: {error}</p>
        <button
          onClick={loadSubscriptions}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className={`text-2xl font-bold ${themeClasses.text}`}>
            <Bell className="inline-block w-6 h-6 mr-2" />
            Alert Subscriptions
          </h2>
          <p className={`mt-1 text-sm ${themeClasses.mutedText}`}>
            Manage your alert notification preferences
          </p>
        </div>
        <button
          onClick={handleCreateSubscription}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Subscription
        </button>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className={`${themeClasses.cardBg} p-4 rounded-lg border ${themeClasses.border}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${themeClasses.mutedText}`}>Active Subscriptions</p>
                <p className={`text-2xl font-bold ${themeClasses.text}`}>{stats.active_employee_subs}</p>
              </div>
              <Bell className="w-8 h-8 text-blue-500" />
            </div>
          </div>
          <div className={`${themeClasses.cardBg} p-4 rounded-lg border ${themeClasses.border}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${themeClasses.mutedText}`}>Inactive</p>
                <p className={`text-2xl font-bold ${themeClasses.text}`}>{stats.inactive_employee_subs}</p>
              </div>
              <BellRing className="w-8 h-8 text-gray-400" />
            </div>
          </div>
          <div className={`${themeClasses.cardBg} p-4 rounded-lg border ${themeClasses.border}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${themeClasses.mutedText}`}>Subscribed Employees</p>
                <p className={`text-2xl font-bold ${themeClasses.text}`}>{stats.subscribed_employees}</p>
              </div>
              <Shield className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <div className={`${themeClasses.cardBg} p-4 rounded-lg border ${themeClasses.border}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm ${themeClasses.mutedText}`}>Client Subscriptions</p>
                <p className={`text-2xl font-bold ${themeClasses.text}`}>{stats.active_client_subs}</p>
              </div>
              <Globe className="w-8 h-8 text-purple-500" />
            </div>
          </div>
        </div>
      )}

      {/* Subscriptions List */}
      {subscriptions.length === 0 ? (
        <div className={`${themeClasses.cardBg} p-12 rounded-lg border ${themeClasses.border} text-center`}>
          <Bell className={`w-16 h-16 mx-auto mb-4 ${themeClasses.mutedText}`} />
          <h3 className={`text-lg font-semibold ${themeClasses.text} mb-2`}>No Alert Subscriptions</h3>
          <p className={`${themeClasses.mutedText} mb-4`}>
            You don't have any alert subscriptions yet. Create one to start receiving notifications.
          </p>
          <button
            onClick={handleCreateSubscription}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create Your First Subscription
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {subscriptions.map((subscription) => (
            <div
              key={subscription.id}
              className={`${themeClasses.cardBg} p-6 rounded-lg border ${themeClasses.border} ${
                !subscription.enabled ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Title and Scope */}
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className={`text-lg font-semibold ${themeClasses.text}`}>
                      {getScopeLabel(subscription)}
                    </h3>
                    {!subscription.enabled && (
                      <span className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                        Disabled
                      </span>
                    )}
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className={`font-medium ${themeClasses.mutedText} mb-1`}>Severity Levels</p>
                      <div className="flex flex-wrap gap-1">
                        {subscription.min_severity.map((severity) => (
                          <span
                            key={severity}
                            className={`px-2 py-1 rounded text-xs ${
                              severity === 'critical'
                                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                : severity === 'high'
                                ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                                : severity === 'medium'
                                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                            }`}
                          >
                            {severity}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className={`font-medium ${themeClasses.mutedText} mb-1`}>Metric Types</p>
                      <div className="flex flex-wrap gap-1">
                        {subscription.metric_types.map((metric) => (
                          <span
                            key={metric}
                            className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs"
                          >
                            {metric.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className={`font-medium ${themeClasses.mutedText} mb-1`}>Notification Channels</p>
                      <div className="flex gap-2">
                        {getChannelIcons(subscription)}
                      </div>
                    </div>
                  </div>

                  {/* Quiet Hours */}
                  {subscription.quiet_hours_start && subscription.quiet_hours_end && (
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span className={themeClasses.mutedText}>
                        Quiet Hours: {subscription.quiet_hours_start} - {subscription.quiet_hours_end} ({subscription.quiet_hours_timezone})
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleEditSubscription(subscription)}
                    className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                    title="Edit subscription"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteSubscription(subscription)}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                    title="Delete subscription"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {showEditorModal && (
        <SubscriptionEditorModal
          subscription={editingSubscription}
          onClose={() => {
            setShowEditorModal(false);
            setEditingSubscription(null);
          }}
          onSave={handleSaveSubscription}
        />
      )}
    </div>
  );
};

export default AlertSubscriptionManager;
