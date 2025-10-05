/**
 * Push Notification Manager Component
 * Allows users to enable/disable push notifications and manage preferences
 */

import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Settings, Smartphone, AlertCircle, Check, X } from 'lucide-react';
import { pushNotificationService } from '../services/pushNotificationService';

interface NotificationPreferences {
  new_client_signup: boolean;
  new_service_request: boolean;
  service_request_updated: boolean;
  invoice_created: boolean;
  invoice_paid: boolean;
}

const PushNotificationManager: React.FC = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    new_client_signup: true,
    new_service_request: true,
    service_request_updated: true,
    invoice_created: true,
    invoice_paid: true
  });
  const [showPreferences, setShowPreferences] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isIOSInstructions, setIsIOSInstructions] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [isEmployee, setIsEmployee] = useState(false);

  useEffect(() => {
    checkNotificationStatus();
    // Check if user is an employee (either traditional or AWS Amplify auth)
    checkEmployeeStatus();
  }, []);

  const checkEmployeeStatus = async () => {
    console.log('🔍 Checking employee status...');

    // Check for role-based session tokens (RoleBasedStorage pattern)
    const employeeRoles = ['admin', 'executive', 'employee', 'technician', 'sales'];
    for (const role of employeeRoles) {
      const roleToken = localStorage.getItem(`${role}_sessionToken`);
      if (roleToken) {
        setIsEmployee(true);
        console.log(`✅ Employee detected via ${role} session token`);
        setDebugInfo(prev => prev + `Employee Status: Yes (${role} Auth)\n`);
        return;
      }
    }

    // Check for traditional auth
    const sessionToken = localStorage.getItem('sessionToken');
    console.log('Traditional sessionToken:', sessionToken ? 'Found' : 'Not found');
    if (sessionToken) {
      setIsEmployee(true);
      console.log('✅ Employee detected via traditional auth');
      // Update debug info
      setDebugInfo(prev => prev + `Employee Status: Yes (Traditional Auth)\n`);
      return;
    }

    // Check for AWS Amplify auth
    try {
      const { getCurrentUser } = await import('aws-amplify/auth');
      const user = await getCurrentUser();
      console.log('AWS Amplify user:', user);
      if (user) {
        setIsEmployee(true);
        console.log('✅ Employee detected via AWS Amplify');
        // Update debug info
        setDebugInfo(prev => prev + `Employee Status: Yes (AWS Amplify)\n`);
      } else {
        setDebugInfo(prev => prev + `Employee Status: No (No user found)\n`);
      }
    } catch (e) {
      console.log('❌ Not authenticated with AWS Amplify:', e);
      setDebugInfo(prev => prev + `Employee Status: No (Not logged in)\n`);
    }
  };

  const checkNotificationStatus = async () => {
    try {
      // Gather comprehensive debug info
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                   (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isPWA = pushNotificationService.isIOSPWA();
      const iOSVersion = (pushNotificationService as any).getIOSVersion?.();

      // Build detailed debug message
      let debugMsg = '';
      debugMsg += `Platform: ${navigator.platform || 'Unknown'}\n`;
      debugMsg += `Max Touch Points: ${navigator.maxTouchPoints || 0}\n`;
      debugMsg += `User Agent: ${navigator.userAgent.substring(0, 50)}...\n`;
      debugMsg += `iOS Device: ${isIOS ? 'Yes' : 'No'}\n`;
      debugMsg += `PWA Mode: ${isPWA ? 'Yes' : 'No'}\n`;
      debugMsg += `iOS Version: ${iOSVersion || 'Unknown'}\n`;
      debugMsg += `Current URL: ${window.location.protocol}//${window.location.host}\n`;
      debugMsg += `Protocol: ${window.location.protocol}\n`;
      debugMsg += `Service Worker: ${('serviceWorker' in navigator) ? 'Supported' : 'Not Supported'}\n`;
      debugMsg += `Push Manager: ${('PushManager' in window) ? 'Available' : 'Not Available'}\n`;
      debugMsg += `Notification API: ${('Notification' in window) ? 'Available' : 'Not Available'}\n`;
      debugMsg += `Standalone: ${(window.navigator as any).standalone ? 'Yes' : 'No'}\n`;
      debugMsg += `Display Mode: ${window.matchMedia('(display-mode: standalone)').matches ? 'Standalone' : 'Browser'}\n`;

      // Add warning about HTTPS requirement
      if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
        debugMsg += `\n⚠️ WARNING: Service Workers require HTTPS!\n`;
        debugMsg += `Current: ${window.location.protocol}//${window.location.hostname}\n`;
        debugMsg += `Push notifications will NOT work over HTTP.\n`;
      }

      console.log('📱 Debug Info:\n' + debugMsg);
      setDebugInfo(debugMsg);

      if (isIOS) {
        // For iOS PWAs, we need to register service worker first
        if (isPWA) {
          console.log('📱 Registering service worker for iOS PWA...');
          await pushNotificationService.registerServiceWorker();
          // Small delay to let service worker fully initialize
          await new Promise(resolve => setTimeout(resolve, 500));

          // Update debug info after registration
          debugMsg += `\nAfter SW Registration:\n`;
          debugMsg += `Push Manager: ${('PushManager' in window) ? 'Available' : 'Not Available'}\n`;
          setDebugInfo(debugMsg);
        }
      }

      // Check if notifications are supported
      const supported = pushNotificationService.isSupported();
      setIsSupported(supported);

      debugMsg += `\nSupported Check: ${supported ? 'Yes' : 'No'}\n`;
      debugMsg += `Employee Status: Checking...\n`;
      debugMsg += `Test Button Shows When: isSubscribed=${isSubscribed} && isEmployee=${isEmployee}\n`;

      // Show localStorage tokens for debugging
      const tokenKeys = Object.keys(localStorage).filter(k => k.toLowerCase().includes('token'));
      debugMsg += `\nLocalStorage Tokens Found:\n`;
      tokenKeys.forEach(key => {
        const value = localStorage.getItem(key);
        debugMsg += `- ${key}: ${value ? value.substring(0, 20) + '...' : 'null'}\n`;
      });

      setDebugInfo(debugMsg);

      if (supported || isPWA) {  // Allow for iOS PWAs even if not fully supported yet
        // Check permission status
        if ('Notification' in window) {
          const permissionStatus = pushNotificationService.getPermissionStatus();
          setPermission(permissionStatus);
          debugMsg += `Permission Status: ${permissionStatus}\n`;
          setDebugInfo(debugMsg);
        }

        // Check subscription status
        try {
          const subscribed = await pushNotificationService.isSubscribed();
          setIsSubscribed(subscribed);
          debugMsg += `Subscribed: ${subscribed ? 'Yes' : 'No'}\n`;
          setDebugInfo(debugMsg);

          // Load preferences if subscribed
          if (subscribed) {
            try {
              const prefs = await pushNotificationService.getPreferences();
              setPreferences(prefs);
            } catch (error) {
              console.error('Failed to load preferences:', error);
            }
          }
        } catch (error) {
          console.log('Could not check subscription status:', error);
          debugMsg += `Subscription Check Error: ${error}\n`;
          setDebugInfo(debugMsg);
        }
      }
    } catch (error) {
      console.error('Error checking notification status:', error);
      setDebugInfo(`Error: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnableNotifications = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      // Check if on iOS and not in PWA
      if (pushNotificationService.isIOSPWA() === false && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
        setIsIOSInstructions(true);
        setMessage({
          type: 'info',
          text: 'Please install this app to your home screen first'
        });
        setIsLoading(false);
        return;
      }

      // Subscribe to notifications
      await pushNotificationService.subscribe();
      setIsSubscribed(true);
      setPermission('granted');
      setMessage({
        type: 'success',
        text: 'Push notifications enabled successfully!'
      });

      // Load preferences
      const prefs = await pushNotificationService.getPreferences();
      setPreferences(prefs);

    } catch (error: any) {
      console.error('Failed to enable notifications:', error);
      setMessage({
        type: 'error',
        text: error.message || 'Failed to enable notifications'
      });

      if (error.message.includes('permission denied')) {
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
        text: 'Push notifications disabled'
      });
    } catch (error: any) {
      console.error('Failed to disable notifications:', error);
      setMessage({
        type: 'error',
        text: 'Failed to disable notifications'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePreferences = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      await pushNotificationService.updatePreferences(preferences);
      setMessage({
        type: 'success',
        text: 'Preferences updated successfully'
      });
    } catch (error: any) {
      console.error('Failed to update preferences:', error);
      setMessage({
        type: 'error',
        text: 'Failed to update preferences'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestNotification = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      await pushNotificationService.sendTestNotification();
      setMessage({
        type: 'success',
        text: 'Test notification sent! Check your device.'
      });
    } catch (error: any) {
      console.error('Failed to send test notification:', error);
      setMessage({
        type: 'error',
        text: error.message || 'Failed to send test notification'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state initially
  if (isLoading) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-600">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600"></div>
          <span>Checking notification support...</span>
        </div>
      </div>
    );
  }

  // Always show debug panel at the top
  const DebugPanel = () => (
    <div className="bg-gray-100 border border-gray-300 rounded-lg p-4 mb-4">
      <h4 className="font-bold text-sm mb-2">🔍 Debug Information:</h4>
      <pre className="text-xs font-mono whitespace-pre-wrap bg-white p-2 rounded border border-gray-200">
        {debugInfo || 'Loading debug info...'}
      </pre>
    </div>
  );

  // Check if it's an iOS device that needs PWA installation
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isPWA = pushNotificationService.isIOSPWA();

  // Check for HTTP vs HTTPS issue
  const isHTTPBlocked = window.location.protocol === 'http:' && window.location.hostname !== 'localhost';

  if (isHTTPBlocked) {
    return (
      <div className="space-y-4">
        <DebugPanel />
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <p className="font-semibold mb-2">⚠️ HTTPS Required for Push Notifications</p>
              <p className="mb-3">Service Workers and Push Notifications require HTTPS. You're currently using HTTP.</p>
              <div className="bg-red-100 p-2 rounded mb-3">
                <p className="font-mono text-xs">Current: {window.location.protocol}//{window.location.hostname}</p>
                <p className="font-mono text-xs">Required: https:// (or localhost)</p>
              </div>
              <p className="font-semibold mb-2">Solutions:</p>
              <ol className="list-decimal ml-4 space-y-2">
                <li>
                  <strong>Use Production URL:</strong>
                  <br />Access the app at <a href="https://romerotechsolutions.com/employee" className="text-blue-600 underline">https://romerotechsolutions.com/employee</a>
                </li>
                <li>
                  <strong>For Local Testing on Desktop:</strong>
                  <br />Use <span className="font-mono">http://localhost:5173/employee</span> instead
                </li>
                <li>
                  <strong>For iPhone Testing:</strong>
                  <br />You must use the production HTTPS URL
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isSupported && isIOS && !isPWA) {
    return (
      <div className="space-y-4">
        <DebugPanel />
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Smartphone className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-2">Install App for Push Notifications:</p>
              <p className="mb-2">Push notifications on iOS require installing this app to your home screen.</p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Tap the Share button (square with arrow) at the bottom of Safari</li>
                <li>Scroll down and tap "Add to Home Screen"</li>
                <li>Tap "Add" in the top right</li>
                <li>Open the app from your home screen</li>
                <li>Return here to enable notifications</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isSupported) {
    return (
      <div className="space-y-4">
        <DebugPanel />
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-yellow-800">
              <AlertCircle className="w-5 h-5" />
              <span>Push notifications are not supported on this device or browser</span>
            </div>
            {isIOS && (
              <div className="text-sm text-yellow-700 ml-7">
                <p>iOS Requirements:</p>
                <ul className="list-disc ml-4 mt-1">
                  <li>iOS 16.4 or later required</li>
                  <li>App must be installed to home screen</li>
                  <li>Safari browser required</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DebugPanel />
      {/* Main Notification Toggle */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {isSubscribed ? (
              <Bell className="w-8 h-8 text-blue-600" />
            ) : (
              <BellOff className="w-8 h-8 text-gray-400" />
            )}
            <div>
              <h3 className="text-lg font-semibold">Push Notifications</h3>
              <p className="text-sm text-gray-600">
                {isSubscribed
                  ? 'You are subscribed to push notifications'
                  : 'Enable push notifications to receive alerts'}
              </p>
              {permission === 'denied' && (
                <p className="text-sm text-red-600 mt-1">
                  Notifications are blocked. Please enable them in your browser settings.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSubscribed && (
              <button
                onClick={() => setShowPreferences(!showPreferences)}
                className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
                title="Notification preferences"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}

            <button
              onClick={isSubscribed ? handleDisableNotifications : handleEnableNotifications}
              disabled={isLoading || permission === 'denied'}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isSubscribed
                  ? 'bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50'
                  : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
              }`}
            >
              {isLoading ? 'Processing...' : isSubscribed ? 'Disable' : 'Enable'}
            </button>
          </div>
        </div>

        {/* Test Notification Button (for admin/employee users) */}
        {/* TEMPORARY: Always show for testing - Remove after debugging */}
        {isSubscribed && (isEmployee || true) && (
          <div className="mt-4 pt-4 border-t">
            <button
              onClick={handleTestNotification}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
            >
              📱 Send Test Notification
            </button>
          </div>
        )}

        {/* DEBUG: Re-sync subscription button */}
        {isSubscribed && (
          <div className="mt-4 pt-4 border-t">
            <button
              onClick={async () => {
                console.log('🔄 Re-syncing subscription to server...');
                setMessage({ type: 'info', text: 'Re-syncing subscription...' });
                try {
                  if (pushNotificationService.registration && pushNotificationService.subscription) {
                    await (pushNotificationService as any).sendSubscriptionToServer(pushNotificationService.subscription);
                    setMessage({ type: 'success', text: 'Subscription synced!' });
                  } else {
                    const reg = await navigator.serviceWorker.getRegistration();
                    const sub = await reg?.pushManager.getSubscription();
                    if (sub) {
                      await (pushNotificationService as any).sendSubscriptionToServer(sub);
                      setMessage({ type: 'success', text: 'Subscription synced!' });
                    } else {
                      setMessage({ type: 'error', text: 'No subscription found to sync' });
                    }
                  }
                } catch (error: any) {
                  console.error('Sync failed:', error);
                  setMessage({ type: 'error', text: error.message || 'Sync failed' });
                }
              }}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md text-sm"
            >
              🔄 DEBUG: Re-sync Subscription to Server
            </button>
          </div>
        )}

      </div>

      {/* iOS Installation Instructions */}
      {isIOSInstructions && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Smartphone className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-2">Install App for iOS Notifications:</p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Open this website in Safari</li>
                <li>Tap the Share button (square with arrow)</li>
                <li>Scroll down and tap "Add to Home Screen"</li>
                <li>Tap "Add" in the top right</li>
                <li>Open the app from your home screen</li>
                <li>Enable notifications when prompted</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Notification Preferences */}
      {showPreferences && isSubscribed && (
        <div className="bg-white border rounded-lg p-6">
          <h4 className="font-semibold mb-4">Notification Preferences</h4>

          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-sm">New Client Signups</span>
              <input
                type="checkbox"
                checked={preferences.new_client_signup}
                onChange={(e) => setPreferences({
                  ...preferences,
                  new_client_signup: e.target.checked
                })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
            </label>

            <label className="flex items-center justify-between">
              <span className="text-sm">New Service Requests</span>
              <input
                type="checkbox"
                checked={preferences.new_service_request}
                onChange={(e) => setPreferences({
                  ...preferences,
                  new_service_request: e.target.checked
                })}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
            </label>

            <label className="flex items-center justify-between">
              <span className="text-sm">Service Request Updates</span>
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
              <span className="text-sm">Invoice Created</span>
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
              <span className="text-sm">Invoice Paid</span>
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

          <div className="mt-4 pt-4 border-t">
            <button
              onClick={handleUpdatePreferences}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>
      )}

      {/* Status Messages */}
      {message && (
        <div
          className={`rounded-lg p-4 flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : message.type === 'error'
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-blue-50 text-blue-800 border border-blue-200'
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

export default PushNotificationManager;