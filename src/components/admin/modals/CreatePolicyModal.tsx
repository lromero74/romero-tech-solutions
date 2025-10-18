import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { automationService, AutomationScript } from '../../../services/automationService';

interface CreatePolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CreatePolicyModal: React.FC<CreatePolicyModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scripts, setScripts] = useState<AutomationScript[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    policy_name: '',
    policy_type: 'script_execution' as 'script_execution' | 'config_enforcement' | 'compliance_check' | 'maintenance_task',
    description: '',
    script_id: '',
    execution_mode: 'manual' as 'manual' | 'scheduled' | 'triggered',
    schedule_cron: '',
    run_on_assignment: false,
    enabled: true,
  });

  // Load scripts on mount
  useEffect(() => {
    if (isOpen) {
      loadScripts();
    }
  }, [isOpen]);

  const loadScripts = async () => {
    try {
      const response = await automationService.listScripts();
      if (response.success && response.data) {
        setScripts(response.data.scripts);
      }
    } catch (err) {
      console.error('Failed to load scripts:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate required fields
      if (!formData.policy_name.trim()) {
        setError('Policy name is required');
        setLoading(false);
        return;
      }

      // Validate script_execution policy type has a script selected
      if (formData.policy_type === 'script_execution' && !formData.script_id) {
        setError('Please select a script for script execution policies');
        setLoading(false);
        return;
      }

      // Validate scheduled execution has a cron expression
      if (formData.execution_mode === 'scheduled' && !formData.schedule_cron.trim()) {
        setError('Please provide a cron schedule for scheduled execution');
        setLoading(false);
        return;
      }

      const response = await automationService.createPolicy({
        policy_name: formData.policy_name.trim(),
        policy_type: formData.policy_type,
        description: formData.description.trim() || undefined,
        script_id: formData.script_id || undefined,
        execution_mode: formData.execution_mode,
        schedule_cron: formData.schedule_cron.trim() || undefined,
        run_on_assignment: formData.run_on_assignment,
        enabled: formData.enabled,
      });

      if (response.success) {
        // Reset form
        setFormData({
          policy_name: '',
          policy_type: 'script_execution',
          description: '',
          script_id: '',
          execution_mode: 'manual',
          schedule_cron: '',
          run_on_assignment: false,
          enabled: true,
        });
        onSuccess();
        onClose();
      } else {
        setError(response.message || 'Failed to create policy');
      }
    } catch (err) {
      setError('An error occurred while creating the policy');
      console.error('Create policy error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.modal} rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>Create Automation Policy</h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${themeClasses.text.secondary} hover:${themeClasses.bg.hover}`}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Error Display */}
            {error && (
              <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Policy Name */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                Policy Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.policy_name}
                onChange={(e) => handleInputChange('policy_name', e.target.value)}
                className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                placeholder="e.g., Daily Security Updates"
                required
              />
            </div>

            {/* Policy Type */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                Policy Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.policy_type}
                onChange={(e) => handleInputChange('policy_type', e.target.value)}
                className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                required
              >
                <option value="script_execution">Script Execution</option>
                <option value="config_enforcement">Configuration Enforcement</option>
                <option value="compliance_check">Compliance Check</option>
                <option value="maintenance_task">Maintenance Task</option>
              </select>
              <p className={`text-xs mt-1 ${themeClasses.text.secondary}`}>
                {formData.policy_type === 'script_execution' && 'Execute an automation script on assigned devices'}
                {formData.policy_type === 'config_enforcement' && 'Enforce configuration settings across devices'}
                {formData.policy_type === 'compliance_check' && 'Verify devices meet compliance requirements'}
                {formData.policy_type === 'maintenance_task' && 'Perform routine maintenance operations'}
              </p>
            </div>

            {/* Script Selection (only for script_execution type) */}
            {formData.policy_type === 'script_execution' && (
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Script <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.script_id}
                  onChange={(e) => handleInputChange('script_id', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                  required={formData.policy_type === 'script_execution'}
                >
                  <option value="">Select a script...</option>
                  {scripts.map((script) => (
                    <option key={script.id} value={script.id}>
                      {script.script_name} ({script.script_type})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Description */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                rows={3}
                placeholder="Describe what this policy does..."
              />
            </div>

            {/* Execution Mode */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                Execution Mode <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.execution_mode}
                onChange={(e) => handleInputChange('execution_mode', e.target.value)}
                className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                required
              >
                <option value="manual">Manual</option>
                <option value="scheduled">Scheduled</option>
                <option value="triggered">Event Triggered</option>
              </select>
              <p className={`text-xs mt-1 ${themeClasses.text.secondary}`}>
                {formData.execution_mode === 'manual' && 'Policy will be executed manually by administrators'}
                {formData.execution_mode === 'scheduled' && 'Policy will run automatically on a schedule'}
                {formData.execution_mode === 'triggered' && 'Policy will run when specific events occur'}
              </p>
            </div>

            {/* Schedule Cron (only for scheduled execution) */}
            {formData.execution_mode === 'scheduled' && (
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Schedule (Cron Expression) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.schedule_cron}
                  onChange={(e) => handleInputChange('schedule_cron', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input} font-mono text-sm`}
                  placeholder="0 2 * * * (Daily at 2 AM)"
                  required={formData.execution_mode === 'scheduled'}
                />
                <p className={`text-xs mt-1 ${themeClasses.text.secondary}`}>
                  Examples: "0 2 * * *" (daily at 2 AM), "0 */6 * * *" (every 6 hours), "0 0 * * 0" (weekly on Sunday)
                </p>
              </div>
            )}

            {/* Run on Assignment */}
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.run_on_assignment}
                  onChange={(e) => handleInputChange('run_on_assignment', e.target.checked)}
                  className="mr-2"
                />
                <span className={themeClasses.text.primary}>Run immediately when assigned to a device</span>
              </label>
              <p className={`text-xs mt-1 ml-6 ${themeClasses.text.secondary}`}>
                If enabled, the policy will execute as soon as it's assigned to an agent or business
              </p>
            </div>

            {/* Enabled Status */}
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => handleInputChange('enabled', e.target.checked)}
                  className="mr-2"
                />
                <span className={themeClasses.text.primary}>Enable policy immediately</span>
              </label>
              <p className={`text-xs mt-1 ml-6 ${themeClasses.text.secondary}`}>
                Disabled policies will not execute even if scheduled or triggered
              </p>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className={`px-6 py-2 rounded-lg ${themeClasses.button.secondary}`}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className={`px-6 py-2 rounded-lg ${themeClasses.button.primary}`}
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Policy'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreatePolicyModal;
