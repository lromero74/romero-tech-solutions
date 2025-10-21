import React, { useState, useEffect } from 'react';
import { AlertTriangle, Plus, Edit2, Trash2, Clock, Users, Bell } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import api from '../../services/apiService';
import EscalationPolicyEditorModal from './EscalationPolicyEditorModal';

interface EscalationStep {
  order: number;
  wait_minutes: number;
  escalate_to_roles: string[];
  notify_email: boolean;
  notify_sms: boolean;
  notify_websocket: boolean;
}

interface EscalationPolicy {
  id: number;
  policy_name: string;
  description?: string;
  trigger_severity: string[];
  trigger_after_minutes: number;
  escalation_steps: EscalationStep[];
  enabled: boolean;
  created_at: string;
  created_by_name?: string;
}

const EscalationPolicyManager: React.FC = () => {
  const [policies, setPolicies] = useState<EscalationPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<EscalationPolicy | null>(null);
  const [showEditorModal, setShowEditorModal] = useState(false);

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/alerts/escalation-policies');
      setPolicies(response.data.data || []);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load escalation policies:', err);
      setError(err.message || 'Failed to load escalation policies');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePolicy = () => {
    setEditingPolicy(null);
    setShowEditorModal(true);
  };

  const handleEditPolicy = (policy: EscalationPolicy) => {
    setEditingPolicy(policy);
    setShowEditorModal(true);
  };

  const handleDeletePolicy = async (policy: EscalationPolicy) => {
    if (!confirm(`Are you sure you want to delete the escalation policy "${policy.policy_name}"?`)) {
      return;
    }

    try {
      await api.delete(`/admin/alerts/escalation-policies/${policy.id}`);
      await loadPolicies();
    } catch (err: any) {
      console.error('Failed to delete escalation policy:', err);
      alert('Failed to delete escalation policy');
    }
  };

  const handleSavePolicy = async () => {
    await loadPolicies();
    setShowEditorModal(false);
    setEditingPolicy(null);
  };

  const getSeverityBadges = (severities: string[]) => {
    const colors = {
      critical: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
      high: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
      medium: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
      low: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    };

    return severities.map(severity => (
      <span
        key={severity}
        className={`px-2 py-1 rounded text-xs font-medium ${colors[severity as keyof typeof colors] || colors.medium}`}
      >
        {severity.toUpperCase()}
      </span>
    ));
  };

  const getRoleBadges = (roles: string[]) => {
    const colors = {
      executive: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
      admin: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      manager: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
      technician: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
      sales: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',
    };

    return roles.map(role => (
      <span
        key={role}
        className={`px-2 py-1 rounded text-xs font-medium ${colors[role as keyof typeof colors] || 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300'}`}
      >
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </span>
    ));
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-8 ${themeClasses.cardBg} rounded-lg`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={themeClasses.text}>Loading escalation policies...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg`}>
        <p className="text-red-700 dark:text-red-300">Error: {error}</p>
        <button
          onClick={loadPolicies}
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
            <AlertTriangle className="inline-block w-6 h-6 mr-2" />
            Alert Escalation Policies
          </h2>
          <p className={`mt-1 text-sm ${themeClasses.mutedText}`}>
            Configure automatic escalation rules for unacknowledged alerts
          </p>
        </div>
        <button
          onClick={handleCreatePolicy}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Policy
        </button>
      </div>

      {/* Policies List */}
      {policies.length === 0 ? (
        <div className={`${themeClasses.cardBg} p-12 rounded-lg border ${themeClasses.border} text-center`}>
          <AlertTriangle className={`w-16 h-16 mx-auto mb-4 ${themeClasses.mutedText}`} />
          <h3 className={`text-lg font-semibold ${themeClasses.text} mb-2`}>No Escalation Policies</h3>
          <p className={`${themeClasses.mutedText} mb-4`}>
            You don't have any escalation policies yet. Create one to automatically escalate unacknowledged alerts.
          </p>
          <button
            onClick={handleCreatePolicy}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create Your First Policy
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {policies.map((policy) => (
            <div
              key={policy.id}
              className={`${themeClasses.cardBg} p-6 rounded-lg border ${themeClasses.border} ${
                !policy.enabled ? 'opacity-60' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Title and Status */}
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className={`text-lg font-semibold ${themeClasses.text}`}>
                      {policy.policy_name}
                    </h3>
                    {!policy.enabled && (
                      <span className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                        Disabled
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {policy.description && (
                    <p className={`text-sm ${themeClasses.mutedText} mb-4`}>{policy.description}</p>
                  )}

                  {/* Trigger Conditions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className={`text-xs font-medium ${themeClasses.mutedText} mb-2`}>TRIGGER SEVERITIES</p>
                      <div className="flex flex-wrap gap-1">
                        {getSeverityBadges(policy.trigger_severity)}
                      </div>
                    </div>

                    <div>
                      <p className={`text-xs font-medium ${themeClasses.mutedText} mb-2`}>TRIGGER AFTER</p>
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 text-gray-500 mr-2" />
                        <span className={`text-sm ${themeClasses.text}`}>
                          {policy.trigger_after_minutes} minutes unacknowledged
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Escalation Steps */}
                  <div>
                    <p className={`text-xs font-medium ${themeClasses.mutedText} mb-2`}>ESCALATION STEPS</p>
                    <div className="space-y-2">
                      {policy.escalation_steps
                        .sort((a, b) => a.order - b.order)
                        .map((step, index) => (
                          <div
                            key={step.order}
                            className={`${themeClasses.cardBg} border ${themeClasses.border} rounded p-3`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded">
                                    Step {step.order}
                                  </span>
                                  {step.wait_minutes > 0 && (
                                    <span className={`text-xs ${themeClasses.mutedText}`}>
                                      after {step.wait_minutes} min
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 mb-2">
                                  <Users className="w-4 h-4 text-gray-500" />
                                  <div className="flex flex-wrap gap-1">
                                    {getRoleBadges(step.escalate_to_roles)}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Bell className="w-4 h-4 text-gray-500" />
                                  <div className="flex gap-2 text-xs">
                                    {step.notify_email && (
                                      <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded">
                                        Email
                                      </span>
                                    )}
                                    {step.notify_sms && (
                                      <span className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded">
                                        SMS
                                      </span>
                                    )}
                                    {step.notify_websocket && (
                                      <span className="px-2 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded">
                                        Real-time
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Created Info */}
                  {policy.created_by_name && (
                    <p className={`text-xs ${themeClasses.mutedText} mt-3`}>
                      Created by {policy.created_by_name} on{' '}
                      {new Date(policy.created_at).toLocaleDateString()}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleEditPolicy(policy)}
                    className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                    title="Edit policy"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeletePolicy(policy)}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                    title="Delete policy"
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
        <EscalationPolicyEditorModal
          policy={editingPolicy}
          onClose={() => {
            setShowEditorModal(false);
            setEditingPolicy(null);
          }}
          onSave={handleSavePolicy}
        />
      )}
    </div>
  );
};

export default EscalationPolicyManager;
