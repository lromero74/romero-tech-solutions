import React, { useState, useEffect } from 'react';
import { X, MapPin, Building, Key, Copy, Check, AlertCircle, RefreshCw, Monitor } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { agentService, AgentDevice } from '../../services/agentService';
import { Business, ServiceLocation } from '../../contexts/AdminDataContext';

interface AgentEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: AgentDevice | null;
  businesses: Business[];
  serviceLocations: ServiceLocation[];
  onUpdate: () => void;
}

const AgentEditModal: React.FC<AgentEditModalProps> = ({
  isOpen,
  onClose,
  agent,
  businesses,
  serviceLocations,
  onUpdate,
}) => {
  const [serviceLocationId, setServiceLocationId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [deviceType, setDeviceType] = useState('');
  const [updating, setUpdating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Initialize form when agent changes
  useEffect(() => {
    if (agent) {
      setServiceLocationId(agent.service_location_id || '');
      setDeviceName(agent.device_name);
      setDeviceType(agent.device_type);
      setNewToken(null);
      setError(null);
      setSuccess(null);
    }
  }, [agent]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setServiceLocationId('');
      setDeviceName('');
      setDeviceType('');
      setNewToken(null);
      setError(null);
      setSuccess(null);
      setCopied(false);
    }
  }, [isOpen]);

  if (!isOpen || !agent) return null;

  // Filter service locations by agent's business
  const filteredLocations = serviceLocations.filter(
    loc => loc.business_id === agent.business_id
  );

  const handleUpdate = async () => {
    if (!deviceName.trim()) {
      setError('Device name is required');
      return;
    }

    if (!deviceType) {
      setError('Device type is required');
      return;
    }

    try {
      setUpdating(true);
      setError(null);
      setSuccess(null);

      const response = await agentService.updateAgent(agent.id, {
        device_name: deviceName,
        device_type: deviceType,
        service_location_id: serviceLocationId || undefined,
      });

      if (response.success) {
        setSuccess('Agent updated successfully');
        onUpdate();
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError(response.message || 'Failed to update agent');
      }
    } catch (err) {
      console.error('Error updating agent:', err);
      setError(err instanceof Error ? err.message : 'Failed to update agent');
    } finally {
      setUpdating(false);
    }
  };

  const handleRegenerateToken = async () => {
    if (!confirm('Are you sure you want to regenerate the token? The old token will be invalidated immediately.')) {
      return;
    }

    try {
      setRegenerating(true);
      setError(null);
      setSuccess(null);

      const response = await agentService.regenerateToken(agent.id);

      if (response.success && response.data?.token) {
        setNewToken(response.data.token);
        setSuccess('Token regenerated successfully! The old token has been invalidated.');
      } else {
        setError(response.message || 'Failed to regenerate token');
      }
    } catch (err) {
      console.error('Error regenerating token:', err);
      setError(err instanceof Error ? err.message : 'Failed to regenerate token');
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopyToken = () => {
    if (newToken) {
      navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const currentBusiness = businesses.find(b => b.id === agent.business_id);
  const currentLocation = serviceLocations.find(l => l.id === serviceLocationId);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`${themeClasses.bg.card} rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto`}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>
            Edit Agent
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
          {/* Current Agent Info */}
          <div className={`${themeClasses.bg.secondary} rounded-lg p-4`}>
            <h3 className={`text-sm font-medium ${themeClasses.text.secondary} mb-2`}>Current Agent</h3>
            <div className="space-y-2">
              <div>
                <span className={`text-xs ${themeClasses.text.muted}`}>Device: </span>
                <span className={`text-sm font-medium ${themeClasses.text.primary}`}>{agent.device_name}</span>
              </div>
              <div>
                <span className={`text-xs ${themeClasses.text.muted}`}>OS: </span>
                <span className={`text-sm ${themeClasses.text.primary}`}>{agent.os_type} {agent.os_version}</span>
              </div>
              <div>
                <span className={`text-xs ${themeClasses.text.muted}`}>Status: </span>
                <span className={`text-sm ${themeClasses.text.primary} capitalize`}>{agent.status}</span>
              </div>
            </div>
          </div>

          {/* Edit Form */}
          <div className="space-y-4">
            {/* Device Name */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                Device Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                className={`block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-purple-500 focus:ring-purple-500 py-2 px-3`}
                disabled={updating || regenerating}
                placeholder="Enter device name"
              />
            </div>

            {/* Device Type */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                <Monitor className="w-4 h-4 inline mr-1" />
                Device Type <span className="text-red-500">*</span>
              </label>
              <select
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value)}
                className={`block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-purple-500 focus:ring-purple-500 py-2 px-3`}
                disabled={updating || regenerating}
              >
                <option value="">Select device type</option>
                <option value="server">Server</option>
                <option value="desktop">Desktop</option>
                <option value="workstation">Workstation</option>
                <option value="laptop">Laptop</option>
                <option value="mobile">Mobile</option>
                <option value="tablet">Tablet</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Business (Read-only) */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                <Building className="w-4 h-4 inline mr-1" />
                Business
              </label>
              <input
                type="text"
                value={currentBusiness?.businessName || 'N/A'}
                disabled
                className={`block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.secondary} ${themeClasses.text.muted} shadow-sm py-2 px-3 cursor-not-allowed`}
              />
              <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                Business cannot be changed after agent deployment
              </p>
            </div>

            {/* Service Location */}
            <div>
              <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                <MapPin className="w-4 h-4 inline mr-1" />
                Service Location
              </label>
              <select
                value={serviceLocationId}
                onChange={(e) => setServiceLocationId(e.target.value)}
                className={`block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-purple-500 focus:ring-purple-500 py-2 px-3`}
                disabled={updating || regenerating}
              >
                <option value="">No specific location</option>
                {filteredLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.location_name || location.address_label || 'Unnamed Location'}
                  </option>
                ))}
              </select>
              {currentLocation && (
                <p className={`text-xs ${themeClasses.text.muted} mt-1`}>
                  {currentLocation.street && currentLocation.city && (
                    <>
                      {currentLocation.street}, {currentLocation.city}, {currentLocation.state} {currentLocation.zip_code}
                    </>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Token Management Section */}
          <div className={`border-t ${themeClasses.border.primary} pt-6`}>
            <h3 className={`text-lg font-medium ${themeClasses.text.primary} mb-4 flex items-center`}>
              <Key className="w-5 h-5 mr-2" />
              Token Management
            </h3>

            {!newToken ? (
              <div className="space-y-4">
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <div className="flex">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-800 dark:text-yellow-200">
                      <p className="font-medium mb-1">Security Warning</p>
                      <p>
                        Regenerating the token will immediately invalidate the current token.
                        The agent will need to be reconfigured with the new token to continue reporting.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleRegenerateToken}
                  disabled={regenerating || updating}
                  className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white ${
                    regenerating || updating
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-orange-600 hover:bg-orange-700'
                  }`}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${regenerating ? 'animate-spin' : ''}`} />
                  {regenerating ? 'Regenerating...' : 'Regenerate Token'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex">
                    <Check className="w-5 h-5 text-green-600 mr-3 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-green-800 dark:text-green-200">Token Regenerated Successfully!</p>
                      <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                        The old token has been invalidated. Configure the agent with this new token.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className={`block text-sm font-medium ${themeClasses.text.secondary} mb-2`}>
                    New Agent Token
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newToken}
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
              </div>
            )}
          </div>

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-green-800 dark:text-green-200">{success}</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className={`px-4 py-2 border ${themeClasses.border.primary} rounded-md text-sm font-medium ${themeClasses.text.secondary} ${themeClasses.bg.hover}`}
              disabled={updating || regenerating}
            >
              {newToken ? 'Close' : 'Cancel'}
            </button>
            {!newToken && (
              <button
                onClick={handleUpdate}
                disabled={updating || regenerating || !deviceName.trim() || !deviceType}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {updating ? 'Updating...' : 'Save Changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentEditModal;
