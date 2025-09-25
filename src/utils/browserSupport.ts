// Browser support utilities to handle Firefox compatibility issues

export const detectBrowser = () => {
  const userAgent = navigator.userAgent.toLowerCase();

  return {
    isFirefox: userAgent.indexOf('firefox') > -1,
    isChrome: userAgent.indexOf('chrome') > -1,
    isSafari: userAgent.indexOf('safari') > -1 && userAgent.indexOf('chrome') === -1,
    isEdge: userAgent.indexOf('edge') > -1,
  };
};

export const isFirefoxWithModuleIssues = () => {
  const browser = detectBrowser();
  if (!browser.isFirefox) return false;

  // Check if dynamic imports are working properly
  try {
    // Test if we can create a dynamic import
    new Function('return import("data:text/javascript,export default true")')();
    return false; // Dynamic imports work
  } catch (error) {
    console.warn('Firefox dynamic import issues detected:', error);
    return true; // Dynamic imports have issues
  }
};

// Fallback icon system for when lucide-react fails to load
export const createFallbackIcon = (iconName: string) => {
  const iconMap: Record<string, string> = {
    'user': '👤',
    'settings': '⚙️',
    'home': '🏠',
    'dashboard': '📊',
    'users': '👥',
    'services': '🔧',
    'requests': '📋',
    'reports': '📈',
    'businesses': '🏢',
    'plus': '+',
    'edit': '✏️',
    'trash': '🗑️',
    'search': '🔍',
    'filter': '🔽',
    'save': '💾',
    'x': '✕',
    'check': '✓',
    'arrow-up': '↑',
    'arrow-down': '↓',
    'calendar': '📅',
    'clock': '🕐',
    'dollar-sign': '$',
    'building': '🏢',
    'badge': '🏷️',
    'heart': '❤️',
    'plane': '✈️',
    'fingerprint': '👆',
  };

  return iconMap[iconName.toLowerCase()] || '•';
};

// Enhanced console logging for Firefox debugging
export const firefoxDebugLog = (message: string, data?: any) => {
  const browser = detectBrowser();
  if (browser.isFirefox) {
    console.log(`🦊 Firefox Debug: ${message}`, data || '');
  }
};

// Check for common Firefox issues
export const checkFirefoxCompatibility = () => {
  const browser = detectBrowser();

  if (!browser.isFirefox) {
    return { compatible: true, issues: [] };
  }

  const issues: string[] = [];

  // Check localStorage
  try {
    localStorage.setItem('firefox-test', 'test');
    localStorage.removeItem('firefox-test');
  } catch {
    issues.push('localStorage not available');
  }

  // Check ES6 module support
  if (typeof Symbol === 'undefined') {
    issues.push('ES6 Symbol not supported');
  }

  // Check dynamic import support
  if (isFirefoxWithModuleIssues()) {
    issues.push('Dynamic import issues detected');
  }

  firefoxDebugLog('Compatibility check completed', {
    compatible: issues.length === 0,
    issues
  });

  return {
    compatible: issues.length === 0,
    issues
  };
};