import { useMemo, useRef } from 'react';
import { ChartDisplayType, ZoomDomain } from '../MetricsChart.types';

interface UseChartDomainProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chartData: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  candlestickData: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  heikenAshiData: any[];
  chartDisplayType: ChartDisplayType;
  selectedTimeWindow: number;
  unit: string;
  autoFitYAxis: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialZoomDomainRef: React.MutableRefObject<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastSelectedTimeWindowRef: React.MutableRefObject<any>;
}

export function useChartDomain({
  chartData,
  candlestickData,
  heikenAshiData,
  activeData,
  chartDisplayType,
  activeDomain,
  unit,
  autoFitYAxis,
  selectedTimeWindow,
}: UseChartDomainProps) {
  // Calculate initial zoom domain based on selected time window
  const initialZoomDomainRef = useRef<ZoomDomain | null>(null);
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

  // Calculate Y-axis domain with dynamic scaling and buffer
  const yAxisDomain = useMemo(() => {
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
    let min = Infinity;
    let max = -Infinity;

    visibleData.forEach((point) => {
      if (chartDisplayType === 'candlestick' || chartDisplayType === 'heiken-ashi') {
        // For candlesticks/heiken-ashi, use high/low values
        const values = [point.high, point.low, point.mean];
        values.forEach(val => {
          if (val != null && isFinite(val)) {
            min = Math.min(min, val);
            max = Math.max(max, val);
          }
        });
      } else {
        // For line charts, check all zone values
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

    // Calculate Y-axis domain with 5% buffer
    const visibleRange = max - min;
    const buffer = visibleRange * 0.05;
    const yMin = min - buffer;
    const yMax = max + buffer;

    // For percentage metrics, clamp to 0-100 range
    if (unit === '%') {
      const clampedMin = Math.max(0, yMin);
      const clampedMax = Math.min(100, yMax);

      // Ensure minimum range of 5% to prevent duplicate tick keys
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
    const minRange = Math.max(5, yMax * 0.1);
    if (finalRange < minRange) {
      const center = (finalMin + yMax) / 2;
      return [Math.max(0, center - minRange / 2), center + minRange / 2];
    }

    return [finalMin, yMax];
  }, [chartData, candlestickData, heikenAshiData, chartDisplayType, activeDomain, unit, autoFitYAxis, activeData]);

  // Calculate minimum decimal places needed for Y-axis
  const yAxisDecimalPlaces = useMemo(() => {
    if (!Array.isArray(yAxisDomain) || yAxisDomain.length !== 2) return 0;

    const [min, max] = yAxisDomain;
    if (typeof min !== 'number' || typeof max !== 'number') return 0;

    // Estimate tick values
    const tickCount = 6;
    const step = (max - min) / (tickCount - 1);
    const estimatedTicks: number[] = [];
    for (let i = 0; i < tickCount; i++) {
      estimatedTicks.push(min + (step * i));
    }

    // Try different decimal precisions to find minimum that makes all ticks unique
    for (let decimals = 0; decimals <= 3; decimals++) {
      const formattedTicks = estimatedTicks.map(tick => tick.toFixed(decimals));
      const uniqueTicks = new Set(formattedTicks);

      if (uniqueTicks.size === formattedTicks.length) {
        return decimals;
      }
    }

    return 3;
  }, [yAxisDomain]);

  // Calculate visible data range high and low for reference lines
  const visibleDataRange = useMemo(() => {
    if (!activeDomain || !chartData || chartData.length === 0) return null;
    if (!activeData || activeData.length === 0) return null;

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
  }, [activeDomain, chartData, activeData, chartDisplayType]);

  return {
    calculateInitialZoomDomain,
    yAxisDomain,
    yAxisDecimalPlaces,
    visibleDataRange,
  };
}
