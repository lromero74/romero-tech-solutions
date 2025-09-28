import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ClientThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

const ClientThemeContext = createContext<ClientThemeContextType | undefined>(undefined);

interface ClientThemeProviderProps {
  children: ReactNode;
}

export const ClientThemeProvider: React.FC<ClientThemeProviderProps> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('client-theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    localStorage.setItem('client-theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const setTheme = (theme: 'light' | 'dark') => {
    setIsDarkMode(theme === 'dark');
  };

  return (
    <ClientThemeContext.Provider value={{
      isDarkMode,
      toggleTheme,
      setTheme
    }}>
      {children}
    </ClientThemeContext.Provider>
  );
};

export const useClientTheme = (): ClientThemeContextType => {
  const context = useContext(ClientThemeContext);
  if (context === undefined) {
    throw new Error('useClientTheme must be used within a ClientThemeProvider');
  }
  return context;
};