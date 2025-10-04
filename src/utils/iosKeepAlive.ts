/**
 * iOS Keep Alive Utility
 * Prevents iOS Safari from suspending the PWA when switching apps
 */

class IOSKeepAlive {
  private intervalId: NodeJS.Timeout | null = null;
  private isIOS: boolean;

  constructor() {
    // Detect iOS
    this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  }

  /**
   * Start keep-alive mechanism for iOS PWAs
   */
  start() {
    if (!this.isIOS) return;

    console.log('📱 Starting iOS keep-alive mechanism');

    // Set a periodic timer to keep the page active
    this.intervalId = setInterval(() => {
      // Touch local storage to keep the page active
      localStorage.setItem('ios_keepalive', Date.now().toString());

      // Also trigger a small DOM update to prevent suspension
      const keepAliveElement = document.getElementById('ios-keepalive');
      if (keepAliveElement) {
        keepAliveElement.textContent = '.';
      }
    }, 1000); // Every second

    // Add hidden element for DOM updates
    if (!document.getElementById('ios-keepalive')) {
      const element = document.createElement('div');
      element.id = 'ios-keepalive';
      element.style.position = 'absolute';
      element.style.left = '-9999px';
      element.style.width = '1px';
      element.style.height = '1px';
      element.style.overflow = 'hidden';
      document.body.appendChild(element);
    }

    // Prevent iOS from going to sleep when in PWA mode
    if ('wakeLock' in navigator) {
      this.requestWakeLock();
    }

    // Handle visibility changes more aggressively
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // Keep network connection alive
    this.keepNetworkAlive();
  }

  /**
   * Stop keep-alive mechanism
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const element = document.getElementById('ios-keepalive');
    if (element) {
      element.remove();
    }

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    console.log('📱 Stopped iOS keep-alive mechanism');
  }

  /**
   * Request wake lock to prevent screen from sleeping
   */
  private async requestWakeLock() {
    try {
      const wakeLock = await (navigator as any).wakeLock.request('screen');
      console.log('🔓 Wake lock acquired');

      // Re-acquire wake lock if released
      wakeLock.addEventListener('release', () => {
        console.log('🔒 Wake lock released, re-acquiring...');
        setTimeout(() => this.requestWakeLock(), 1000);
      });
    } catch (err) {
      console.log('Wake lock not available:', err);
    }
  }

  /**
   * Handle visibility changes
   */
  private handleVisibilityChange = () => {
    if (document.hidden) {
      console.log('📱 Page hidden, saving state...');

      // Save a timestamp to detect refreshes
      localStorage.setItem('ios_hidden_timestamp', Date.now().toString());

      // Try to prevent suspension
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Send message to service worker to keep it alive
        navigator.serviceWorker.controller.postMessage({
          type: 'KEEP_ALIVE',
          timestamp: Date.now()
        });
      }
    } else {
      console.log('📱 Page visible again, checking for refresh...');

      // Check if we were refreshed
      const hiddenTime = localStorage.getItem('ios_hidden_timestamp');
      if (hiddenTime) {
        const timeDiff = Date.now() - parseInt(hiddenTime);
        if (timeDiff > 2000) {
          console.log('⚠️ Detected page refresh after', Math.round(timeDiff / 1000), 'seconds');
          // The form persistence should handle restoring data
        }
        localStorage.removeItem('ios_hidden_timestamp');
      }

      // Re-request wake lock when visible
      if ('wakeLock' in navigator) {
        this.requestWakeLock();
      }
    }
  };

  /**
   * Keep network connection alive with periodic pings
   */
  private keepNetworkAlive() {
    // Send a tiny request periodically to keep the connection warm
    setInterval(() => {
      if (!document.hidden) {
        fetch('/favicon.ico', {
          method: 'HEAD',
          cache: 'no-store'
        }).catch(() => {
          // Ignore errors
        });
      }
    }, 5000); // Every 5 seconds
  }

  /**
   * Check if running as PWA
   */
  isPWA(): boolean {
    return (window.navigator as any).standalone === true ||
           window.matchMedia('(display-mode: standalone)').matches ||
           window.matchMedia('(display-mode: fullscreen)').matches;
  }
}

// Create singleton instance
export const iosKeepAlive = new IOSKeepAlive();

// Auto-start if on iOS and in PWA mode
if (typeof window !== 'undefined') {
  const keepAlive = new IOSKeepAlive();
  if (keepAlive.isIOS && keepAlive.isPWA()) {
    keepAlive.start();
  }
}