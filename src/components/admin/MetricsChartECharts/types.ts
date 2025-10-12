import type { MetricDataPoint, AveragingMode, BandMode } from '../../../utils/metricsStats';
import type { ActiveIndicators, ChartDisplayType } from '../../../types/chartTypes';

export interface MetricsChartEChartsProps {
  data: MetricDataPoint[];
  title: string;
  dataKey: string;
  unit: string;
  color?: string;
  showStdDev?: boolean;
  showRateOfChange?: boolean;
  height?: number;
  // Navigation from alerts
  highlightTimeRange?: {
    start: string; // ISO timestamp
    end: string;   // ISO timestamp
  } | null;
  scrollToTimestamp?: string | null; // ISO timestamp to center on
  indicatorOverlay?: string | null; // Which indicator to highlight (e.g., 'RSI', 'Stochastic')
}

export interface OscillatorHeights {
  main: number;
  rsi: number;
  macd: number;
  stochastic: number;
  williamsR: number;
  roc: number;
  atr: number;
}

export interface DropdownPosition {
  top: number;
  left: number;
  right: number;
}

export interface DataGap {
  start: number;
  end: number;
}

export type {
  MetricDataPoint,
  AveragingMode,
  BandMode,
  ActiveIndicators,
  ChartDisplayType,
};
