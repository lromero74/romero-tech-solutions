import { MetricDataPoint } from '../../utils/metricsStats';

export type ChartDisplayType = 'line' | 'candlestick' | 'heiken-ashi';

export interface MetricsChartProps {
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

export interface ZoomDomain {
  startIndex: number;
  endIndex: number;
}
