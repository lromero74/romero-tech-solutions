import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ReactECharts from 'echarts-for-react';
import { format } from 'date-fns';
import { ZoomIn, ZoomOut, Maximize2, Clock, BarChart2, LineChart as LineChartIcon, Expand, ChevronLeft, ChevronRight, Filter, TrendingUp } from 'lucide-react';
import {
  calculateStats,
  prepareChartData,
  formatRateOfChange,
  detectAnomalies,
  type MetricDataPoint,
  type AveragingMode,
  type BandMode,
} from '../../utils/metricsStats';
import { themeClasses, useTheme } from '../../contexts/ThemeContext';
import type { ActiveIndicators, ChartDisplayType, CandlestickDataPoint } from '../../types/chartTypes';
import {
  calculateAllTechnicalIndicators,
  calculateCandleIndicators,
} from '../../utils/technicalIndicators';
import {
  buildGrids,
  buildXAxes,
  buildYAxes,
  buildBaseConfig,
} from '../../utils/chartConfigBuilders';
import {
  buildLineChartSeries,
  buildCandlestickSeries,
  buildHeikenAshiSeries,
  buildOscillatorSeries,
} from '../../utils/chartSeriesBuilders';

interface MetricsChartEChartsProps {
  data: MetricDataPoint[];
  title: string;
  dataKey: string;
  unit: string;
  color?: string;
  showStdDev?: boolean;
  showRateOfChange?: boolean;
  height?: number;
}

const MetricsChartECharts: React.FC<MetricsChartEChartsProps> = ({
  data,
  title,
  dataKey,
  unit,
  color = '#3b82f6',
  showStdDev = true,
  showRateOfChange = true,
  height = 300,
}) => {
  const { isDark } = useTheme();

  // State for chart display type
  const [chartDisplayType, setChartDisplayType] = useState<ChartDisplayType>('heiken-ashi');

  // State for candlestick period (in minutes)
  const [candlestickPeriod, setCandlestickPeriod] = useState<number>(15);

  // State for averaging mode
  const [averagingMode, setAveragingMode] = useState<AveragingMode>('moving');
  const [windowSize, setWindowSize] = useState<number>(20);
  const [bandMode, setBandMode] = useState<BandMode>('dynamic');

  // State for time window selection (default to 1 day = 24 hours)
  const [selectedTimeWindow, setSelectedTimeWindow] = useState<number>(24);

  // State for Y-axis autofitting (default to enabled)
  const [autoFitYAxis, setAutoFitYAxis] = useState<boolean>(true);

  // Anomaly navigation state
  const [anomalyNavigationExpanded, setAnomalyNavigationExpanded] = useState<boolean>(false);
  const [anomalySeverityFilter, setAnomalySeverityFilter] = useState<'all' | 'severe'>('all');
  const [currentAnomalyIndex, setCurrentAnomalyIndex] = useState<number>(0);
  const [highlightedAnomalyTimestamp, setHighlightedAnomalyTimestamp] = useState<string | null>(null);

  // State to track current zoom position (preserve across chart type changes)
  const [currentZoom, setCurrentZoom] = useState<{ start: number; end: number } | null>(null);
  const [isInitialRender, setIsInitialRender] = useState<boolean>(true);

  // Ref for debouncing zoom updates
  const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Technical indicators state
  const [activeIndicators, setActiveIndicators] = useState<ActiveIndicators>({
    sma20: true,
    bb: true,
  });
  const [showIndicatorsMenu, setShowIndicatorsMenu] = useState(false);

  // Ref for indicators button to calculate dropdown position
  const indicatorsButtonRef = useRef<HTMLButtonElement>(null);

  // Ref for the dropdown menu itself (for click-outside detection)
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Dropdown position state (for portal positioning)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; right: number } | null>(null);

  // Oscillator panel heights (as percentages of total chart height)
  const [oscillatorHeights, setOscillatorHeights] = useState({
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
  // Store the initial offset between mouse and handle position when drag starts
  const dragOffsetRef = useRef<number>(0);

  // Chart height state (can be resized by user)
  const [chartHeight, setChartHeight] = useState(height);

  // Validate and normalize data
  const validatedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const validPoints: MetricDataPoint[] = [];

    data.forEach((point) => {
      let value = point.value;

      // For percentage metrics, ensure values are in 0-100 range
      if (unit === '%') {
        if (value > 100 || value < 0 || !isFinite(value)) {
          return; // Skip invalid data points
        }
      }

      validPoints.push({
        timestamp: point.timestamp,
        value: value
      });
    });

    return validPoints;
  }, [data, unit]);

  // Calculate statistics
  const stats = useMemo(() => {
    if (!validatedData || validatedData.length === 0) return null;
    return calculateStats(validatedData, averagingMode, windowSize, bandMode);
  }, [validatedData, averagingMode, windowSize, bandMode]);

  // Detect anomalies
  const anomalies = useMemo(() => {
    if (!stats) return [];
    return detectAnomalies(validatedData, stats);
  }, [validatedData, stats]);

  // Filter anomalies based on severity filter
  const filteredAnomalies = useMemo(() => {
    if (anomalySeverityFilter === 'severe') {
      return anomalies.filter(a => a.severity === 'severe');
    }
    return anomalies;
  }, [anomalies, anomalySeverityFilter]);

  // Prepare chart data with statistical overlays
  const chartData = useMemo(() => {
    if (!stats) return [];
    return prepareChartData(validatedData, stats, anomalies);
  }, [validatedData, stats, anomalies]);

  // Calculate professional Bollinger Bands for line chart (20-period SMA)
  const bollingerBands = useMemo(() => {
    if (!validatedData || validatedData.length === 0) return [];

    const bbPeriod = 20;
    const bands: any[] = [];

    validatedData.forEach((point, index) => {
      if (index < bbPeriod - 1) {
        // Not enough data for full BB calculation
        bands.push({
          timestamp: point.timestamp,
          sma: point.value,
          upper: point.value,
          lower: point.value,
        });
      } else {
        // Calculate 20-period SMA
        const windowValues = validatedData.slice(index - bbPeriod + 1, index + 1).map(p => p.value);
        const sma = windowValues.reduce((sum, v) => sum + v, 0) / bbPeriod;

        // Calculate standard deviation over the same 20-period window
        const variance = windowValues.reduce((sum, v) => sum + Math.pow(v - sma, 2), 0) / bbPeriod;
        const stdDev = Math.sqrt(variance);

        bands.push({
          timestamp: point.timestamp,
          sma,
          upper: sma + (2 * stdDev),
          lower: sma - (2 * stdDev),
        });
      }
    });

    return bands;
  }, [validatedData]);

  // Calculate technical indicators using extracted functions
  const technicalIndicators = useMemo(() => {
    if (!validatedData || validatedData.length === 0) return null;

    const values = validatedData.map(p => p.value);
    const timestamps = validatedData.map(p => new Date(p.timestamp).getTime());

    return calculateAllTechnicalIndicators(values, timestamps);
  }, [validatedData]);

  // Aggregate data into candlesticks for candlestick display
  const candlestickData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];

    const periodMs = candlestickPeriod * 60 * 1000;
    const bucketMap = new Map<number, typeof chartData>();

    chartData.forEach(point => {
      const pointTime = new Date(point.timestamp).getTime();
      const bucketStart = Math.floor(pointTime / periodMs) * periodMs;

      if (!bucketMap.has(bucketStart)) {
        bucketMap.set(bucketStart, []);
      }
      bucketMap.get(bucketStart)!.push(point);
    });

    const buckets: any[] = [];
    const sortedBucketStarts = Array.from(bucketMap.keys()).sort((a, b) => a - b);

    sortedBucketStarts.forEach(bucketStart => {
      const bucketData = bucketMap.get(bucketStart)!;
      if (bucketData.length === 0) return;

      const values = bucketData.map(d => d.value);
      const open = values[0];
      const close = values[values.length - 1];
      const high = Math.max(...values);
      const low = Math.min(...values);
      const timestamp = bucketStart;

      buckets.push({
        timestamp,
        value: [open, close, low, high], // ECharts format: [open, close, low, high]
        close, // Store close for indicator calculations
      });
    });

    return buckets;
  }, [chartData, candlestickPeriod]);

  // Calculate indicators specifically for candlestick data using extracted functions
  const candleIndicators = useMemo(() => {
    if (!candlestickData || candlestickData.length === 0) return null;

    // Convert candlestick data to the format expected by calculateCandleIndicators
    const candlestickDataPoints: CandlestickDataPoint[] = candlestickData.map(candle => ({
      timestamp: candle.timestamp,
      value: candle.value, // Already in [open, close, low, high] format
      close: candle.close,
    }));

    return calculateCandleIndicators(candlestickDataPoints);
  }, [candlestickData]);

  // Calculate Heiken Ashi candles from regular candlestick data
  const heikenAshiData = useMemo(() => {
    if (!candlestickData || candlestickData.length === 0) return [];

    const haCandles: any[] = [];
    let prevHAOpen = candlestickData[0].value[0]; // open
    let prevHAClose = candlestickData[0].value[1]; // close

    candlestickData.forEach((candle, index) => {
      const [open, close, low, high] = candle.value;

      // Heiken Ashi calculations
      const haClose = (open + high + low + close) / 4;
      const haOpen = index === 0 ? open : (prevHAOpen + prevHAClose) / 2;
      const haHigh = Math.max(high, haOpen, haClose);
      const haLow = Math.min(low, haOpen, haClose);

      haCandles.push({
        timestamp: candle.timestamp,
        value: [haOpen, haClose, haLow, haHigh], // ECharts format: [open, close, low, high]
        mean: candle.mean,
        stdDev: candle.stdDev,
        upperBB: candle.upperBB,
        lowerBB: candle.lowerBB,
      });

      // Update previous values for next iteration
      prevHAOpen = haOpen;
      prevHAClose = haClose;
    });

    return haCandles;
  }, [candlestickData]);

  // Calculate initial zoom based on time window
  const initialZoomRange = useMemo(() => {
    if (!chartData || chartData.length === 0) return [0, 100];

    const now = new Date();
    const cutoffTime = new Date(now.getTime() - selectedTimeWindow * 60 * 60 * 1000);

    // Find the index of the first data point within the time window
    let startIndex = 0;
    for (let i = chartData.length - 1; i >= 0; i--) {
      const dataTime = new Date(chartData[i].timestamp);
      if (dataTime >= cutoffTime) {
        startIndex = i;
      } else {
        break;
      }
    }

    const startPercent = (startIndex / chartData.length) * 100;
    return [startPercent, 100];
  }, [chartData, selectedTimeWindow]);

  // Get the zoom range to use (current zoom if available, otherwise initial)
  const activeZoomRange = useMemo(() => {
    if (currentZoom && !isInitialRender) {
      return [currentZoom.start, currentZoom.end];
    }
    return initialZoomRange;
  }, [currentZoom, isInitialRender, initialZoomRange]);

  // Handle time window change - reset zoom
  useEffect(() => {
    setCurrentZoom(null);
    setIsInitialRender(true);
  }, [selectedTimeWindow]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
    };
  }, []);

  // Click-outside detection and scroll handling for dropdown menu
  useEffect(() => {
    if (!showIndicatorsMenu) return;

    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside both button and dropdown
      if (
        indicatorsButtonRef.current &&
        !indicatorsButtonRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowIndicatorsMenu(false);
      }
    };

    const handleScroll = () => {
      // Close dropdown when user scrolls (standard UX pattern)
      setShowIndicatorsMenu(false);
    };

    // Add listener with a small delay to prevent immediate closing
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true); // Use capture to catch all scroll events
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [showIndicatorsMenu]);

  // Adjust oscillator heights when indicators are toggled
  useEffect(() => {
    const hasRSI = activeIndicators.rsi === true;
    const hasMACD = activeIndicators.macd === true;
    const hasStochastic = activeIndicators.stochastic === true;
    const hasWilliamsR = activeIndicators.williamsR === true;
    const hasROC = activeIndicators.roc === true;
    const hasATR = activeIndicators.atr === true;

    const oscillatorCount =
      (hasRSI ? 1 : 0) +
      (hasMACD ? 1 : 0) +
      (hasStochastic ? 1 : 0) +
      (hasWilliamsR ? 1 : 0) +
      (hasROC ? 1 : 0) +
      (hasATR ? 1 : 0);

    // Calculate dynamic heights based on number of oscillators
    let mainHeight = 92; // Default when no oscillators
    let oscillatorHeight = 0;

    if (oscillatorCount > 0) {
      // Reserve 8% for slider, distribute remaining space
      const availableSpace = 92; // Total available (100% - 8% for slider)

      if (oscillatorCount === 1) {
        mainHeight = 70;
        oscillatorHeight = 30;
      } else if (oscillatorCount === 2) {
        mainHeight = 60;
        oscillatorHeight = 20;
      } else if (oscillatorCount === 3) {
        mainHeight = 55;
        oscillatorHeight = 15;
      } else if (oscillatorCount === 4) {
        mainHeight = 50;
        oscillatorHeight = 12.5;
      } else if (oscillatorCount === 5) {
        mainHeight = 45;
        oscillatorHeight = 11;
      } else if (oscillatorCount === 6) {
        mainHeight = 40;
        oscillatorHeight = 10;
      }
    }

    setOscillatorHeights({
      main: mainHeight,
      rsi: hasRSI ? oscillatorHeight : 0,
      macd: hasMACD ? oscillatorHeight : 0,
      stochastic: hasStochastic ? oscillatorHeight : 0,
      williamsR: hasWilliamsR ? oscillatorHeight : 0,
      roc: hasROC ? oscillatorHeight : 0,
      atr: hasATR ? oscillatorHeight : 0,
    });
  }, [
    activeIndicators.rsi,
    activeIndicators.macd,
    activeIndicators.stochastic,
    activeIndicators.williamsR,
    activeIndicators.roc,
    activeIndicators.atr
  ]);

  // Handle resize dragging
  const handleResizeMouseDown = (panelName: string) => (e: React.MouseEvent) => {
    e.preventDefault();

    const container = chartContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;

    // Calculate the handle's current position (in pixels)
    let handleY = 0;
    if (panelName === 'main-rsi') {
      handleY = (oscillatorHeights.main / 100) * rect.height;
    } else if (panelName === 'rsi-macd') {
      handleY = ((oscillatorHeights.main + oscillatorHeights.rsi) / 100) * rect.height;
    } else if (panelName === 'card-height') {
      handleY = rect.height; // Bottom of container
    }

    // Store the offset between mouse position and handle position
    dragOffsetRef.current = mouseY - handleY;

    setIsDragging(panelName);
  };

  useEffect(() => {
    if (!isDragging || !chartContainerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = chartContainerRef.current;
      if (!container) return;

      const hasRSI = activeIndicators.rsi === true;
      const hasMACD = activeIndicators.macd === true;

      if (isDragging === 'card-height') {
        // Resizing the entire card height
        const rect = container.getBoundingClientRect();
        // Apply the stored offset to maintain grab point
        const adjustedMouseY = e.clientY - rect.top - dragOffsetRef.current;
        const newHeight = Math.max(200, Math.min(1000, adjustedMouseY));
        setChartHeight(newHeight);
        return;
      }

      const rect = container.getBoundingClientRect();
      // Apply the stored offset to maintain grab point
      const adjustedMouseY = e.clientY - rect.top - dragOffsetRef.current;
      const percentY = (adjustedMouseY / rect.height) * 100;

      if (isDragging === 'main-rsi' && hasRSI) {
        // Dragging between main and RSI
        const newMainHeight = Math.max(30, Math.min(70, percentY));
        const remaining = 100 - newMainHeight;

        if (hasMACD) {
          // Keep MACD at minimum 10%, distribute rest between main and RSI
          const macdHeight = Math.max(10, oscillatorHeights.macd);
          const rsiHeight = Math.max(10, remaining - macdHeight);
          setOscillatorHeights({
            main: newMainHeight,
            rsi: rsiHeight,
            macd: macdHeight,
          });
        } else {
          setOscillatorHeights({
            ...oscillatorHeights,
            main: newMainHeight,
            rsi: remaining,
          });
        }
      } else if (isDragging === 'rsi-macd' && hasRSI && hasMACD) {
        // Dragging between RSI and MACD
        const mainHeight = oscillatorHeights.main;
        const rsiTop = mainHeight;
        const relativeY = percentY - rsiTop;
        const availableHeight = 100 - mainHeight;

        const newRSIHeight = Math.max(10, Math.min(availableHeight - 10, relativeY));
        const newMACDHeight = Math.max(10, availableHeight - newRSIHeight);

        setOscillatorHeights({
          main: mainHeight,
          rsi: newRSIHeight,
          macd: newMACDHeight,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, oscillatorHeights, activeIndicators]);

  // Detect gaps in data for visual indicators (always use raw data for gap detection)
  const dataGaps = useMemo(() => {
    // Always use raw chartData for gap detection, regardless of display mode
    // This ensures we see gaps in the underlying data even when displayed as candles
    if (!chartData || chartData.length < 2) return [];

    const gaps: Array<{ start: number; end: number }> = [];
    const sortedData = [...chartData].sort((a, b) => {
      const aTime = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime();
      const bTime = typeof b.timestamp === 'number' ? b.timestamp : new Date(b.timestamp).getTime();
      return aTime - bTime;
    });

    // Calculate expected interval from first few points
    const time0 = typeof sortedData[0].timestamp === 'number' ? sortedData[0].timestamp : new Date(sortedData[0].timestamp).getTime();
    const time1 = typeof sortedData[1].timestamp === 'number' ? sortedData[1].timestamp : new Date(sortedData[1].timestamp).getTime();
    const expectedInterval = time1 - time0;

    console.log(`🔍 [${chartDisplayType}] Gap detection - Expected interval: ${(expectedInterval / 60000).toFixed(1)}min, Data points: ${sortedData.length}`);

    // Detect gaps - if there's more than 3x the expected interval between points
    for (let i = 1; i < sortedData.length; i++) {
      const prevTime = typeof sortedData[i - 1].timestamp === 'number'
        ? sortedData[i - 1].timestamp
        : new Date(sortedData[i - 1].timestamp).getTime();
      const currTime = typeof sortedData[i].timestamp === 'number'
        ? sortedData[i].timestamp
        : new Date(sortedData[i].timestamp).getTime();
      const interval = currTime - prevTime;

      // If gap is more than 3x expected interval, mark it (excluding the data points themselves)
      if (interval > expectedInterval * 3) {
        gaps.push({
          start: prevTime,
          end: currTime,
        });
      }
    }

    return gaps;
  }, [chartData, chartDisplayType]);

  // ECharts option configuration
  const option = useMemo(() => {
    if (!stats || !chartData || chartData.length === 0) return {};

    const timestamps = chartData.map(d => new Date(d.timestamp).getTime());

    // Calculate grid layout based on active oscillators
    const activeOscillators = [
      { key: 'rsi', active: activeIndicators.rsi === true, height: oscillatorHeights.rsi },
      { key: 'macd', active: activeIndicators.macd === true, height: oscillatorHeights.macd },
      { key: 'stochastic', active: activeIndicators.stochastic === true, height: oscillatorHeights.stochastic },
      { key: 'williamsR', active: activeIndicators.williamsR === true, height: oscillatorHeights.williamsR },
      { key: 'roc', active: activeIndicators.roc === true, height: oscillatorHeights.roc },
      { key: 'atr', active: activeIndicators.atr === true, height: oscillatorHeights.atr },
    ].filter(osc => osc.active);

    const oscillatorCount = activeOscillators.length;
    const sliderBottom = 10;

    // Build grids array dynamically
    const grids: any[] = [
      {
        left: 60,
        right: 20,
        top: 20,
        bottom: oscillatorCount === 0 ? 80 : `${100 - oscillatorHeights.main}%`,
        containLabel: false,
      },
    ];

    // Add oscillator grids dynamically
    let cumulativeTop = oscillatorHeights.main;
    activeOscillators.forEach((osc, index) => {
      const isLast = index === activeOscillators.length - 1;
      grids.push({
        left: 60,
        right: 20,
        top: `${cumulativeTop}%`,
        height: isLast ? `${osc.height - 8}%` : `${osc.height}%`, // -8% for slider space on last panel
        containLabel: false,
      });
      cumulativeTop += osc.height;
    });

    // Build xAxis array dynamically
    const xAxes: any[] = [
      {
        type: 'time',
        gridIndex: 0,
        boundaryGap: (chartDisplayType === 'candlestick' || chartDisplayType === 'heiken-ashi') ? ['2%', '2%'] : ['0%', '0%'],
        axisLine: {
          lineStyle: {
            color: isDark ? '#4b5563' : '#d1d5db',
          },
        },
        axisLabel: {
          color: isDark ? '#9ca3af' : '#6b7280',
          fontSize: 12,
          formatter: (value: number) => format(new Date(value), 'HH:mm'),
        },
        splitLine: {
          show: false,
        },
      },
    ];

    // Add xAxis for each oscillator dynamically
    activeOscillators.forEach((osc, index) => {
      const isLast = index === activeOscillators.length - 1;
      xAxes.push({
        type: 'time',
        gridIndex: index + 1,
        boundaryGap: (chartDisplayType === 'candlestick' || chartDisplayType === 'heiken-ashi') ? ['2%', '2%'] : ['0%', '0%'],
        axisLine: {
          lineStyle: {
            color: isDark ? '#4b5563' : '#d1d5db',
          },
        },
        axisLabel: {
          show: isLast, // Only show labels on bottom-most panel
          color: isDark ? '#9ca3af' : '#6b7280',
          fontSize: 12,
          formatter: (value: number) => format(new Date(value), 'HH:mm'),
        },
        splitLine: {
          show: false,
        },
      });
    });

    // Build yAxis array dynamically
    const yAxes: any[] = [
      {
        type: 'value',
        gridIndex: 0,
        scale: true,
        axisLine: {
          lineStyle: {
            color: isDark ? '#4b5563' : '#d1d5db',
          },
        },
        axisLabel: {
          color: isDark ? '#9ca3af' : '#6b7280',
          fontSize: 12,
          formatter: (value: number) => `${value.toFixed(1)}${unit}`,
        },
        splitLine: {
          lineStyle: {
            color: isDark ? '#374151' : '#e5e7eb',
            type: 'dashed',
          },
        },
      },
    ];

    // Add yAxis for each oscillator dynamically with appropriate ranges
    activeOscillators.forEach((osc, index) => {
      const config: any = {
        type: 'value',
        gridIndex: index + 1,
        scale: true,
        axisLine: {
          lineStyle: {
            color: isDark ? '#4b5563' : '#d1d5db',
          },
        },
        axisLabel: {
          color: isDark ? '#9ca3af' : '#6b7280',
          fontSize: 10,
        },
        splitLine: {
          lineStyle: {
            color: isDark ? '#374151' : '#e5e7eb',
            type: 'dashed',
          },
        },
      };

      // Set appropriate Y-axis ranges for each indicator type
      if (osc.key === 'rsi' || osc.key === 'stochastic') {
        config.min = 0;
        config.max = 100;
        config.axisLabel.formatter = (value: number) => `${value.toFixed(0)}`;
      } else if (osc.key === 'williamsR') {
        config.min = -100;
        config.max = 0;
        config.axisLabel.formatter = (value: number) => `${value.toFixed(0)}`;
      }
      // MACD, ROC, ATR use auto-scaling (no min/max specified)

      yAxes.push(config);
    });

    // Base configuration
    const baseOption: any = {
      backgroundColor: 'transparent',
      animation: true,
      animationDuration: 300,
      animationEasing: 'cubicOut',
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          animation: false,
          label: {
            backgroundColor: isDark ? '#374151' : '#6b7280',
          },
        },
        backgroundColor: isDark ? '#1f2937' : '#ffffff',
        borderColor: isDark ? '#4b5563' : '#d1d5db',
        textStyle: {
          color: isDark ? '#f3f4f6' : '#1f2937',
          fontSize: 12,
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';

          const timestamp = params[0].axisValue;
          const timeStr = format(new Date(timestamp), 'MMM d, HH:mm');

          let lines = [`<div style="font-weight: bold; margin-bottom: 4px;">${timeStr}</div>`];

          params.forEach((param: any) => {
            if (param.seriesName && param.value != null) {
              const color = param.color;
              const name = param.seriesName;
              const value = Array.isArray(param.value) ? param.value[1] : param.value;

              if (name.includes('Value')) {
                lines.push(`<div style="color: ${color};">${name}: ${value.toFixed(1)}${unit}</div>`);
              } else if (!name.includes('σ') && !name.includes('Mean')) {
                lines.push(`<div style="color: ${color}; opacity: 0.7;">${name}: ${value.toFixed(1)}${unit}</div>`);
              }
            }
          });

          return lines.join('');
        },
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: Array.from({ length: xAxes.length }, (_, i) => i), // Apply to all x-axes
          start: activeZoomRange[0],
          end: activeZoomRange[1],
          zoomOnMouseWheel: 'shift',
          moveOnMouseMove: true,
          moveOnMouseWheel: true,
        },
        {
          type: 'slider',
          xAxisIndex: Array.from({ length: xAxes.length }, (_, i) => i), // Apply to all x-axes
          start: activeZoomRange[0],
          end: activeZoomRange[1],
          height: 30,
          bottom: sliderBottom,
          borderColor: isDark ? '#4b5563' : '#d1d5db',
          fillerColor: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)',
          handleStyle: {
            color: isDark ? '#3b82f6' : '#2563eb',
            borderColor: isDark ? '#60a5fa' : '#3b82f6',
          },
          dataBackground: {
            lineStyle: {
              color: isDark ? '#6b7280' : '#9ca3af',
            },
            areaStyle: {
              color: isDark ? '#374151' : '#e5e7eb',
            },
          },
          textStyle: {
            color: isDark ? '#9ca3af' : '#6b7280',
          },
        },
      ],
    };

    // Line chart mode
    if (chartDisplayType === 'line') {
      const series: any[] = [];

      // Add moving averages
      if (activeIndicators.sma7 && technicalIndicators) {
        const sma7Data = technicalIndicators.timestamps
          .map((t, i) => [t, technicalIndicators.sma7[i]])
          .filter(([t, v]) => !isNaN(v as number));
        console.log('Adding SMA(7) to chart', sma7Data.length, 'valid points');
        series.push({
          name: 'SMA(7)',
          type: 'line',
          data: sma7Data,
          lineStyle: { color: '#f59e0b', width: 1.5 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.sma20 && technicalIndicators) {
        const sma20Data = technicalIndicators.timestamps
          .map((t, i) => [t, technicalIndicators.sma20[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'SMA(20)',
          type: 'line',
          data: sma20Data,
          lineStyle: { color: '#64748b', width: 1.5 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.sma25 && technicalIndicators) {
        const sma25Data = technicalIndicators.timestamps
          .map((t, i) => [t, technicalIndicators.sma25[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'SMA(25)',
          type: 'line',
          data: sma25Data,
          lineStyle: { color: '#10b981', width: 1.5 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.sma99 && technicalIndicators) {
        const sma99Data = technicalIndicators.timestamps
          .map((t, i) => [t, technicalIndicators.sma99[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'SMA(99)',
          type: 'line',
          data: sma99Data,
          lineStyle: { color: '#8b5cf6', width: 1.5 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.ema12 && technicalIndicators) {
        const ema12Data = technicalIndicators.timestamps
          .map((t, i) => [t, technicalIndicators.ema12[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'EMA(12)',
          type: 'line',
          data: ema12Data,
          lineStyle: { color: '#06b6d4', width: 1.5 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.ema26 && technicalIndicators) {
        const ema26Data = technicalIndicators.timestamps
          .map((t, i) => [t, technicalIndicators.ema26[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'EMA(26)',
          type: 'line',
          data: ema26Data,
          lineStyle: { color: '#ec4899', width: 1.5 },
          symbol: 'none',
          smooth: false,
        });
      }

      // Bollinger Bands (TradingView style)
      if (activeIndicators.bb && bollingerBands.length > 0) {
        const bbUpperData = bollingerBands
          .map(bb => [new Date(bb.timestamp).getTime(), bb.upper])
          .filter(([t, v]) => !isNaN(v as number));

        const bbMiddleData = bollingerBands
          .map(bb => [new Date(bb.timestamp).getTime(), bb.sma])
          .filter(([t, v]) => !isNaN(v as number));

        const bbLowerData = bollingerBands
          .map(bb => [new Date(bb.timestamp).getTime(), bb.lower])
          .filter(([t, v]) => !isNaN(v as number));

        // TradingView standard: all three lines same color and style
        const bbColor = '#2962FF';
        const bbWidth = 1;

        // Add smooth fill area between upper and lower bands using stack
        // First invisible series to establish baseline at lower band
        series.push({
          name: 'BB Base',
          type: 'line',
          data: bbLowerData,
          lineStyle: { opacity: 0 },
          areaStyle: { opacity: 0 },
          stack: 'bb-fill',
          symbol: 'none',
          smooth: true,
          z: 0,
        });

        // Second series: difference between upper and lower (stacked on top of lower)
        const bbDiffData = bollingerBands
          .map(bb => [new Date(bb.timestamp).getTime(), bb.upper - bb.lower])
          .filter(([t, v]) => !isNaN(v as number));

        series.push({
          name: 'BB Fill',
          type: 'line',
          data: bbDiffData,
          lineStyle: { opacity: 0 },
          areaStyle: {
            color: 'rgba(41, 98, 255, 0.15)',
          },
          stack: 'bb-fill',
          symbol: 'none',
          smooth: true,
          z: 0,
        });

        series.push({
          name: 'BB Upper',
          type: 'line',
          data: bbUpperData,
          lineStyle: { color: bbColor, width: bbWidth },
          symbol: 'none',
          smooth: true,
        });

        series.push({
          name: 'BB Middle',
          type: 'line',
          data: bbMiddleData,
          lineStyle: { color: bbColor, width: bbWidth },
          symbol: 'none',
          smooth: true,
        });

        series.push({
          name: 'BB Lower',
          type: 'line',
          data: bbLowerData,
          lineStyle: { color: bbColor, width: bbWidth },
          symbol: 'none',
          smooth: true,
        });
      }

      // Main data line
      series.push({
        name: dataKey,
        type: 'line',
        data: validatedData.map(point => [new Date(point.timestamp).getTime(), point.value]),
        lineStyle: { color: color, width: 2 },
        symbol: 'none',
        smooth: false,
        z: 10, // Ensure data line is on top
      });

      baseOption.series = series;
    }
    // Candlestick mode
    else if (chartDisplayType === 'candlestick') {
      const candleTimestamps = candlestickData.map(d => d.timestamp);
      const series: any[] = [];

      // Add indicators first (so they're behind candles) - using candleIndicators for smooth lines
      if (activeIndicators.sma7 && candleIndicators) {
        const sma7Data = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.sma7[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'SMA(7)',
          type: 'line',
          data: sma7Data,
          lineStyle: { color: '#f59e0b', width: 2 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.sma20 && candleIndicators) {
        const sma20Data = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.sma20[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'SMA(20)',
          type: 'line',
          data: sma20Data,
          lineStyle: { color: '#64748b', width: 2 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.sma25 && candleIndicators) {
        const sma25Data = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.sma25[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'SMA(25)',
          type: 'line',
          data: sma25Data,
          lineStyle: { color: '#10b981', width: 2 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.sma99 && candleIndicators) {
        const sma99Data = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.sma99[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'SMA(99)',
          type: 'line',
          data: sma99Data,
          lineStyle: { color: '#8b5cf6', width: 2 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.ema12 && candleIndicators) {
        const ema12Data = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.ema12[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'EMA(12)',
          type: 'line',
          data: ema12Data,
          lineStyle: { color: '#06b6d4', width: 2 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.ema26 && candleIndicators) {
        const ema26Data = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.ema26[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'EMA(26)',
          type: 'line',
          data: ema26Data,
          lineStyle: { color: '#ec4899', width: 2 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.bb && candleIndicators) {
        const bbUpperData = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.bb.upper[i]])
          .filter(([t, v]) => !isNaN(v as number));

        const bbMiddleData = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.bb.middle[i]])
          .filter(([t, v]) => !isNaN(v as number));

        const bbLowerData = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.bb.lower[i]])
          .filter(([t, v]) => !isNaN(v as number));

        // TradingView standard: all three lines same color and style
        const bbColor = '#2962FF';
        const bbWidth = 1;

        // Add smooth fill area between upper and lower bands using stack
        // First invisible series to establish baseline at lower band
        series.push({
          name: 'BB Base',
          type: 'line',
          data: bbLowerData,
          lineStyle: { opacity: 0 },
          areaStyle: { opacity: 0 },
          stack: 'bb-fill',
          symbol: 'none',
          smooth: false,
          z: 0,
        });

        // Second series: difference between upper and lower (stacked on top of lower)
        const bbDiffData = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.bb.upper[i] - candleIndicators.bb.lower[i]])
          .filter(([t, v]) => !isNaN(v as number));

        series.push({
          name: 'BB Fill',
          type: 'line',
          data: bbDiffData,
          lineStyle: { opacity: 0 },
          areaStyle: {
            color: 'rgba(41, 98, 255, 0.15)',
          },
          stack: 'bb-fill',
          symbol: 'none',
          smooth: false,
          z: 0,
        });

        series.push({
          name: 'BB Upper',
          type: 'line',
          data: bbUpperData,
          lineStyle: { color: bbColor, width: bbWidth },
          symbol: 'none',
          smooth: false,
        });

        series.push({
          name: 'BB Middle',
          type: 'line',
          data: bbMiddleData,
          lineStyle: { color: bbColor, width: bbWidth },
          symbol: 'none',
          smooth: false,
        });

        series.push({
          name: 'BB Lower',
          type: 'line',
          data: bbLowerData,
          lineStyle: { color: bbColor, width: bbWidth },
          symbol: 'none',
          smooth: false,
        });
      }

      // Candlesticks on top
      series.push({
        name: dataKey,
        type: 'candlestick',
        data: candleTimestamps.map((t, i) => [t, ...candlestickData[i].value]),
        itemStyle: {
          color: isDark ? '#22c55e' : '#16a34a',
          color0: isDark ? '#ef4444' : '#dc2626',
          borderColor: isDark ? '#16a34a' : '#15803d',
          borderColor0: isDark ? '#dc2626' : '#b91c1c',
        },
        z: 10, // Ensure candles are on top
      });

      baseOption.series = series;
    }
    // Heiken Ashi mode
    else if (chartDisplayType === 'heiken-ashi') {
      const haTimestamps = heikenAshiData.map(d => d.timestamp);
      const series: any[] = [];

      // Add indicators first (so they're behind candles) - using candleIndicators for smooth lines
      if (activeIndicators.sma7 && candleIndicators) {
        const sma7Data = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.sma7[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'SMA(7)',
          type: 'line',
          data: sma7Data,
          lineStyle: { color: '#f59e0b', width: 2 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.sma20 && candleIndicators) {
        const sma20Data = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.sma20[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'SMA(20)',
          type: 'line',
          data: sma20Data,
          lineStyle: { color: '#64748b', width: 2 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.sma25 && candleIndicators) {
        const sma25Data = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.sma25[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'SMA(25)',
          type: 'line',
          data: sma25Data,
          lineStyle: { color: '#10b981', width: 2 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.sma99 && candleIndicators) {
        const sma99Data = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.sma99[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'SMA(99)',
          type: 'line',
          data: sma99Data,
          lineStyle: { color: '#8b5cf6', width: 2 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.ema12 && candleIndicators) {
        const ema12Data = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.ema12[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'EMA(12)',
          type: 'line',
          data: ema12Data,
          lineStyle: { color: '#06b6d4', width: 2 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.ema26 && candleIndicators) {
        const ema26Data = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.ema26[i]])
          .filter(([t, v]) => !isNaN(v as number));
        series.push({
          name: 'EMA(26)',
          type: 'line',
          data: ema26Data,
          lineStyle: { color: '#ec4899', width: 2 },
          symbol: 'none',
          smooth: false,
        });
      }

      if (activeIndicators.bb && candleIndicators) {
        const bbUpperData = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.bb.upper[i]])
          .filter(([t, v]) => !isNaN(v as number));

        const bbMiddleData = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.bb.middle[i]])
          .filter(([t, v]) => !isNaN(v as number));

        const bbLowerData = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.bb.lower[i]])
          .filter(([t, v]) => !isNaN(v as number));

        // TradingView standard: all three lines same color and style
        const bbColor = '#2962FF';
        const bbWidth = 1;

        // Add smooth fill area between upper and lower bands using stack
        // First invisible series to establish baseline at lower band
        series.push({
          name: 'BB Base',
          type: 'line',
          data: bbLowerData,
          lineStyle: { opacity: 0 },
          areaStyle: { opacity: 0 },
          stack: 'bb-fill',
          symbol: 'none',
          smooth: false,
          z: 0,
        });

        // Second series: difference between upper and lower (stacked on top of lower)
        const bbDiffData = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.bb.upper[i] - candleIndicators.bb.lower[i]])
          .filter(([t, v]) => !isNaN(v as number));

        series.push({
          name: 'BB Fill',
          type: 'line',
          data: bbDiffData,
          lineStyle: { opacity: 0 },
          areaStyle: {
            color: 'rgba(41, 98, 255, 0.15)',
          },
          stack: 'bb-fill',
          symbol: 'none',
          smooth: false,
          z: 0,
        });

        series.push({
          name: 'BB Upper',
          type: 'line',
          data: bbUpperData,
          lineStyle: { color: bbColor, width: bbWidth },
          symbol: 'none',
          smooth: false,
        });

        series.push({
          name: 'BB Middle',
          type: 'line',
          data: bbMiddleData,
          lineStyle: { color: bbColor, width: bbWidth },
          symbol: 'none',
          smooth: false,
        });

        series.push({
          name: 'BB Lower',
          type: 'line',
          data: bbLowerData,
          lineStyle: { color: bbColor, width: bbWidth },
          symbol: 'none',
          smooth: false,
        });
      }

      // Heiken Ashi candles on top
      series.push({
        name: dataKey,
        type: 'candlestick',
        data: haTimestamps.map((t, i) => [t, ...heikenAshiData[i].value]),
        itemStyle: {
          color: isDark ? '#22c55e' : '#16a34a',
          color0: isDark ? '#ef4444' : '#dc2626',
          borderColor: isDark ? '#16a34a' : '#15803d',
          borderColor0: isDark ? '#dc2626' : '#b91c1c',
        },
        z: 10, // Ensure candles are on top
      });

      baseOption.series = series;
    }

    // Add oscillator panels dynamically
    activeOscillators.forEach((osc, index) => {
      const axisIndex = index + 1; // +1 because main chart is index 0

      if (osc.key === 'rsi' && technicalIndicators) {
        // RSI line (purple)
        const rsiData = technicalIndicators.timestamps
          .map((t, i) => [t, technicalIndicators.rsi[i]])
          .filter(([t, v]) => !isNaN(v as number));

        baseOption.series.push({
          name: 'RSI',
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: rsiData,
          lineStyle: { color: '#a855f7', width: 2 },
          symbol: 'none',
          smooth: false,
        });

        // RSI reference lines (30 oversold, 70 overbought)
        baseOption.series.push({
          name: 'RSI Oversold',
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: technicalIndicators.timestamps.map(t => [t, 30]),
          lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', width: 1, type: 'dashed' },
          symbol: 'none',
          silent: true,
        });

        baseOption.series.push({
          name: 'RSI Overbought',
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: technicalIndicators.timestamps.map(t => [t, 70]),
          lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', width: 1, type: 'dashed' },
          symbol: 'none',
          silent: true,
        });
      }

      if (osc.key === 'macd' && technicalIndicators) {
        // MACD line (blue)
        const macdLineData = technicalIndicators.timestamps
          .map((t, i) => [t, technicalIndicators.macd.macdLine[i]])
          .filter(([t, v]) => !isNaN(v as number));

        baseOption.series.push({
          name: 'MACD',
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: macdLineData,
          lineStyle: { color: '#3b82f6', width: 2 },
          symbol: 'none',
          smooth: false,
        });

        // Signal line (orange)
        const signalLineData = technicalIndicators.timestamps
          .map((t, i) => [t, technicalIndicators.macd.signalLine[i]])
          .filter(([t, v]) => !isNaN(v as number));

        baseOption.series.push({
          name: 'Signal',
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: signalLineData,
          lineStyle: { color: '#f97316', width: 2 },
          symbol: 'none',
          smooth: false,
        });

        // MACD histogram (red/green bars)
        const histogramData = technicalIndicators.timestamps
          .map((t, i) => {
            const val = technicalIndicators.macd.histogram[i];
            return [t, isNaN(val) ? null : val];
          });

        baseOption.series.push({
          name: 'MACD Histogram',
          type: 'bar',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: histogramData,
          itemStyle: {
            color: (params: any) => {
              return params.value[1] >= 0 ? '#22c55e' : '#ef4444';
            },
          },
          barWidth: '60%',
        });

        // Zero line
        baseOption.series.push({
          name: 'MACD Zero',
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: technicalIndicators.timestamps.map(t => [t, 0]),
          lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', width: 1, type: 'solid' },
          symbol: 'none',
          silent: true,
        });
      }

      if (osc.key === 'stochastic' && technicalIndicators) {
        // Stochastic %K line (blue)
        const stochKData = technicalIndicators.timestamps
          .map((t, i) => [t, technicalIndicators.stochastic.k[i]])
          .filter(([t, v]) => !isNaN(v as number));

        baseOption.series.push({
          name: 'Stoch %K',
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: stochKData,
          lineStyle: { color: '#3b82f6', width: 2 },
          symbol: 'none',
          smooth: false,
        });

        // Stochastic %D line (orange)
        const stochDData = technicalIndicators.timestamps
          .map((t, i) => [t, technicalIndicators.stochastic.d[i]])
          .filter(([t, v]) => !isNaN(v as number));

        baseOption.series.push({
          name: 'Stoch %D',
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: stochDData,
          lineStyle: { color: '#f97316', width: 2 },
          symbol: 'none',
          smooth: false,
        });

        // Stochastic reference lines (20 oversold, 80 overbought)
        baseOption.series.push({
          name: 'Stoch Oversold',
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: technicalIndicators.timestamps.map(t => [t, 20]),
          lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', width: 1, type: 'dashed' },
          symbol: 'none',
          silent: true,
        });

        baseOption.series.push({
          name: 'Stoch Overbought',
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: technicalIndicators.timestamps.map(t => [t, 80]),
          lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', width: 1, type: 'dashed' },
          symbol: 'none',
          silent: true,
        });
      }

      if (osc.key === 'williamsR' && technicalIndicators) {
        // Williams %R line (purple)
        const williamsRData = technicalIndicators.timestamps
          .map((t, i) => [t, technicalIndicators.williamsR[i]])
          .filter(([t, v]) => !isNaN(v as number));

        baseOption.series.push({
          name: 'Williams %R',
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: williamsRData,
          lineStyle: { color: '#a855f7', width: 2 },
          symbol: 'none',
          smooth: false,
        });

        // Williams %R reference lines (-20 overbought, -80 oversold)
        baseOption.series.push({
          name: 'Williams Overbought',
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: technicalIndicators.timestamps.map(t => [t, -20]),
          lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', width: 1, type: 'dashed' },
          symbol: 'none',
          silent: true,
        });

        baseOption.series.push({
          name: 'Williams Oversold',
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: technicalIndicators.timestamps.map(t => [t, -80]),
          lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', width: 1, type: 'dashed' },
          symbol: 'none',
          silent: true,
        });
      }

      if (osc.key === 'roc' && technicalIndicators) {
        // ROC line (cyan)
        const rocData = technicalIndicators.timestamps
          .map((t, i) => [t, technicalIndicators.roc[i]])
          .filter(([t, v]) => !isNaN(v as number));

        baseOption.series.push({
          name: 'ROC',
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: rocData,
          lineStyle: { color: '#06b6d4', width: 2 },
          symbol: 'none',
          smooth: false,
        });

        // ROC zero line
        baseOption.series.push({
          name: 'ROC Zero',
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: technicalIndicators.timestamps.map(t => [t, 0]),
          lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', width: 1, type: 'solid' },
          symbol: 'none',
          silent: true,
        });
      }

      if (osc.key === 'atr' && candleIndicators) {
        // ATR line (orange) - requires candlestick data
        const atrData = candleIndicators.timestamps
          .map((t, i) => [t, candleIndicators.atr[i]])
          .filter(([t, v]) => !isNaN(v as number));

        baseOption.series.push({
          name: 'ATR',
          type: 'line',
          xAxisIndex: axisIndex,
          yAxisIndex: axisIndex,
          data: atrData,
          lineStyle: { color: '#f59e0b', width: 2 },
          symbol: 'none',
          smooth: false,
        });
      }
    });

    // Add gap indicators for all chart types
    if (dataGaps.length > 0) {
      console.log(`🔍 [${chartDisplayType}] Detected ${dataGaps.length} gaps:`, dataGaps.map(g => ({
        start: new Date(g.start).toISOString(),
        end: new Date(g.end).toISOString(),
        duration: ((g.end - g.start) / 60000).toFixed(1) + 'min'
      })));
      console.log(`📊 [${chartDisplayType}] Adding gap series to ${baseOption.series.length} existing series`);

      // Add a dedicated series for gap visualization (ensures it renders properly)
      baseOption.series.unshift({
        name: 'Data Gaps',
        type: 'line',
        data: [], // No actual data points
        markArea: {
          silent: true,
          itemStyle: {
            color: 'rgba(239, 68, 68, 0.25)', // Red with 25% opacity
            borderWidth: 0,
          },
          emphasis: {
            disabled: true,
          },
          data: dataGaps.map(gap => [
            {
              xAxis: gap.start,
            },
            {
              xAxis: gap.end,
            },
          ]),
        },
        z: 15, // Render on top of everything for visibility
      });

      console.log(`✅ [${chartDisplayType}] Gap series added, total series: ${baseOption.series.length}`);
    } else {
      console.log(`ℹ️ [${chartDisplayType}] No gaps detected`);
    }

    // Y-axis autofitting (only apply to main chart yAxis, not oscillators)
    if (autoFitYAxis && chartData.length > 0) {
      const values = chartData.map(d => d.value);
      const minVal = Math.min(...values);
      const maxVal = Math.max(...values);
      const buffer = (maxVal - minVal) * 0.1; // 10% buffer
      baseOption.yAxis[0].min = Math.max(0, minVal - buffer);
      baseOption.yAxis[0].max = maxVal + buffer;
    } else {
      // When autoscale is off, show full range 0-100% for percentage metrics
      if (unit === '%') {
        baseOption.yAxis[0].min = 0;
        baseOption.yAxis[0].max = 100;
      }
    }

    return baseOption;
  }, [stats, chartData, candlestickData, heikenAshiData, chartDisplayType, showStdDev, dataKey, unit, isDark, activeZoomRange, candlestickPeriod, anomalies, autoFitYAxis, bollingerBands, validatedData, activeIndicators, technicalIndicators, candleIndicators, color, dataGaps, oscillatorHeights]);

  // Handle chart events - but don't update React state on user zoom actions
  // ECharts maintains its own zoom state internally, and updating React state
  // causes a re-render with the same values, creating a visible "blink"
  // Memoize to ensure stable reference for chartElement memoization
  const onChartEvents = useMemo(() => ({
    dataZoom: (params: any) => {
      // Don't sync zoom state back to React - ECharts handles this internally
      // We only update React state when we programmatically change zoom (e.g., time window buttons)
    },
  }), []);

  // Memoize the chart rendering to prevent re-renders when only dropdown menu state changes
  // This prevents the blink when opening/closing the indicators dropdown
  const chartElement = useMemo(() => (
    <ReactECharts
      option={option}
      style={{ height: `${chartHeight}px` }}
      opts={{ renderer: 'canvas' }}
      notMerge={false}
      lazyUpdate={true}
      onEvents={onChartEvents}
    />
  ), [option, chartHeight, onChartEvents]);

  if (!data || data.length === 0) {
    return (
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
        <h4 className={`text-md font-semibold ${themeClasses.text.primary} mb-4`}>{title}</h4>
        <div className="text-center py-8">
          <p className={themeClasses.text.tertiary}>No data available</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
      {/* Financial Chart Style Header */}
      <div className={`flex items-center justify-between px-4 py-2 border-b ${themeClasses.border.primary}`}>
        <div className="flex items-center gap-4">
          {/* Title and Stats */}
          <div>
            <h4 className={`text-sm font-semibold ${themeClasses.text.primary}`}>
              {title}
            </h4>
            <div className={`text-xs ${themeClasses.text.tertiary}`}>
              Avg: {stats.mean.toFixed(1)}{unit} • σ: {stats.stdDev.toFixed(1)}{unit}
            </div>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          {/* Y-axis autofitting toggle */}
          <button
            onClick={() => setAutoFitYAxis(!autoFitYAxis)}
            className={`p-1.5 rounded transition-colors ${
              autoFitYAxis
                ? 'bg-blue-500 text-white'
                : `${themeClasses.text.muted} hover:${themeClasses.bg.hover}`
            }`}
            title={autoFitYAxis ? 'Auto Scale: ON' : 'Auto Scale: OFF'}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Financial Chart Toolbar */}
      <div className={`flex items-center justify-between px-4 py-2 border-b ${themeClasses.border.primary} ${themeClasses.bg.hover}`}>
        {/* Left: Chart Type Selector */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setChartDisplayType('line')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              chartDisplayType === 'line'
                ? 'bg-blue-500 text-white'
                : `${themeClasses.text.secondary} hover:${themeClasses.bg.card}`
            }`}
          >
            Line
          </button>
          <button
            onClick={() => setChartDisplayType('candlestick')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              chartDisplayType === 'candlestick'
                ? 'bg-blue-500 text-white'
                : `${themeClasses.text.secondary} hover:${themeClasses.bg.card}`
            }`}
          >
            Candles
          </button>
          <button
            onClick={() => setChartDisplayType('heiken-ashi')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              chartDisplayType === 'heiken-ashi'
                ? 'bg-blue-500 text-white'
                : `${themeClasses.text.secondary} hover:${themeClasses.bg.card}`
            }`}
          >
            Heikin
          </button>

          {/* Candlestick period selector */}
          {(chartDisplayType === 'candlestick' || chartDisplayType === 'heiken-ashi') && (
            <>
              <div className={`h-4 w-px ${themeClasses.border.primary} mx-1`}></div>
              <select
                value={candlestickPeriod}
                onChange={(e) => setCandlestickPeriod(Number(e.target.value))}
                className={`text-xs px-2 py-1 rounded border ${themeClasses.border.primary} ${themeClasses.bg.card} ${themeClasses.text.primary}`}
              >
                <option value={15}>15m</option>
                <option value={30}>30m</option>
                <option value={60}>1h</option>
                <option value={240}>4h</option>
                <option value={480}>8h</option>
                <option value={1440}>1d</option>
              </select>
            </>
          )}
        </div>

        {/* Center: Time Range Buttons */}
        <div className="flex items-center gap-1">
          {[
            { label: '1H', value: 1 },
            { label: '4H', value: 4 },
            { label: '12H', value: 12 },
            { label: '1D', value: 24 },
            { label: '2D', value: 48 },
            { label: '1W', value: 168 },
          ].map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setSelectedTimeWindow(value)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                selectedTimeWindow === value
                  ? 'bg-blue-500 text-white'
                  : `${themeClasses.text.secondary} hover:${themeClasses.bg.card}`
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Right: Studies/Indicators */}
        <div className="flex items-center gap-1 relative">
          <button
            ref={indicatorsButtonRef}
            onClick={() => {
              if (!showIndicatorsMenu && indicatorsButtonRef.current) {
                // Calculate dropdown position when opening
                const rect = indicatorsButtonRef.current.getBoundingClientRect();
                setDropdownPosition({
                  top: rect.bottom + 8, // 8px below button
                  left: rect.left,
                  right: window.innerWidth - rect.right,
                });
              }
              setShowIndicatorsMenu(!showIndicatorsMenu);
            }}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
              Object.values(activeIndicators).some(v => v)
                ? 'bg-blue-500 text-white'
                : `${themeClasses.text.secondary} hover:${themeClasses.bg.card}`
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Indicators
          </button>

          {/* Indicators dropdown menu */}
          {showIndicatorsMenu && dropdownPosition && createPortal(
            <div
              ref={dropdownRef}
              className={`fixed z-[60] ${themeClasses.bg.card} ${themeClasses.shadow.lg} rounded-lg border ${themeClasses.border.primary} py-2 min-w-[200px]`}
              style={{
                top: `${dropdownPosition.top}px`,
                right: `${dropdownPosition.right}px`,
              }}
            >
                <div className={`px-3 py-1 text-xs font-semibold ${themeClasses.text.secondary} uppercase`}>
                  Moving Averages
                </div>
                {[
                  { key: 'sma7' as const, label: 'SMA (7)', color: '#f59e0b' },
                  { key: 'sma20' as const, label: 'SMA (20)', color: '#64748b' },
                  { key: 'sma25' as const, label: 'SMA (25)', color: '#10b981' },
                  { key: 'sma99' as const, label: 'SMA (99)', color: '#8b5cf6' },
                  { key: 'ema12' as const, label: 'EMA (12)', color: '#06b6d4' },
                  { key: 'ema26' as const, label: 'EMA (26)', color: '#ec4899' },
                ].map(({ key, label, color }) => (
                  <button
                    key={key}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveIndicators(prev => ({ ...prev, [key]: !prev[key] }));
                    }}
                    className={`w-full px-3 py-1.5 text-xs text-left hover:${themeClasses.bg.hover} flex items-center justify-between ${themeClasses.text.primary}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-0.5 rounded" style={{ backgroundColor: color }}></div>
                      {label}
                    </div>
                    {activeIndicators[key] && (
                      <span className="text-blue-500">✓</span>
                    )}
                  </button>
                ))}

                <div className={`mx-2 my-1 border-t ${themeClasses.border.primary}`}></div>

                <div className={`px-3 py-1 text-xs font-semibold ${themeClasses.text.secondary} uppercase`}>
                  Oscillators
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveIndicators(prev => ({ ...prev, bb: !prev.bb }));
                  }}
                  className={`w-full px-3 py-1.5 text-xs text-left hover:${themeClasses.bg.hover} flex items-center justify-between ${themeClasses.text.primary}`}
                >
                  <span>Bollinger Bands</span>
                  {activeIndicators.bb && (
                    <span className="text-blue-500">✓</span>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveIndicators(prev => ({ ...prev, rsi: !prev.rsi }));
                  }}
                  className={`w-full px-3 py-1.5 text-xs text-left hover:${themeClasses.bg.hover} flex items-center justify-between ${themeClasses.text.primary}`}
                >
                  <span>RSI (14)</span>
                  {activeIndicators.rsi && (
                    <span className="text-blue-500">✓</span>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveIndicators(prev => ({ ...prev, macd: !prev.macd }));
                  }}
                  className={`w-full px-3 py-1.5 text-xs text-left hover:${themeClasses.bg.hover} flex items-center justify-between ${themeClasses.text.primary}`}
                >
                  <span>MACD (12, 26, 9)</span>
                  {activeIndicators.macd && (
                    <span className="text-blue-500">✓</span>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveIndicators(prev => ({ ...prev, stochastic: !prev.stochastic }));
                  }}
                  className={`w-full px-3 py-1.5 text-xs text-left hover:${themeClasses.bg.hover} flex items-center justify-between ${themeClasses.text.primary}`}
                >
                  <span>Stochastic (14, 3, 3)</span>
                  {activeIndicators.stochastic && (
                    <span className="text-blue-500">✓</span>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveIndicators(prev => ({ ...prev, williamsR: !prev.williamsR }));
                  }}
                  className={`w-full px-3 py-1.5 text-xs text-left hover:${themeClasses.bg.hover} flex items-center justify-between ${themeClasses.text.primary}`}
                >
                  <span>Williams %R (14)</span>
                  {activeIndicators.williamsR && (
                    <span className="text-blue-500">✓</span>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveIndicators(prev => ({ ...prev, roc: !prev.roc }));
                  }}
                  className={`w-full px-3 py-1.5 text-xs text-left hover:${themeClasses.bg.hover} flex items-center justify-between ${themeClasses.text.primary}`}
                >
                  <span>ROC (12)</span>
                  {activeIndicators.roc && (
                    <span className="text-blue-500">✓</span>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveIndicators(prev => ({ ...prev, atr: !prev.atr }));
                  }}
                  className={`w-full px-3 py-1.5 text-xs text-left hover:${themeClasses.bg.hover} flex items-center justify-between ${themeClasses.text.primary}`}
                >
                  <span>ATR (14)</span>
                  {activeIndicators.atr && (
                    <span className="text-blue-500">✓</span>
                  )}
                </button>
            </div>,
            document.body
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="relative" ref={chartContainerRef}>
        {chartElement}

        {/* Resize handles */}
        {activeIndicators.rsi && (
          <div
            className={`absolute left-0 right-0 h-1 cursor-row-resize z-50 hover:bg-blue-500 hover:opacity-30 transition-opacity ${
              isDragging === 'main-rsi' ? 'bg-blue-500 opacity-50' : ''
            }`}
            style={{
              top: `${oscillatorHeights.main}%`,
              transform: 'translateY(-50%)',
            }}
            onMouseDown={handleResizeMouseDown('main-rsi')}
          >
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-gray-400 dark:bg-gray-600"></div>
          </div>
        )}

        {activeIndicators.rsi && activeIndicators.macd && (
          <div
            className={`absolute left-0 right-0 h-1 cursor-row-resize z-50 hover:bg-blue-500 hover:opacity-30 transition-opacity ${
              isDragging === 'rsi-macd' ? 'bg-blue-500 opacity-50' : ''
            }`}
            style={{
              top: `${oscillatorHeights.main + oscillatorHeights.rsi}%`,
              transform: 'translateY(-50%)',
            }}
            onMouseDown={handleResizeMouseDown('rsi-macd')}
          >
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-gray-400 dark:bg-gray-600"></div>
          </div>
        )}

        {/* Card height resize handle */}
        <div
          className={`absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize z-50 hover:bg-blue-500 hover:opacity-30 transition-opacity ${
            isDragging === 'card-height' ? 'bg-blue-500 opacity-50' : ''
          }`}
          onMouseDown={handleResizeMouseDown('card-height')}
        >
          <div className="absolute inset-x-0 bottom-1 h-0.5 bg-gray-400 dark:bg-gray-600"></div>
        </div>
      </div>

      {/* Bottom Stats Bar */}
      <div className={`flex items-center justify-between px-4 py-2 border-t ${themeClasses.border.primary} ${themeClasses.bg.hover}`}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className={`text-xs ${themeClasses.text.tertiary}`}>L:</span>
            <span className={`text-xs font-mono ${themeClasses.text.primary}`}>{stats.min.toFixed(1)}{unit}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs ${themeClasses.text.tertiary}`}>H:</span>
            <span className={`text-xs font-mono ${themeClasses.text.primary}`}>{stats.max.toFixed(1)}{unit}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs ${themeClasses.text.tertiary}`}>Range:</span>
            <span className={`text-xs font-mono ${themeClasses.text.primary}`}>{stats.range.toFixed(1)}{unit}</span>
          </div>
        </div>
        <div className={`text-xs ${themeClasses.text.tertiary}`}>
          {showRateOfChange && (
            <span>
              {formatRateOfChange(stats.rateOfChange, unit)} •{' '}
              <span className={
                stats.trend === 'increasing' ? 'text-orange-600' :
                stats.trend === 'decreasing' ? 'text-blue-600' :
                'text-green-600'
              }>
                {stats.trend}
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default MetricsChartECharts;
