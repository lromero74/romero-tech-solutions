import React, { useState, useEffect } from 'react';
import { X, Save, AlertTriangle, Plus, Trash2, Clock, Users, Bell } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import api from '../../services/apiService';

interface EscalationStep {
  order: number;
  wait_minutes: number;
  escalate_to_roles: string[];
  notify_email: boolean;
  notify_sms: boolean;
  notify_websocket: boolean;
}

interface EscalationPolicy {
  id?: number;
  policy_name: string;
  description?: string;
  trigger_severity: string[];
  trigger_after_minutes: number;
  escalation_steps: EscalationStep[];
  enabled: boolean;
}

interface EscalationPolicyEditorModalProps {
  policy: EscalationPolicy | null;
  onClose: () => void;
  onSave: () => void;
}

const defaultPolicy: Omit<EscalationPolicy, 'id'> = {
  policy_name: '',
  description: '',
  trigger_severity: ['critical', 'high'],
  trigger_after_minutes: 30,
  escalation_steps: [
    {
      order: 1,
      wait_minutes: 0,
      escalate_to_roles: ['manager'],
      notify_email: true,
      notify_sms: true,
      notify_websocket: true,
    },
  ],
  enabled: true,
};

const EscalationPolicyEditorModal: React.FC<EscalationPolicyEditorModalProps> = ({
  policy,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<Omit<EscalationPolicy, 'id'>>(
    policy || defaultPolicy
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (policy) {
      setFormData(policy);
    }
  }, [policy]);

  const handleSeverityToggle = (severity: string) => {
    const newSeverities = formData.trigger_severity.includes(severity)
      ? formData.trigger_severity.filter(s => s !== severity)
      : [...formData.trigger_severity, severity];

    setFormData({ ...formData, trigger_severity: newSeverities });
  };

  const handleRoleToggle = (stepIndex: number, role: string) => {
    const steps = [...formData.escalation_steps];
    const step = steps[stepIndex];

    step.escalate_to_roles = step.escalate_to_roles.includes(role)
      ? step.escalate_to_roles.filter(r => r !== role)
      : [...step.escalate_to_roles, role];

    setFormData({ ...formData, escalation_steps: steps });
  };

  const handleStepChange = (stepIndex: number, field: string, value: any) => {
    const steps = [...formData.escalation_steps];
    steps[stepIndex] = { ...steps[stepIndex], [field]: value };
    setFormData({ ...formData, escalation_steps: steps });
  };

  const addEscalationStep = () => {
    const newStep: EscalationStep = {
      order: formData.escalation_steps.length + 1,
      wait_minutes: 30,
      escalate_to_roles: ['executive'],
      notify_email: true,
      notify_sms: true,
      notify_websocket: true,
    };

    setFormData({
      ...formData,
      escalation_steps: [...formData.escalation_steps, newStep],
    });
  };

  const removeEscalationStep = (stepIndex: number) => {
    const steps = formData.escalation_steps.filter((_, index) => index !== stepIndex);
    // Reorder steps
    const reorderedSteps = steps.map((step, index) => ({ ...step, order: index + 1 }));
    setFormData({ ...formData, escalation_steps: reorderedSteps });
  };

  const validateForm = (): string | null => {
    if (!formData.policy_name.trim()) {
      return 'Policy name is required';
    }

    if (formData.trigger_severity.length === 0) {
      return 'At least one trigger severity must be selected';
    }

    if (formData.trigger_after_minutes < 1) {
      return 'Trigger time must be at least 1 minute';
    }

    if (formData.escalation_steps.length === 0) {
      return 'At least one escalation step is required';
    }

    for (const step of formData.escalation_steps) {
      if (step.escalate_to_roles.length === 0) {
        return `Step ${step.order} must have at least one role selected`;
      }

      if (!step.notify_email && !step.notify_sms && !step.notify_websocket) {
        return `Step ${step.order} must have at least one notification channel enabled`;
      }
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
      if (policy?.id) {
        // Update existing policy
        await api.put(`/admin/alerts/escalation-policies/${policy.id}`, formData);
      } else {
        // Create new policy
        await api.post('/admin/alerts/escalation-policies', formData);
      }
      onSave();
    } catch (err: any) {
      console.error('Failed to save escalation policy:', err);
      setError(err.response?.data?.message || 'Failed to save escalation policy');
      setSaving(false);
    }
  };

  const availableRoles = [
    { value: 'executive', label: 'Executive', color: 'purple' },
    { value: 'admin', label: 'Admin', color: 'blue' },
    { value: 'manager', label: 'Manager', color: 'green' },
    { value: 'technician', label: 'Technician', color: 'yellow' },
    { value: 'sales', label: 'Sales', color: 'pink' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className={`${themeClasses.cardBg} rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b ${themeClasses.border} flex items-center justify-between`}>
          <div className="flex items-center">
            <AlertTriangle className="w-6 h-6 text-orange-500 mr-3" />
            <div>
              <h2 className={`text-xl font-semibold ${themeClasses.text}`}>
                {policy ? 'Edit Escalation Policy' : 'New Escalation Policy'}
              </h2>
              <p className={`text-sm ${themeClasses.mutedText}`}>
                Configure automatic escalation for unacknowledged alerts
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

            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className={`text-lg font-medium ${themeClasses.text}`}>Basic Information</h3>

              <div>
                <label className={`block text-sm font-medium ${themeClasses.mutedText} mb-2`}>
                  Policy Name
                </label>
                <input
                  type="text"
                  value={formData.policy_name}
                  onChange={(e) => setFormData({ ...formData, policy_name: e.target.value })}
                  className={`block w-full rounded-md shadow-sm px-3 py-2 focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
                  placeholder="e.g., Critical Alert Escalation"
                  required
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${themeClasses.mutedText} mb-2`}>
                  Description (Optional)
                </label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className={`block w-full rounded-md shadow-sm px-3 py-2 focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
                  placeholder="Describe when this policy applies..."
                />
              </div>
            </div>

            {/* Trigger Conditions */}
            <div className="space-y-4">
              <h3 className={`text-lg font-medium ${themeClasses.text}`}>Trigger Conditions</h3>
              <p className={`text-sm ${themeClasses.mutedText}`}>
                Define when this escalation policy should be activated
              </p>

              {/* Severity Levels */}
              <div>
                <label className={`block text-sm font-medium ${themeClasses.mutedText} mb-2`}>
                  Trigger for Severity Levels
                </label>
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
                        formData.trigger_severity.includes(severity.value)
                          ? `border-${severity.color}-500 bg-${severity.color}-50 dark:bg-${severity.color}-900/20`
                          : `border-gray-300 dark:border-gray-600 ${themeClasses.cardBg}`
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.trigger_severity.includes(severity.value)}
                        onChange={() => handleSeverityToggle(severity.value)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                      />
                      <span className={`text-sm font-medium ${themeClasses.text}`}>{severity.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Trigger Time */}
              <div>
                <label className={`block text-sm font-medium ${themeClasses.mutedText} mb-2`}>
                  Trigger After (minutes unacknowledged)
                </label>
                <div className="flex items-center">
                  <Clock className="w-5 h-5 text-gray-400 mr-2" />
                  <input
                    type="number"
                    min="1"
                    value={formData.trigger_after_minutes}
                    onChange={(e) => setFormData({ ...formData, trigger_after_minutes: parseInt(e.target.value) || 1 })}
                    className={`block w-32 rounded-md shadow-sm px-3 py-2 focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
                  />
                  <span className={`ml-2 text-sm ${themeClasses.text}`}>minutes</span>
                </div>
                <p className={`text-xs ${themeClasses.mutedText} mt-1`}>
                  How long to wait before starting escalation
                </p>
              </div>
            </div>

            {/* Escalation Steps */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className={`text-lg font-medium ${themeClasses.text}`}>Escalation Steps</h3>
                <button
                  type="button"
                  onClick={addEscalationStep}
                  className="flex items-center px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Step
                </button>
              </div>

              <p className={`text-sm ${themeClasses.mutedText}`}>
                Define who gets notified at each escalation level
              </p>

              <div className="space-y-4">
                {formData.escalation_steps.map((step, stepIndex) => (
                  <div
                    key={stepIndex}
                    className={`${themeClasses.cardBg} border-2 ${themeClasses.border} rounded-lg p-4`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-medium rounded">
                          Step {step.order}
                        </span>
                        {stepIndex > 0 && (
                          <div className="flex items-center">
                            <Clock className="w-4 h-4 text-gray-400 mr-1" />
                            <input
                              type="number"
                              min="0"
                              value={step.wait_minutes}
                              onChange={(e) => handleStepChange(stepIndex, 'wait_minutes', parseInt(e.target.value) || 0)}
                              className={`w-20 rounded-md shadow-sm px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500 ${themeClasses.cardBg} ${themeClasses.text} border ${themeClasses.border}`}
                            />
                            <span className={`ml-1 text-sm ${themeClasses.mutedText}`}>min after previous</span>
                          </div>
                        )}
                      </div>
                      {formData.escalation_steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEscalationStep(stepIndex)}
                          className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                          title="Remove step"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Roles */}
                    <div className="mb-4">
                      <label className={`flex items-center text-sm font-medium ${themeClasses.mutedText} mb-2`}>
                        <Users className="w-4 h-4 mr-1" />
                        Escalate to Roles
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {availableRoles.map(role => (
                          <label
                            key={role.value}
                            className={`flex items-center p-2 rounded border cursor-pointer transition-colors ${
                              step.escalate_to_roles.includes(role.value)
                                ? `border-${role.color}-500 bg-${role.color}-50 dark:bg-${role.color}-900/20`
                                : `${themeClasses.border} ${themeClasses.cardBg}`
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={step.escalate_to_roles.includes(role.value)}
                              onChange={() => handleRoleToggle(stepIndex, role.value)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                            />
                            <span className={`text-xs font-medium ${themeClasses.text}`}>{role.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Notification Channels */}
                    <div>
                      <label className={`flex items-center text-sm font-medium ${themeClasses.mutedText} mb-2`}>
                        <Bell className="w-4 h-4 mr-1" />
                        Notification Channels
                      </label>
                      <div className="flex flex-wrap gap-3">
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={step.notify_email}
                            onChange={(e) => handleStepChange(stepIndex, 'notify_email', e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                          />
                          <span className={`text-sm ${themeClasses.text}`}>Email</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={step.notify_sms}
                            onChange={(e) => handleStepChange(stepIndex, 'notify_sms', e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                          />
                          <span className={`text-sm ${themeClasses.text}`}>SMS</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={step.notify_websocket}
                            onChange={(e) => handleStepChange(stepIndex, 'notify_websocket', e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                          />
                          <span className={`text-sm ${themeClasses.text}`}>Real-time Dashboard</span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Enabled Toggle */}
            <div className="space-y-4">
              <div className={`${themeClasses.cardBg} border ${themeClasses.border} rounded-lg p-4`}>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className={`text-sm font-medium ${themeClasses.text}`}>Enable Policy</span>
                    <p className={`text-xs ${themeClasses.mutedText} mt-1`}>
                      Temporarily disable this policy without deleting it
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
              disabled={saving || !formData.policy_name.trim()}
              className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                saving || !formData.policy_name.trim()
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
                  Save Policy
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EscalationPolicyEditorModal;
