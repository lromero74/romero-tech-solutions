import { useMemo } from 'react';
import {
  calculateStats,
  prepareChartData,
  detectAnomalies,
  type MetricDataPoint,
  type AveragingMode,
  type BandMode,
} from '../../../utils/metricsStats';
import { ChartDisplayType } from '../MetricsChart.types';

interface UseChartDataProps {
  data: MetricDataPoint[];
  unit: string;
  title: string;
  averagingMode: AveragingMode;
  windowSize: number;
  bandMode: BandMode;
  candlestickPeriod: number;
  chartDisplayType: ChartDisplayType;
  anomalySeverityFilter: 'all' | 'severe';
}

export function useChartData({
  data,
  unit,
  title,
  averagingMode,
  windowSize,
  bandMode,
  candlestickPeriod,
  chartDisplayType,
  anomalySeverityFilter,
}: UseChartDataProps) {
  // Validate and normalize data (especially for percentages)
  const validatedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const validPoints: MetricDataPoint[] = [];

    data.forEach((point) => {
      const value = point.value;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Get the active data array based on chart display type
  const activeData = useMemo(() => {
    return chartDisplayType === 'candlestick' ? candlestickData :
           chartDisplayType === 'heiken-ashi' ? heikenAshiData :
           chartData;
  }, [chartDisplayType, candlestickData, heikenAshiData, chartData]);

  return {
    validatedData,
    stats,
    anomalies,
    filteredAnomalies,
    chartData,
    candlestickData,
    heikenAshiData,
    activeData,
  };
}
