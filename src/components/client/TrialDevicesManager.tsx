import React, { useState, useEffect } from 'react';
import { HardDrive, Trash2, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { RoleBasedStorage } from '../../utils/roleBasedStorage';
import { AuthUser } from '../../types/database';

interface Agent {
  id: string;
  device_name: string;
  os_type: string;
  os_version?: string;
  status: string;
  last_heartbeat: string;
  created_at: string;
}

interface TrialDevicesManagerProps {
  authUser: AuthUser;
  onDeviceRemoved?: () => void;
}

const TRIAL_DEVICE_LIMIT = 2;

const TrialDevicesManager: React.FC<TrialDevicesManagerProps> = ({ authUser, onDeviceRemoved }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingAgentId, setRemovingAgentId] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [agentToRemove, setAgentToRemove] = useState<Agent | null>(null);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      setError(null);

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

      const response = await fetch(`${apiBaseUrl}/agents`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      const result = await response.json();

      if (result.success) {
        setAgents(result.data.agents || []);
      } else {
        setError(result.message || 'Failed to fetch devices');
      }
    } catch (err) {
      console.error('Error fetching agents:', err);
      setError('Failed to load devices. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleRemoveClick = (agent: Agent) => {
    setAgentToRemove(agent);
    setShowConfirmDialog(true);
  };

  const confirmRemoveDevice = async () => {
    if (!agentToRemove) return;

    try {
      setRemovingAgentId(agentToRemove.id);
      setError(null);

      const sessionToken = RoleBasedStorage.getItem('sessionToken');
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

      const response = await fetch(`${apiBaseUrl}/agents/${agentToRemove.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      const result = await response.json();

      if (result.success) {
        // Remove from local state
        setAgents(prev => prev.filter(a => a.id !== agentToRemove.id));
        setShowConfirmDialog(false);
        setAgentToRemove(null);

        if (onDeviceRemoved) {
          onDeviceRemoved();
        }
      } else {
        setError(result.message || 'Failed to remove device');
      }
    } catch (err) {
      console.error('Error removing agent:', err);
      setError('Failed to remove device. Please try again.');
    } finally {
      setRemovingAgentId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'online':
        return 'text-green-600 dark:text-green-400';
      case 'offline':
        return 'text-gray-600 dark:text-gray-400';
      default:
        return 'text-yellow-600 dark:text-yellow-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'online':
        return <CheckCircle className="h-5 w-5" />;
      default:
        return <AlertCircle className="h-5 w-5" />;
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex items-center justify-center">
          <Loader className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading devices...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          My Devices
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            {agents.length} / {TRIAL_DEVICE_LIMIT} devices used
          </span>
          {authUser.trialExpiresAt && (
            <span className="text-blue-600 dark:text-blue-400">
              • Trial expires: {new Date(authUser.trialExpiresAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Device Limit Info */}
      <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex items-start gap-3">
          <HardDrive className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-blue-900 dark:text-blue-200 mb-1">
              Trial Device Limit
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Trial accounts can monitor up to {TRIAL_DEVICE_LIMIT} devices. To add more devices, please upgrade to a full subscription.
            </p>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Devices List */}
      <div className="space-y-4">
        {agents.length === 0 ? (
          <div className="text-center py-12">
            <HardDrive className="h-16 w-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">No devices connected yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
              Install the RTS Agent on your device to get started
            </p>
          </div>
        ) : (
          agents.map((agent) => (
            <div
              key={agent.id}
              className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <HardDrive className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    <h3 className="font-medium text-gray-900 dark:text-white">
                      {agent.device_name}
                    </h3>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 ${getStatusColor(agent.status)}`}>
                        {getStatusIcon(agent.status)}
                        <span className="capitalize">{agent.status}</span>
                      </span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400">
                      OS: {agent.os_type} {agent.os_version && `(${agent.os_version})`}
                    </p>
                    <p className="text-gray-500 dark:text-gray-500 text-xs">
                      Last heartbeat: {formatDate(agent.last_heartbeat)}
                    </p>
                    <p className="text-gray-500 dark:text-gray-500 text-xs">
                      Added: {formatDate(agent.created_at)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveClick(agent)}
                  disabled={removingAgentId === agent.id}
                  className="ml-4 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Remove device"
                >
                  {removingAgentId === agent.id ? (
                    <Loader className="h-5 w-5 animate-spin" />
                  ) : (
                    <Trash2 className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && agentToRemove && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Remove Device?
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to remove <strong>{agentToRemove.device_name}</strong>?
              This device will stop being monitored immediately.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowConfirmDialog(false);
                  setAgentToRemove(null);
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRemoveDevice}
                disabled={removingAgentId !== null}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {removingAgentId ? 'Removing...' : 'Remove Device'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrialDevicesManager;
