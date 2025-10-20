import React, { useState, useEffect } from 'react';
import { HardDrive, Trash2, AlertCircle, CheckCircle, Loader, Activity, Settings, Pause, Play } from 'lucide-react';
import { RoleBasedStorage } from '../../utils/roleBasedStorage';
import { AuthUser } from '../../types/database';
import apiService from '../../services/apiService';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';

interface Agent {
  id: string;
  device_name: string;
  os_type: string;
  os_version?: string;
  status: string;
  is_active: boolean;
  last_heartbeat: string;
  created_at: string;
}

interface TrialDevicesManagerProps {
  authUser: AuthUser;
  onDeviceRemoved?: () => void;
  onViewMetrics?: (agentId: string) => void;
  onEditSettings?: (agentId: string) => void;
}

interface PricingRange {
  start: number;
  end: number;
  price: number;
  description?: string;
}

interface SubscriptionPricing {
  tier: string;
  base_devices: number;
  default_devices_allowed: number;
  price_per_additional_device: number;
  pricing_ranges: PricingRange[];
  currency: string;
  billing_period: string;
}

const TrialDevicesManager: React.FC<TrialDevicesManagerProps> = ({ authUser, onDeviceRemoved, onViewMetrics, onEditSettings }) => {
  const { t } = useClientLanguage();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingAgentId, setRemovingAgentId] = useState<string | null>(null);
  const [deactivatingAgentId, setDeactivatingAgentId] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [agentToRemove, setAgentToRemove] = useState<Agent | null>(null);
  const [actionType, setActionType] = useState<'deactivate' | 'remove'>('remove');
  const [pricing, setPricing] = useState<SubscriptionPricing[]>([]);
  const [startingPrice, setStartingPrice] = useState<string>('9.99'); // Default fallback

  // Get device limit from user's subscription tier
  const deviceLimit = authUser.devicesAllowed || 2;
  const subscriptionTier = authUser.subscriptionTier || 'free';

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
      setError(t('devices.errors.loadFailed', undefined, 'Failed to load devices. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const fetchPricing = async () => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
      const response = await fetch(`${apiBaseUrl}/subscription/pricing`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (result.success && result.pricing) {
        setPricing(result.pricing);

        // Find the 'subscribed' tier and extract starting price
        const subscribedTier = result.pricing.find((p: SubscriptionPricing) => p.tier === 'subscribed');
        if (subscribedTier && subscribedTier.pricing_ranges && subscribedTier.pricing_ranges.length > 0) {
          // Find the first non-zero price in the pricing ranges
          const firstPaidRange = subscribedTier.pricing_ranges.find((range: PricingRange) => range.price > 0);
          if (firstPaidRange) {
            setStartingPrice(firstPaidRange.price.toFixed(2));
          }
        }
      }
    } catch (err) {
      console.error('Error fetching pricing:', err);
      // Keep default fallback price
    }
  };

  useEffect(() => {
    fetchAgents();
    fetchPricing();
  }, []);

  const handleRemoveClick = (agent: Agent) => {
    setActionType('remove');
    setAgentToRemove(agent);
    setShowConfirmDialog(true);
  };

  const handleDeactivateClick = (agent: Agent) => {
    setActionType('deactivate');
    setAgentToRemove(agent);
    setShowConfirmDialog(true);
  };

  const confirmAction = async () => {
    if (!agentToRemove) return;

    if (actionType === 'deactivate') {
      await confirmDeactivateDevice();
    } else {
      await confirmRemoveDevice();
    }
  };

  const confirmDeactivateDevice = async () => {
    if (!agentToRemove) return;

    try {
      setDeactivatingAgentId(agentToRemove.id);
      setError(null);

      const result = await apiService.put<{ success: boolean; message?: string }>(`/agents/${agentToRemove.id}/deactivate`);

      if (result.success) {
        // Update agent in local state to show as inactive
        setAgents(prev => prev.map(a =>
          a.id === agentToRemove.id ? { ...a, is_active: false, status: 'offline' } : a
        ));
        setShowConfirmDialog(false);
        setAgentToRemove(null);

        if (onDeviceRemoved) {
          onDeviceRemoved();
        }
      } else {
        setError(result.message || t('devices.errors.deactivateFailed', undefined, 'Failed to deactivate device'));
      }
    } catch (err) {
      console.error('Error deactivating agent:', err);
      setError(t('devices.errors.deactivateFailedRetry', undefined, 'Failed to deactivate device. Please try again.'));
    } finally {
      setDeactivatingAgentId(null);
    }
  };

  const confirmRemoveDevice = async () => {
    if (!agentToRemove) return;

    try {
      setRemovingAgentId(agentToRemove.id);
      setError(null);

      const result = await apiService.delete<{ success: boolean; message?: string }>(`/agents/${agentToRemove.id}`);

      if (result.success) {
        // Remove from local state
        setAgents(prev => prev.filter(a => a.id !== agentToRemove.id));
        setShowConfirmDialog(false);
        setAgentToRemove(null);

        if (onDeviceRemoved) {
          onDeviceRemoved();
        }
      } else {
        setError(result.message || t('devices.errors.removeFailed', undefined, 'Failed to remove device'));
      }
    } catch (err) {
      console.error('Error removing agent:', err);
      setError(t('devices.errors.removeFailedRetry', undefined, 'Failed to remove device. Please try again.'));
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
          <span className="ml-3 text-gray-600 dark:text-gray-400">{t('trialDevices.loading', undefined, 'Loading devices...')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Monitored Devices
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            {agents.length} / {deviceLimit} devices used
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            subscriptionTier === 'free' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
            subscriptionTier === 'enterprise' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
            'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
          }`}>
            {subscriptionTier === 'free' ? t('devices.plans.free', undefined, 'Free Plan') :
             subscriptionTier === 'enterprise' ? t('devices.plans.enterprise', undefined, 'Enterprise') : t('devices.plans.pro', undefined, 'Pro Plan')}
          </span>
        </div>
      </div>

      {/* Subscription Info and Upgrade CTA */}
      {subscriptionTier === 'free' && (
        <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border border-blue-200 dark:border-blue-700 rounded-lg">
          <div className="flex items-start gap-3">
            <HardDrive className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-blue-900 dark:text-blue-200 mb-1">
                {t('devices.trialManager.freePlanHeader', { count: deviceLimit }, `Free Plan - ${deviceLimit} Devices Included`)}
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                {t('devices.trialManager.freePlanDescription', { deviceLimit }, `Monitor up to ${deviceLimit} devices with full monitoring and alerting. Need more devices?`)}
              </p>
              <button
                onClick={() => {
                  // TODO: Navigate to upgrade page or show upgrade modal
                  alert(t('devices.trialManager.upgradeComingSoon', {}, 'Upgrade feature coming soon! Contact support@romerotechsolutions.com for now.'));
                }}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {t('devices.trialManager.upgradeButton', { price: startingPrice }, `Upgrade - Starting at $${startingPrice}/month`)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paid Plan Info */}
      {(subscriptionTier === 'subscribed' || subscriptionTier === 'enterprise') && (
        <div className="mb-4 p-4 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border border-green-200 dark:border-green-700 rounded-lg">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-green-900 dark:text-green-200 mb-1">
                {t('devices.trialManager.paidPlanHeader', {
                  planName: subscriptionTier === 'enterprise' ? t('devices.plans.enterprise', undefined, 'Enterprise') : t('devices.plans.pro', undefined, 'Pro'),
                  deviceLimit
                }, `${subscriptionTier === 'enterprise' ? 'Enterprise' : 'Pro'} Plan - ${deviceLimit} Devices`)}
              </h3>
              <p className="text-sm text-green-700 dark:text-green-300">
                {t('devices.trialManager.paidPlanDescription', undefined, 'Full monitoring, alerting, and remote management for all your devices. Need more devices? Contact support to upgrade your plan.')}
              </p>
            </div>
          </div>
        </div>
      )}

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
            <p className="text-gray-500 dark:text-gray-400">{t('trialDevices.noDevices', undefined, 'No devices connected yet')}</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
              {t('trialDevices.installAgent', undefined, 'Install the RTS Agent on your device to get started')}
            </p>
          </div>
        ) : (
          agents.map((agent) => (
            <div
              key={agent.id}
              className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="space-y-4">
                {/* Device Info */}
                <div>
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

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onViewMetrics?.(agent.id)}
                    className="inline-flex items-center px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Activity className="h-4 w-4 mr-2" />
                    View Metrics
                  </button>
                  <button
                    onClick={() => onEditSettings?.(agent.id)}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium rounded-lg transition-colors"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </button>
                  <button
                    onClick={() => handleDeactivateClick(agent)}
                    disabled={deactivatingAgentId === agent.id}
                    className={`inline-flex items-center px-3 py-2 border text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      agent.is_active
                        ? 'border-yellow-300 dark:border-yellow-600 text-yellow-700 dark:text-yellow-400 bg-white dark:bg-gray-800 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                        : 'border-green-300 dark:border-green-600 text-green-700 dark:text-green-400 bg-white dark:bg-gray-800 hover:bg-green-50 dark:hover:bg-green-900/20'
                    }`}
                    title={agent.is_active ? t('devices.trialManager.deactivateDevice', {}, 'Deactivate device') : t('devices.trialManager.reactivateDevice', {}, 'Reactivate device')}
                  >
                    {deactivatingAgentId === agent.id ? (
                      <>
                        <Loader className="h-4 w-4 mr-2 animate-spin" />
                        {agent.is_active ? t('devices.trialManager.deactivating', {}, 'Deactivating...') : t('devices.trialManager.reactivating', {}, 'Reactivating...')}
                      </>
                    ) : agent.is_active ? (
                      <>
                        <Pause className="h-4 w-4 mr-2" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Reactivate
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleRemoveClick(agent)}
                    disabled={removingAgentId === agent.id}
                    className="inline-flex items-center px-3 py-2 border border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('devices.trialManager.removeDevice', {}, 'Remove device')}
                  >
                    {removingAgentId === agent.id ? (
                      <>
                        <Loader className="h-4 w-4 mr-2 animate-spin" />
                        {t('devices.trialManager.removing', {}, 'Removing...')}
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove
                      </>
                    )}
                  </button>
                </div>
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
              {actionType === 'deactivate'
                ? (agentToRemove.is_active ? 'Deactivate Device?' : 'Reactivate Device?')
                : 'Remove Device?'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {actionType === 'deactivate' ? (
                agentToRemove.is_active ? (
                  <>
                    Are you sure you want to deactivate <strong>{agentToRemove.device_name}</strong>?
                    This device will stop being monitored but will remain in your list.
                    Inactive devices do not count toward your device limit.
                  </>
                ) : (
                  <>
                    Are you sure you want to reactivate <strong>{agentToRemove.device_name}</strong>?
                    This device will resume monitoring and will count toward your device limit.
                  </>
                )
              ) : (
                <>
                  Are you sure you want to remove <strong>{agentToRemove.device_name}</strong>?
                  This device will be removed from your list. All historical data will be preserved.
                </>
              )}
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
                onClick={confirmAction}
                disabled={removingAgentId !== null || deactivatingAgentId !== null}
                className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                  actionType === 'deactivate'
                    ? (agentToRemove.is_active ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700')
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {deactivatingAgentId !== null
                  ? (agentToRemove.is_active ? t('devices.actions.deactivating', undefined, 'Deactivating...') : t('devices.actions.reactivating', undefined, 'Reactivating...'))
                  : removingAgentId !== null
                    ? t('devices.actions.removing', undefined, 'Removing...')
                    : actionType === 'deactivate'
                      ? (agentToRemove.is_active ? t('devices.actions.deactivate', undefined, 'Deactivate') : t('devices.actions.reactivate', undefined, 'Reactivate'))
                      : t('devices.actions.removeDevice', undefined, 'Remove Device')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrialDevicesManager;
