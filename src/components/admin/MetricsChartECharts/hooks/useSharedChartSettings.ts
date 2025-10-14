import { useState, useEffect, useCallback } from 'react';
import type { ChartDisplayType, ActiveIndicators, AveragingMode, BandMode } from '../types';

/**
 * Chart settings that can be shared across multiple resource types
 */
export interface ChartSettings {
  chartDisplayType: ChartDisplayType;
  candlestickPeriod: number;
  averagingMode: AveragingMode;
  windowSize: number;
  bandMode: BandMode;
  selectedTimeWindow: number;
  autoFitYAxis: boolean;
  activeIndicators: ActiveIndicators;
  chartHeight: number;
  currentZoom?: { start: number; end: number } | null;
}

/**
 * Settings for all resource types
 */
interface ResourceSettings {
  cpu: ChartSettings;
  memory: ChartSettings;
  disk: ChartSettings;
}

/**
 * Hook for managing shared chart settings across resource types
 * Persists settings to localStorage and supports linking settings across all types
 */
export const useSharedChartSettings = (agentId: string, initialHeight: number = 300) => {
  const STORAGE_KEY = `metrics-chart-settings-${agentId}`;
  const LINK_SETTINGS_KEY = `metrics-chart-link-settings-${agentId}`;
  const USER_DEFAULT_SETTINGS_KEY = 'metrics-chart-user-defaults';

  // Get system default settings
  const getSystemDefaults = (): ChartSettings => ({
    chartDisplayType: 'heiken-ashi',
    candlestickPeriod: 15,
    averagingMode: 'moving',
    windowSize: 20,
    bandMode: 'dynamic',
    selectedTimeWindow: 48, // 2 days
    autoFitYAxis: true,
    activeIndicators: {
      sma20: true,
      bb: true,
    },
    chartHeight: initialHeight,
  });

  // Load user's personal default settings (if any)
  const loadUserDefaults = (): ChartSettings | null => {
    try {
      const saved = localStorage.getItem(USER_DEFAULT_SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with system defaults to handle new settings added over time
        return { ...getSystemDefaults(), ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load user default settings from localStorage:', error);
    }
    return null;
  };

  // Get default settings (user's personal defaults or system defaults)
  const getDefaultSettings = (): ChartSettings => {
    const userDefaults = loadUserDefaults();
    return userDefaults || getSystemDefaults();
  };

  // Load settings from localStorage or use defaults
  const loadSettings = (): ResourceSettings => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new settings added over time
        const defaults = getDefaultSettings();
        return {
          cpu: { ...defaults, ...parsed.cpu },
          memory: { ...defaults, ...parsed.memory },
          disk: { ...defaults, ...parsed.disk },
        };
      }
    } catch (error) {
      console.warn('Failed to load chart settings from localStorage:', error);
    }

    // Return defaults for all types
    const defaults = getDefaultSettings();
    return {
      cpu: { ...defaults },
      memory: { ...defaults },
      disk: { ...defaults },
    };
  };

  // Load link settings from localStorage
  const loadLinkSettings = (): boolean => {
    try {
      const saved = localStorage.getItem(LINK_SETTINGS_KEY);
      return saved === 'true';
    } catch (error) {
      console.warn('Failed to load link settings from localStorage:', error);
      return false;
    }
  };

  // State
  const [settings, setSettings] = useState<ResourceSettings>(loadSettings());
  const [linkSettings, setLinkSettings] = useState<boolean>(loadLinkSettings());

  // Save settings to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save chart settings to localStorage:', error);
    }
  }, [settings, STORAGE_KEY]);

  // Save link settings to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(LINK_SETTINGS_KEY, String(linkSettings));
    } catch (error) {
      console.error('Failed to save link settings to localStorage:', error);
    }
  }, [linkSettings, LINK_SETTINGS_KEY]);

  // Update settings for a specific resource type
  const updateSettings = useCallback((
    resourceType: 'cpu' | 'memory' | 'disk',
    updates: Partial<ChartSettings>
  ) => {
    setSettings(prev => {
      if (linkSettings) {
        // Apply to all resource types when linked
        return {
          cpu: { ...prev.cpu, ...updates },
          memory: { ...prev.memory, ...updates },
          disk: { ...prev.disk, ...updates },
        };
      } else {
        // Apply only to specific resource type
        return {
          ...prev,
          [resourceType]: { ...prev[resourceType], ...updates },
        };
      }
    });
  }, [linkSettings]);

  // Toggle link settings
  const toggleLinkSettings = useCallback(() => {
    setLinkSettings(prev => !prev);
  }, []);

  // Reset settings for a specific resource type
  const resetSettings = useCallback((resourceType: 'cpu' | 'memory' | 'disk') => {
    const defaults = getDefaultSettings();
    updateSettings(resourceType, defaults);
  }, [updateSettings]);

  // Reset all settings to user defaults or system defaults
  const resetAllSettings = useCallback(() => {
    const defaults = getDefaultSettings();
    setSettings({
      cpu: { ...defaults },
      memory: { ...defaults },
      disk: { ...defaults },
    });
  }, []);

  // Save current settings as user's personal defaults
  const saveAsUserDefaults = useCallback((resourceType: 'cpu' | 'memory' | 'disk') => {
    try {
      const currentSettings = settings[resourceType];
      localStorage.setItem(USER_DEFAULT_SETTINGS_KEY, JSON.stringify(currentSettings));
      console.log('✅ Saved as user default settings:', currentSettings);
    } catch (error) {
      console.error('Failed to save user default settings:', error);
    }
  }, [settings, USER_DEFAULT_SETTINGS_KEY]);

  // Revert to system defaults (clear user defaults)
  const revertToSystemDefaults = useCallback(() => {
    try {
      localStorage.removeItem(USER_DEFAULT_SETTINGS_KEY);
      const systemDefaults = getSystemDefaults();
      setSettings({
        cpu: { ...systemDefaults },
        memory: { ...systemDefaults },
        disk: { ...systemDefaults },
      });
      console.log('✅ Reverted to system default settings');
    } catch (error) {
      console.error('Failed to revert to system defaults:', error);
    }
  }, []);

  // Check if user has custom defaults
  const hasUserDefaults = (): boolean => {
    return loadUserDefaults() !== null;
  };

  return {
    settings,
    linkSettings,
    updateSettings,
    toggleLinkSettings,
    resetSettings,
    resetAllSettings,
    saveAsUserDefaults,
    revertToSystemDefaults,
    hasUserDefaults,
  };
};
