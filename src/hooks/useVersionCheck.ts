import { useEffect, useRef } from 'react';

const CURRENT_VERSION = '1.101.92';
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

interface VersionInfo {
  version: string;
  timestamp: string;
  buildDate: string;
}

/**
 * Automatically checks for new app versions and reloads the page
 * when a new version is deployed. This ensures users always see
 * the latest content without manual cache clearing.
 *
 * Works in conjunction with service worker to handle updates properly:
 * 1. Detects version mismatch
 * 2. Updates service worker if available
 * 3. Performs controlled reload
 */
export function useVersionCheck() {
  const hasCheckedRef = useRef(false);
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // Get service worker registration on mount
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        swRegistrationRef.current = registration;
      });
    }
  }, []);

  useEffect(() => {
    // Only run in production
    if (import.meta.env.DEV) {
      return;
    }

    const checkVersion = async () => {
      try {
        // Check if we've already done a version-triggered reload recently
        const lastReloadTime = sessionStorage.getItem('versionCheckReloadTime');
        const now = Date.now();

        if (lastReloadTime && (now - parseInt(lastReloadTime)) < 10000) {
          // Skip check if we reloaded less than 10 seconds ago
          console.log('⏭️ Skipping version check - recently reloaded');
          return;
        }

        // Add timestamp to prevent caching of version.json itself
        const response = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });

        if (!response.ok) {
          console.warn('Version check failed:', response.status);
          return;
        }

        const versionInfo: VersionInfo = await response.json();

        if (versionInfo.version !== CURRENT_VERSION) {
          console.log(
            `🔄 New version available: ${versionInfo.version} (current: ${CURRENT_VERSION})`
          );

          // Only prompt after first check to avoid disrupting initial page load
          if (hasCheckedRef.current) {
            // If service worker is available, update it first
            if (swRegistrationRef.current) {
              console.log('SW: Updating service worker before reload...');
              await swRegistrationRef.current.update();

              // If there's a waiting service worker, activate it immediately
              if (swRegistrationRef.current.waiting) {
                swRegistrationRef.current.waiting.postMessage({ type: 'SKIP_WAITING' });
              }
            }

            const shouldReload = window.confirm(
              'A new version of the application is available. Click OK to reload and get the latest updates.'
            );

            if (shouldReload) {
              sessionStorage.setItem('versionCheckReloadTime', now.toString());
              window.location.reload();
            }
          } else {
            // On first check, just log - don't reload to avoid refresh loops
            console.log('Version mismatch detected on initial check - will prompt on next check');
          }
        } else {
          console.log(`✅ Version check: Already on latest (${CURRENT_VERSION})`);
        }

        hasCheckedRef.current = true;
      } catch (error) {
        console.error('Version check error:', error);
      }
    };

    // Check immediately on mount
    checkVersion();

    // Then check periodically
    const interval = setInterval(checkVersion, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, []);
}
