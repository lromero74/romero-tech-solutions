import { APP_CONFIG } from '../constants/config';

export const storage = {
  get: <T>(key: string, defaultValue?: T): T | null => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue || null;
    } catch {
      return defaultValue || null;
    }
  },

  set: <T>(key: string, value: T): void => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  },

  remove: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to remove from localStorage:', error);
    }
  },

  // Specific app storage functions
  language: {
    get: () => storage.get(APP_CONFIG.storage.keys.language, 'en') as 'en' | 'es',
    set: (language: 'en' | 'es') => storage.set(APP_CONFIG.storage.keys.language, language)
  },

  currentPage: {
    get: () => storage.get(APP_CONFIG.storage.keys.currentPage, 'home'),
    set: (page: string) => storage.set(APP_CONFIG.storage.keys.currentPage, page)
  }
};