import React, { useState } from 'react';
import { useClientLanguage } from '../../contexts/ClientLanguageContext';
import { useClientTheme } from '../../contexts/ClientThemeContext';
import { Globe, ChevronDown } from 'lucide-react';

interface LanguageSelectorProps {
  compact?: boolean;
  className?: string;
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ compact = false, className = '' }) => {
  const { language, setLanguage, availableLanguages, loading } = useClientLanguage();
  const { isDarkMode } = useClientTheme();
  const [isOpen, setIsOpen] = useState(false);

  const themeClasses = {
    button: isDarkMode
      ? 'bg-gray-700 hover:bg-gray-600 text-white border-gray-600'
      : 'bg-white hover:bg-gray-50 text-gray-900 border-gray-300',
    dropdown: isDarkMode
      ? 'bg-gray-800 border-gray-700 shadow-lg'
      : 'bg-white border-gray-200 shadow-lg',
    option: isDarkMode
      ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
      : 'text-gray-700 hover:bg-gray-100',
    optionActive: isDarkMode
      ? 'bg-blue-600 text-white'
      : 'bg-blue-50 text-blue-700'
  };

  const currentLanguage = availableLanguages.find(lang => lang.code === language);

  const handleLanguageChange = async (langCode: string) => {
    setIsOpen(false);
    if (langCode !== language) {
      await setLanguage(langCode);
    }
  };

  const handleClickOutside = (event: React.MouseEvent) => {
    if (!event.currentTarget.contains(event.target as Node)) {
      setIsOpen(false);
    }
  };

  // Compact version for header
  if (compact) {
    return (
      <div className={`relative ${className}`} onClick={handleClickOutside}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={loading}
          className={`flex items-center px-3 py-2 rounded-lg border transition-colors ${themeClasses.button} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={currentLanguage?.nativeName || 'Select Language'}
        >
          <Globe className="h-4 w-4 mr-1" />
          <span className="text-sm font-medium">{language.toUpperCase()}</span>
          <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className={`absolute right-0 top-full mt-2 w-40 rounded-lg border ${themeClasses.dropdown} z-50`}>
            <div className="py-1">
              {availableLanguages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    lang.code === language
                      ? themeClasses.optionActive
                      : themeClasses.option
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{lang.nativeName}</span>
                    {lang.code === language && (
                      <div className="w-2 h-2 bg-current rounded-full" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full version for settings or dedicated language selection
  return (
    <div className={`${className}`}>
      <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
        Select Language
      </label>

      <div className="relative" onClick={handleClickOutside}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={loading}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${themeClasses.button} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center">
            <Globe className="h-5 w-5 mr-3" />
            <div className="text-left">
              <div className="font-medium">
                {currentLanguage?.nativeName || 'Select Language'}
              </div>
              {currentLanguage && (
                <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {currentLanguage.name}
                </div>
              )}
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className={`absolute left-0 right-0 top-full mt-2 rounded-lg border ${themeClasses.dropdown} z-50`}>
            <div className="py-2">
              {availableLanguages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    lang.code === language
                      ? themeClasses.optionActive
                      : themeClasses.option
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{lang.nativeName}</div>
                      <div className={`text-xs ${
                        lang.code === language
                          ? isDarkMode ? 'text-blue-200' : 'text-blue-600'
                          : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        {lang.name}
                      </div>
                    </div>
                    {lang.code === language && (
                      <div className="w-3 h-3 bg-current rounded-full" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className={`mt-2 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Loading translations...
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;