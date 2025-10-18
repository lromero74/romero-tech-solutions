import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Loader, RefreshCw } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { agentService, type AgentDevice } from '../../services/agentService';
import { adminService } from '../../services/adminService';

interface TrialConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  trialAgent: AgentDevice | null;
  onConversionSuccess?: (newAgentId: string) => void;
}

interface Business {
  id: string;
  businessName: string;
  isActive: boolean;
}

const TrialConversionModal: React.FC<TrialConversionModalProps> = ({
  isOpen,
  onClose,
  trialAgent,
  onConversionSuccess
}) => {
  const [step, setStep] = useState<'business-selection' | 'converting' | 'success' | 'error'>('business-selection');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string>('');
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [preserveData, setPreserveData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newAgentId, setNewAgentId] = useState<string | null>(null);
  const [registrationToken, setRegistrationToken] = useState<string | null>(null);

  // Load businesses when modal opens
  useEffect(() => {
    if (isOpen) {
      loadBusinesses();
      // Reset state
      setStep('business-selection');
      setSelectedBusinessId('');
      setPreserveData(true);
      setError(null);
      setNewAgentId(null);
      setRegistrationToken(null);
    }
  }, [isOpen]);

  const loadBusinesses = async () => {
    setLoadingBusinesses(true);
    try {
      const response = await adminService.getBusinesses();
      if (response.success && response.data) {
        // Filter to only active businesses
        const activeBusinesses = response.data.filter((b: Business) => b.isActive);
        setBusinesses(activeBusinesses);
      }
    } catch (err) {
      console.error('Failed to load businesses:', err);
      setError('Failed to load businesses. Please try again.');
    } finally {
      setLoadingBusinesses(false);
    }
  };

  const handleConvert = async () => {
    if (!selectedBusinessId) {
      setError('Please select a business');
      return;
    }

    if (!trialAgent || !trialAgent.trial_original_id) {
      setError('Invalid trial agent');
      return;
    }

    setStep('converting');
    setError(null);

    try {
      // Step 1: Create a registration token for the selected business
      const tokenResponse = await agentService.createRegistrationToken({
        business_id: selectedBusinessId,
        expires_in: 3600 // 1 hour expiration
      });

      if (!tokenResponse.success || !tokenResponse.data?.token) {
        throw new Error('Failed to create registration token');
      }

      const token = tokenResponse.data.token;
      setRegistrationToken(token);

      // Step 2: Convert the trial agent using the token
      const conversionResponse = await agentService.convertTrialAgent({
        trial_id: trialAgent.trial_original_id, // Use original trial-{timestamp} format
        registration_token: token,
        preserve_data: preserveData
      });

      if (!conversionResponse.success || !conversionResponse.data) {
        throw new Error(conversionResponse.error || 'Failed to convert trial agent');
      }

      // Conversion successful
      setNewAgentId(conversionResponse.data.agent_id);
      setStep('success');

      // Call success callback
      if (onConversionSuccess) {
        onConversionSuccess(conversionResponse.data.agent_id);
      }
    } catch (err) {
      console.error('Trial conversion failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to convert trial agent');
      setStep('error');
    }
  };

  const handleClose = () => {
    onClose();
    // Reset after animation completes
    setTimeout(() => {
      setStep('business-selection');
      setSelectedBusinessId('');
      setPreserveData(true);
      setError(null);
      setNewAgentId(null);
      setRegistrationToken(null);
    }, 300);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className={`relative w-full max-w-md transform transition-all ${themeClasses.bg.primary} ${themeClasses.border.primary} border rounded-lg shadow-xl`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={`flex items-center justify-between p-6 border-b ${themeClasses.border.primary}`}>
            <h3 className={`text-lg font-semibold ${themeClasses.text.primary}`}>
              Convert Trial Agent to Paid
            </h3>
            <button
              onClick={handleClose}
              className={`${themeClasses.text.tertiary} hover:${themeClasses.text.primary} transition-colors`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Business Selection Step */}
            {step === 'business-selection' && (
              <div className="space-y-4">
                {/* Trial Agent Info */}
                <div className={`p-4 rounded-lg ${themeClasses.bg.secondary}`}>
                  <p className={`text-sm ${themeClasses.text.secondary} mb-1`}>
                    Converting trial agent:
                  </p>
                  <p className={`font-medium ${themeClasses.text.primary}`}>
                    {trialAgent?.device_name || 'Unknown Device'}
                  </p>
                  <p className={`text-xs ${themeClasses.text.tertiary} mt-1`}>
                    Trial ID: {trialAgent?.trial_original_id || 'Unknown'}
                  </p>
                </div>

                {/* Business Selection */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.primary} mb-2`}>
                    Select Business <span className="text-red-500">*</span>
                  </label>
                  {loadingBusinesses ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader className="w-5 h-5 animate-spin text-blue-600" />
                    </div>
                  ) : (
                    <select
                      value={selectedBusinessId}
                      onChange={(e) => setSelectedBusinessId(e.target.value)}
                      className={`w-full px-3 py-2 rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    >
                      <option value="">-- Select a business --</option>
                      {businesses.map((business) => (
                        <option key={business.id} value={business.id}>
                          {business.businessName}
                        </option>
                      ))}
                    </select>
                  )}
                  {businesses.length === 0 && !loadingBusinesses && (
                    <p className={`text-sm ${themeClasses.text.tertiary} mt-2`}>
                      No active businesses found. Please create a business first.
                    </p>
                  )}
                </div>

                {/* Preserve Data Option */}
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="preserve-data"
                    checked={preserveData}
                    onChange={(e) => setPreserveData(e.target.checked)}
                    className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="preserve-data" className={`ml-2 text-sm ${themeClasses.text.secondary}`}>
                    Preserve trial metrics and history
                    <p className={`text-xs ${themeClasses.text.tertiary} mt-1`}>
                      If checked, all metrics collected during the trial period will be migrated to the new registered agent.
                    </p>
                  </label>
                </div>

                {/* Error Display */}
                {error && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* Converting Step */}
            {step === 'converting' && (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader className="w-12 h-12 animate-spin text-blue-600 mb-4" />
                <p className={`text-lg font-medium ${themeClasses.text.primary}`}>
                  Converting trial agent...
                </p>
                <p className={`text-sm ${themeClasses.text.tertiary} mt-2`}>
                  Please wait while we convert your trial agent to a registered agent.
                </p>
              </div>
            )}

            {/* Success Step */}
            {step === 'success' && (
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center py-4">
                  <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mb-4">
                    <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
                  </div>
                  <p className={`text-lg font-medium ${themeClasses.text.primary}`}>
                    Conversion Successful!
                  </p>
                  <p className={`text-sm ${themeClasses.text.tertiary} mt-2 text-center`}>
                    Trial agent has been successfully converted to a registered agent.
                  </p>
                </div>

                <div className={`p-4 rounded-lg ${themeClasses.bg.secondary} space-y-2`}>
                  <div>
                    <p className={`text-xs ${themeClasses.text.tertiary}`}>Device Name</p>
                    <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                      {trialAgent?.device_name || 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${themeClasses.text.tertiary}`}>New Agent ID</p>
                    <p className={`text-sm font-mono ${themeClasses.text.primary}`}>
                      {newAgentId?.substring(0, 8)}...
                    </p>
                  </div>
                  <div>
                    <p className={`text-xs ${themeClasses.text.tertiary}`}>Status</p>
                    <p className="text-sm font-medium text-green-600 dark:text-green-400">
                      Active & Registered
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Error Step */}
            {step === 'error' && (
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center py-4">
                  <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
                    <AlertCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
                  </div>
                  <p className={`text-lg font-medium ${themeClasses.text.primary}`}>
                    Conversion Failed
                  </p>
                  <p className={`text-sm ${themeClasses.text.tertiary} mt-2 text-center`}>
                    {error || 'An unknown error occurred'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`flex items-center justify-end gap-3 p-6 border-t ${themeClasses.border.primary}`}>
            {step === 'business-selection' && (
              <>
                <button
                  onClick={handleClose}
                  className={`px-4 py-2 text-sm font-medium ${themeClasses.text.primary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.tertiary} rounded-md transition-colors`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConvert}
                  disabled={!selectedBusinessId || loadingBusinesses}
                  className={`px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  Convert to Paid
                </button>
              </>
            )}
            {step === 'converting' && (
              <button
                disabled
                className={`px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md opacity-50 cursor-not-allowed`}
              >
                Converting...
              </button>
            )}
            {(step === 'success' || step === 'error') && (
              <>
                {step === 'error' && (
                  <button
                    onClick={() => setStep('business-selection')}
                    className={`px-4 py-2 text-sm font-medium ${themeClasses.text.primary} ${themeClasses.bg.secondary} hover:${themeClasses.bg.tertiary} rounded-md transition-colors flex items-center gap-2`}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Try Again
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className={`px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors`}
                >
                  {step === 'success' ? 'Done' : 'Close'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrialConversionModal;
