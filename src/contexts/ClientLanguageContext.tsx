import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

interface LanguageContextType {
  language: string;
  setLanguage: (lang: string) => void;
  t: (key: string, variables?: { [key: string]: string }, fallback?: string) => string;
  loading: boolean;
  availableLanguages: Array<{ code: string; name: string; nativeName: string }>;
  clearTranslationCache: () => void;
}

export const ClientLanguageContext = createContext<LanguageContextType | undefined>(undefined);

interface ClientLanguageProviderProps {
  children: React.ReactNode;
}

// In-memory cache for translations
const translationCache: { [languageCode: string]: { [key: string]: string } } = {};

// Helper function to flatten nested translation objects to dot notation keys
const flattenTranslations = (obj: any, prefix = ''): { [key: string]: string } => {
  const result: { [key: string]: string } = {};

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;

      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(result, flattenTranslations(obj[key], newKey));
      } else {
        result[newKey] = obj[key];
      }
    }
  }

  return result;
};


// Load cached translations from localStorage
const loadCachedTranslations = (languageCode: string): { [key: string]: string } => {
  try {
    const cached = localStorage.getItem(`translations_${languageCode}`);
    if (cached) {
      const translations = JSON.parse(cached);
      translationCache[languageCode] = translations;
      return translations;
    }
  } catch (error) {
    console.warn('Failed to load cached translations:', error);
  }
  return {};
};

// Save translations to localStorage
const saveCachedTranslations = (languageCode: string, translations: { [key: string]: string }) => {
  try {
    localStorage.setItem(`translations_${languageCode}`, JSON.stringify(translations));
  } catch (error) {
    console.warn('Failed to save translations to cache:', error);
  }
};

export const ClientLanguageProvider: React.FC<ClientLanguageProviderProps> = ({ children }) => {
  // Initialize language synchronously from localStorage to prevent flash of wrong language
  const getInitialLanguage = () => {
    const clientLanguage = localStorage.getItem('clientLanguage');
    const homePageLanguage = localStorage.getItem('homePageLanguage');
    let selectedLanguage = clientLanguage || homePageLanguage;

    if (!selectedLanguage) {
      const browserLang = navigator.language.split('-')[0];
      const availableLanguages = [
        { code: 'en', name: 'English', nativeName: 'English' },
        { code: 'es', name: 'Spanish', nativeName: 'Español' }
      ];
      selectedLanguage = availableLanguages.find(lang => lang.code === browserLang)?.code || 'en';
    }

    return selectedLanguage;
  };

  const initialLanguage = getInitialLanguage();
  const initialTranslations = loadCachedTranslations(initialLanguage) || {};
  const [language, setLanguageState] = useState<string>(initialLanguage);
  const [loading, setLoading] = useState<boolean>(Object.keys(initialTranslations).length === 0);
  const [translations, setTranslations] = useState<{ [key: string]: string }>(initialTranslations);

  const availableLanguages = [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'es', name: 'Spanish', nativeName: 'Español' }
  ];

  // Load translations from API
  const loadTranslations = useCallback(async (languageCode: string, force: boolean = false) => {
    // Check cache first (unless forced)
    if (!force) {
      if (translationCache[languageCode]) {
        setTranslations(translationCache[languageCode]);
        setLoading(false);
        return;
      }

      // Check localStorage cache
      const localCached = loadCachedTranslations(languageCode);
      if (localCached && Object.keys(localCached).length > 0) {
        translationCache[languageCode] = localCached;
        setTranslations(localCached);
        setLoading(false);
        return;
      }
    } else {
      delete translationCache[languageCode];
      localStorage.removeItem(`translations_${languageCode}`);
    }

    // If we don't have initial translations, show we're loading
    if (Object.keys(translations).length === 0) {
      setLoading(true);
    }

    try {
      // Load translations from database API
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
      const response = await fetch(`${API_BASE_URL}/translations/client/${languageCode}`, {
        method: 'GET',
        credentials: 'include'
      });

      if (response.ok) {
        const apiResponse = await response.json();
        const translationMap: { [key: string]: string } = {};

        // Convert API response to flat key-value map
        if (apiResponse.success && apiResponse.data && apiResponse.data.translations) {
          apiResponse.data.translations.forEach((item: { key_path: string; value: string; default_value: string }) => {
            translationMap[item.key_path] = item.value || item.default_value;
          });
        }

        // Cache the translations
        translationCache[languageCode] = translationMap;
        saveCachedTranslations(languageCode, translationMap);
        setTranslations(translationMap);
      } else {
        console.error('Failed to load translations:', response.statusText);
        // Fallback to empty translations - component will use fallback text
        setTranslations({});
      }
    } catch (error) {
      console.error('Error loading translations:', error);
      // Fallback to empty translations - component will use fallback text
      setTranslations({});
    } finally {
      setLoading(false);
    }
  }, []);

  // Load translations for the initial language
  useEffect(() => {
    loadTranslations(language);
  }, [loadTranslations, language]);


  // Translation function with variable interpolation
  const t = useCallback((key: string, variables?: { [key: string]: string }, fallback?: string): string => {
    let translation = translations[key];

    if (translation) {
      // Handle variable interpolation
      if (variables) {
        Object.keys(variables).forEach(varKey => {
          const placeholder = `{{${varKey}}}`;
          translation = translation.replace(new RegExp(placeholder, 'g'), variables[varKey]);
        });
      }
      return translation;
    }

    // If no translation found, return fallback or key
    if (fallback) {
      // Apply variable interpolation to fallback string too
      let interpolatedFallback = fallback;
      if (variables) {
        Object.keys(variables).forEach(varKey => {
          const placeholder = `{{${varKey}}}`;
          interpolatedFallback = interpolatedFallback.replace(new RegExp(placeholder, 'g'), variables[varKey]);
        });
      }
      return interpolatedFallback;
    }

    // Return a readable version of the key as last resort
    return key.split('.').pop()?.replace(/([A-Z])/g, ' $1').trim() || key;
  }, [translations]);

  // Set language with persistence and API call
  const setLanguage = useCallback(async (languageCode: string) => {
    if (languageCode === language) return;

    // Save to localStorage
    localStorage.setItem('clientLanguage', languageCode);

    // Update state
    setLanguageState(languageCode);

    // Load new translations
    await loadTranslations(languageCode);

    // Optionally save user preference to database if authenticated
    try {
      const authUser = localStorage.getItem('authUser');
      const sessionToken = localStorage.getItem('sessionToken');
      if (authUser && sessionToken) {
        const response = await fetch(`${API_BASE_URL}/client/profile/language-preference`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionToken}`
          },
          credentials: 'include',
          body: JSON.stringify({
            language: languageCode,
            context: 'client'
          })
        });

        if (!response.ok) {
          console.warn('Failed to save language preference to database');
        }
      }
    } catch (error) {
      console.warn('Error saving language preference:', error);
    }
  }, [language, loadTranslations]);

  // Clear translation cache function
  const clearTranslationCache = useCallback(() => {
    delete translationCache[language];
    localStorage.removeItem(`translations_${language}`);
    loadTranslations(language, true); // Force reload
  }, [language, loadTranslations]);

  const contextValue: LanguageContextType = {
    language,
    setLanguage,
    t,
    loading,
    availableLanguages,
    clearTranslationCache
  };

  return (
    <ClientLanguageContext.Provider value={contextValue}>
      {children}
    </ClientLanguageContext.Provider>
  );
};

export const useClientLanguage = (): LanguageContextType => {
  const context = useContext(ClientLanguageContext);
  if (context === undefined) {
    throw new Error('useClientLanguage must be used within a ClientLanguageProvider');
  }
  return context;
};

// Optional version that returns fallback behavior when provider is missing
// Use this in components that are shared between client and admin contexts
export const useOptionalClientLanguage = (): LanguageContextType => {
  const context = useContext(ClientLanguageContext);

  // If no provider, return a fallback implementation
  if (context === undefined) {
    return {
      language: 'en',
      setLanguage: () => {},
      t: (key: string, variables?: { [key: string]: string }, fallback?: string): string => {
        // Return fallback if provided, otherwise extract key name
        if (fallback) {
          let interpolatedFallback = fallback;
          if (variables) {
            Object.keys(variables).forEach(varKey => {
              const placeholder = `{{${varKey}}}`;
              interpolatedFallback = interpolatedFallback.replace(new RegExp(placeholder, 'g'), variables[varKey]);
            });
          }
          return interpolatedFallback;
        }
        return key.split('.').pop()?.replace(/([A-Z])/g, ' $1').trim() || key;
      },
      loading: false,
      availableLanguages: [
        { code: 'en', name: 'English', nativeName: 'English' },
        { code: 'es', name: 'Spanish', nativeName: 'Español' }
      ],
      clearTranslationCache: () => {}
    };
  }

  return context;
};

export default ClientLanguageProvider;