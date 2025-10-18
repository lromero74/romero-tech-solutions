import React, { useState, useEffect } from 'react';
import { X, Users, Monitor, AlertCircle } from 'lucide-react';
import { themeClasses } from '../../../contexts/ThemeContext';
import { automationService } from '../../../services/automationService';
import apiService from '../../../services/apiService';

interface AssignPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  policyId: string;
  policyName: string;
  onSuccess?: () => void;
}

interface Business {
  id: string;
  businessName: string;
}

interface AgentDevice {
  id: string;
  device_name: string;
  device_type: string;
  os_type: string;
  business_name?: string;
}

const AssignPolicyModal: React.FC<AssignPolicyModalProps> = ({
  isOpen,
  onClose,
  policyId,
  policyName,
  onSuccess,
}) => {
  const [assignmentScope, setAssignmentScope] = useState<'agent' | 'business'>('business');
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [agents, setAgents] = useState<AgentDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      setLoadingData(true);
      setError(null);

      // Load businesses and agents in parallel
      const [businessesResponse, agentsResponse] = await Promise.all([
        apiService.get('/admin/businesses'),
        apiService.get('/agents'),
      ]);

      if (businessesResponse.success && businessesResponse.data) {
        setBusinesses(businessesResponse.data.businesses || []);
      }

      if (agentsResponse.success && agentsResponse.data) {
        setAgents(agentsResponse.data.agents || []);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load businesses and agents');
    } finally {
      setLoadingData(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (assignmentScope === 'business' && !selectedBusinessId) {
      setError('Please select a business');
      return;
    }

    if (assignmentScope === 'agent' && !selectedAgentId) {
      setError('Please select an agent');
      return;
    }

    try {
      setLoading(true);

      const assignmentData = assignmentScope === 'business'
        ? { business_id: selectedBusinessId }
        : { agent_device_id: selectedAgentId };

      const response = await automationService.assignPolicy(policyId, assignmentData);

      if (response.success) {
        onSuccess?.();
        handleClose();
      } else {
        setError(response.message || 'Failed to assign policy');
      }
    } catch (err) {
      console.error('Error assigning policy:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while assigning policy');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAssignmentScope('business');
    setSelectedBusinessId('');
    setSelectedAgentId('');
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.modal} rounded-lg shadow-xl max-w-2xl w-full`}>
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>Assign Policy</h2>
          <button
            onClick={handleClose}
            className={`p-2 rounded-lg ${themeClasses.text.secondary} hover:${themeClasses.bg.hover}`}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6">
            {/* Policy Info */}
            <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
              <p className={`text-sm ${themeClasses.text.secondary}`}>Policy:</p>
              <p className={`text-lg font-semibold ${themeClasses.text.primary}`}>{policyName}</p>
            </div>

            {error && (
              <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded flex items-center">
                <AlertCircle className="w-5 h-5 mr-2" />
                {error}
              </div>
            )}

            {loadingData && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            )}

            {!loadingData && (
              <>
                {/* Assignment Scope Selection */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Assignment Scope
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setAssignmentScope('business');
                        setSelectedAgentId('');
                      }}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        assignmentScope === 'business'
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                          : `border-gray-300 dark:border-gray-600 ${themeClasses.bg.secondary}`
                      }`}
                    >
                      <div className="flex items-center justify-center mb-2">
                        <Users className={`w-8 h-8 ${assignmentScope === 'business' ? 'text-blue-600' : themeClasses.text.secondary}`} />
                      </div>
                      <div className={`text-sm font-medium ${assignmentScope === 'business' ? 'text-blue-600' : themeClasses.text.primary}`}>
                        Entire Business
                      </div>
                      <div className={`text-xs ${themeClasses.text.secondary} mt-1`}>
                        Apply to all agents in a business
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAssignmentScope('agent');
                        setSelectedBusinessId('');
                      }}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        assignmentScope === 'agent'
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                          : `border-gray-300 dark:border-gray-600 ${themeClasses.bg.secondary}`
                      }`}
                    >
                      <div className="flex items-center justify-center mb-2">
                        <Monitor className={`w-8 h-8 ${assignmentScope === 'agent' ? 'text-blue-600' : themeClasses.text.secondary}`} />
                      </div>
                      <div className={`text-sm font-medium ${assignmentScope === 'agent' ? 'text-blue-600' : themeClasses.text.primary}`}>
                        Single Agent
                      </div>
                      <div className={`text-xs ${themeClasses.text.secondary} mt-1`}>
                        Apply to a specific device
                      </div>
                    </button>
                  </div>
                </div>

                {/* Business Selection */}
                {assignmentScope === 'business' && (
                  <div>
                    <label htmlFor="business" className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                      Select Business <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="business"
                      value={selectedBusinessId}
                      onChange={(e) => setSelectedBusinessId(e.target.value)}
                      className={`w-full px-4 py-2 rounded-lg border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      required
                    >
                      <option value="">-- Select a business --</option>
                      {businesses.map((business) => (
                        <option key={business.id} value={business.id}>
                          {business.businessName}
                        </option>
                      ))}
                    </select>
                    {businesses.length === 0 && (
                      <p className={`text-sm ${themeClasses.text.secondary} mt-2`}>
                        No businesses available
                      </p>
                    )}
                  </div>
                )}

                {/* Agent Selection */}
                {assignmentScope === 'agent' && (
                  <div>
                    <label htmlFor="agent" className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                      Select Agent Device <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="agent"
                      value={selectedAgentId}
                      onChange={(e) => setSelectedAgentId(e.target.value)}
                      className={`w-full px-4 py-2 rounded-lg border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      required
                    >
                      <option value="">-- Select an agent --</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.device_name || agent.hostname} ({agent.os_type})
                          {agent.business_name && ` - ${agent.business_name}`}
                        </option>
                      ))}
                    </select>
                    {agents.length === 0 && (
                      <p className={`text-sm ${themeClasses.text.secondary} mt-2`}>
                        No agents available
                      </p>
                    )}
                  </div>
                )}

                {/* Info Box */}
                <div className={`p-4 rounded-lg ${themeClasses.bg.secondary} border-l-4 border-blue-500`}>
                  <p className={`text-sm ${themeClasses.text.secondary}`}>
                    {assignmentScope === 'business'
                      ? 'This policy will be applied to all current and future agents registered under the selected business.'
                      : 'This policy will be applied only to the selected agent device.'}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleClose}
              className={`px-6 py-2 rounded-lg ${themeClasses.button.secondary}`}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-6 py-2 rounded-lg ${themeClasses.button.primary}`}
              disabled={loading || loadingData}
            >
              {loading ? (
                <span className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Assigning...
                </span>
              ) : (
                'Assign Policy'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AssignPolicyModal;
