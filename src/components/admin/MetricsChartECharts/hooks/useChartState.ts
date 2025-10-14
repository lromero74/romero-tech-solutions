import { useState, useRef } from 'react';
import type { ChartDisplayType, ActiveIndicators, AveragingMode, BandMode, OscillatorHeights, DropdownPosition } from '../types';

export const useChartState = (initialHeight: number) => {
  // Chart display type
  const [chartDisplayType, setChartDisplayType] = useState<ChartDisplayType>('heiken-ashi');

  // Candlestick period (in minutes)
  const [candlestickPeriod, setCandlestickPeriod] = useState<number>(15);

  // Averaging mode
  const [averagingMode, setAveragingMode] = useState<AveragingMode>('moving');
  const [windowSize, setWindowSize] = useState<number>(20);
  const [bandMode, setBandMode] = useState<BandMode>('dynamic');

  // Time window selection (default to 2 days = 48 hours)
  const [selectedTimeWindow, setSelectedTimeWindow] = useState<number>(48);

  // Y-axis autofitting (default to enabled)
  const [autoFitYAxis, setAutoFitYAxis] = useState<boolean>(true);

  // Anomaly navigation state
  const [anomalyNavigationExpanded, setAnomalyNavigationExpanded] = useState<boolean>(false);
  const [anomalySeverityFilter, setAnomalySeverityFilter] = useState<'all' | 'severe'>('all');
  const [currentAnomalyIndex, setCurrentAnomalyIndex] = useState<number>(0);
  const [highlightedAnomalyTimestamp, setHighlightedAnomalyTimestamp] = useState<string | null>(null);

  // Zoom state
  const [currentZoom, setCurrentZoom] = useState<{ start: number; end: number } | null>(null);
  const [isInitialRender, setIsInitialRender] = useState<boolean>(true);

  // Zoom debouncing ref
  const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Technical indicators state
  const [activeIndicators, setActiveIndicators] = useState<ActiveIndicators>({
    sma20: true,
    bb: true,
  });
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
  const [chartHeight, setChartHeight] = useState(initialHeight);

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
