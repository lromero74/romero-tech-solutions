/**
 * Form State Persistence Utility
 * Preserves form data when app loses focus (for MFA checks, etc.)
 */

const STORAGE_PREFIX = 'rts_form_';
const STORAGE_DURATION = 5 * 60 * 1000; // 5 minutes

interface StoredFormData {
  data: Record<string, any>;
  timestamp: number;
  path: string;
}

class FormStatePersistence {
  private storageKey: string;

  constructor(formId: string) {
    this.storageKey = `${STORAGE_PREFIX}${formId}`;
  }

  /**
   * Save form data to localStorage (survives iOS refreshes)
   */
  saveFormData(data: Record<string, any>) {
    try {
      const storedData: StoredFormData = {
        data,
        timestamp: Date.now(),
        path: window.location.pathname
      };

      // Use localStorage for iOS PWA persistence
      localStorage.setItem(this.storageKey, JSON.stringify(storedData));

      // Also save to sessionStorage as backup
      try {
        sessionStorage.setItem(this.storageKey, JSON.stringify(storedData));
      } catch (e) {
        // SessionStorage might fail in some cases
      }

      console.log('💾 Saved form data to persistent storage');
    } catch (error) {
      console.error('Failed to save form data:', error);
    }
  }

  /**
   * Restore form data from localStorage (survives iOS refreshes)
   */
  restoreFormData(): Record<string, any> | null {
    try {
      // Try localStorage first (survives refreshes)
      let stored = localStorage.getItem(this.storageKey);

      // Fallback to sessionStorage if not in localStorage
      if (!stored) {
        stored = sessionStorage.getItem(this.storageKey);
      }

      if (!stored) return null;

      const parsed: StoredFormData = JSON.parse(stored);

      // Check if data is expired
      if (Date.now() - parsed.timestamp > STORAGE_DURATION) {
        this.clearFormData();
        return null;
      }

      // Check if we're on the same path
      if (parsed.path !== window.location.pathname) {
        return null;
      }

      return parsed.data;
    } catch (error) {
      console.error('Failed to restore form data:', error);
      return null;
    }
  }

  /**
   * Clear saved form data from both storage types
   */
  clearFormData() {
    try {
      localStorage.removeItem(this.storageKey);
      sessionStorage.removeItem(this.storageKey);
      console.log('🧹 Cleared form data from storage');
    } catch (error) {
      console.error('Failed to clear form data:', error);
    }
  }

  /**
   * Setup auto-save on page visibility change
   */
  setupAutoSave(getFormData: () => Record<string, any>) {
    // Save when page loses visibility (switching apps, tabs, etc.)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        const data = getFormData();
        if (data && Object.keys(data).length > 0) {
          this.saveFormData(data);
        }
      }
    });

    // Save before page unload
    window.addEventListener('beforeunload', () => {
      const data = getFormData();
      if (data && Object.keys(data).length > 0) {
        this.saveFormData(data);
      }
    });

    // Also save on blur events (when focus leaves the window)
    window.addEventListener('blur', () => {
      const data = getFormData();
      if (data && Object.keys(data).length > 0) {
        this.saveFormData(data);
      }
    });

    // Save periodically while typing
    let saveTimeout: NodeJS.Timeout;
    const autoSaveOnInput = () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        const data = getFormData();
        if (data && Object.keys(data).length > 0) {
          this.saveFormData(data);
        }
      }, 1000); // Save 1 second after stopping typing
    };

    // Listen for input events on the document
    document.addEventListener('input', autoSaveOnInput);
    document.addEventListener('change', autoSaveOnInput);

    // Return cleanup function
    return () => {
      document.removeEventListener('visibilitychange', () => {});
      window.removeEventListener('beforeunload', () => {});
      window.removeEventListener('blur', () => {});
      document.removeEventListener('input', autoSaveOnInput);
      document.removeEventListener('change', autoSaveOnInput);
      clearTimeout(saveTimeout);
    };
  }
}

/**
 * Hook for React components to use form persistence
 */
export function useFormPersistence(formId: string) {
  const persistence = new FormStatePersistence(formId);

  return {
    saveFormData: (data: Record<string, any>) => persistence.saveFormData(data),
    restoreFormData: () => persistence.restoreFormData(),
    clearFormData: () => persistence.clearFormData(),
    setupAutoSave: (getFormData: () => Record<string, any>) => persistence.setupAutoSave(getFormData)
  };
}

/**
 * Preserve scroll position when switching apps
 */
export function preserveScrollPosition() {
  const SCROLL_KEY = 'rts_scroll_position';

  // Save scroll position when leaving
  const saveScroll = () => {
    const scrollData = {
      x: window.scrollX,
      y: window.scrollY,
      timestamp: Date.now(),
      path: window.location.pathname
    };
    // Use localStorage for iOS persistence
    localStorage.setItem(SCROLL_KEY, JSON.stringify(scrollData));
  };

  // Restore scroll position when returning
  const restoreScroll = () => {
    try {
      const stored = localStorage.getItem(SCROLL_KEY) || sessionStorage.getItem(SCROLL_KEY);
      if (!stored) return;

      const scrollData = JSON.parse(stored);

      // Only restore if same path and within 5 minutes
      if (scrollData.path === window.location.pathname &&
          Date.now() - scrollData.timestamp < STORAGE_DURATION) {
        window.scrollTo(scrollData.x, scrollData.y);
      }
    } catch (error) {
      console.error('Failed to restore scroll position:', error);
    }
  };

  // Set up listeners
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      saveScroll();
    } else {
      setTimeout(restoreScroll, 100); // Small delay to ensure page is ready
    }
  });

  window.addEventListener('beforeunload', saveScroll);
  window.addEventListener('load', restoreScroll);
}

// Auto-initialize scroll preservation
if (typeof window !== 'undefined') {
  preserveScrollPosition();
}

export default FormStatePersistence;