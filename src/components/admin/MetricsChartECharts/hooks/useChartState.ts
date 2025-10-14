import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChartDisplayType, ActiveIndicators, AveragingMode, BandMode, OscillatorHeights, DropdownPosition } from '../types';
import type { ChartSettings } from './useSharedChartSettings';

interface UseChartStateProps {
  initialHeight: number;
  agentId?: string;
  resourceType?: 'cpu' | 'memory' | 'disk';
}

export const useChartState = (props: UseChartStateProps | number) => {
  // Handle both old API (just initialHeight number) and new API (props object)
  const config = typeof props === 'number' ? { initialHeight: props } : props;
  const { initialHeight, agentId, resourceType } = config;

  // Helper to get storage key
  const getStorageKey = () => {
    if (!agentId) return null;
    return `metrics-chart-settings-${agentId}`;
  };

  // Helper to load settings from localStorage
  const loadSettingsFromStorage = (): Partial<ChartSettings> | null => {
    if (!agentId || !resourceType) return null;

    try {
      const storageKey = getStorageKey();
      if (!storageKey) return null;

      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed[resourceType] || null;
      }
    } catch (error) {
      console.warn('Failed to load chart settings from localStorage:', error);
    }
    return null;
  };

  // Helper to save settings to localStorage
  const saveSettingsToStorage = useCallback((updates: Partial<ChartSettings>) => {
    if (!agentId || !resourceType) return;

    try {
      const storageKey = getStorageKey();
      if (!storageKey) return;

      // Load existing settings
      const saved = localStorage.getItem(storageKey);
      const existing = saved ? JSON.parse(saved) : { cpu: {}, memory: {}, disk: {} };

      // Check if settings are linked
      const linkSettingsKey = `metrics-chart-link-settings-${agentId}`;
      const isLinked = localStorage.getItem(linkSettingsKey) === 'true';

      if (isLinked) {
        // Apply to all resource types
        existing.cpu = { ...existing.cpu, ...updates };
        existing.memory = { ...existing.memory, ...updates };
        existing.disk = { ...existing.disk, ...updates };
      } else {
        // Apply only to current resource type
        existing[resourceType] = { ...existing[resourceType], ...updates };
      }

      localStorage.setItem(storageKey, JSON.stringify(existing));
    } catch (error) {
      console.error('Failed to save chart settings to localStorage:', error);
    }
  }, [agentId, resourceType]);

  // Load initial settings from localStorage or use defaults
  const savedSettings = loadSettingsFromStorage();

  // Chart display type
  const [chartDisplayType, setChartDisplayType] = useState<ChartDisplayType>(
    savedSettings?.chartDisplayType || 'heiken-ashi'
  );

  // Candlestick period (in minutes)
  const [candlestickPeriod, setCandlestickPeriod] = useState<number>(
    savedSettings?.candlestickPeriod || 15
  );

  // Averaging mode
  const [averagingMode, setAveragingMode] = useState<AveragingMode>(
    savedSettings?.averagingMode || 'moving'
  );
  const [windowSize, setWindowSize] = useState<number>(
    savedSettings?.windowSize || 20
  );
  const [bandMode, setBandMode] = useState<BandMode>(
    savedSettings?.bandMode || 'dynamic'
  );

  // Time window selection (default to 2 days = 48 hours)
  const [selectedTimeWindow, setSelectedTimeWindow] = useState<number>(
    savedSettings?.selectedTimeWindow || 48
  );

  // Y-axis autofitting (default to enabled)
  const [autoFitYAxis, setAutoFitYAxis] = useState<boolean>(
    savedSettings?.autoFitYAxis !== undefined ? savedSettings.autoFitYAxis : true
  );

  // Anomaly navigation state
  const [anomalyNavigationExpanded, setAnomalyNavigationExpanded] = useState<boolean>(false);
  const [anomalySeverityFilter, setAnomalySeverityFilter] = useState<'all' | 'severe'>('all');
  const [currentAnomalyIndex, setCurrentAnomalyIndex] = useState<number>(0);
  const [highlightedAnomalyTimestamp, setHighlightedAnomalyTimestamp] = useState<string | null>(null);

  // Zoom state (load from saved settings)
  const [currentZoom, setCurrentZoom] = useState<{ start: number; end: number } | null>(
    savedSettings?.currentZoom || null
  );
  const [isInitialRender, setIsInitialRender] = useState<boolean>(true);

  // Zoom debouncing ref
  const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Technical indicators state
  const [activeIndicators, setActiveIndicators] = useState<ActiveIndicators>(
    savedSettings?.activeIndicators || {
      sma20: true,
      bb: true,
    }
  );
  const [showIndicatorsMenu, setShowIndicatorsMenu] = useState(false);

  // Refs for indicators button and dropdown
  const indicatorsButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Dropdown position state
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);

  // Oscillator panel heights
  const [oscillatorHeights, setOscillatorHeights] = useState<OscillatorHeights>({
    main: 60,
    rsi: 0,
    macd: 0,
    stochastic: 0,
    williamsR: 0,
    roc: 0,
    atr: 0,
  });

  // Dragging state for resize handles
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef<number>(0);

  // Chart height state
  const [chartHeight, setChartHeight] = useState(
    savedSettings?.chartHeight || initialHeight
  );

  // Save settings to localStorage whenever they change
  useEffect(() => {
    if (!agentId || !resourceType) return;

    saveSettingsToStorage({
      chartDisplayType,
      candlestickPeriod,
      averagingMode,
      windowSize,
      bandMode,
      selectedTimeWindow,
      autoFitYAxis,
      activeIndicators,
      chartHeight,
      currentZoom,
    });
  }, [
    chartDisplayType,
    candlestickPeriod,
    averagingMode,
    windowSize,
    bandMode,
    selectedTimeWindow,
    autoFitYAxis,
    activeIndicators,
    chartHeight,
    currentZoom,
    saveSettingsToStorage,
    agentId,
    resourceType,
  ]);

  // Reset function to restore all defaults
  const resetToDefaults = () => {
    setChartDisplayType('heiken-ashi');
    setCandlestickPeriod(15);
    setAveragingMode('moving');
    setWindowSize(20);
    setBandMode('dynamic');
    setSelectedTimeWindow(48); // 2 days
    setAutoFitYAxis(true);
    setActiveIndicators({
      sma20: true,
      bb: true,
    });
    setCurrentZoom(null);
    setChartHeight(initialHeight);
    setOscillatorHeights({
      main: 60,
      rsi: 0,
      macd: 0,
      stochastic: 0,
      williamsR: 0,
      roc: 0,
      atr: 0,
    });
  };

  return {
    // Display settings
    chartDisplayType,
    setChartDisplayType,
    candlestickPeriod,
    setCandlestickPeriod,

    // Averaging settings
    averagingMode,
    setAveragingMode,
    windowSize,
    setWindowSize,
    bandMode,
    setBandMode,

    // Time window
    selectedTimeWindow,
    setSelectedTimeWindow,

    // Y-axis
    autoFitYAxis,
    setAutoFitYAxis,

    // Anomaly navigation
    anomalyNavigationExpanded,
    setAnomalyNavigationExpanded,
    anomalySeverityFilter,
    setAnomalySeverityFilter,
    currentAnomalyIndex,
    setCurrentAnomalyIndex,
    highlightedAnomalyTimestamp,
    setHighlightedAnomalyTimestamp,

    // Zoom
    currentZoom,
    setCurrentZoom,
    isInitialRender,
    setIsInitialRender,
    zoomTimeoutRef,

    // Indicators
    activeIndicators,
    setActiveIndicators,
    showIndicatorsMenu,
    setShowIndicatorsMenu,
    indicatorsButtonRef,
    dropdownRef,
    dropdownPosition,
    setDropdownPosition,

    // Oscillators
    oscillatorHeights,
    setOscillatorHeights,

    // Resize
    isDragging,
    setIsDragging,
    chartContainerRef,
    dragOffsetRef,

    // Chart dimensions
    chartHeight,
    setChartHeight,

    // Reset
    resetToDefaults,
  };
};
