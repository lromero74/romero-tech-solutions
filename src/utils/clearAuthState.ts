/**
 * Development utility to clear stale authentication state from localStorage
 *
 * This utility helps resolve auth state conflicts when:
 * - User has mixed client/employee sessions
 * - localStorage has stale tokens
 * - Auth context is out of sync with backend
 *
 * Usage:
 * 1. Open browser console
 * 2. Run: clearAuthState()
 * 3. Refresh the page
 */

export const clearAuthState = () => {
  const keysToRemove = [
    // Auth tokens and session data
    'sessionToken',
    'authUser',
    'authToken',
    'refreshToken',

    // Session configuration
    'sessionConfig',
    'lastSessionConfigFetch',

    // User data
    'userRole',
    'userId',
    'userEmail',

    // AWS Cognito
    'CognitoIdentityServiceProvider',

    // Any key containing 'auth', 'session', or 'token' (case-insensitive)
  ];

  console.log('🧹 Clearing authentication state from localStorage...');

  let clearedCount = 0;

  // Remove specific keys
  keysToRemove.forEach(key => {
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
      console.log(`✅ Removed: ${key}`);
      clearedCount++;
    }
  });

  // Remove any keys containing auth-related terms
  const allKeys = Object.keys(localStorage);
  allKeys.forEach(key => {
    if (
      key.toLowerCase().includes('auth') ||
      key.toLowerCase().includes('session') ||
      key.toLowerCase().includes('token') ||
      key.toLowerCase().includes('cognito')
    ) {
      if (!keysToRemove.includes(key)) {
        localStorage.removeItem(key);
        console.log(`✅ Removed (pattern match): ${key}`);
        clearedCount++;
      }
    }
  });

  console.log(`🎉 Cleared ${clearedCount} auth-related items from localStorage`);
  console.log('🔄 Please refresh the page to complete the cleanup');

  return clearedCount;
};

// Expose globally for console access in development
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).clearAuthState = clearAuthState;
  console.log('🛠️ Development utility loaded: clearAuthState()');
}

export default clearAuthState;