import { useEffect, useRef } from 'react';

const CURRENT_VERSION = '1.2.2';
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
 */
export function useVersionCheck() {
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    // Only run in production
    if (import.meta.env.DEV) {
      return;
    }

    const checkVersion = async () => {
      try {
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
          console.log('Reloading to get latest version...');

          // Show user-friendly message before reload
          if (hasCheckedRef.current) {
            // Only show alert if this isn't the first check (to avoid disrupting initial load)
            const shouldReload = window.confirm(
              'A new version of the application is available. Click OK to reload and get the latest updates.'
            );
            if (shouldReload) {
              window.location.reload();
            }
          } else {
            // Silent reload on first check (page just loaded with old cache)
            window.location.reload();
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
