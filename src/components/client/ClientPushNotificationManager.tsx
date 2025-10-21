/**
 * Client Push Notification Manager Component
 * Allows clients to enable/disable push notifications and manage preferences
 * Includes both app notifications and monitoring alert subscriptions
 */

import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Settings, Smartphone, AlertCircle, Check, X, HardDrive, Mail, MessageSquare, Globe, Clock } from 'lucide-react';
import { pushNotificationService } from '../../services/pushNotificationService';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';
import { apiService } from '../../services/apiService';

interface ClientNotificationPreferences {
  service_request_updated: boolean;
  invoice_created: boolean;
  invoice_paid: boolean;
}

interface MonitoringAgent {
  id: string;
  device_name: string;
  hostname: string;
  os_type: string;
  status: string;
  location_name: string;
  business_name: string;
  has_subscription: boolean;
}

interface AlertSubscription {
  id: number;
  user_id: string;
  business_id: string;
  agent_id: string | null;
  alert_categories: string[];
  notify_email: boolean;
  notify_sms: boolean;
  notify_push: boolean;
  email: string | null;
  phone_number: string | null;
  preferred_language: string | null;
  digest_mode: boolean;
  digest_time: string;
  digest_timezone: string;
  enabled: boolean;
  agent_name?: string;
  agent_hostname?: string;
}

const ClientPushNotificationManager: React.FC = () => {
  const { isDarkMode } = useClientTheme();
  const { t, currentLanguage } = useClientLanguage();

  // Push notification state
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [preferences, setPreferences] = useState<ClientNotificationPreferences>({
    service_request_updated: true,
    invoice_created: true,
    invoice_paid: true
  });
  const [showPreferences, setShowPreferences] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isIOSInstructions, setIsIOSInstructions] = useState(false);

  // Alert subscription state
  const [showAlertSection, setShowAlertSection] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<MonitoringAgent[]>([]);
  const [alertSubscriptions, setAlertSubscriptions] = useState<AlertSubscription[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const themeClasses = {
    container: isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
    text: isDarkMode ? 'text-white' : 'text-gray-900',
    textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    border: isDarkMode ? 'border-gray-700' : 'border-gray-200',
    card: isDarkMode ? 'bg-gray-750 border-gray-600' : 'bg-gray-50 border-gray-200',
    button: isDarkMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white',
  };

  useEffect(() => {
    const init = async () => {
      await checkNotificationStatus();
      await loadAlertData();
    };
    setTimeout(init, 100);
  }, []);

  const checkNotificationStatus = async () => {
    try {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isPWA = pushNotificationService.isIOSPWA();

      if (isIOS) {
        if (isPWA) {
          console.log('📱 Registering service worker for iOS PWA...');
          await pushNotificationService.registerServiceWorker();
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const supported = pushNotificationService.isSupported();
      setIsSupported(supported);

      // Allow for iOS PWAs even if not fully supported yet
      if (supported || isPWA) {
        if ('Notification' in window) {
          const permissionStatus = pushNotificationService.getPermissionStatus();
          setPermission(permissionStatus);
        }

        try {
          const subscribed = await pushNotificationService.isSubscribed();
          setIsSubscribed(subscribed);

          if (subscribed) {
            try {
              const allPrefs = await pushNotificationService.getPreferences();
              setPreferences({
                service_request_updated: allPrefs.service_request_updated ?? true,
                invoice_created: allPrefs.invoice_created ?? true,
                invoice_paid: allPrefs.invoice_paid ?? true
              });
            } catch (error) {
              console.error('Failed to load preferences:', error);
            }
          }
        } catch (error) {
          console.log('Could not check subscription status:', error);
        }
      }
    } catch (error) {
      console.error('Error checking notification status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAlertData = async () => {
    setLoadingAlerts(true);
    try {
      // Load available agents
      const agentsResponse = await apiService.get('/client/alert-subscriptions/available-agents');
      setAvailableAgents(agentsResponse.data.agents || []);

      // Load existing subscriptions
      const subsResponse = await apiService.get('/client/alert-subscriptions');
      setAlertSubscriptions(subsResponse.data.subscriptions || []);
    } catch (error) {
      console.error('Failed to load alert data:', error);
    } finally {
      setLoadingAlerts(false);
    }
  };

  const handleEnableNotifications = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isPWA = pushNotificationService.isIOSPWA();

      if (isIOS && !isPWA) {
        setIsIOSInstructions(true);
        setMessage({
          type: 'info',
          text: t('settings.notifications.iosInstallRequired', 'Please install this app to your home screen first')
        });
        setIsLoading(false);
        return;
      }

      if (!('serviceWorker' in navigator)) {
        throw new Error('Service workers not supported in this browser/mode');
      }

      const registration = await pushNotificationService.registerServiceWorker();
      if (!registration) {
        throw new Error('Failed to register service worker');
      }

      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        await existingSub.unsubscribe();
      }

      await pushNotificationService.subscribe();

      setIsSubscribed(true);
      setPermission('granted');
      setMessage({
        type: 'success',
        text: t('settings.notifications.enableSuccess', 'Push notifications enabled successfully!')
      });

      try {
        const allPrefs = await pushNotificationService.getPreferences();
        setPreferences({
          service_request_updated: allPrefs.service_request_updated ?? true,
          invoice_created: allPrefs.invoice_created ?? true,
          invoice_paid: allPrefs.invoice_paid ?? true
        });
      } catch (prefError) {
        // Ignore preference loading errors for new subscriptions
      }

      setTimeout(() => {
        checkNotificationStatus();
      }, 1000);

    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.message || t('settings.notifications.enableFailed', 'Failed to enable notifications')
      });

      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = await reg?.pushManager.getSubscription();
          if (sub) {
            setIsSubscribed(true);
          }
        } catch (subError) {
          // Ignore subscription check errors
        }
      }

      if (error.message && error.message.includes('permission denied')) {
        setPermission('denied');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableNotifications = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      await pushNotificationService.unsubscribe();
      setIsSubscribed(false);
      setMessage({
        type: 'success',
        text: t('settings.notifications.disableSuccess', 'Push notifications disabled')
      });
    } catch (error: any) {
      console.error('Failed to disable notifications:', error);
      setMessage({
        type: 'error',
        text: t('settings.notifications.disableFailed', 'Failed to disable notifications')
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePreferences = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const currentPrefs = await pushNotificationService.getPreferences();
      const updatedPrefs = {
        ...currentPrefs,
        service_request_updated: preferences.service_request_updated,
        invoice_created: preferences.invoice_created,
        invoice_paid: preferences.invoice_paid
      };

      await pushNotificationService.updatePreferences(updatedPrefs);
      setMessage({
        type: 'success',
        text: t('settings.notifications.preferencesUpdated', 'Preferences updated successfully')
      });
    } catch (error: any) {
      console.error('Failed to update preferences:', error);
      setMessage({
        type: 'error',
        text: t('settings.notifications.preferencesUpdateFailed', 'Failed to update preferences')
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAgentAlerts = async (agentId: string, enabled: boolean) => {
    setLoadingAlerts(true);
    setMessage(null);

    try {
      if (enabled) {
        // Create new subscription
        await apiService.post('/client/alert-subscriptions', {
          agentId,
          notifyEmail: true,
          notifyPush: true,
          preferredLanguage: currentLanguage,
          enabled: true
        });
        setMessage({
          type: 'success',
          text: t('settings.alerts.subscribed', 'Alert notifications enabled for this device')
        });
      } else {
        // Find and delete subscription
        const sub = alertSubscriptions.find(s => s.agent_id === agentId);
        if (sub) {
          await apiService.delete(`/client/alert-subscriptions/${sub.id}`);
          setMessage({
            type: 'success',
            text: t('settings.alerts.unsubscribed', 'Alert notifications disabled for this device')
          });
        }
      }

      // Reload data
      await loadAlertData();
    } catch (error: any) {
      console.error('Failed to toggle agent alerts:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || t('settings.alerts.updateFailed', 'Failed to update alert subscription')
      });
    } finally {
      setLoadingAlerts(false);
    }
  };

  const handleUpdateAlertSubscription = async (subscriptionId: number, updates: Partial<AlertSubscription>) => {
    setLoadingAlerts(true);
    setMessage(null);

    try {
      await apiService.put(`/client/alert-subscriptions/${subscriptionId}`, updates);
      setMessage({
        type: 'success',
        text: t('settings.alerts.updated', 'Alert preferences updated successfully')
      });
      await loadAlertData();
    } catch (error: any) {
      console.error('Failed to update alert subscription:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || t('settings.alerts.updateFailed', 'Failed to update alert preferences')
      });
    } finally {
      setLoadingAlerts(false);
    }
  };

  const handleBulkEnableAlerts = async () => {
    setLoadingAlerts(true);
    setMessage(null);

    try {
      await apiService.post('/client/alert-subscriptions/bulk-enable', {
        notifyEmail: true,
        notifyPush: true,
        preferredLanguage: currentLanguage
      });
      setMessage({
        type: 'success',
        text: t('settings.alerts.bulkEnabled', 'Alerts enabled for all monitored devices')
      });
      await loadAlertData();
    } catch (error: any) {
      console.error('Failed to bulk enable alerts:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || t('settings.alerts.bulkEnableFailed', 'Failed to enable alerts')
      });
    } finally {
      setLoadingAlerts(false);
    }
  };

  const handleBulkDisableAlerts = async () => {
    setLoadingAlerts(true);
    setMessage(null);

    try {
      await apiService.post('/client/alert-subscriptions/bulk-disable');
      setMessage({
        type: 'success',
        text: t('settings.alerts.bulkDisabled', 'All alert notifications disabled')
      });
      await loadAlertData();
    } catch (error: any) {
      console.error('Failed to bulk disable alerts:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || t('settings.alerts.bulkDisableFailed', 'Failed to disable alerts')
      });
    } finally {
      setLoadingAlerts(false);
    }
  };

  const getSubscriptionForAgent = (agentId: string): AlertSubscription | undefined => {
    return alertSubscriptions.find(sub => sub.agent_id === agentId);
  };

  if (isLoading) {
    return (
      <div className={`${themeClasses.card} border rounded-lg p-4`}>
        <div className={`flex items-center gap-2 ${themeClasses.textSecondary}`}>
          <div className={`animate-spin rounded-full h-5 w-5 border-b-2 ${themeClasses.textSecondary}`}></div>
          <span>{t('settings.notifications.checking', 'Checking notification support...')}</span>
        </div>
      </div>
    );
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isPWA = pushNotificationService.isIOSPWA();

  // For iOS: if not in PWA mode, show installation instructions
  if (isIOS && !isPWA) {
    return (
      <div className={`bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4`}>
        <div className="flex items-start gap-3">
          <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-semibold mb-2">
              {t('settings.notifications.installApp', 'Install App for Push Notifications')}
            </p>
            <p className="mb-2">
              {t('settings.notifications.iosRequirement', 'Push notifications on iOS require installing this app to your home screen.')}
            </p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>{t('settings.notifications.iosStep1', 'Tap the Share button (square with arrow) at the bottom of Safari')}</li>
              <li>{t('settings.notifications.iosStep2', 'Scroll down and tap "Add to Home Screen"')}</li>
              <li>{t('settings.notifications.iosStep3', 'Tap "Add" in the top right')}</li>
              <li>{t('settings.notifications.iosStep4', 'Open the app from your home screen')}</li>
              <li>{t('settings.notifications.iosStep5', 'Return here to enable notifications')}</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main Notification Toggle */}
      <div className={`${themeClasses.card} border rounded-lg p-6`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {isSubscribed ? (
              <Bell className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            ) : (
              <BellOff className={`w-8 h-8 ${themeClasses.textMuted}`} />
            )}
            <div>
              <h3 className={`text-lg font-semibold ${themeClasses.text}`}>
                {t('settings.notifications.title', 'Push Notifications')}
              </h3>
              <p className={`text-sm ${themeClasses.textSecondary}`}>
                {isSubscribed
                  ? t('settings.notifications.subscribed', 'You are subscribed to push notifications')
                  : t('settings.notifications.notSubscribed', 'Enable push notifications to receive alerts')}
              </p>
              {permission === 'denied' && !isPWA && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                  {t('settings.notifications.blocked', 'Notifications are blocked. Please enable them in your browser settings.')}
                </p>
              )}
              {permission === 'denied' && isPWA && (
                <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                  {t('settings.notifications.iosPermission', 'Click Enable to request notification permission')}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSubscribed && (
              <button
                onClick={() => setShowPreferences(!showPreferences)}
                className={`p-2 ${themeClasses.textSecondary} hover:${themeClasses.text} transition-colors`}
                title={t('settings.notifications.preferences', 'Notification preferences')}
              >
                <Settings className="w-5 h-5" />
              </button>
            )}

            {(isSupported || isPWA) && (
              <button
                onClick={isSubscribed ? handleDisableNotifications : handleEnableNotifications}
                disabled={isLoading}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isSubscribed
                    ? 'bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50'
                    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                }`}
              >
                {isLoading
                  ? t('general.processing', 'Processing...')
                  : isSubscribed
                    ? t('general.disable', 'Disable')
                    : t('general.enable', 'Enable')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* iOS Installation Instructions */}
      {isIOSInstructions && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Smartphone className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-semibold mb-2">
                {t('settings.notifications.iosInstallTitle', 'Install App for iOS Notifications')}
              </p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>{t('settings.notifications.iosInstallStep1', 'Open this website in Safari')}</li>
                <li>{t('settings.notifications.iosInstallStep2', 'Tap the Share button (square with arrow)')}</li>
                <li>{t('settings.notifications.iosInstallStep3', 'Scroll down and tap "Add to Home Screen"')}</li>
                <li>{t('settings.notifications.iosInstallStep4', 'Tap "Add" in the top right')}</li>
                <li>{t('settings.notifications.iosInstallStep5', 'Open the app from your home screen')}</li>
                <li>{t('settings.notifications.iosInstallStep6', 'Enable notifications when prompted')}</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Notification Preferences */}
      {showPreferences && isSubscribed && (
        <div className={`${themeClasses.card} border rounded-lg p-6`}>
          <h4 className={`font-semibold mb-4 ${themeClasses.text}`}>
            {t('settings.notifications.preferencesTitle', 'Notification Preferences')}
          </h4>

          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className={`text-sm ${themeClasses.text}`}>
                {t('settings.notifications.serviceRequestUpdates', 'Service Request Updates')}
              </span>
              <input
                type="checkbox"
                checked={preferences.service_request_updated}
                onChange={(e) => setPreferences({
                  ...preferences,
                  service_request_updated: e.target.checked
                })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
            </label>

            <label className="flex items-center justify-between">
              <span className={`text-sm ${themeClasses.text}`}>
                {t('settings.notifications.invoiceCreated', 'New Invoices')}
              </span>
              <input
                type="checkbox"
                checked={preferences.invoice_created}
                onChange={(e) => setPreferences({
                  ...preferences,
                  invoice_created: e.target.checked
                })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
            </label>

            <label className="flex items-center justify-between">
              <span className={`text-sm ${themeClasses.text}`}>
                {t('settings.notifications.invoicePaid', 'Payment Confirmations')}
              </span>
              <input
                type="checkbox"
                checked={preferences.invoice_paid}
                onChange={(e) => setPreferences({
                  ...preferences,
                  invoice_paid: e.target.checked
                })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
            </label>
          </div>

          <div className={`mt-4 pt-4 border-t ${themeClasses.border}`}>
            <button
              onClick={handleUpdatePreferences}
              disabled={isLoading}
              className={`px-4 py-2 ${themeClasses.button} rounded-lg disabled:opacity-50 transition-colors`}
            >
              {isLoading
                ? t('general.saving', 'Saving...')
                : t('general.savePreferences', 'Save Preferences')}
            </button>
          </div>
        </div>
      )}

      {/* MONITORING AGENT ALERTS SECTION */}
      {availableAgents.length > 0 && (
        <div className={`${themeClasses.card} border rounded-lg p-6`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <HardDrive className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              <div>
                <h3 className={`text-lg font-semibold ${themeClasses.text}`}>
                  {t('settings.alerts.title', 'System Alert Notifications')}
                </h3>
                <p className={`text-sm ${themeClasses.textSecondary}`}>
                  {t('settings.alerts.description', 'Receive notifications when your monitored devices have issues')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowAlertSection(!showAlertSection)}
              className={`px-3 py-1 text-sm rounded ${themeClasses.button}`}
            >
              {showAlertSection ? t('general.hide', 'Hide') : t('general.show', 'Show')}
            </button>
          </div>

          {showAlertSection && (
            <div className="space-y-4">
              {/* Bulk Actions */}
              <div className={`flex gap-2 pb-4 border-b ${themeClasses.border}`}>
                <button
                  onClick={handleBulkEnableAlerts}
                  disabled={loadingAlerts}
                  className={`px-3 py-2 text-sm ${themeClasses.button} rounded disabled:opacity-50`}
                >
                  {t('settings.alerts.enableAll', 'Enable All')}
                </button>
                <button
                  onClick={handleBulkDisableAlerts}
                  disabled={loadingAlerts}
                  className="px-3 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                >
                  {t('settings.alerts.disableAll', 'Disable All')}
                </button>
              </div>

              {/* Agent List */}
              <div className="space-y-3">
                {availableAgents.map((agent) => {
                  const subscription = getSubscriptionForAgent(agent.id);
                  const isExpanded = expandedAgent === agent.id;

                  return (
                    <div key={agent.id} className={`border ${themeClasses.border} rounded-lg p-4`}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <HardDrive className="w-4 h-4 text-gray-500" />
                            <span className={`font-medium ${themeClasses.text}`}>{agent.device_name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              subscription?.enabled
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                            }`}>
                              {subscription?.enabled ? t('general.enabled', 'Enabled') : t('general.disabled', 'Disabled')}
                            </span>
                          </div>
                          <p className={`text-xs ${themeClasses.textSecondary} mt-1`}>
                            {agent.location_name} • {agent.hostname}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {subscription && (
                            <button
                              onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                              className={`p-2 ${themeClasses.textSecondary} hover:${themeClasses.text}`}
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                          )}
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!subscription?.enabled}
                              onChange={(e) => handleToggleAgentAlerts(agent.id, e.target.checked)}
                              disabled={loadingAlerts}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                      </div>

                      {/* Expanded Settings */}
                      {isExpanded && subscription && (
                        <div className={`mt-4 pt-4 border-t ${themeClasses.border} space-y-4`}>
                          {/* Notification Channels */}
                          <div>
                            <label className={`block text-sm font-medium mb-2 ${themeClasses.text}`}>
                              {t('settings.alerts.channels', 'Notification Channels')}
                            </label>
                            <div className="flex gap-4">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={subscription.notify_email}
                                  onChange={(e) => handleUpdateAlertSubscription(subscription.id, { notifyEmail: e.target.checked })}
                                  className="w-4 h-4 text-blue-600 rounded"
                                />
                                <Mail className="w-4 h-4" />
                                <span className="text-sm">{t('general.email', 'Email')}</span>
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={subscription.notify_push}
                                  onChange={(e) => handleUpdateAlertSubscription(subscription.id, { notifyPush: e.target.checked })}
                                  className="w-4 h-4 text-blue-600 rounded"
                                />
                                <MessageSquare className="w-4 h-4" />
                                <span className="text-sm">{t('general.push', 'Push')}</span>
                              </label>
                            </div>
                          </div>

                          {/* Language Preference */}
                          <div>
                            <label className={`block text-sm font-medium mb-2 ${themeClasses.text}`}>
                              <Globe className="w-4 h-4 inline mr-1" />
                              {t('settings.alerts.language', 'Alert Language')}
                            </label>
                            <select
                              value={subscription.preferred_language || currentLanguage}
                              onChange={(e) => handleUpdateAlertSubscription(subscription.id, { preferredLanguage: e.target.value })}
                              className={`px-3 py-2 border rounded ${themeClasses.input}`}
                            >
                              <option value="en">English</option>
                              <option value="es">Español</option>
                            </select>
                          </div>

                          {/* Digest Mode */}
                          <div>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={subscription.digest_mode}
                                onChange={(e) => handleUpdateAlertSubscription(subscription.id, { digestMode: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded"
                              />
                              <Clock className="w-4 h-4" />
                              <span className="text-sm">
                                {t('settings.alerts.digestMode', 'Daily digest instead of real-time')}
                              </span>
                            </label>
                            {subscription.digest_mode && (
                              <p className={`text-xs ${themeClasses.textSecondary} ml-6 mt-1`}>
                                {t('settings.alerts.digestTime', 'Sent daily at')} {subscription.digest_time}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status Messages */}
      {message && (
        <div
          className={`rounded-lg p-4 flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
              : message.type === 'error'
              ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
              : 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800'
          }`}
        >
          {message.type === 'success' && <Check className="w-5 h-5" />}
          {message.type === 'error' && <X className="w-5 h-5" />}
          {message.type === 'info' && <AlertCircle className="w-5 h-5" />}
          <span>{message.text}</span>
        </div>
      )}
    </div>
  );
};

export default ClientPushNotificationManager;
