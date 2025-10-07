/**
 * Client Push Notification Manager Component
 * Allows clients to enable/disable push notifications and manage preferences
 * Only shows notification types relevant to clients (no admin/employee types)
 */

import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Settings, Smartphone, AlertCircle, Check, X } from 'lucide-react';
import { pushNotificationService } from '../../services/pushNotificationService';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';

interface ClientNotificationPreferences {
  service_request_updated: boolean;
  invoice_created: boolean;
  invoice_paid: boolean;
}

const ClientPushNotificationManager: React.FC = () => {
  const { isDarkMode } = useClientTheme();
  const { t } = useClientLanguage();
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
              // Extract only client-relevant preferences
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

  const handleEnableNotifications = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isPWA = pushNotificationService.isIOSPWA();

      // Check if on iOS and not in PWA
      if (isIOS && !isPWA) {
        setIsIOSInstructions(true);
        setMessage({
          type: 'info',
          text: t('settings.notifications.iosInstallRequired', 'Please install this app to your home screen first')
        });
        setIsLoading(false);
        return;
      }

      // Check if service workers are supported first
      if (!('serviceWorker' in navigator)) {
        throw new Error('Service workers not supported in this browser/mode');
      }

      // Register service worker first
      const registration = await pushNotificationService.registerServiceWorker();
      if (!registration) {
        throw new Error('Failed to register service worker');
      }

      // Check if there's already a subscription
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        await existingSub.unsubscribe();
      }

      // Subscribe to notifications
      await pushNotificationService.subscribe();

      setIsSubscribed(true);
      setPermission('granted');
      setMessage({
        type: 'success',
        text: t('settings.notifications.enableSuccess', 'Push notifications enabled successfully!')
      });

      // Load preferences
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

      // Check if we have a partial subscription (only if serviceWorker exists)
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
      // Get current full preferences from server
      const currentPrefs = await pushNotificationService.getPreferences();

      // Merge client preferences with existing ones (preserve employee-only prefs)
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

  // For iOS PWAs, always show the UI (don't check isSupported - service worker will make APIs available)
  // For non-iOS, check if supported
  if (!isSupported && !isPWA) {
    return (
      <div className={`bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4`}>
        <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-300">
          <AlertCircle className="w-5 h-5" />
          <span>
            {t('settings.notifications.notSupported', 'Push notifications are not supported on this device or browser')}
          </span>
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
