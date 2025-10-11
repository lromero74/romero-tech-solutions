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
import { ZoomIn, ZoomOut, Maximize2, Expand, ChevronLeft, ChevronRight, Filter, Clock } from 'lucide-react';
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

  // State for averaging mode and window size (default to moving average with 20-point window and dynamic Bollinger Bands)
  const [averagingMode, setAveragingMode] = useState<AveragingMode>('moving');
  const [windowSize, setWindowSize] = useState<number>(20);
  const [bandMode, setBandMode] = useState<BandMode>('dynamic');

  // State for Y-axis autofitting (default to enabled)
  const [autoFitYAxis, setAutoFitYAxis] = useState<boolean>(true);

  // State for time window selection (local to each chart)
  const [selectedTimeWindow, setSelectedTimeWindow] = useState<number>(initialZoomWindowHours || 4);

  // Anomaly navigation state
  const [anomalyNavigationExpanded, setAnomalyNavigationExpanded] = useState<boolean>(false);
  const [anomalySeverityFilter, setAnomalySeverityFilter] = useState<'all' | 'severe'>('all');
  const [currentAnomalyIndex, setCurrentAnomalyIndex] = useState<number>(0);
  const [highlightedAnomalyTimestamp, setHighlightedAnomalyTimestamp] = useState<string | null>(null);

  // Zoom and pan state
  const [zoomDomain, setZoomDomain] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const chartRef = useRef<any>(null);
  const hasInitializedZoom = useRef<boolean>(false);

  // Validate and normalize data (especially for percentages)
  const validatedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const validPoints: MetricDataPoint[] = [];

    data.forEach((point, index) => {
      let value = point.value;

      // Debug: Log first few data points to understand the data
      if (index < 3) {
        console.log(`[MetricsChart] ${title} data point ${index}:`, { timestamp: point.timestamp, value: point.value, unit });
      }

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

    console.log(`[MetricsChart] ${title}: Validated ${validPoints.length} out of ${data.length} data points`);
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

  // Calculate Y-axis domain with dynamic scaling and buffer
  const yAxisDomain = useMemo(() => {
    if (!chartData || chartData.length === 0) {
      return unit === '%' ? [0, 100] : ['auto', 'auto'];
    }

    // If autofit is disabled, use fixed domain
    if (!autoFitYAxis) {
      return unit === '%' ? [0, 100] : ['auto', 'auto'];
    }

    // Determine the visible data range
    const visibleData = zoomDomain
      ? chartData.slice(zoomDomain.startIndex, zoomDomain.endIndex + 1)
      : chartData;

    if (visibleData.length === 0) {
      return unit === '%' ? [0, 100] : ['auto', 'auto'];
    }

    // Find min and max values across all relevant data keys
    let min = Infinity;
    let max = -Infinity;

    visibleData.forEach((point) => {
      // Check value
      if (point.value != null && isFinite(point.value)) {
        min = Math.min(min, point.value);
        max = Math.max(max, point.value);
      }
      // Check standard deviation bands if they exist
      if (showStdDev) {
        if (point.stdDev3Lower != null && isFinite(point.stdDev3Lower)) {
          min = Math.min(min, point.stdDev3Lower);
        }
        if (point.stdDev3Upper != null && isFinite(point.stdDev3Upper)) {
          max = Math.max(max, point.stdDev3Upper);
        }
      }
    });

    // If we couldn't find valid values, use defaults
    if (!isFinite(min) || !isFinite(max)) {
      return unit === '%' ? [0, 100] : ['auto', 'auto'];
    }

    // Debug: Log calculated domain
    console.log(`[MetricsChart] ${title} Y-axis domain calculation:`, { min, max, unit, autoFitYAxis });

    // For percentage metrics, clamp to 0-100 range but allow dynamic scaling within that
    if (unit === '%') {
      // Calculate range before clamping
      const range = max - min;

      // Add buffer to prevent clipping (minimum 5% buffer, or 20% of range)
      const buffer = Math.max(5, range * 0.2);

      // Apply buffer first, then clamp to 0-100
      min = Math.max(0, min - buffer);
      max = Math.min(100, max + buffer);

      console.log(`[MetricsChart] ${title} Final Y-axis domain:`, [min, max]);
      return [min, max];
    }

    // For non-percentage metrics, add buffer space
    const range = max - min;
    const buffer = range > 0 ? range * 0.2 : 1; // 20% buffer or minimum 1 unit

    const finalDomain = [Math.max(0, min - buffer), max + buffer];
    console.log(`[MetricsChart] ${title} Final Y-axis domain:`, finalDomain);
    return finalDomain;
  }, [chartData, zoomDomain, unit, showStdDev, autoFitYAxis, title]);

  // Calculate initial zoom domain based on selectedTimeWindow
  const calculateInitialZoomDomain = useMemo(() => {
    if (!selectedTimeWindow || !chartData || chartData.length === 0) {
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

    // Only set zoom if we have a valid range
    if (startIndex < endIndex) {
      return { startIndex, endIndex };
    }

    return null;
  }, [chartData, selectedTimeWindow]);

  // Initialize zoom domain on first render or when selectedTimeWindow changes
  useEffect(() => {
    // Reset initialization flag when selectedTimeWindow changes
    hasInitializedZoom.current = false;
  }, [selectedTimeWindow]);

  useEffect(() => {
    // Only apply initial zoom once, or when initialZoomWindowHours changes
    if (!hasInitializedZoom.current && calculateInitialZoomDomain) {
      setZoomDomain(calculateInitialZoomDomain);
      hasInitializedZoom.current = true;
    }
  }, [calculateInitialZoomDomain]);

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
    if (domain && domain.startIndex !== undefined && domain.endIndex !== undefined) {
      setZoomDomain({ startIndex: domain.startIndex, endIndex: domain.endIndex });
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
    if (!zoomDomain || !chartData || chartData.length === 0) return 100;
    const visibleRange = zoomDomain.endIndex - zoomDomain.startIndex + 1;
    return Math.round((visibleRange / chartData.length) * 100);
  }, [zoomDomain, chartData]);

  // Auto-follow latest data when the right handle is at the rightmost position
  const prevDataLengthRef = useRef<number>(0);

  useEffect(() => {
    if (!chartData || chartData.length === 0) return;

    // Only act when new data arrives (length increases)
    const dataLengthIncreased = chartData.length > prevDataLengthRef.current;
    const prevDataLength = prevDataLengthRef.current;
    prevDataLengthRef.current = chartData.length;

    if (!dataLengthIncreased) return;

    // If we have a zoom domain, check if the right handle is at the end
    if (zoomDomain) {
      const isAtEnd = zoomDomain.endIndex >= prevDataLength - 2; // Within 1-2 points of previous end

      if (isAtEnd) {
        // Shift the zoom window forward to follow new data
        const zoomRange = zoomDomain.endIndex - zoomDomain.startIndex;
        const newEndIndex = chartData.length - 1;
        const newStartIndex = Math.max(0, newEndIndex - zoomRange);

        setZoomDomain({ startIndex: newStartIndex, endIndex: newEndIndex });
      }
    }
    // If zoomDomain is null, we're in fully zoomed out mode (no action needed)
  }, [chartData.length, zoomDomain]); // Monitor data length and zoom state

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
              onChange={(e) => setSelectedTimeWindow(Number(e.target.value))}
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
        </div>

        <div className="flex items-center gap-3">
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

        {/* Jump to Now button - always shown */}
        <div className="ml-auto">
          <button
            onClick={handleJumpToNow}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            title="Jump to most recent data"
          >
            <Clock className="w-3.5 h-3.5" />
            Jump to Now
          </button>
        </div>
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
          data={chartData}
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
            domain={zoomDomain ? [
              chartData[zoomDomain.startIndex]?.timestamp,
              chartData[zoomDomain.endIndex]?.timestamp
            ] : undefined}
            allowDataOverflow={zoomDomain ? true : false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : '#6b7280' }}
            tickFormatter={(value) => {
              // Ensure we're formatting numbers as percentages or values, not timestamps
              if (typeof value === 'number' && isFinite(value)) {
                // If it looks like a timestamp (very large number), don't display it
                if (value > 1000000) {
                  return '';
                }
                return unit === '%' ? `${value.toFixed(0)}${unit}` : value.toFixed(1);
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

          {/* Standard Deviation Lines (if enabled) */}
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
              />
            </>
          )}

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

          {/* Brush for panning and zooming */}
          <Brush
            key={`brush-${selectedTimeWindow}`}
            dataKey="timestamp"
            height={30}
            stroke={isDark ? '#6b7280' : '#9ca3af'}
            fill={isDark ? '#1f2937' : '#f3f4f6'}
            tickFormatter={(value) => format(new Date(value), 'HH:mm')}
            onChange={handleBrushChange}
            startIndex={zoomDomain?.startIndex ?? undefined}
            endIndex={zoomDomain?.endIndex ?? undefined}
          />
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
