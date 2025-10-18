import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Package, Target, Settings, Calendar } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { deploymentService, SoftwarePackage, DeploymentSchedule } from '../../../services/deploymentService';
import { agentService } from '../../../services/agentService';

interface DeploymentWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Agent {
  id: string;
  hostname: string;
  business_name?: string;
}

interface Business {
  id: string;
  name: string;
}

const DeploymentWizard: React.FC<DeploymentWizardProps> = ({ isOpen, onClose, onSuccess }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data from API
  const [packages, setPackages] = useState<SoftwarePackage[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [schedules, setSchedules] = useState<DeploymentSchedule[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    deployment_name: '',
    package_id: '',
    deployment_scope: 'single_agent' as 'single_agent' | 'business' | 'all_agents',
    agent_device_id: '',
    business_id: '',
    install_mode: 'silent' as 'silent' | 'attended' | 'unattended',
    allow_reboot: false,
    scheduled_for: '',
    maintenance_window_id: '',
  });

  // Load data on mount
  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [packagesResponse, agentsResponse, schedulesResponse] = await Promise.all([
        deploymentService.listPackages({ is_approved: true }),
        agentService.listAgents(),
        deploymentService.listSchedules({ is_active: true }),
      ]);

      if (packagesResponse.success && packagesResponse.data) {
        setPackages(packagesResponse.data.packages);
      }

      if (agentsResponse.success && agentsResponse.data) {
        setAgents(agentsResponse.data.agents);
        // Extract unique businesses from agents
        const uniqueBusinesses = Array.from(
          new Set(
            agentsResponse.data.agents
              .filter((agent: Agent) => agent.business_name)
              .map((agent: Agent) => agent.business_name)
          )
        ).map((name, index) => ({ id: `business-${index}`, name: name as string }));
        setBusinesses(uniqueBusinesses);
      }

      if (schedulesResponse.success && schedulesResponse.data) {
        setSchedules(schedulesResponse.data.schedules);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load deployment options');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      // Validate based on scope
      if (formData.deployment_scope === 'single_agent' && !formData.agent_device_id) {
        setError('Please select an agent for single agent deployment');
        setLoading(false);
        return;
      }

      if (formData.deployment_scope === 'business' && !formData.business_id) {
        setError('Please select a business for business-wide deployment');
        setLoading(false);
        return;
      }

      const response = await deploymentService.createDeployment({
        deployment_name: formData.deployment_name.trim() || undefined,
        package_id: formData.package_id,
        deployment_scope: formData.deployment_scope,
        agent_device_id: formData.deployment_scope === 'single_agent' ? formData.agent_device_id : undefined,
        business_id: formData.deployment_scope === 'business' ? formData.business_id : undefined,
        install_mode: formData.install_mode,
        allow_reboot: formData.allow_reboot,
        scheduled_for: formData.scheduled_for || undefined,
        maintenance_window_id: formData.maintenance_window_id || undefined,
      });

      if (response.success) {
        // Reset form
        setFormData({
          deployment_name: '',
          package_id: '',
          deployment_scope: 'single_agent',
          agent_device_id: '',
          business_id: '',
          install_mode: 'silent',
          allow_reboot: false,
          scheduled_for: '',
          maintenance_window_id: '',
        });
        setCurrentStep(1);
        onSuccess();
        onClose();
      } else {
        setError(response.message || 'Failed to create deployment');
      }
    } catch (err) {
      setError('An error occurred while creating the deployment');
      console.error('Create deployment error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 1: // Package selection
        return !!formData.package_id;
      case 2: // Scope selection
        if (formData.deployment_scope === 'single_agent') {
          return !!formData.agent_device_id;
        } else if (formData.deployment_scope === 'business') {
          return !!formData.business_id;
        }
        return true; // all_agents doesn't need additional selection
      case 3: // Install options
        return true; // All fields are optional or have defaults
      case 4: // Schedule
        return true; // Scheduling is optional
      default:
        return false;
    }
  };

  const nextStep = () => {
    if (canProceed() && currentStep < 4) {
      setCurrentStep(currentStep + 1);
      setError(null);
    }
  };

  const previousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };

  const getSelectedPackage = (): SoftwarePackage | undefined => {
    return packages.find(pkg => pkg.id === formData.package_id);
  };

  if (!isOpen) return null;

  const selectedPackage = getSelectedPackage();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.modal} rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>Create Deployment</h2>
            <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>Step {currentStep} of 4</p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${themeClasses.text.secondary} hover:${themeClasses.bg.hover}`}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className={`flex items-center ${currentStep >= 1 ? 'text-blue-600' : themeClasses.text.secondary}`}>
              <Package className="w-5 h-5 mr-2" />
              <span className="text-sm font-medium">Package</span>
            </div>
            <div className={`flex items-center ${currentStep >= 2 ? 'text-blue-600' : themeClasses.text.secondary}`}>
              <Target className="w-5 h-5 mr-2" />
              <span className="text-sm font-medium">Target</span>
            </div>
            <div className={`flex items-center ${currentStep >= 3 ? 'text-blue-600' : themeClasses.text.secondary}`}>
              <Settings className="w-5 h-5 mr-2" />
              <span className="text-sm font-medium">Options</span>
            </div>
            <div className={`flex items-center ${currentStep >= 4 ? 'text-blue-600' : themeClasses.text.secondary}`}>
              <Calendar className="w-5 h-5 mr-2" />
              <span className="text-sm font-medium">Schedule</span>
            </div>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Error Display */}
          {error && (
            <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {/* Step 1: Select Package */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h3 className={`text-lg font-semibold ${themeClasses.text.primary}`}>Select Software Package</h3>
              <p className={`text-sm ${themeClasses.text.secondary}`}>
                Choose the software package you want to deploy
              </p>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {packages.map((pkg) => (
                  <label
                    key={pkg.id}
                    className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                      formData.package_id === pkg.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="package"
                      value={pkg.id}
                      checked={formData.package_id === pkg.id}
                      onChange={(e) => handleInputChange('package_id', e.target.value)}
                      className="mt-1 mr-3"
                    />
                    <div className="flex-1">
                      <div className={`font-medium ${themeClasses.text.primary}`}>
                        {pkg.package_name} {pkg.package_version && `v${pkg.package_version}`}
                      </div>
                      {pkg.description && (
                        <div className={`text-sm ${themeClasses.text.secondary} mt-1`}>{pkg.description}</div>
                      )}
                      <div className="flex gap-2 mt-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                          {pkg.package_type.toUpperCase()}
                        </span>
                        {pkg.publisher && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                            {pkg.publisher}
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {packages.length === 0 && (
                <div className={`text-center py-8 ${themeClasses.text.secondary}`}>
                  No approved packages available. Please create and approve a package first.
                </div>
              )}
            </div>
          )}

          {/* Step 2: Select Deployment Scope */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h3 className={`text-lg font-semibold ${themeClasses.text.primary}`}>Select Deployment Target</h3>
              <p className={`text-sm ${themeClasses.text.secondary}`}>
                Choose where to deploy {selectedPackage?.package_name}
              </p>

              {/* Deployment Name */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Deployment Name (Optional)
                </label>
                <input
                  type="text"
                  value={formData.deployment_name}
                  onChange={(e) => handleInputChange('deployment_name', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                  placeholder="e.g., Chrome Update - Marketing Team"
                />
              </div>

              {/* Scope Selection */}
              <div className="space-y-3">
                <label className={`block text-sm font-medium ${themeClasses.text.primary}`}>
                  Deployment Scope <span className="text-red-500">*</span>
                </label>

                <label className={`flex items-start p-4 rounded-lg border-2 cursor-pointer ${
                  formData.deployment_scope === 'single_agent'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}>
                  <input
                    type="radio"
                    name="scope"
                    value="single_agent"
                    checked={formData.deployment_scope === 'single_agent'}
                    onChange={(e) => handleInputChange('deployment_scope', e.target.value)}
                    className="mt-1 mr-3"
                  />
                  <div className="flex-1">
                    <div className={`font-medium ${themeClasses.text.primary}`}>Single Agent</div>
                    <div className={`text-sm ${themeClasses.text.secondary}`}>Deploy to a specific device</div>
                  </div>
                </label>

                <label className={`flex items-start p-4 rounded-lg border-2 cursor-pointer ${
                  formData.deployment_scope === 'business'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}>
                  <input
                    type="radio"
                    name="scope"
                    value="business"
                    checked={formData.deployment_scope === 'business'}
                    onChange={(e) => handleInputChange('deployment_scope', e.target.value)}
                    className="mt-1 mr-3"
                  />
                  <div className="flex-1">
                    <div className={`font-medium ${themeClasses.text.primary}`}>Business-Wide</div>
                    <div className={`text-sm ${themeClasses.text.secondary}`}>Deploy to all devices in a business</div>
                  </div>
                </label>

                <label className={`flex items-start p-4 rounded-lg border-2 cursor-pointer ${
                  formData.deployment_scope === 'all_agents'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                }`}>
                  <input
                    type="radio"
                    name="scope"
                    value="all_agents"
                    checked={formData.deployment_scope === 'all_agents'}
                    onChange={(e) => handleInputChange('deployment_scope', e.target.value)}
                    className="mt-1 mr-3"
                  />
                  <div className="flex-1">
                    <div className={`font-medium ${themeClasses.text.primary}`}>All Agents</div>
                    <div className={`text-sm ${themeClasses.text.secondary}`}>Deploy to all managed devices</div>
                  </div>
                </label>
              </div>

              {/* Agent Selection (if single_agent) */}
              {formData.deployment_scope === 'single_agent' && (
                <div>
                  <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                    Select Agent <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.agent_device_id}
                    onChange={(e) => handleInputChange('agent_device_id', e.target.value)}
                    className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                    required
                  >
                    <option value="">Select an agent...</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.hostname} {agent.business_name && `(${agent.business_name})`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Business Selection (if business) */}
              {formData.deployment_scope === 'business' && (
                <div>
                  <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                    Select Business <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.business_id}
                    onChange={(e) => handleInputChange('business_id', e.target.value)}
                    className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                    required
                  >
                    <option value="">Select a business...</option>
                    {businesses.map((business) => (
                      <option key={business.id} value={business.name}>
                        {business.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Installation Options */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <h3 className={`text-lg font-semibold ${themeClasses.text.primary}`}>Installation Options</h3>
              <p className={`text-sm ${themeClasses.text.secondary}`}>
                Configure how {selectedPackage?.package_name} will be installed
              </p>

              {/* Install Mode */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Installation Mode
                </label>
                <select
                  value={formData.install_mode}
                  onChange={(e) => handleInputChange('install_mode', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                >
                  <option value="silent">Silent (No user interaction)</option>
                  <option value="attended">Attended (User can see progress)</option>
                  <option value="unattended">Unattended (Background installation)</option>
                </select>
              </div>

              {/* Allow Reboot */}
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.allow_reboot}
                    onChange={(e) => handleInputChange('allow_reboot', e.target.checked)}
                    className="mr-2"
                  />
                  <span className={themeClasses.text.primary}>Allow automatic reboot if required</span>
                </label>
                <p className={`text-xs mt-1 ml-6 ${themeClasses.text.secondary}`}>
                  {selectedPackage?.requires_reboot
                    ? 'This package requires a reboot after installation'
                    : 'Reboot will only occur if the installation requires it'}
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Schedule */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <h3 className={`text-lg font-semibold ${themeClasses.text.primary}`}>Schedule Deployment</h3>
              <p className={`text-sm ${themeClasses.text.secondary}`}>
                Optionally schedule when the deployment should occur
              </p>

              {/* Scheduled Date/Time */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Schedule For (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_for}
                  onChange={(e) => handleInputChange('scheduled_for', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                />
                <p className={`text-xs mt-1 ${themeClasses.text.secondary}`}>
                  Leave empty to deploy immediately
                </p>
              </div>

              {/* Maintenance Window */}
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.primary}`}>
                  Maintenance Window (Optional)
                </label>
                <select
                  value={formData.maintenance_window_id}
                  onChange={(e) => handleInputChange('maintenance_window_id', e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg ${themeClasses.input}`}
                >
                  <option value="">No maintenance window</option>
                  {schedules.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.schedule_name} ({schedule.schedule_type})
                    </option>
                  ))}
                </select>
                <p className={`text-xs mt-1 ${themeClasses.text.secondary}`}>
                  Restrict deployment to occur only during this maintenance window
                </p>
              </div>

              {/* Summary */}
              <div className={`mt-6 p-4 rounded-lg ${themeClasses.bg.secondary} border ${themeClasses.border.primary}`}>
                <h4 className={`font-semibold ${themeClasses.text.primary} mb-3`}>Deployment Summary</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className={themeClasses.text.secondary}>Package:</dt>
                    <dd className={`${themeClasses.text.primary} font-medium`}>
                      {selectedPackage?.package_name} {selectedPackage?.package_version}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className={themeClasses.text.secondary}>Target:</dt>
                    <dd className={`${themeClasses.text.primary} font-medium`}>
                      {formData.deployment_scope === 'single_agent' && 'Single Agent'}
                      {formData.deployment_scope === 'business' && 'Business-Wide'}
                      {formData.deployment_scope === 'all_agents' && 'All Agents'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className={themeClasses.text.secondary}>Install Mode:</dt>
                    <dd className={`${themeClasses.text.primary} font-medium capitalize`}>{formData.install_mode}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className={themeClasses.text.secondary}>Allow Reboot:</dt>
                    <dd className={`${themeClasses.text.primary} font-medium`}>
                      {formData.allow_reboot ? 'Yes' : 'No'}
                    </dd>
                  </div>
                  {formData.scheduled_for && (
                    <div className="flex justify-between">
                      <dt className={themeClasses.text.secondary}>Scheduled:</dt>
                      <dd className={`${themeClasses.text.primary} font-medium`}>
                        {new Date(formData.scheduled_for).toLocaleString()}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={previousStep}
            className={`inline-flex items-center px-6 py-2 rounded-lg ${themeClasses.button.secondary}`}
            disabled={currentStep === 1 || loading}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Back
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className={`px-6 py-2 rounded-lg ${themeClasses.button.secondary}`}
              disabled={loading}
            >
              Cancel
            </button>
            {currentStep < 4 ? (
              <button
                onClick={nextStep}
                className={`inline-flex items-center px-6 py-2 rounded-lg ${themeClasses.button.primary}`}
                disabled={!canProceed() || loading}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className={`px-6 py-2 rounded-lg ${themeClasses.button.primary}`}
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Create Deployment'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeploymentWizard;
