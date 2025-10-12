import { useMemo } from 'react';
import {
  calculateStats,
  prepareChartData,
  detectAnomalies,
  type MetricDataPoint,
  type AveragingMode,
  type BandMode,
} from '../../../../utils/metricsStats';
import {
  calculateAllTechnicalIndicators,
  calculateCandleIndicators,
} from '../../../../utils/technicalIndicators';
import type { CandlestickDataPoint } from '../../../../types/chartTypes';

interface UseChartDataProps {
  data: MetricDataPoint[];
  unit: string;
  averagingMode: AveragingMode;
  windowSize: number;
  bandMode: BandMode;
  candlestickPeriod: number;
}

export const useChartData = ({
  data,
  unit,
  averagingMode,
  windowSize,
  bandMode,
  candlestickPeriod,
}: UseChartDataProps) => {
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

    return calculateAllTechnicalIndicators(values, timestamps);
  }, [validatedData]);

  // Aggregate data into candlesticks
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

  // Calculate indicators for candlestick data
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

  // Calculate Heiken Ashi candles
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

  // Detect gaps in data
  const dataGaps = useMemo(() => {
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

    // Detect gaps - if there's more than 3x the expected interval between points
    for (let i = 1; i < sortedData.length; i++) {
      const prevTime = typeof sortedData[i - 1].timestamp === 'number'
        ? sortedData[i - 1].timestamp
        : new Date(sortedData[i - 1].timestamp).getTime();
      const currTime = typeof sortedData[i].timestamp === 'number'
        ? sortedData[i].timestamp
        : new Date(sortedData[i].timestamp).getTime();
      const interval = currTime - prevTime;

      // If gap is more than 3x expected interval, mark it
      if (interval > expectedInterval * 3) {
        gaps.push({
          start: prevTime,
          end: currTime,
        });
      }
    }

    return gaps;
  }, [chartData]);

  return {
    validatedData,
    stats,
    anomalies,
    chartData,
    bollingerBands,
    technicalIndicators,
    candlestickData,
    candleIndicators,
    heikenAshiData,
    dataGaps,
  };
};
