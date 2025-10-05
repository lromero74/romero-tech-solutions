/**
 * Push Notification Service
 * Handles PWA push notification permissions and subscriptions
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

// Convert base64 to Uint8Array for the VAPID public key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Get device information
function getDeviceInfo() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screenResolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: new Date().toISOString()
  };
}

class PushNotificationService {
  private registration: ServiceWorkerRegistration | null = null;
  private subscription: PushSubscription | null = null;

  /**
   * Check if push notifications are supported
   */
  isSupported(): boolean {
    // Check if we're in an iOS PWA (iOS Safari 16.4+ supports push in PWAs)
    if (this.isIOSPWA()) {
      // If we're in a PWA with Service Worker and Push Manager, assume iOS 16.4+
      // (older iOS versions wouldn't have these APIs in PWA mode)
      if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
        console.log('📱 iOS PWA with push support detected');
        return true;
      }
      // Fallback: try to check iOS version
      const iOSVersion = this.getIOSVersion();
      if (iOSVersion && iOSVersion >= 16.4) {
        return true;
      }
      // For older iOS versions or if we can't detect, push is not supported
      return false;
    }

    // For non-iOS, check standard browser support
    return 'serviceWorker' in navigator &&
           'PushManager' in window &&
           'Notification' in window;
  }

  /**
   * Check if notifications are supported on iOS PWA
   */
  isIOSPWA(): boolean {
    // Check for iOS devices - they sometimes report as MacIntel in PWAs
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
                  (navigator.platform === 'MacIntel' && (window.navigator as any).standalone === true);

    const isStandalone = (window.navigator as any).standalone === true ||
                        window.matchMedia('(display-mode: standalone)').matches ||
                        window.matchMedia('(display-mode: fullscreen)').matches;
    return isStandalone && (isIOS || navigator.platform === 'MacIntel');
  }

  /**
   * Get iOS version from user agent
   */
  getIOSVersion(): number | null {
    const match = navigator.userAgent.match(/OS (\d+)_(\d+)_?(\d+)?/);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      return major + (minor / 10);
    }
    return null;
  }

  /**
   * Register the service worker
   */
  async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) {
      console.log('Service workers are not supported');
      return null;
    }

    try {
      // Check if service worker is already registered
      const existingRegistration = await navigator.serviceWorker.getRegistration();
      if (existingRegistration) {
        this.registration = existingRegistration;
        console.log('Service worker already registered');
        // For iOS PWAs, ensure the service worker is active
        if (this.isIOSPWA() && existingRegistration.active) {
          console.log('📱 iOS PWA: Service worker is active');
        }
        return existingRegistration;
      }

      // Register new service worker
      console.log('Registering new service worker...');
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });

      // Wait for the service worker to be ready
      await navigator.serviceWorker.ready;

      this.registration = registration;
      console.log('Service worker registered successfully');

      // Log additional info for debugging
      if (this.isIOSPWA()) {
        console.log('📱 iOS PWA detected:');
        console.log('- iOS Version:', this.getIOSVersion());
        console.log('- PushManager available:', 'PushManager' in window);
        console.log('- Registration pushManager:', !!registration.pushManager);
      }

      return registration;
    } catch (error) {
      console.error('Service worker registration failed:', error);
      return null;
    }
  }

  /**
   * Get current notification permission status
   */
  getPermissionStatus(): NotificationPermission {
    return Notification.permission;
  }

  /**
   * Request notification permission
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      throw new Error('Push notifications are not supported on this device');
    }

    // On iOS, we need to check if we're in a PWA
    if (this.isIOSPWA() || window.location.protocol === 'https:') {
      const permission = await Notification.requestPermission();
      console.log('Notification permission:', permission);
      return permission;
    } else {
      throw new Error('Push notifications require HTTPS or PWA installation');
    }
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe(): Promise<void> {
    // Special handling for iOS PWAs
    if (this.isIOSPWA()) {
      console.log('📱 Detected iOS PWA, using iOS-specific subscription flow');

      // Register service worker first (required for iOS)
      const registration = await this.registerServiceWorker();
      if (!registration) {
        throw new Error('Failed to register service worker');
      }
      this.registration = registration;

      // Wait a moment for service worker to fully activate
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Now check if PushManager is available after SW registration
      if (!('PushManager' in window) || !registration.pushManager) {
        throw new Error('Push notifications are not available. Please ensure you are using iOS 16.4 or later.');
      }
    } else if (!this.isSupported()) {
      throw new Error('Push notifications are not supported');
    }

    // Register service worker if needed (for non-iOS)
    if (!this.registration) {
      const registration = await this.registerServiceWorker();
      if (!registration) {
        throw new Error('Failed to register service worker');
      }
      this.registration = registration;
    }

    // Ensure we have permission
    const permission = await this.getPermissionStatus();
    if (permission !== 'granted') {
      const newPermission = await this.requestPermission();
      if (newPermission !== 'granted') {
        throw new Error('Notification permission denied');
      }
    }

    try {
      // Get VAPID public key from server
      const response = await fetch(`${API_BASE_URL}/push/vapid-public-key`);
      const { publicKey } = await response.json();

      // Subscribe to push notifications
      const subscription = await this.registration!.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      this.subscription = subscription;
      console.log('Push subscription created:', subscription);

      // Send subscription to server
      await this.sendSubscriptionToServer(subscription);

    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      throw error;
    }
  }

  /**
   * Send subscription to server
   */
  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
    // Get session token
    const sessionToken = await this.getSessionToken();

    if (!sessionToken) {
      throw new Error('No session token found. Please log in.');
    }

    const response = await fetch(`${API_BASE_URL}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`
      },
      credentials: 'include',
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        deviceInfo: getDeviceInfo()
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to register subscription');
    }

    console.log('Subscription sent to server successfully');
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe(): Promise<void> {
    if (!this.subscription) {
      // Try to get existing subscription
      if (this.registration) {
        this.subscription = await this.registration.pushManager.getSubscription();
      }
    }

    if (this.subscription) {
      // Unsubscribe from push manager
      await this.subscription.unsubscribe();

      // Get session token
      const sessionToken = await this.getSessionToken();

      // Notify server
      if (sessionToken) {
        try {
          await fetch(`${API_BASE_URL}/push/unsubscribe`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${sessionToken}`
            },
            credentials: 'include',
            body: JSON.stringify({
              endpoint: this.subscription.endpoint
            })
          });
          console.log('Unsubscribed from push notifications');
        } catch (error) {
          console.error('Failed to notify server of unsubscription:', error);
        }
      }

      this.subscription = null;
    }
  }

  /**
   * Check if user is subscribed
   */
  async isSubscribed(): Promise<boolean> {
    if (!this.registration) {
      await this.registerServiceWorker();
    }

    if (!this.registration) {
      return false;
    }

    const subscription = await this.registration.pushManager.getSubscription();
    this.subscription = subscription;
    return subscription !== null;
  }

  /**
   * Get session token from AWS Amplify or localStorage
   */
  private async getSessionToken(): Promise<string | null> {
    console.log('🔍 Getting session token...');

    // Check for AWS Amplify authentication (employee login)
    try {
      console.log('📱 Attempting to get AWS Amplify session...');
      const { fetchAuthSession } = await import('aws-amplify/auth');
      const session = await fetchAuthSession();
      console.log('📱 AWS Amplify session:', session);

      if (session?.tokens?.idToken) {
        console.log('✅ Found AWS Amplify idToken');
        return session.tokens.idToken.toString();
      } else if (session?.tokens?.accessToken) {
        console.log('✅ Found AWS Amplify accessToken (using as fallback)');
        return session.tokens.accessToken.toString();
      } else {
        console.log('❌ AWS Amplify session exists but no tokens found');
      }
    } catch (e) {
      console.log('❌ AWS Amplify error:', e);
    }

    // Fallback to traditional session tokens
    const traditionalToken = localStorage.getItem('sessionToken') || localStorage.getItem('client_sessionToken');
    if (traditionalToken) {
      console.log('✅ Found traditional session token');
      return traditionalToken;
    }

    console.log('❌ No session token found in any location');
    return null;
  }

  /**
   * Get notification preferences
   */
  async getPreferences(): Promise<any> {
    const sessionToken = await this.getSessionToken();

    if (!sessionToken) {
      throw new Error('No session token found');
    }

    const response = await fetch(`${API_BASE_URL}/push/preferences`, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`
      },
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to fetch preferences');
    }

    return response.json();
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(preferences: any): Promise<void> {
    const sessionToken = await this.getSessionToken();

    if (!sessionToken) {
      throw new Error('No session token found');
    }

    const response = await fetch(`${API_BASE_URL}/push/preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`
      },
      credentials: 'include',
      body: JSON.stringify(preferences)
    });

    if (!response.ok) {
      throw new Error('Failed to update preferences');
    }
  }

  /**
   * Send test notification (admin only)
   */
  async sendTestNotification(): Promise<void> {
    console.log('📮 Sending test notification...');
    const sessionToken = await this.getSessionToken();

    if (!sessionToken) {
      console.error('❌ Cannot send test notification: No session token found');
      throw new Error('No session token found. Please log in.');
    }

    console.log('📤 Sending request to:', `${API_BASE_URL}/push/test`);
    console.log('🔑 Using token:', sessionToken.substring(0, 20) + '...');

    const response = await fetch(`${API_BASE_URL}/push/test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`
      },
      credentials: 'include'
    });

    console.log('📥 Response status:', response.status);

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Test notification failed:', error);
      throw new Error(error.error || 'Failed to send test notification');
    }

    console.log('✅ Test notification sent successfully');
  }

  /**
   * Show install prompt for iOS
   */
  showIOSInstallInstructions(): string {
    return `To enable notifications on iOS:
1. Open this website in Safari
2. Tap the Share button (square with arrow)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add" in the top right
5. Open the app from your home screen
6. Allow notifications when prompted`;
  }
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();