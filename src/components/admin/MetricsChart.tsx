import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
  Scatter,
  Brush,
} from 'recharts';
import { format } from 'date-fns';
import { ZoomIn, ZoomOut, Maximize2, Expand, ChevronLeft, ChevronRight, Filter, Clock, BarChart2, LineChart as LineChartIcon } from 'lucide-react';
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

interface MetricsChartProps {
  data: MetricDataPoint[];
  title: string;
  dataKey: string;
  unit: string;
  color?: string;
  showStdDev?: boolean;
  showRateOfChange?: boolean;
  height?: number;
  initialZoomWindowHours?: number; // Initial zoom window in hours (defaults to showing all data)
  onJumpToNow?: () => void; // Callback to notify parent when "Jump to Now" is clicked
}

const MetricsChart: React.FC<MetricsChartProps> = ({
  data,
  title,
  dataKey,
  unit,
  color = '#3b82f6',
  showStdDev = true,
  showRateOfChange = true,
  height = 300,
  initialZoomWindowHours,
}) => {
  const { isDark } = useTheme();

  // State for chart display type
  type ChartDisplayType = 'line' | 'candlestick' | 'heiken-ashi';
  const [chartDisplayType, setChartDisplayType] = useState<ChartDisplayType>('line');

  // State for candlestick period (in minutes)
  // Default to 30 minutes (6 data points per candle with 5-minute polling)
  const [candlestickPeriod, setCandlestickPeriod] = useState<number>(30);

  // State for averaging mode and window size (default to moving average with 20-point window and dynamic Bollinger Bands)
  const [averagingMode, setAveragingMode] = useState<AveragingMode>('moving');
  const [windowSize, setWindowSize] = useState<number>(20);
  const [bandMode, setBandMode] = useState<BandMode>('dynamic');

  // State for Y-axis autofitting (default to enabled)
  const [autoFitYAxis, setAutoFitYAxis] = useState<boolean>(true);

  // State for time window selection (default to 4 hours)
  const [selectedTimeWindow, setSelectedTimeWindow] = useState<number>(4);

  // Anomaly navigation state
  const [anomalyNavigationExpanded, setAnomalyNavigationExpanded] = useState<boolean>(false);
  const [anomalySeverityFilter, setAnomalySeverityFilter] = useState<'all' | 'severe'>('all');
  const [currentAnomalyIndex, setCurrentAnomalyIndex] = useState<number>(0);
  const [highlightedAnomalyTimestamp, setHighlightedAnomalyTimestamp] = useState<string | null>(null);

  // Zoom and pan state
  const [zoomDomain, setZoomDomain] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [animatedZoomDomain, setAnimatedZoomDomain] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const chartRef = useRef<any>(null);
  const hasInitializedZoom = useRef<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);
  const isInitialMount = useRef<boolean>(true);
  const prevChartDisplayType = useRef<ChartDisplayType>('line');

  // Validate and normalize data (especially for percentages)
  const validatedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const validPoints: MetricDataPoint[] = [];

    data.forEach((point, index) => {
      let value = point.value;

      // For percentage metrics, ensure values are in 0-100 range
      if (unit === '%') {
        // Filter out invalid values (timestamps, negative numbers, etc.)
        if (value > 100 || value < 0 || !isFinite(value)) {
          console.warn(`[MetricsChart] ${title}: Invalid percentage value detected: ${value}, skipping this data point`);
          return; // Skip this data point entirely
        }
      }

      // Only add valid data points
      validPoints.push({
        timestamp: point.timestamp,
        value: value
      });
    });

    return validPoints;
  }, [data, unit, title]);

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

  // Aggregate data into candlesticks (OHLC) for candlestick display using time-based periods
  const candlestickData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];

    // Convert candlestick period to milliseconds
    const periodMs = candlestickPeriod * 60 * 1000;

    // Group data points into time-based buckets
    const bucketMap = new Map<number, typeof chartData>();

    chartData.forEach(point => {
      const pointTime = new Date(point.timestamp).getTime();
      // Round down to nearest period boundary
      const bucketStart = Math.floor(pointTime / periodMs) * periodMs;

      if (!bucketMap.has(bucketStart)) {
        bucketMap.set(bucketStart, []);
      }
      bucketMap.get(bucketStart)!.push(point);
    });

    // Convert buckets to OHLC candlesticks
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
      const timestamp = new Date(bucketStart).toISOString(); // Use bucket start time
      const mean = bucketData[bucketData.length - 1].mean; // Use last mean value in bucket

      // Check if any data point in this bucket is an anomaly
      const hasAnomaly = bucketData.some(d => d.isAnomaly);
      const anomalySeverity = hasAnomaly
        ? bucketData.find(d => d.isAnomaly)?.anomalySeverity
        : undefined;

      // Get standard deviation values from the last data point in the bucket
      const lastPoint = bucketData[bucketData.length - 1];

      buckets.push({
        timestamp,
        open,
        high,
        low,
        close,
        mean,
        isAnomaly: hasAnomaly,
        anomalySeverity,
        // Determine candlestick color based on open/close
        isGreen: close >= open,
        // Keep close as representative value
        value: close,
        // Store period info for debugging
        periodMinutes: candlestickPeriod,
        dataPointCount: bucketData.length,
        // Include standard deviation bands for overlay
        stdDev1Upper: lastPoint.stdDev1Upper,
        stdDev1Lower: lastPoint.stdDev1Lower,
        stdDev2Upper: lastPoint.stdDev2Upper,
        stdDev2Lower: lastPoint.stdDev2Lower,
        stdDev3Upper: lastPoint.stdDev3Upper,
        stdDev3Lower: lastPoint.stdDev3Lower,
      });
    });

    return buckets;
  }, [chartData, candlestickPeriod]);

  // Calculate Heiken Ashi candles from regular candlestick data
  const heikenAshiData = useMemo(() => {
    if (!candlestickData || candlestickData.length === 0) return [];

    const haCandles: any[] = [];
    let prevHAOpen = candlestickData[0].open;
    let prevHAClose = candlestickData[0].close;

    candlestickData.forEach((candle, index) => {
      // Heiken Ashi calculations
      const haClose = (candle.open + candle.high + candle.low + candle.close) / 4;
      const haOpen = index === 0 ? candle.open : (prevHAOpen + prevHAClose) / 2;
      const haHigh = Math.max(candle.high, haOpen, haClose);
      const haLow = Math.min(candle.low, haOpen, haClose);

      haCandles.push({
        timestamp: candle.timestamp,
        open: haOpen,
        high: haHigh,
        low: haLow,
        close: haClose,
        mean: candle.mean,
        isAnomaly: candle.isAnomaly,
        anomalySeverity: candle.anomalySeverity,
        isGreen: haClose >= haOpen,
        value: haClose, // Use HA close as representative value
        periodMinutes: candle.periodMinutes,
        dataPointCount: candle.dataPointCount,
        // Include standard deviation bands
        stdDev1Upper: candle.stdDev1Upper,
        stdDev1Lower: candle.stdDev1Lower,
        stdDev2Upper: candle.stdDev2Upper,
        stdDev2Lower: candle.stdDev2Lower,
        stdDev3Upper: candle.stdDev3Upper,
        stdDev3Lower: candle.stdDev3Lower,
      });

      // Update previous values for next iteration
      prevHAOpen = haOpen;
      prevHAClose = haClose;
    });

    return haCandles;
  }, [candlestickData]);

  // Calculate initial zoom domain based on selected time window
  const initialZoomDomainRef = useRef<{ startIndex: number; endIndex: number } | null>(null);
  const lastSelectedTimeWindowRef = useRef<number>(selectedTimeWindow);

  const calculateInitialZoomDomain = useMemo(() => {
    // If time window changed, clear the cache
    if (lastSelectedTimeWindowRef.current !== selectedTimeWindow) {
      initialZoomDomainRef.current = null;
      lastSelectedTimeWindowRef.current = selectedTimeWindow;
    }

    // If we already calculated it for this window, return the cached value
    if (initialZoomDomainRef.current !== null) {
      return initialZoomDomainRef.current;
    }

    if (!chartData || chartData.length < 2) {
      return null;
    }

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

    // End index is the last data point
    const endIndex = chartData.length - 1;

    // Only set zoom if we have a valid range (at least 2 points difference)
    if (startIndex < endIndex && (endIndex - startIndex) >= 1) {
      const domain = { startIndex, endIndex };
      initialZoomDomainRef.current = domain; // Cache it
      return domain;
    }

    return null;
  }, [chartData, selectedTimeWindow]);

  // Get the active domain (for both display and calculations)
  // Once user has manually set zoom, NEVER fall back to calculateInitialZoomDomain
  const activeDomain = useMemo(() => {
    return animatedZoomDomain || zoomDomain;
  }, [animatedZoomDomain, zoomDomain]);

  // Calculate Y-axis domain with dynamic scaling and buffer
  const yAxisDomain = useMemo(() => {
    // Choose data source based on display type
    const activeData =
      chartDisplayType === 'candlestick' ? candlestickData :
      chartDisplayType === 'heiken-ashi' ? heikenAshiData :
      chartData;

    if (!activeData || activeData.length === 0) {
      return unit === '%' ? [0, 100] : ['auto', 'auto'];
    }

    // If autofit is disabled, use fixed domain
    if (!autoFitYAxis) {
      return unit === '%' ? [0, 100] : ['auto', 'auto'];
    }

    // Get visible data based on active domain
    let visibleData: typeof activeData;

    if (activeDomain) {
      // Validate domain indices are within bounds (use chartData for bounds since zoom is based on it)
      const validStartIndex = Math.max(0, Math.min(activeDomain.startIndex, chartData.length - 1));
      const validEndIndex = Math.max(0, Math.min(activeDomain.endIndex, chartData.length - 1));

      if (validStartIndex >= chartData.length || validEndIndex >= chartData.length) {
        // Indices out of bounds, use all data
        visibleData = activeData;
      } else {
        // Get the timestamp range that will be displayed on X-axis
        const startTime = new Date(chartData[validStartIndex].timestamp).getTime();
        const endTime = new Date(chartData[validEndIndex].timestamp).getTime();

        // Filter data to visible time range
        visibleData = activeData.filter(point => {
          const pointTime = new Date(point.timestamp).getTime();
          return pointTime >= startTime && pointTime <= endTime;
        });

        // For candlestick/heiken-ashi mode, also include one candle before and after
        // to ensure edge candles that might be partially visible are included
        if ((chartDisplayType === 'candlestick' || chartDisplayType === 'heiken-ashi') && visibleData.length > 0) {
          const candleData = chartDisplayType === 'heiken-ashi' ? heikenAshiData : candlestickData;
          if (candleData.length > 0) {
            const firstVisibleIndex = candleData.findIndex(c => c.timestamp === visibleData[0].timestamp);
            const lastVisibleIndex = candleData.findIndex(c => c.timestamp === visibleData[visibleData.length - 1].timestamp);

            // Include previous candlestick if it exists
            if (firstVisibleIndex > 0) {
              visibleData = [candleData[firstVisibleIndex - 1], ...visibleData];
            }

            // Include next candlestick if it exists
            if (lastVisibleIndex >= 0 && lastVisibleIndex < candleData.length - 1) {
              visibleData = [...visibleData, candleData[lastVisibleIndex + 1]];
            }
          }
        }
      }
    } else {
      visibleData = activeData;
    }

    if (!visibleData || visibleData.length === 0) {
      return unit === '%' ? [0, 100] : ['auto', 'auto'];
    }

    // Find min and max values from visible data points and mean line
    // Ignore statistical bands to avoid wasted space for stable metrics
    let min = Infinity;
    let max = -Infinity;

    visibleData.forEach((point) => {
      if (chartDisplayType === 'candlestick' || chartDisplayType === 'heiken-ashi') {
        // For candlesticks/heiken-ashi, use high/low values
        const values = [
          point.high,
          point.low,
          point.mean
        ];

        values.forEach(val => {
          if (val != null && isFinite(val)) {
            min = Math.min(min, val);
            max = Math.max(max, val);
          }
        });
      } else {
        // For line charts, check all zone values (the chart displays these, not just point.value)
        const values = [
          point.value,
          point.valueGreen,
          point.valueYellow,
          point.valueOrange,
          point.valueRed,
          point.mean
        ];

        values.forEach(val => {
          if (val != null && isFinite(val)) {
            min = Math.min(min, val);
            max = Math.max(max, val);
          }
        });
      }
    });

    // If we couldn't find valid values, use defaults
    if (!isFinite(min) || !isFinite(max)) {
      return unit === '%' ? [0, 100] : ['auto', 'auto'];
    }

    // Calculate Y-axis domain using the formulas:
    // yMin = visibleLow - ((visibleHigh - visibleLow) * 0.05)
    // yMax = visibleHigh + ((visibleHigh - visibleLow) * 0.05)
    const visibleRange = max - min;
    const buffer = visibleRange * 0.05;
    const yMin = min - buffer;
    const yMax = max + buffer;

    // For percentage metrics, clamp to 0-100 range
    if (unit === '%') {
      const clampedMin = Math.max(0, yMin);
      const clampedMax = Math.min(100, yMax);

      // Ensure minimum range of 5% to prevent duplicate tick keys in Recharts
      const finalRange = clampedMax - clampedMin;
      if (finalRange < 5) {
        const center = (clampedMin + clampedMax) / 2;
        return [Math.max(0, center - 2.5), Math.min(100, center + 2.5)];
      }

      return [clampedMin, clampedMax];
    }

    // For non-percentage metrics, ensure minimum is non-negative
    const finalMin = Math.max(0, yMin);

    // Ensure minimum range to prevent duplicate tick keys
    const finalRange = yMax - finalMin;
    const minRange = Math.max(5, yMax * 0.1); // At least 5 or 10% of max value
    if (finalRange < minRange) {
      const center = (finalMin + yMax) / 2;
      return [Math.max(0, center - minRange / 2), center + minRange / 2];
    }

    return [finalMin, yMax];
  }, [chartData, candlestickData, heikenAshiData, chartDisplayType, activeDomain, unit, autoFitYAxis]);

  // Calculate minimum decimal places needed for Y-axis so no two ticks appear identical
  const yAxisDecimalPlaces = useMemo(() => {
    if (!Array.isArray(yAxisDomain) || yAxisDomain.length !== 2) return 0;

    const [min, max] = yAxisDomain;
    if (typeof min !== 'number' || typeof max !== 'number') return 0;

    // Estimate tick values (Recharts typically generates 5-7 evenly spaced ticks)
    const tickCount = 6;
    const step = (max - min) / (tickCount - 1);
    const estimatedTicks: number[] = [];
    for (let i = 0; i < tickCount; i++) {
      estimatedTicks.push(min + (step * i));
    }

    // Try different decimal precisions (0 to 3) and find minimum that makes all ticks unique
    for (let decimals = 0; decimals <= 3; decimals++) {
      const formattedTicks = estimatedTicks.map(tick => tick.toFixed(decimals));
      const uniqueTicks = new Set(formattedTicks);

      // If all formatted values are unique, this precision is sufficient
      if (uniqueTicks.size === formattedTicks.length) {
        return decimals;
      }
    }

    // Fallback to 3 decimals if we couldn't find a good precision
    return 3;
  }, [yAxisDomain]);

  // Calculate visible data range high and low for reference lines
  const visibleDataRange = useMemo(() => {
    if (!activeDomain || !chartData || chartData.length === 0) return null;

    const activeData =
      chartDisplayType === 'candlestick' ? candlestickData :
      chartDisplayType === 'heiken-ashi' ? heikenAshiData :
      chartData;
    if (!activeData || activeData.length === 0) return null;

    // Get the timestamp range that will be displayed
    const validStartIndex = Math.max(0, Math.min(activeDomain.startIndex, chartData.length - 1));
    const validEndIndex = Math.max(0, Math.min(activeDomain.endIndex, chartData.length - 1));

    if (validStartIndex >= chartData.length || validEndIndex >= chartData.length) {
      return null;
    }

    const startTime = new Date(chartData[validStartIndex].timestamp).getTime();
    const endTime = new Date(chartData[validEndIndex].timestamp).getTime();

    // Filter data to visible time range
    const visibleData = activeData.filter(point => {
      const pointTime = new Date(point.timestamp).getTime();
      return pointTime >= startTime && pointTime <= endTime;
    });

    if (visibleData.length === 0) return null;

    // Find min and max from visible data
    let min = Infinity;
    let max = -Infinity;

    visibleData.forEach((point) => {
      if (chartDisplayType === 'candlestick' || chartDisplayType === 'heiken-ashi') {
        min = Math.min(min, point.low);
        max = Math.max(max, point.high);
      } else {
        min = Math.min(min, point.value);
        max = Math.max(max, point.value);
      }
    });

    if (!isFinite(min) || !isFinite(max)) return null;

    return { min, max };
  }, [activeDomain, chartData, candlestickData, heikenAshiData, chartDisplayType]);

  // Smooth animation for zoom domain changes
  useEffect(() => {
    // Cancel any ongoing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // If no zoom domain or no previous animated domain, set immediately
    if (!zoomDomain || !animatedZoomDomain) {
      setAnimatedZoomDomain(zoomDomain);
      return;
    }

    // Calculate the difference to determine if we should animate
    const startDiff = Math.abs(zoomDomain.startIndex - animatedZoomDomain.startIndex);
    const endDiff = Math.abs(zoomDomain.endIndex - animatedZoomDomain.endIndex);

    // If change is very small (less than 2 indices), set immediately to avoid jitter
    if (startDiff < 2 && endDiff < 2) {
      setAnimatedZoomDomain(zoomDomain);
      return;
    }

    // Smooth animation using requestAnimationFrame (for button-triggered zooms)
    const startTime = performance.now();
    const duration = 200; // 200ms animation duration
    const startDomain = { ...animatedZoomDomain };
    const targetDomain = { ...zoomDomain };

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function: easeOutCubic for smooth deceleration
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      // Interpolate between start and target
      const newStartIndex = startDomain.startIndex + (targetDomain.startIndex - startDomain.startIndex) * easedProgress;
      const newEndIndex = startDomain.endIndex + (targetDomain.endIndex - startDomain.endIndex) * easedProgress;

      setAnimatedZoomDomain({
        startIndex: Math.round(newStartIndex),
        endIndex: Math.round(newEndIndex),
      });

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    // Cleanup function to cancel animation on unmount or when dependencies change
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [zoomDomain]);

  // Initialize zoom domain only on first mount - no automatic adjustments
  useEffect(() => {
    // Only run once on initial mount
    if (!hasInitializedZoom.current && calculateInitialZoomDomain) {
      setZoomDomain(calculateInitialZoomDomain);

      // Mark as initialized after a delay
      setTimeout(() => {
        hasInitializedZoom.current = true;
        isInitialMount.current = false;
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount


  // Zoom handlers
  const handleZoomIn = () => {
    if (!chartData || chartData.length === 0) return;

    const currentStart = zoomDomain?.startIndex ?? 0;
    const currentEnd = zoomDomain?.endIndex ?? chartData.length - 1;
    const currentRange = currentEnd - currentStart;

    // Zoom in by 25% (reduce range by 25%)
    const newRange = Math.max(10, Math.floor(currentRange * 0.75)); // Minimum 10 points
    const center = Math.floor((currentStart + currentEnd) / 2);
    const newStart = Math.max(0, center - Math.floor(newRange / 2));
    const newEnd = Math.min(chartData.length - 1, newStart + newRange);

    setZoomDomain({ startIndex: newStart, endIndex: newEnd });
  };

  const handleZoomOut = () => {
    if (!chartData || chartData.length === 0) return;

    const currentStart = zoomDomain?.startIndex ?? 0;
    const currentEnd = zoomDomain?.endIndex ?? chartData.length - 1;
    const currentRange = currentEnd - currentStart;

    // Zoom out by 33% (increase range by 33%)
    const newRange = Math.min(chartData.length - 1, Math.floor(currentRange * 1.33));
    const center = Math.floor((currentStart + currentEnd) / 2);
    const newStart = Math.max(0, center - Math.floor(newRange / 2));
    const newEnd = Math.min(chartData.length - 1, newStart + newRange);

    // If we're at full range, reset zoom
    if (newStart === 0 && newEnd === chartData.length - 1) {
      setZoomDomain(null);
    } else {
      setZoomDomain({ startIndex: newStart, endIndex: newEnd });
    }
  };

  const handleResetZoom = () => {
    setZoomDomain(null);
  };

  const handleBrushChange = (domain: any) => {
    // Ignore brush changes during initial mount to prevent overriding calculated initial zoom
    if (isInitialMount.current || !hasInitializedZoom.current) {
      return;
    }

    if (domain && domain.startIndex !== undefined && domain.endIndex !== undefined) {
      let startIndex = domain.startIndex;
      let endIndex = domain.endIndex;

      // If we're in candlestick/heiken-ashi mode, convert indices from candle space to chartData space
      if (chartDisplayType === 'candlestick' && candlestickData.length > 0 && chartData.length > 0) {
        const ratio = chartData.length / candlestickData.length;
        startIndex = Math.max(0, Math.floor(domain.startIndex * ratio));
        endIndex = Math.min(chartData.length - 1, Math.ceil(domain.endIndex * ratio));
      } else if (chartDisplayType === 'heiken-ashi' && heikenAshiData.length > 0 && chartData.length > 0) {
        const ratio = chartData.length / heikenAshiData.length;
        startIndex = Math.max(0, Math.floor(domain.startIndex * ratio));
        endIndex = Math.min(chartData.length - 1, Math.ceil(domain.endIndex * ratio));
      }

      const newDomain = { startIndex, endIndex };

      // Update zoom domain immediately
      setZoomDomain(newDomain);

      // Calculate the time range and update the Window dropdown to closest match
      if (chartData && chartData.length > 0 && startIndex < chartData.length && endIndex < chartData.length) {
        const startTime = new Date(chartData[startIndex].timestamp).getTime();
        const endTime = new Date(chartData[endIndex].timestamp).getTime();
        const durationMs = endTime - startTime;
        const durationHours = durationMs / (1000 * 60 * 60);

        // Available time window options in hours
        const timeWindowOptions = [1, 4, 12, 24, 48, 168];

        // Find closest match
        let closestWindow = timeWindowOptions[0];
        let minDiff = Math.abs(durationHours - closestWindow);

        for (const option of timeWindowOptions) {
          const diff = Math.abs(durationHours - option);
          if (diff < minDiff) {
            minDiff = diff;
            closestWindow = option;
          }
        }

        // Update the time window dropdown if it changed
        if (closestWindow !== selectedTimeWindow) {
          timeWindowChangedByBrushRef.current = true;
          setSelectedTimeWindow(closestWindow);
          // Reset the flag after a short delay
          setTimeout(() => {
            timeWindowChangedByBrushRef.current = false;
          }, 50);
        }
      }
    }
  };

  // Jump to Now handler - resets zoom to show the most recent data window
  const handleJumpToNow = () => {
    if (!chartData || chartData.length === 0) return;

    // Reset to the initial zoom domain (most recent time window)
    if (calculateInitialZoomDomain) {
      setZoomDomain(calculateInitialZoomDomain);
    } else {
      // If no initial zoom window is defined, show all data
      setZoomDomain(null);
    }
  };

  // Anomaly navigation handlers
  const navigateToAnomaly = (index: number) => {
    if (!filteredAnomalies || filteredAnomalies.length === 0 || !chartData) return;

    const anomaly = filteredAnomalies[index];
    if (!anomaly) return;

    // Find the chart data index for this anomaly timestamp
    const dataIndex = chartData.findIndex(d => d.timestamp === anomaly.timestamp);
    if (dataIndex === -1) return;

    // Center the view on this anomaly with a reasonable window (50 data points)
    const windowSize = Math.min(50, chartData.length);
    const halfWindow = Math.floor(windowSize / 2);
    const newStart = Math.max(0, dataIndex - halfWindow);
    const newEnd = Math.min(chartData.length - 1, dataIndex + halfWindow);

    setZoomDomain({ startIndex: newStart, endIndex: newEnd });
    setCurrentAnomalyIndex(index);

    // Highlight this anomaly with a blue halo for 2 seconds
    setHighlightedAnomalyTimestamp(anomaly.timestamp);
    setTimeout(() => {
      setHighlightedAnomalyTimestamp(null);
    }, 2000);
  };

  const handlePreviousAnomaly = () => {
    if (filteredAnomalies.length === 0 || currentAnomalyIndex === 0) return;
    const newIndex = currentAnomalyIndex - 1;
    navigateToAnomaly(newIndex);
  };

  const handleNextAnomaly = () => {
    if (filteredAnomalies.length === 0 || currentAnomalyIndex >= filteredAnomalies.length - 1) return;
    const newIndex = currentAnomalyIndex + 1;
    navigateToAnomaly(newIndex);
  };

  const handleToggleAnomalyNavigation = () => {
    setAnomalyNavigationExpanded(!anomalyNavigationExpanded);
    // If expanding and there are anomalies, navigate to the first one
    if (!anomalyNavigationExpanded && filteredAnomalies.length > 0) {
      navigateToAnomaly(0);
    }
  };

  // Calculate zoom percentage for display
  const zoomPercentage = useMemo(() => {
    if (!activeDomain || !chartData || chartData.length === 0) return 100;
    const visibleRange = activeDomain.endIndex - activeDomain.startIndex + 1;
    return Math.round((visibleRange / chartData.length) * 100);
  }, [activeDomain, chartData]);

  // Smart auto-follow: only follow when right brush is at the most recent data
  const prevDataLengthRef = useRef<number>(0);
  const zoomDomainRef = useRef<{ startIndex: number; endIndex: number } | null>(null);

  // Track if time window change came from brush adjustment (to prevent circular updates)
  const timeWindowChangedByBrushRef = useRef<boolean>(false);

  // Keep ref in sync with state
  useEffect(() => {
    zoomDomainRef.current = zoomDomain;
  }, [zoomDomain]);

  useEffect(() => {
    if (!chartData || chartData.length === 0) return;

    // Only act when new data arrives (length increases)
    const dataLengthIncreased = chartData.length > prevDataLengthRef.current;
    const prevDataLength = prevDataLengthRef.current;
    prevDataLengthRef.current = chartData.length;

    if (!dataLengthIncreased) return;

    // If we have a zoom domain, check if the right handle is at the end
    const currentZoomDomain = zoomDomainRef.current;
    if (currentZoomDomain) {
      const isAtEnd = currentZoomDomain.endIndex >= prevDataLength - 2; // Within 1-2 points of previous end

      if (isAtEnd) {
        // Shift the zoom window forward to follow new data
        const zoomRange = currentZoomDomain.endIndex - currentZoomDomain.startIndex;
        const newEndIndex = chartData.length - 1;
        const newStartIndex = Math.max(0, newEndIndex - zoomRange);

        setZoomDomain({ startIndex: newStartIndex, endIndex: newEndIndex });
      }
      // If right brush is not at end, keep brushes locked (don't update zoomDomain)
    }
    // If zoomDomain is null, we're in fully zoomed out mode (no action needed)
  }, [chartData.length]); // Only monitor data length - not zoomDomain!

  // Auto-zoom disabled - keep X interval the same when switching between line and candlestick
  useEffect(() => {
    // Just track the current display type
    prevChartDisplayType.current = chartDisplayType;
  }, [chartDisplayType]);

  // When selectedTimeWindow changes, apply the new zoom window
  // (unless the change came from brush adjustment)
  useEffect(() => {
    // Skip if the time window change came from brush adjustment
    if (timeWindowChangedByBrushRef.current) {
      return;
    }

    if (hasInitializedZoom.current && calculateInitialZoomDomain) {
      setZoomDomain(calculateInitialZoomDomain);
    }
  }, [selectedTimeWindow, calculateInitialZoomDomain]);

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
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
      {/* Header with stats and zoom controls */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-4">
          <div>
            <h4 className={`text-md font-semibold ${themeClasses.text.primary}`}>{title}</h4>
            {showRateOfChange && (
              <p className={`text-sm ${themeClasses.text.secondary} mt-1`}>
                {formatRateOfChange(stats.rateOfChange, unit)} •{' '}
                <span className={
                  stats.trend === 'increasing' ? 'text-orange-600' :
                  stats.trend === 'decreasing' ? 'text-blue-600' :
                  'text-green-600'
                }>
                  {stats.trend}
                </span>
              </p>
            )}
          </div>

          {/* Time Window Selector */}
          <div className="flex items-center gap-2">
            <label className={`text-xs ${themeClasses.text.secondary} font-medium`}>
              Window:
            </label>
            <select
              value={selectedTimeWindow}
              onChange={(e) => {
                const newWindow = Number(e.target.value);
                setSelectedTimeWindow(newWindow);
                // Reset zoom domain cache when window changes
                initialZoomDomainRef.current = null;
              }}
              className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            >
              <option value={1}>1 Hour</option>
              <option value={4}>4 Hours</option>
              <option value={12}>12 Hours</option>
              <option value={24}>24 Hours</option>
              <option value={48}>2 Days</option>
              <option value={168}>7 Days</option>
            </select>
          </div>

          {/* Jump to Now button */}
          <button
            onClick={handleJumpToNow}
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            title="Jump to most recent data"
          >
            <Clock className="w-3.5 h-3.5" />
            Now
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Chart display type toggle */}
          <div className="flex items-center gap-1 border border-gray-300 dark:border-gray-600 rounded-lg p-1">
            <button
              onClick={() => setChartDisplayType('line')}
              className={`p-1.5 rounded-lg transition-colors ${
                chartDisplayType === 'line'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title="Line chart"
            >
              <LineChartIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setChartDisplayType('candlestick')}
              className={`p-1.5 rounded-lg transition-colors ${
                chartDisplayType === 'candlestick'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title="Candlestick chart"
            >
              <BarChart2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setChartDisplayType('heiken-ashi')}
              className={`px-2 py-1.5 rounded-lg transition-colors text-xs font-medium ${
                chartDisplayType === 'heiken-ashi'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title="Heiken Ashi chart (smoothed candlesticks)"
            >
              HA
            </button>
          </div>

          {/* Candlestick period selector (shown for candlestick and heiken-ashi modes) */}
          {(chartDisplayType === 'candlestick' || chartDisplayType === 'heiken-ashi') && (
            <div className="flex items-center gap-2">
              <label className={`text-xs ${themeClasses.text.secondary} font-medium`}>
                Period:
              </label>
              <select
                value={candlestickPeriod}
                onChange={(e) => setCandlestickPeriod(Number(e.target.value))}
                className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                title="Agent polls every 5 minutes"
              >
                <option value={15}>15 min (≈3 pts)</option>
                <option value={30}>30 min (≈6 pts)</option>
                <option value={60}>1 hour (≈12 pts)</option>
                <option value={240}>4 hours (≈48 pts)</option>
                <option value={720}>12 hours (≈144 pts)</option>
                <option value={1440}>24 hours (≈288 pts)</option>
              </select>
            </div>
          )}

          {/* Y-axis autofit toggle */}
          <button
            onClick={() => setAutoFitYAxis(!autoFitYAxis)}
            className={`p-1.5 rounded-lg border transition-colors ${
              autoFitYAxis
                ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400'
                : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
            } hover:bg-blue-50 dark:hover:bg-blue-900/20`}
            title={autoFitYAxis ? 'Y-axis autofit enabled' : 'Y-axis autofit disabled'}
          >
            <Expand className="w-4 h-4" />
          </button>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 border border-gray-300 dark:border-gray-600 rounded-lg p-1">
            <button
              onClick={handleZoomIn}
              disabled={zoomPercentage <= 10}
              className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                zoomPercentage <= 10 ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
            <button
              onClick={handleZoomOut}
              disabled={!zoomDomain}
              className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                !zoomDomain ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
            <button
              onClick={handleResetZoom}
              disabled={!zoomDomain}
              className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                !zoomDomain ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              title="Reset Zoom"
            >
              <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
            <div className={`text-xs ${themeClasses.text.tertiary} px-2 border-l border-gray-300 dark:border-gray-600`}>
              {zoomPercentage}%
            </div>
          </div>
          {/* Stats */}
          <div className="text-right">
            <div className={`text-sm ${themeClasses.text.secondary}`}>
              <span className="font-medium">Avg:</span> {stats.mean.toFixed(1)}{unit}
            </div>
            <div className={`text-xs ${themeClasses.text.tertiary} mt-1`}>
              σ: {stats.stdDev.toFixed(1)}{unit}
            </div>
          </div>
        </div>
      </div>

      {/* Averaging Mode Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <label className={`text-xs ${themeClasses.text.secondary} font-medium`}>
            Average:
          </label>
          <select
            value={averagingMode}
            onChange={(e) => setAveragingMode(e.target.value as AveragingMode)}
            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          >
            <option value="simple" className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">Simple</option>
            <option value="moving" className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">Moving</option>
          </select>
          <span className={`text-xs ${themeClasses.text.tertiary}`}>
            ({averagingMode === 'simple' ? 'Overall average' : `${windowSize}-point window`})
          </span>
        </div>

        {averagingMode === 'moving' && (
          <>
            <div className="flex items-center gap-2">
              <label className={`text-xs ${themeClasses.text.secondary} font-medium`}>
                Window:
              </label>
              <input
                type="number"
                min="3"
                max="50"
                value={windowSize}
                onChange={(e) => setWindowSize(parseInt(e.target.value) || 20)}
                style={{
                  colorScheme: isDark ? 'dark' : 'light'
                }}
                className="text-xs w-16 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              />
              <span className={`text-xs ${themeClasses.text.tertiary}`}>points</span>
            </div>

            <div className="flex items-center gap-2">
              <label className={`text-xs ${themeClasses.text.secondary} font-medium`}>
                Bands:
              </label>
              <select
                value={bandMode}
                onChange={(e) => setBandMode(e.target.value as BandMode)}
                className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              >
                <option value="fixed" className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">Fixed</option>
                <option value="dynamic" className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">Dynamic</option>
              </select>
              <span className={`text-xs ${themeClasses.text.tertiary}`}>
                ({bandMode === 'fixed' ? 'Fixed std dev' : 'Bollinger Bands'})
              </span>
            </div>
          </>
        )}
      </div>

      {/* Anomaly Warning and Navigation */}
      {anomalies.length > 0 && (
        <div className="mb-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg overflow-hidden">
          {/* Clickable header */}
          <button
            onClick={handleToggleAnomalyNavigation}
            className="w-full p-3 text-left hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors"
          >
            <p className="text-sm text-yellow-900 dark:text-yellow-100 flex items-center justify-between">
              <span>
                ⚠️ {anomalies.length} anomal{anomalies.length === 1 ? 'y' : 'ies'} detected
                ({anomalies.filter(a => a.severity === 'severe').length} severe)
              </span>
              <span className="text-xs opacity-70">
                {anomalyNavigationExpanded ? 'Click to hide controls' : 'Click to navigate'}
              </span>
            </p>
          </button>

          {/* Navigation controls (expanded state) */}
          {anomalyNavigationExpanded && (
            <div className="px-3 pb-3 border-t border-yellow-200 dark:border-yellow-800 pt-3 flex items-center gap-3 flex-wrap">
              {/* Severity filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-yellow-700 dark:text-yellow-300" />
                <select
                  value={anomalySeverityFilter}
                  onChange={(e) => {
                    setAnomalySeverityFilter(e.target.value as 'all' | 'severe');
                    setCurrentAnomalyIndex(0);
                    // Navigate to first anomaly of new filter
                    if (e.target.value === 'severe' && anomalies.filter(a => a.severity === 'severe').length > 0) {
                      setTimeout(() => navigateToAnomaly(0), 0);
                    } else if (e.target.value === 'all' && anomalies.length > 0) {
                      setTimeout(() => navigateToAnomaly(0), 0);
                    }
                  }}
                  className="text-xs px-2 py-1 rounded border border-yellow-300 dark:border-yellow-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="all">All anomalies</option>
                  <option value="severe">Severe only</option>
                </select>
              </div>

              {/* Navigation buttons */}
              <div className="flex items-center gap-1 border border-yellow-300 dark:border-yellow-700 rounded-lg p-1 bg-white dark:bg-gray-800">
                <button
                  onClick={handlePreviousAnomaly}
                  disabled={filteredAnomalies.length === 0 || currentAnomalyIndex === 0}
                  className={`p-1 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors ${
                    filteredAnomalies.length === 0 || currentAnomalyIndex === 0 ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                  title={currentAnomalyIndex === 0 ? 'At first anomaly' : 'Previous anomaly'}
                >
                  <ChevronLeft className="w-4 h-4 text-yellow-700 dark:text-yellow-300" />
                </button>
                <span className="text-xs text-yellow-900 dark:text-yellow-100 px-2 min-w-[4rem] text-center">
                  {filteredAnomalies.length > 0 ? `${currentAnomalyIndex + 1} of ${filteredAnomalies.length}` : 'None'}
                </span>
                <button
                  onClick={handleNextAnomaly}
                  disabled={filteredAnomalies.length === 0 || currentAnomalyIndex >= filteredAnomalies.length - 1}
                  className={`p-1 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors ${
                    filteredAnomalies.length === 0 || currentAnomalyIndex >= filteredAnomalies.length - 1 ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                  title={currentAnomalyIndex >= filteredAnomalies.length - 1 ? 'At last anomaly' : 'Next anomaly'}
                >
                  <ChevronRight className="w-4 h-4 text-yellow-700 dark:text-yellow-300" />
                </button>
              </div>

              {/* Current anomaly info */}
              {filteredAnomalies.length > 0 && filteredAnomalies[currentAnomalyIndex] && (
                <div className="text-xs text-yellow-900 dark:text-yellow-100 flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded font-medium ${
                    filteredAnomalies[currentAnomalyIndex].severity === 'severe' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200' :
                    filteredAnomalies[currentAnomalyIndex].severity === 'moderate' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200' :
                    'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'
                  }`}>
                    {filteredAnomalies[currentAnomalyIndex].severity}
                  </span>
                  <span>
                    {format(new Date(filteredAnomalies[currentAnomalyIndex].timestamp), 'MMM d, HH:mm')}
                  </span>
                  <span>
                    {filteredAnomalies[currentAnomalyIndex].value.toFixed(1)}{unit}
                  </span>
                  <span className="opacity-70">
                    ({filteredAnomalies[currentAnomalyIndex].deviationsFromMean.toFixed(1)}σ)
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
          <ComposedChart
            data={
              chartDisplayType === 'candlestick' ? candlestickData :
              chartDisplayType === 'heiken-ashi' ? heikenAshiData :
              chartData
            }
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            ref={chartRef}
          >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={isDark ? '#4b5563' : '#d1d5db'}
            opacity={isDark ? 0.3 : 0.2}
          />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(value) => format(new Date(value), 'HH:mm')}
            tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : '#6b7280' }}
            stroke={isDark ? '#4b5563' : '#d1d5db'}
            domain={activeDomain && chartData.length > 0 ? [
              chartData[Math.min(activeDomain.startIndex, chartData.length - 1)]?.timestamp,
              chartData[Math.min(activeDomain.endIndex, chartData.length - 1)]?.timestamp
            ] : ['auto', 'auto']}
            allowDataOverflow={!!activeDomain}
          />
          <YAxis
            tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : '#6b7280' }}
            tickCount={5}
            tickFormatter={(value) => {
              // Ensure we're formatting numbers as percentages or values, not timestamps
              if (typeof value === 'number' && isFinite(value)) {
                // If it looks like a timestamp (very large number), don't display it
                if (value > 1000000) {
                  return '';
                }
                if (unit === '%') {
                  // Use calculated decimal precision to ensure unique tick labels
                  return `${value.toFixed(yAxisDecimalPlaces)}${unit}`;
                }
                return value.toFixed(yAxisDecimalPlaces);
              }
              return '';
            }}
            label={{
              value: unit,
              angle: -90,
              position: 'insideLeft',
              fontSize: 12,
              fill: isDark ? '#9ca3af' : '#6b7280'
            }}
            stroke={isDark ? '#4b5563' : '#d1d5db'}
            domain={yAxisDomain as [number, number] | ['auto', 'auto']}
            allowDataOverflow={unit === '%'}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;

                if (chartDisplayType === 'candlestick' || chartDisplayType === 'heiken-ashi') {
                  const chartTypeName = chartDisplayType === 'heiken-ashi' ? 'Heiken Ashi' : 'Candlestick';
                  return (
                    <div className={`${themeClasses.bg.card} p-3 border ${themeClasses.border.default} rounded shadow-lg`}>
                      <p className={`text-xs ${themeClasses.text.tertiary} mb-1`}>
                        {format(new Date(data.timestamp), 'MMM d, HH:mm')}
                      </p>
                      {chartDisplayType === 'heiken-ashi' && (
                        <p className={`text-xs ${themeClasses.text.tertiary} italic mb-2`}>
                          {chartTypeName}
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                        <p className={`text-xs ${themeClasses.text.secondary}`}>Open:</p>
                        <p className={`text-xs font-semibold ${themeClasses.text.primary}`}>{data.open.toFixed(1)}{unit}</p>
                        <p className={`text-xs ${themeClasses.text.secondary}`}>High:</p>
                        <p className={`text-xs font-semibold ${themeClasses.text.primary}`}>{data.high.toFixed(1)}{unit}</p>
                        <p className={`text-xs ${themeClasses.text.secondary}`}>Low:</p>
                        <p className={`text-xs font-semibold ${themeClasses.text.primary}`}>{data.low.toFixed(1)}{unit}</p>
                        <p className={`text-xs ${themeClasses.text.secondary}`}>Close:</p>
                        <p className={`text-xs font-semibold ${themeClasses.text.primary}`}>{data.close.toFixed(1)}{unit}</p>
                        <p className={`text-xs ${themeClasses.text.secondary}`}>Mean:</p>
                        <p className={`text-xs font-semibold ${themeClasses.text.primary}`}>{data.mean.toFixed(1)}{unit}</p>
                      </div>
                      {data.isAnomaly && (
                        <p className={`text-xs text-orange-600 dark:text-orange-400 mt-2`}>
                          ⚠️ Anomaly detected
                        </p>
                      )}
                    </div>
                  );
                }

                return (
                  <div className={`${themeClasses.bg.card} p-3 border ${themeClasses.border.default} rounded shadow-lg`}>
                    <p className={`text-xs ${themeClasses.text.tertiary} mb-1`}>
                      {format(new Date(data.timestamp), 'MMM d, HH:mm')}
                    </p>
                    <p className={`text-sm font-semibold ${themeClasses.text.primary}`}>
                      {dataKey}: {data.value.toFixed(1)}{unit}
                    </p>
                    <p className={`text-xs ${themeClasses.text.secondary} mt-1`}>
                      Mean: {data.mean.toFixed(1)}{unit}
                    </p>
                    <p className={`text-xs ${themeClasses.text.tertiary}`}>
                      Deviation: {((data.value - data.mean) / stats.stdDev).toFixed(2)}σ
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend
            wrapperStyle={{
              fontSize: '12px',
              color: isDark ? '#9ca3af' : '#6b7280'
            }}
            iconType="line"
          />

          {/* View range reference lines */}
          {visibleDataRange && (
            <>
              <ReferenceLine
                y={visibleDataRange.max}
                stroke={isDark ? '#60a5fa' : '#3b82f6'}
                strokeDasharray="3 3"
                strokeWidth={1.5}
                label={{
                  value: `High: ${visibleDataRange.max.toFixed(yAxisDecimalPlaces)}${unit}`,
                  position: 'right',
                  fill: isDark ? '#60a5fa' : '#3b82f6',
                  fontSize: 11
                }}
              />
              <ReferenceLine
                y={visibleDataRange.min}
                stroke={isDark ? '#60a5fa' : '#3b82f6'}
                strokeDasharray="3 3"
                strokeWidth={1.5}
                label={{
                  value: `Low: ${visibleDataRange.min.toFixed(yAxisDecimalPlaces)}${unit}`,
                  position: 'right',
                  fill: isDark ? '#60a5fa' : '#3b82f6',
                  fontSize: 11
                }}
              />
            </>
          )}

          {/* Standard Deviation Lines (if enabled) - shown in both line and candlestick modes */}
          {showStdDev && (
            <>
              {/* +3σ line (red) */}
              <Line
                type="monotone"
                dataKey="stdDev3Upper"
                stroke="#ef4444"
                strokeWidth={0.8}
                strokeOpacity={0.4}
                dot={false}
                activeDot={false}
                name="+3σ"
                isAnimationActive={false}
              />
              {/* -3σ line (red) */}
              <Line
                type="monotone"
                dataKey="stdDev3Lower"
                stroke="#ef4444"
                strokeWidth={0.8}
                strokeOpacity={0.4}
                dot={false}
                activeDot={false}
                name="-3σ"
                isAnimationActive={false}
              />

              {/* +2σ line (orange) */}
              <Line
                type="monotone"
                dataKey="stdDev2Upper"
                stroke="#f97316"
                strokeWidth={0.8}
                strokeOpacity={0.5}
                dot={false}
                activeDot={false}
                name="+2σ"
                isAnimationActive={false}
              />
              {/* -2σ line (orange) */}
              <Line
                type="monotone"
                dataKey="stdDev2Lower"
                stroke="#f97316"
                strokeWidth={0.8}
                strokeOpacity={0.5}
                dot={false}
                activeDot={false}
                name="-2σ"
                isAnimationActive={false}
              />

              {/* +1σ line (yellow) */}
              <Line
                type="monotone"
                dataKey="stdDev1Upper"
                stroke="#eab308"
                strokeWidth={0.8}
                strokeOpacity={0.6}
                dot={false}
                activeDot={false}
                name="+1σ"
                isAnimationActive={false}
              />
              {/* -1σ line (yellow) */}
              <Line
                type="monotone"
                dataKey="stdDev1Lower"
                stroke="#eab308"
                strokeWidth={0.8}
                strokeOpacity={0.6}
                dot={false}
                activeDot={false}
                name="-1σ"
                isAnimationActive={false}
              />
            </>
          )}

          {chartDisplayType === 'line' && (
            <>

          {/* Mean line (or moving average line) */}
          <Line
            type="monotone"
            dataKey="mean"
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            activeDot={false}
            name={averagingMode === 'moving' ? `Moving Avg (${windowSize}pts)` : 'Mean'}
            isAnimationActive={false}
          />

          {/* Zone-colored line segments */}
          {/* Green zone (within ±1σ) */}
          <Line
            type="monotone"
            dataKey="valueGreen"
            stroke="#10b981"
            strokeWidth={2.5}
            dot={false}
            activeDot={false}
            connectNulls={false}
            name={`${dataKey} (Normal)`}
            isAnimationActive={false}
          />

          {/* Yellow zone (±1σ to ±2σ) */}
          <Line
            type="monotone"
            dataKey="valueYellow"
            stroke="#eab308"
            strokeWidth={2.5}
            dot={false}
            activeDot={false}
            connectNulls={false}
            name={`${dataKey} (Warning)`}
            isAnimationActive={false}
          />

          {/* Orange zone (±2σ to ±3σ) */}
          <Line
            type="monotone"
            dataKey="valueOrange"
            stroke="#f97316"
            strokeWidth={2.5}
            dot={false}
            activeDot={false}
            connectNulls={false}
            name={`${dataKey} (Elevated)`}
            isAnimationActive={false}
          />

          {/* Red zone (beyond ±3σ) */}
          <Line
            type="monotone"
            dataKey="valueRed"
            stroke="#ef4444"
            strokeWidth={2.5}
            dot={false}
            activeDot={false}
            connectNulls={false}
            name={`${dataKey} (Critical)`}
            isAnimationActive={false}
          />

          {/* Anomaly markers - overlay on all points but only show triangle on anomalies */}
          <Scatter
            dataKey="value"
            fill="none"
            isAnimationActive={false}
            shape={(props: any) => {
              const { cx, cy, payload } = props;
              // Only render triangle for anomalous points
              if (!payload.isAnomaly) return null;

              const severityColors = {
                severe: '#dc2626',
                moderate: '#f59e0b',
                minor: '#eab308'
              };
              const color = severityColors[payload.anomalySeverity as keyof typeof severityColors] || '#dc2626';

              // Check if this is the highlighted anomaly
              const isHighlighted = highlightedAnomalyTimestamp === payload.timestamp;

              return (
                <g>
                  {/* Blue halo (pulsing animation) - only for highlighted anomaly */}
                  {isHighlighted && (
                    <>
                      {/* Outer halo */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={20}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        opacity={0.6}
                      >
                        <animate
                          attributeName="r"
                          from="15"
                          to="25"
                          dur="1s"
                          repeatCount="2"
                        />
                        <animate
                          attributeName="opacity"
                          from="0.6"
                          to="0"
                          dur="1s"
                          repeatCount="2"
                        />
                      </circle>
                      {/* Inner halo */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={15}
                        fill="#3b82f6"
                        opacity={0.2}
                      >
                        <animate
                          attributeName="r"
                          from="10"
                          to="15"
                          dur="0.5s"
                          repeatCount="4"
                        />
                      </circle>
                    </>
                  )}

                  {/* Warning triangle */}
                  <polygon
                    points={`${cx},${cy - 8} ${cx - 7},${cy + 4} ${cx + 7},${cy + 4}`}
                    fill={color}
                    stroke={isHighlighted ? '#3b82f6' : 'white'}
                    strokeWidth={isHighlighted ? 2.5 : 1.5}
                    opacity={0.9}
                  />
                  {/* Exclamation mark */}
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    fill="white"
                    fontSize="10"
                    fontWeight="bold"
                  >
                    !
                  </text>
                </g>
              );
            }}
            name="Anomalies"
          />
            </>
          )}

          {/* Candlestick/Heiken-Ashi chart rendering */}
          {(chartDisplayType === 'candlestick' || chartDisplayType === 'heiken-ashi') && (
            <>
              {/* Mean line */}
              <Line
                type="monotone"
                dataKey="mean"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                activeDot={false}
                name="Mean"
                isAnimationActive={false}
              />

              {/* Candlesticks/Heiken-Ashi rendered using custom rendering */}
              {(chartDisplayType === 'heiken-ashi' ? heikenAshiData : candlestickData).map((candle, index) => {
                // Calculate Y positions based on the domain
                const [minDomain, maxDomain] = yAxisDomain as [number, number];
                const chartHeight = height - 50; // Approximate chart height (height - margins)

                // Scale function to convert values to Y coordinates
                const valueToY = (value: number) => {
                  const percentage = (value - minDomain) / (maxDomain - minDomain);
                  return chartHeight * (1 - percentage);
                };

                const openY = valueToY(candle.open);
                const closeY = valueToY(candle.close);
                const highY = valueToY(candle.high);
                const lowY = valueToY(candle.low);

                const candleWidth = 8;
                const wickWidth = 2;

                // Determine color based on price movement
                const fillColor = candle.isGreen
                  ? (isDark ? '#22c55e' : '#16a34a')  // Green for bullish
                  : (isDark ? '#ef4444' : '#dc2626'); // Red for bearish

                const strokeColor = candle.isGreen
                  ? (isDark ? '#16a34a' : '#15803d')
                  : (isDark ? '#dc2626' : '#b91c1c');

                // Anomaly border if this period contains an anomaly
                const hasAnomalyBorder = candle.isAnomaly;
                const anomalyBorderColor = '#f59e0b';

                return (
                  <g key={`candle-${index}-${candle.timestamp}`}>
                    {/* This is a placeholder - actual rendering handled by Scatter below */}
                  </g>
                );
              })}

              {/* Use Scatter with simpler shape that doesn't need yAxis scale */}
              <Scatter
                dataKey="high"
                fill="none"
                isAnimationActive={false}
                shape={(props: any) => {
                  const { cx, payload, height: chartContainerHeight } = props;
                  if (!payload) return null;

                  // Use the percentage-based approach
                  const [minDomain, maxDomain] = yAxisDomain as [number, number];
                  const range = maxDomain - minDomain;

                  // Calculate Y positions as percentages of the chart height
                  const openPercent = (payload.open - minDomain) / range;
                  const closePercent = (payload.close - minDomain) / range;
                  const highPercent = (payload.high - minDomain) / range;
                  const lowPercent = (payload.low - minDomain) / range;

                  // Chart rendering area (approximate based on height prop)
                  const renderHeight = height - 100; // Approximate usable height
                  const topMargin = 30; // Top margin

                  // Convert percentages to Y coordinates (inverted because SVG Y increases downward)
                  const openY = topMargin + renderHeight * (1 - openPercent);
                  const closeY = topMargin + renderHeight * (1 - closePercent);
                  const highY = topMargin + renderHeight * (1 - highPercent);
                  const lowY = topMargin + renderHeight * (1 - lowPercent);

                  const candleWidth = 8;
                  const wickWidth = 2;

                  // Determine color based on price movement
                  const fillColor = payload.isGreen
                    ? (isDark ? '#22c55e' : '#16a34a')  // Green for bullish
                    : (isDark ? '#ef4444' : '#dc2626'); // Red for bearish

                  const strokeColor = payload.isGreen
                    ? (isDark ? '#16a34a' : '#15803d')
                    : (isDark ? '#dc2626' : '#b91c1c');

                  // Anomaly border if this period contains an anomaly
                  const hasAnomalyBorder = payload.isAnomaly;
                  const anomalyBorderColor = '#f59e0b';

                  return (
                    <g>
                      {/* High-low wick */}
                      <line
                        x1={cx}
                        y1={highY}
                        x2={cx}
                        y2={lowY}
                        stroke={strokeColor}
                        strokeWidth={wickWidth}
                      />

                      {/* Open-close body */}
                      <rect
                        x={cx - candleWidth / 2}
                        y={Math.min(openY, closeY)}
                        width={candleWidth}
                        height={Math.max(Math.abs(closeY - openY), 1)} // Minimum height of 1 for doji
                        fill={fillColor}
                        stroke={hasAnomalyBorder ? anomalyBorderColor : strokeColor}
                        strokeWidth={hasAnomalyBorder ? 2.5 : 1}
                        opacity={0.9}
                      />

                      {/* Anomaly indicator */}
                      {hasAnomalyBorder && (
                        <circle
                          cx={cx}
                          cy={highY - 5}
                          r={3}
                          fill={anomalyBorderColor}
                          stroke="white"
                          strokeWidth={1}
                        />
                      )}
                    </g>
                  );
                }}
                name={chartDisplayType === 'heiken-ashi' ? 'Heiken Ashi' : 'Candlesticks'}
              />
            </>
          )}

          {/* Brush for panning and zooming */}
          {(() => {
            // Determine the active data array being displayed
            const activeDataArray =
              chartDisplayType === 'candlestick' ? candlestickData :
              chartDisplayType === 'heiken-ashi' ? heikenAshiData :
              chartData;

            // Don't render Brush if there's insufficient data
            if (!activeDataArray || activeDataArray.length < 2) {
              return null;
            }

            // Calculate brush indices based on the active data array
            let brushStartIndex: number | undefined = undefined;
            let brushEndIndex: number | undefined = undefined;

            if (activeDomain && activeDataArray.length > 0) {
              // In candlestick mode, we need to scale indices proportionally
              if (chartDisplayType === 'candlestick' && chartData.length > 0 && candlestickData.length > 0) {
                const ratio = candlestickData.length / chartData.length;
                brushStartIndex = Math.max(0, Math.floor(activeDomain.startIndex * ratio));
                brushEndIndex = Math.min(candlestickData.length - 1, Math.ceil(activeDomain.endIndex * ratio));
              } else if (chartDisplayType === 'heiken-ashi' && chartData.length > 0 && heikenAshiData.length > 0) {
                const ratio = heikenAshiData.length / chartData.length;
                brushStartIndex = Math.max(0, Math.floor(activeDomain.startIndex * ratio));
                brushEndIndex = Math.min(heikenAshiData.length - 1, Math.ceil(activeDomain.endIndex * ratio));
              } else if (chartDisplayType === 'line') {
                // Line mode - use indices directly
                brushStartIndex = Math.max(0, Math.min(activeDomain.startIndex, activeDataArray.length - 1));
                brushEndIndex = Math.max(0, Math.min(activeDomain.endIndex, activeDataArray.length - 1));
              }

              // Validate indices - if either is NaN or invalid, clear both
              if (!Number.isFinite(brushStartIndex) || !Number.isFinite(brushEndIndex) ||
                  brushStartIndex < 0 || brushEndIndex < 0 ||
                  brushStartIndex >= activeDataArray.length || brushEndIndex >= activeDataArray.length ||
                  brushStartIndex >= brushEndIndex) {
                brushStartIndex = undefined;
                brushEndIndex = undefined;
              }
            } else {
              // No zoom domain - show full data range (reset zoom state)
              brushStartIndex = 0;
              brushEndIndex = activeDataArray.length - 1;
            }

            return (
              <Brush
                key={`brush-${chartDisplayType}-${selectedTimeWindow}`}
                dataKey="timestamp"
                height={30}
                stroke={isDark ? '#6b7280' : '#9ca3af'}
                fill={isDark ? '#1f2937' : '#f3f4f6'}
                tickFormatter={(value) => format(new Date(value), 'HH:mm')}
                onChange={handleBrushChange}
                startIndex={brushStartIndex}
                endIndex={brushEndIndex}
              />
            );
          })()}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Statistics Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div>
          <div className={`text-xs ${themeClasses.text.tertiary}`}>Min</div>
          <div className={`text-sm font-semibold ${themeClasses.text.primary}`}>
            {stats.min.toFixed(1)}{unit}
          </div>
        </div>
        <div>
          <div className={`text-xs ${themeClasses.text.tertiary}`}>Max</div>
          <div className={`text-sm font-semibold ${themeClasses.text.primary}`}>
            {stats.max.toFixed(1)}{unit}
          </div>
        </div>
        <div>
          <div className={`text-xs ${themeClasses.text.tertiary}`}>Range</div>
          <div className={`text-sm font-semibold ${themeClasses.text.primary}`}>
            {stats.range.toFixed(1)}{unit}
          </div>
        </div>
        <div>
          <div className={`text-xs ${themeClasses.text.tertiary}`}>Std Dev</div>
          <div className={`text-sm font-semibold ${themeClasses.text.primary}`}>
            {stats.stdDev.toFixed(1)}{unit}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetricsChart;
