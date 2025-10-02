import React, { useState, useEffect } from 'react';
import {
  Settings,
  Bell,
  Clock,
  CheckCircle,
  AlertCircle,
  BarChart3,
  RefreshCw,
  Eye,
  Edit2,
  Save,
  X
} from 'lucide-react';
import apiService from '../../services/apiService';

interface WorkflowRule {
  id: string;
  rule_name: string;
  rule_description: string;
  trigger_event: string;
  recipient_type: string;
  recipient_roles: string[];
  notification_type: string;
  email_template_name: string;
  timeout_minutes: number | null;
  max_retry_count: number;
  retry_interval_minutes: number | null;
  execution_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface WorkflowStats {
  stateStats: { current_state: string; count: string }[];
  notificationStats: { trigger_event: string; count: string; sent_count: string; failed_count: string }[];
  pendingActions: { pending_count: string; next_action_time: string | null };
}

const WorkflowConfiguration: React.FC = () => {
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [stats, setStats] = useState<WorkflowStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<WorkflowRule>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchWorkflowData();
  }, []);

  const fetchWorkflowData = async () => {
    try {
      setLoading(true);
      const [rulesData, statsData] = await Promise.all([
        apiService.get<{ success: boolean; data: { rules: WorkflowRule[] } }>('/admin/workflow-configuration/rules'),
        apiService.get<{ success: boolean; data: WorkflowStats }>('/admin/workflow-configuration/stats')
      ]);

      if (rulesData.success) {
        setRules(rulesData.data.rules);
      }

      if (statsData.success) {
        setStats(statsData.data);
      }
    } catch (error) {
      console.error('Error fetching workflow data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditRule = (rule: WorkflowRule) => {
    setEditingRule(rule.id);
    setEditForm({
      rule_name: rule.rule_name,
      rule_description: rule.rule_description,
      timeout_minutes: rule.timeout_minutes,
      max_retry_count: rule.max_retry_count,
      retry_interval_minutes: rule.retry_interval_minutes,
      is_active: rule.is_active
    });
  };

  const handleCancelEdit = () => {
    setEditingRule(null);
    setEditForm({});
  };

  const handleSaveRule = async (ruleId: string) => {
    try {
      setSaving(true);
      const result = await apiService.put(`/admin/workflow-configuration/rules/${ruleId}`, editForm);

      if (result.success) {
        // Update local state
        setRules(rules.map(r => r.id === ruleId ? { ...r, ...editForm } : r));
        setEditingRule(null);
        setEditForm({});
      }
    } catch (error) {
      console.error('Error saving rule:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const getTriggerEventLabel = (event: string): string => {
    const labels: Record<string, string> = {
      'service_request_created': 'Service Request Created',
      'acknowledgment_timeout': 'Acknowledgment Timeout',
      'acknowledged': 'Acknowledged',
      'start_timeout': 'Start Timeout',
      'started': 'Started',
      'completed': 'Completed',
      'closed': 'Closed'
    };
    return labels[event] || event;
  };

  const getStateLabel = (state: string): string => {
    const labels: Record<string, string> = {
      'pending_acknowledgment': 'Pending Acknowledgment',
      'acknowledged': 'Acknowledged',
      'started': 'In Progress',
      'completed': 'Completed',
      'closed': 'Closed'
    };
    return labels[state] || state;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Settings className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Workflow Configuration
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Manage service request notification rules and automation settings
              </p>
            </div>
          </div>
          <button
            onClick={fetchWorkflowData}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Workflow State Statistics */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-2 mb-4">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Current States
              </h2>
            </div>
            <div className="space-y-2">
              {stats.stateStats.map(stat => (
                <div key={stat.current_state} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {getStateLabel(stat.current_state)}
                  </span>
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {stat.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Notification Statistics */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-2 mb-4">
              <Bell className="h-5 w-5 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Notifications (7d)
              </h2>
            </div>
            <div className="space-y-2">
              {stats.notificationStats.map(stat => (
                <div key={stat.trigger_event} className="text-sm">
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>{getTriggerEventLabel(stat.trigger_event)}</span>
                    <span>{stat.count}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span className="text-green-600">Sent: {stat.sent_count}</span>
                    <span className="text-red-600">Failed: {stat.failed_count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Actions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-2 mb-4">
              <Clock className="h-5 w-5 text-orange-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Pending Actions
              </h2>
            </div>
            <div className="space-y-3">
              <div className="text-center">
                <div className="text-4xl font-bold text-orange-600">
                  {stats.pendingActions.pending_count}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Scheduled Actions
                </div>
              </div>
              {stats.pendingActions.next_action_time && (
                <div className="text-xs text-gray-500 text-center mt-2">
                  Next: {new Date(stats.pendingActions.next_action_time).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Workflow Rules */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Notification Rules
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Configure timeouts, retries, and notification recipients
          </p>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {rules.map(rule => (
            <div key={rule.id} className="p-6">
              {editingRule === rule.id ? (
                // Edit Mode
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Rule Name
                    </label>
                    <input
                      type="text"
                      value={editForm.rule_name || ''}
                      onChange={(e) => setEditForm({ ...editForm, rule_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Description
                    </label>
                    <textarea
                      value={editForm.rule_description || ''}
                      onChange={(e) => setEditForm({ ...editForm, rule_description: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Timeout (minutes)
                      </label>
                      <input
                        type="number"
                        value={editForm.timeout_minutes || ''}
                        onChange={(e) => setEditForm({ ...editForm, timeout_minutes: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Max Retries
                      </label>
                      <input
                        type="number"
                        value={editForm.max_retry_count || 0}
                        onChange={(e) => setEditForm({ ...editForm, max_retry_count: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Retry Interval (min)
                      </label>
                      <input
                        type="number"
                        value={editForm.retry_interval_minutes || ''}
                        onChange={(e) => setEditForm({ ...editForm, retry_interval_minutes: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`active-${rule.id}`}
                      checked={editForm.is_active}
                      onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor={`active-${rule.id}`} className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Active
                    </label>
                  </div>

                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={handleCancelEdit}
                      disabled={saving}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleSaveRule(rule.id)}
                      disabled={saving}
                      className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      <span>{saving ? 'Saving...' : 'Save'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {rule.rule_name}
                        </h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          rule.is_active
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {rule.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {rule.rule_description}
                      </p>
                    </div>
                    <button
                      onClick={() => handleEditRule(rule)}
                      className="ml-4 p-2 text-gray-600 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Trigger:</span>
                      <div className="font-medium text-gray-900 dark:text-white mt-1">
                        {getTriggerEventLabel(rule.trigger_event)}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Recipients:</span>
                      <div className="font-medium text-gray-900 dark:text-white mt-1">
                        {rule.recipient_roles?.join(', ') || rule.recipient_type}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Timeout:</span>
                      <div className="font-medium text-gray-900 dark:text-white mt-1">
                        {rule.timeout_minutes ? `${rule.timeout_minutes} min` : 'Immediate'}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Max Retries:</span>
                      <div className="font-medium text-gray-900 dark:text-white mt-1">
                        {rule.max_retry_count}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WorkflowConfiguration;
