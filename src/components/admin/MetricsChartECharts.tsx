import React, { useMemo, useState, useEffect, useRef } from 'react';
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
  type ChartDisplayType = 'line' | 'candlestick' | 'heiken-ashi';
  const [chartDisplayType, setChartDisplayType] = useState<ChartDisplayType>('line');

  // State for candlestick period (in minutes)
  const [candlestickPeriod, setCandlestickPeriod] = useState<number>(30);

  // State for averaging mode
  const [averagingMode, setAveragingMode] = useState<AveragingMode>('moving');
  const [windowSize, setWindowSize] = useState<number>(20);
  const [bandMode, setBandMode] = useState<BandMode>('dynamic');

  // State for time window selection (default to 4 hours)
  const [selectedTimeWindow, setSelectedTimeWindow] = useState<number>(4);

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
  const [activeIndicators, setActiveIndicators] = useState<{
    sma7?: boolean;
    sma20?: boolean;
    sma25?: boolean;
    sma99?: boolean;
    ema12?: boolean;
    ema26?: boolean;
    bb?: boolean;
    rsi?: boolean;
    macd?: boolean;
  }>({});
  const [showIndicatorsMenu, setShowIndicatorsMenu] = useState(false);

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

  // Calculate technical indicators
  const technicalIndicators = useMemo(() => {
    if (!validatedData || validatedData.length === 0) return null;

    const values = validatedData.map(p => p.value);
    const timestamps = validatedData.map(p => new Date(p.timestamp).getTime());

    // SMA calculation
    const calculateSMA = (period: number) => {
      const sma: number[] = [];
      for (let i = 0; i < values.length; i++) {
        if (i < period - 1) {
          sma.push(NaN);
        } else {
          const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
          sma.push(sum / period);
        }
      }
      return sma;
    };

    // EMA calculation
    const calculateEMA = (period: number) => {
      const ema: number[] = [];
      const multiplier = 2 / (period + 1);

      // First EMA is SMA
      let sum = 0;
      for (let i = 0; i < period; i++) {
        sum += values[i];
        ema.push(i === period - 1 ? sum / period : NaN);
      }

      // Calculate EMA
      for (let i = period; i < values.length; i++) {
        ema.push((values[i] - ema[i - 1]) * multiplier + ema[i - 1]);
      }

      return ema;
    };

    // RSI calculation
    const calculateRSI = (period: number = 14) => {
      const rsi: number[] = [];
      let gains = 0;
      let losses = 0;

      // First RSI calculation
      for (let i = 1; i <= period; i++) {
        const change = values[i] - values[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
      }

      let avgGain = gains / period;
      let avgLoss = losses / period;
      rsi.push(...Array(period).fill(NaN));
      rsi.push(100 - (100 / (1 + avgGain / avgLoss)));

      // Smooth RSI
      for (let i = period + 1; i < values.length; i++) {
        const change = values[i] - values[i - 1];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        rsi.push(100 - (100 / (1 + avgGain / avgLoss)));
      }

      return rsi;
    };

    // MACD calculation
    const calculateMACD = () => {
      const ema12 = calculateEMA(12);
      const ema26 = calculateEMA(26);
      const macdLine = ema12.map((val, i) => val - ema26[i]);

      // Signal line (9-period EMA of MACD)
      const signalLine: number[] = [];
      const multiplier = 2 / (9 + 1);
      let emaValue = 0;
      let count = 0;

      for (let i = 0; i < macdLine.length; i++) {
        if (isNaN(macdLine[i])) {
          signalLine.push(NaN);
          continue;
        }

        if (count < 9) {
          emaValue += macdLine[i];
          count++;
          if (count === 9) {
            emaValue = emaValue / 9;
            signalLine.push(emaValue);
          } else {
            signalLine.push(NaN);
          }
        } else {
          emaValue = (macdLine[i] - emaValue) * multiplier + emaValue;
          signalLine.push(emaValue);
        }
      }

      const histogram = macdLine.map((val, i) => val - signalLine[i]);

      return { macdLine, signalLine, histogram };
    };

    return {
      sma7: calculateSMA(7),
      sma20: calculateSMA(20),
      sma25: calculateSMA(25),
      sma99: calculateSMA(99),
      ema12: calculateEMA(12),
      ema26: calculateEMA(26),
      rsi: calculateRSI(14),
      macd: calculateMACD(),
      timestamps,
    };
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

  // Calculate indicators specifically for candlestick data (based on candle closes)
  const candleIndicators = useMemo(() => {
    if (!candlestickData || candlestickData.length === 0) return null;

    const closes = candlestickData.map(c => c.close);
    const timestamps = candlestickData.map(c => c.timestamp);

    // SMA calculation
    const calculateSMA = (period: number) => {
      const sma: number[] = [];
      for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) {
          sma.push(NaN);
        } else {
          const sum = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
          sma.push(sum / period);
        }
      }
      return sma;
    };

    // EMA calculation
    const calculateEMA = (period: number) => {
      const ema: number[] = [];
      const multiplier = 2 / (period + 1);

      // First EMA is SMA
      let sum = 0;
      for (let i = 0; i < Math.min(period, closes.length); i++) {
        sum += closes[i];
        ema.push(i === period - 1 ? sum / period : NaN);
      }

      // Calculate EMA
      for (let i = period; i < closes.length; i++) {
        ema.push((closes[i] - ema[i - 1]) * multiplier + ema[i - 1]);
      }

      return ema;
    };

    // Bollinger Bands (20-period)
    const calculateBB = () => {
      const bbPeriod = 20;
      const upper: number[] = [];
      const middle: number[] = [];
      const lower: number[] = [];

      for (let i = 0; i < closes.length; i++) {
        if (i < bbPeriod - 1) {
          upper.push(NaN);
          middle.push(NaN);
          lower.push(NaN);
        } else {
          const windowCloses = closes.slice(i - bbPeriod + 1, i + 1);
          const sma = windowCloses.reduce((sum, v) => sum + v, 0) / bbPeriod;
          const variance = windowCloses.reduce((sum, v) => sum + Math.pow(v - sma, 2), 0) / bbPeriod;
          const stdDev = Math.sqrt(variance);

          middle.push(sma);
          upper.push(sma + (2 * stdDev));
          lower.push(sma - (2 * stdDev));
        }
      }

      return { upper, middle, lower };
    };

    const bb = calculateBB();

    return {
      sma7: calculateSMA(7),
      sma20: calculateSMA(20),
      sma25: calculateSMA(25),
      sma99: calculateSMA(99),
      ema12: calculateEMA(12),
      ema26: calculateEMA(26),
      bb,
      timestamps,
    };
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

  // ECharts option configuration
  const option = useMemo(() => {
    if (!stats || !chartData || chartData.length === 0) return {};

    const timestamps = chartData.map(d => new Date(d.timestamp).getTime());

    // Base configuration
    const baseOption: any = {
      backgroundColor: 'transparent',
      animation: true,
      animationDuration: 300,
      animationEasing: 'cubicOut',
      grid: {
        left: 60,
        right: 20,
        top: 20,
        bottom: 80,
        containLabel: false,
      },
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
      xAxis: {
        type: 'time',
        boundaryGap: chartDisplayType === 'candlestick' ? true : false,
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
      yAxis: {
        type: 'value',
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
      dataZoom: [
        {
          type: 'inside',
          start: activeZoomRange[0],
          end: activeZoomRange[1],
          zoomOnMouseWheel: 'shift',
          moveOnMouseMove: true,
          moveOnMouseWheel: true,
        },
        {
          type: 'slider',
          start: activeZoomRange[0],
          end: activeZoomRange[1],
          height: 30,
          bottom: 10,
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

      // Bollinger Bands
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

        series.push({
          name: 'BB Upper',
          type: 'line',
          data: bbUpperData,
          lineStyle: { color: '#94a3b8', width: 1, type: 'dashed' },
          symbol: 'none',
          smooth: true,
        });

        series.push({
          name: 'BB Middle',
          type: 'line',
          data: bbMiddleData,
          lineStyle: { color: '#64748b', width: 1.5 },
          symbol: 'none',
          smooth: true,
        });

        series.push({
          name: 'BB Lower',
          type: 'line',
          data: bbLowerData,
          lineStyle: { color: '#94a3b8', width: 1, type: 'dashed' },
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

        series.push({
          name: 'BB Upper',
          type: 'line',
          data: bbUpperData,
          lineStyle: { color: '#94a3b8', width: 1.5, type: 'dashed' },
          symbol: 'none',
          smooth: false,
        });

        series.push({
          name: 'BB Middle',
          type: 'line',
          data: bbMiddleData,
          lineStyle: { color: '#64748b', width: 2 },
          symbol: 'none',
          smooth: false,
        });

        series.push({
          name: 'BB Lower',
          type: 'line',
          data: bbLowerData,
          lineStyle: { color: '#94a3b8', width: 1.5, type: 'dashed' },
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

        series.push({
          name: 'BB Upper',
          type: 'line',
          data: bbUpperData,
          lineStyle: { color: '#94a3b8', width: 1.5, type: 'dashed' },
          symbol: 'none',
          smooth: false,
        });

        series.push({
          name: 'BB Middle',
          type: 'line',
          data: bbMiddleData,
          lineStyle: { color: '#64748b', width: 2 },
          symbol: 'none',
          smooth: false,
        });

        series.push({
          name: 'BB Lower',
          type: 'line',
          data: bbLowerData,
          lineStyle: { color: '#94a3b8', width: 1.5, type: 'dashed' },
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


    // Y-axis autofitting
    if (autoFitYAxis && chartData.length > 0) {
      const values = chartData.map(d => d.value);
      const minVal = Math.min(...values);
      const maxVal = Math.max(...values);
      const buffer = (maxVal - minVal) * 0.1; // 10% buffer
      baseOption.yAxis.min = Math.max(0, minVal - buffer);
      baseOption.yAxis.max = maxVal + buffer;
    } else {
      // When autoscale is off, show full range 0-100% for percentage metrics
      if (unit === '%') {
        baseOption.yAxis.min = 0;
        baseOption.yAxis.max = 100;
      }
    }

    return baseOption;
  }, [stats, chartData, candlestickData, heikenAshiData, chartDisplayType, showStdDev, dataKey, unit, isDark, activeZoomRange, candlestickPeriod, anomalies, autoFitYAxis, bollingerBands, validatedData, activeIndicators, technicalIndicators, candleIndicators, color]);

  // Handle chart events to capture zoom changes (debounced to prevent interrupting drag)
  const onChartEvents = {
    dataZoom: (params: any) => {
      // Clear any existing timeout
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }

      // Extract zoom values
      let start: number | undefined;
      let end: number | undefined;

      if (params.batch && params.batch.length > 0) {
        start = params.batch[0].start;
        end = params.batch[0].end;
      } else if (params.start !== undefined && params.end !== undefined) {
        start = params.start;
        end = params.end;
      }

      // Debounce the state update to avoid interrupting drag operations
      if (start !== undefined && end !== undefined) {
        zoomTimeoutRef.current = setTimeout(() => {
          setCurrentZoom({ start, end });
          setIsInitialRender(false);
        }, 150); // Wait 150ms after user stops dragging
      }
    },
  };

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
            onClick={() => setShowIndicatorsMenu(!showIndicatorsMenu)}
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
          {showIndicatorsMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowIndicatorsMenu(false)}
              ></div>
              <div className={`absolute right-0 top-8 z-50 ${themeClasses.bg.card} ${themeClasses.shadow.lg} rounded-lg border ${themeClasses.border.primary} py-2 min-w-[200px]`}>
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
                  onClick={() => {
                    setActiveIndicators(prev => ({ ...prev, rsi: !prev.rsi }));
                  }}
                  className={`w-full px-3 py-1.5 text-xs text-left hover:${themeClasses.bg.hover} flex items-center justify-between ${themeClasses.text.primary}`}
                  disabled
                  title="Coming soon"
                >
                  <span className="opacity-50">RSI (14)</span>
                </button>
                <button
                  onClick={() => {
                    setActiveIndicators(prev => ({ ...prev, macd: !prev.macd }));
                  }}
                  className={`w-full px-3 py-1.5 text-xs text-left hover:${themeClasses.bg.hover} flex items-center justify-between ${themeClasses.text.primary}`}
                  disabled
                  title="Coming soon"
                >
                  <span className="opacity-50">MACD</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        <ReactECharts
          option={option}
          style={{ height: `${height}px` }}
          opts={{ renderer: 'canvas' }}
          notMerge={true}
          lazyUpdate={false}
          onEvents={onChartEvents}
        />
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
