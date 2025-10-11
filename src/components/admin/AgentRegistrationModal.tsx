import React, { useState, useEffect } from 'react';
import { X, Copy, Check, AlertCircle, Clock, Building, MapPin, Key } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { agentService, RegistrationToken } from '../../services/agentService';
import { Business, ServiceLocation } from '../../contexts/AdminDataContext';

interface AgentRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  businesses: Business[];
  serviceLocations: ServiceLocation[];
}

const AgentRegistrationModal: React.FC<AgentRegistrationModalProps> = ({
  isOpen,
  onClose,
  businesses,
  serviceLocations,
}) => {
  const [businessId, setBusinessId] = useState('');
  const [serviceLocationId, setServiceLocationId] = useState('');
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<RegistrationToken | null>(null);
  const [copied, setCopied] = useState(false);

  // Filter service locations by selected business
  const filteredLocations = serviceLocations.filter(
    loc => !businessId || loc.business_id === businessId
  );

  // Debug logging when modal opens
  useEffect(() => {
    if (isOpen) {
      console.log('🔍 AgentRegistrationModal opened');
      console.log('📊 Businesses received:', businesses);
      console.log('📊 Businesses count:', businesses.length);
      console.log('📊 Service Locations received:', serviceLocations);
      console.log('📊 Service Locations count:', serviceLocations.length);
    }
  }, [isOpen, businesses, serviceLocations]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setBusinessId('');
      setServiceLocationId('');
      setExpiresInHours(24);
      setGeneratedToken(null);
      setError(null);
      setCopied(false);
    }
  }, [isOpen]);

  // Reset location when business changes
  useEffect(() => {
    if (businessId && serviceLocationId) {
      const locationStillValid = filteredLocations.some(loc => loc.id === serviceLocationId);
      if (!locationStillValid) {
        setServiceLocationId('');
      }
    }
  }, [businessId, serviceLocationId, filteredLocations]);

  const handleGenerateToken = async () => {
    if (!businessId) {
      setError('Please select a business');
      return;
    }

    try {
      setGenerating(true);
      setError(null);

      const response = await agentService.createRegistrationToken({
        business_id: businessId,
        service_location_id: serviceLocationId || undefined,
        expires_in_hours: expiresInHours,
      });

      if (response.success && response.data) {
        setGeneratedToken(response.data);
      } else {
        setError(response.message || 'Failed to generate token');
      }
    } catch (err) {
      console.error('Error generating token:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate token');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyToken = () => {
    if (generatedToken) {
      navigator.clipboard.writeText(generatedToken.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyInstallCommand = () => {
    if (generatedToken) {
      const installCommand = `curl -sL https://install.romerotechsolutions.com/agent.sh | bash -s -- --token ${generatedToken.token}`;
      navigator.clipboard.writeText(installCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatExpiryDate = (expiresAt: string): string => {
    return new Date(expiresAt).toLocaleString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.card} rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto`}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className={`text-2xl font-bold ${themeClasses.text.primary} flex items-center`}>
            <Key className="w-6 h-6 mr-2" />
            Deploy New Agent
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${themeClasses.bg.hover}`}
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {!generatedToken ? (
            <>
              {/* Configuration Form */}
              <div className="space-y-4">
                <p className={`text-sm ${themeClasses.text.secondary}`}>
                  Generate a one-time registration token to deploy a monitoring agent on a customer device.
                </p>

                {/* Business Selection */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    <Building className="w-4 h-4 inline mr-1" />
                    Business <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={businessId}
                    onChange={(e) => setBusinessId(e.target.value)}
                    className={`block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-purple-500 focus:ring-purple-500 py-2 px-3`}
                    disabled={generating}
                  >
                    <option value="">Select a business...</option>
                    {businesses.map((business) => (
                      <option key={business.id} value={business.id}>
                        {business.businessName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Service Location Selection */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    <MapPin className="w-4 h-4 inline mr-1" />
                    Service Location (Optional)
                  </label>
                  <select
                    value={serviceLocationId}
                    onChange={(e) => setServiceLocationId(e.target.value)}
                    className={`block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-purple-500 focus:ring-purple-500 py-2 px-3`}
                    disabled={generating || !businessId}
                  >
                    <option value="">No specific location</option>
                    {filteredLocations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.location_name || location.address_label || 'Unnamed Location'}
                      </option>
                    ))}
                  </select>
                  {businessId && filteredLocations.length === 0 && (
                    <p className="text-xs text-yellow-600 mt-1">
                      No service locations found for this business
                    </p>
                  )}
                </div>

                {/* Expiration Time */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    <Clock className="w-4 h-4 inline mr-1" />
                    Token Expiration
                  </label>
                  <select
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(Number(e.target.value))}
                    className={`block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-purple-500 focus:ring-purple-500 py-2 px-3`}
                    disabled={generating}
                  >
                    <option value={1}>1 hour</option>
                    <option value={6}>6 hours</option>
                    <option value={24}>24 hours (recommended)</option>
                    <option value={72}>3 days</option>
                    <option value={168}>7 days</option>
                  </select>
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex">
                    <AlertCircle className="w-5 h-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800 dark:text-blue-200">
                      <p className="font-medium mb-1">Security Notice</p>
                      <p>
                        The token can only be used once to register a single agent.
                        It will expire after {expiresInHours} {expiresInHours === 1 ? 'hour' : 'hours'} or
                        when used, whichever comes first.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <p className="text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={onClose}
                  className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.secondary} ${themeClasses.bg.hover}`}
                  disabled={generating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerateToken}
                  disabled={generating || !businessId}
                  className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {generating ? 'Generating...' : 'Generate Token'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Token Generated - Display Instructions */}
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex">
                    <Check className="w-5 h-5 text-green-600 mr-3 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-green-800 dark:text-green-200">Token Generated Successfully!</p>
                      <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                        Use this token to register the agent on the target device.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Token Details */}
                <div className={`${themeClasses.bg.secondary} rounded-lg p-4 space-y-3`}>
                  <div>
                    <p className={`text-xs ${themeClasses.text.muted} mb-1`}>Business</p>
                    <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                      {businesses.find(b => b.id === generatedToken.business_id)?.businessName || 'Unknown'}
                    </p>
                  </div>
                  {generatedToken.service_location_id && (
                    <div>
                      <p className={`text-xs ${themeClasses.text.muted} mb-1`}>Service Location</p>
                      <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                        {(() => {
                          const location = serviceLocations.find(l => l.id === generatedToken.service_location_id);
                          return location?.location_name || location?.address_label || 'Unknown';
                        })()}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className={`text-xs ${themeClasses.text.muted} mb-1`}>Expires At</p>
                    <p className={`text-sm font-medium ${themeClasses.text.primary}`}>
                      {formatExpiryDate(generatedToken.expires_at)}
                    </p>
                  </div>
                </div>

                {/* Registration Token */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Registration Token
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={generatedToken.token}
                      readOnly
                      className={`flex-1 rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm py-2 px-3 font-mono text-sm`}
                    />
                    <button
                      onClick={handleCopyToken}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
                      title="Copy token"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Installation Instructions */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Installation Command (Linux/macOS)
                  </label>
                  <div className="relative">
                    <pre className={`${themeClasses.bg.secondary} rounded-lg p-4 overflow-x-auto text-sm font-mono ${themeClasses.text.primary}`}>
                      {`curl -sL https://install.romerotechsolutions.com/agent.sh | \\
  bash -s -- --token ${generatedToken.token}`}
                    </pre>
                    <button
                      onClick={handleCopyInstallCommand}
                      className="absolute top-2 right-2 px-3 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-600"
                      title="Copy command"
                    >
                      {copied ? <Check className="w-3 h-3 inline text-green-600" /> : <Copy className="w-3 h-3 inline" />}
                    </button>
                  </div>
                </div>

                {/* Windows Instructions */}
                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    Installation Command (Windows PowerShell)
                  </label>
                  <pre className={`${themeClasses.bg.secondary} rounded-lg p-4 overflow-x-auto text-sm font-mono ${themeClasses.text.primary}`}>
                    {`Invoke-WebRequest -Uri https://install.romerotechsolutions.com/agent.ps1 -OutFile agent.ps1
.\\agent.ps1 -Token "${generatedToken.token}"`}
                  </pre>
                </div>

                {/* Important Notes */}
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <div className="flex">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-800 dark:text-yellow-200">
                      <p className="font-medium mb-1">Important</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>This token can only be used ONCE</li>
                        <li>Save the token securely - it cannot be retrieved later</li>
                        <li>Token expires: {formatExpiryDate(generatedToken.expires_at)}</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setGeneratedToken(null);
                    setBusinessId('');
                    setServiceLocationId('');
                  }}
                  className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.secondary} ${themeClasses.bg.hover}`}
                >
                  Generate Another
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-purple-600 hover:bg-purple-700"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentRegistrationModal;
