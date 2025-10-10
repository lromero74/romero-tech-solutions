/**
 * Metrics Statistics Utilities
 *
 * Provides statistical analysis for metrics data including:
 * - Average (mean)
 * - Standard deviation
 * - Rate of change
 * - Trend analysis
 */

export interface MetricDataPoint {
  timestamp: string | Date;
  value: number;
}

export type AveragingMode = 'simple' | 'moving';
export type BandMode = 'fixed' | 'dynamic';

export interface StatisticalAnalysis {
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  range: number;
  // Standard deviation bands
  stdDev1Upper: number;
  stdDev1Lower: number;
  stdDev2Upper: number;
  stdDev2Lower: number;
  stdDev3Upper: number;
  stdDev3Lower: number;
  // Rate of change
  rateOfChange: number; // Units per hour
  trend: 'increasing' | 'decreasing' | 'stable';
  // Moving average (if using moving average mode)
  movingAverages?: number[];
  // Rolling standard deviations for Bollinger Bands (dynamic mode)
  rollingStdDevs?: number[];
}

/**
 * Calculate moving average for a dataset
 */
export function calculateMovingAverage(values: number[], windowSize: number): number[] {
  if (values.length === 0 || windowSize < 1) {
    return [];
  }

  const movingAverages: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(values.length, i + Math.ceil(windowSize / 2));
    const window = values.slice(start, end);
    const avg = window.reduce((sum, val) => sum + val, 0) / window.length;
    movingAverages.push(avg);
  }

  return movingAverages;
}

/**
 * Calculate rolling standard deviation (for true Bollinger Bands)
 */
export function calculateRollingStdDev(values: number[], movingAverages: number[], windowSize: number): number[] {
  if (values.length === 0 || windowSize < 1) {
    return [];
  }

  const rollingStdDevs: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(values.length, i + Math.ceil(windowSize / 2));
    const window = values.slice(start, end);
    const meanAtPoint = movingAverages[i];

    // Calculate standard deviation for this window
    const squaredDiffs = window.map(val => Math.pow(val - meanAtPoint, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / window.length;
    const stdDev = Math.sqrt(variance);

    rollingStdDevs.push(stdDev);
  }

  return rollingStdDevs;
}

/**
 * Calculate statistical metrics for a dataset
 */
export function calculateStats(
  data: MetricDataPoint[],
  averagingMode: AveragingMode = 'simple',
  movingWindowSize: number = 20,
  bandMode: BandMode = 'fixed'
): StatisticalAnalysis | null {
  if (!data || data.length === 0) {
    return null;
  }

  const values = data.map(d => d.value);

  // Calculate mean based on averaging mode
  let mean: number;
  let movingAverages: number[] | undefined;
  let baselineForStdDev: number[];

  if (averagingMode === 'moving') {
    movingAverages = calculateMovingAverage(values, movingWindowSize);
    // Use the overall mean of moving averages for std dev bands
    mean = movingAverages.reduce((sum, val) => sum + val, 0) / movingAverages.length;
    // Calculate std dev based on deviations from moving average at each point
    baselineForStdDev = movingAverages;
  } else {
    // Simple average
    mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    // Calculate std dev based on deviations from overall mean
    baselineForStdDev = new Array(values.length).fill(mean);
  }

  // Calculate standard deviation relative to the baseline (either simple mean or moving average)
  const squaredDiffs = values.map((val, i) => Math.pow(val - baselineForStdDev[i], 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Calculate rolling standard deviations for dynamic (Bollinger Band) mode
  let rollingStdDevs: number[] | undefined;
  if (bandMode === 'dynamic' && movingAverages) {
    rollingStdDevs = calculateRollingStdDev(values, movingAverages, movingWindowSize);
  }

  // Calculate min and max
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  // Calculate standard deviation bands
  const stdDev1Upper = mean + stdDev;
  const stdDev1Lower = mean - stdDev;
  const stdDev2Upper = mean + (stdDev * 2);
  const stdDev2Lower = mean - (stdDev * 2);
  const stdDev3Upper = mean + (stdDev * 3);
  const stdDev3Lower = mean - (stdDev * 3);

  // Calculate rate of change (linear regression slope)
  const rateOfChange = calculateRateOfChange(data);

  // Determine trend
  let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
  const changeThreshold = stdDev * 0.1; // 10% of std dev
  if (Math.abs(rateOfChange) > changeThreshold) {
    trend = rateOfChange > 0 ? 'increasing' : 'decreasing';
  }

  return {
    mean,
    stdDev,
    min,
    max,
    range,
    stdDev1Upper,
    stdDev1Lower,
    stdDev2Upper,
    stdDev2Lower,
    stdDev3Upper,
    stdDev3Lower,
    rateOfChange,
    trend,
    movingAverages,
    rollingStdDevs,
  };
}

/**
 * Calculate rate of change using linear regression
 * Returns change per hour
 */
function calculateRateOfChange(data: MetricDataPoint[]): number {
  if (data.length < 2) {
    return 0;
  }

  // Convert timestamps to hours from first data point
  const firstTime = new Date(data[0].timestamp).getTime();
  const timeValues = data.map(d =>
    (new Date(d.timestamp).getTime() - firstTime) / (1000 * 60 * 60) // Convert to hours
  );
  const values = data.map(d => d.value);

  // Calculate linear regression slope (least squares method)
  const n = data.length;
  const sumX = timeValues.reduce((sum, x) => sum + x, 0);
  const sumY = values.reduce((sum, y) => sum + y, 0);
  const sumXY = timeValues.reduce((sum, x, i) => sum + (x * values[i]), 0);
  const sumX2 = timeValues.reduce((sum, x) => sum + (x * x), 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  return slope;
}

/**
 * Prepare data for chart with statistical overlays
 */
export interface ChartDataPoint {
  timestamp: string;
  value: number;
  mean: number;
  stdDev1Upper: number;
  stdDev1Lower: number;
  stdDev2Upper: number;
  stdDev2Lower: number;
  stdDev3Upper: number;
  stdDev3Lower: number;
  zoneColor: string; // Color based on deviation zone
  // Separate values for each zone (null if not in that zone)
  valueGreen: number | null;
  valueYellow: number | null;
  valueOrange: number | null;
  valueRed: number | null;
  // Anomaly marker
  isAnomaly?: boolean;
  anomalySeverity?: 'minor' | 'moderate' | 'severe';
}

export function prepareChartData(
  data: MetricDataPoint[],
  stats: StatisticalAnalysis,
  anomalies?: Anomaly[]
): ChartDataPoint[] {
  const chartPoints = data.map((point, index) => {
    // Use moving average at this index if available, otherwise use simple mean
    const meanAtPoint = stats.movingAverages ? stats.movingAverages[index] : stats.mean;

    // Calculate band values based on whether we have rolling std devs (dynamic Bollinger Bands)
    let stdDevAtPoint = stats.stdDev;
    if (stats.rollingStdDevs && stats.rollingStdDevs[index] !== undefined) {
      // Use rolling standard deviation at this point (true Bollinger Bands)
      stdDevAtPoint = stats.rollingStdDevs[index];
    }

    // Calculate band values
    const stdDev1Upper = stats.movingAverages ? meanAtPoint + stdDevAtPoint : stats.stdDev1Upper;
    const stdDev1Lower = stats.movingAverages ? meanAtPoint - stdDevAtPoint : stats.stdDev1Lower;
    const stdDev2Upper = stats.movingAverages ? meanAtPoint + (stdDevAtPoint * 2) : stats.stdDev2Upper;
    const stdDev2Lower = stats.movingAverages ? meanAtPoint - (stdDevAtPoint * 2) : stats.stdDev2Lower;
    const stdDev3Upper = stats.movingAverages ? meanAtPoint + (stdDevAtPoint * 3) : stats.stdDev3Upper;
    const stdDev3Lower = stats.movingAverages ? meanAtPoint - (stdDevAtPoint * 3) : stats.stdDev3Lower;

    // Determine color and zone-specific values based on which deviation zone the value is in
    let zoneColor = '#10b981'; // Green (within ±1σ)
    let valueGreen: number | null = null;
    let valueYellow: number | null = null;
    let valueOrange: number | null = null;
    let valueRed: number | null = null;

    if (point.value > stdDev3Upper || point.value < stdDev3Lower) {
      zoneColor = '#ef4444'; // Red (beyond ±3σ)
      valueRed = point.value;
    } else if (point.value > stdDev2Upper || point.value < stdDev2Lower) {
      zoneColor = '#f97316'; // Orange (between ±2σ and ±3σ)
      valueOrange = point.value;
    } else if (point.value > stdDev1Upper || point.value < stdDev1Lower) {
      zoneColor = '#eab308'; // Yellow (between ±1σ and ±2σ)
      valueYellow = point.value;
    } else {
      zoneColor = '#10b981'; // Green (within ±1σ)
      valueGreen = point.value;
    }

    // Check if this point is an anomaly
    const timestampStr = typeof point.timestamp === 'string'
      ? point.timestamp
      : point.timestamp.toISOString();
    const anomaly = anomalies?.find(a => a.timestamp === timestampStr);

    return {
      timestamp: timestampStr,
      value: point.value,
      mean: meanAtPoint,
      stdDev1Upper,
      stdDev1Lower,
      stdDev2Upper,
      stdDev2Lower,
      stdDev3Upper,
      stdDev3Lower,
      zoneColor,
      valueGreen,
      valueYellow,
      valueOrange,
      valueRed,
      isAnomaly: !!anomaly,
      anomalySeverity: anomaly?.severity,
    };
  });

  // Add transition points: when zone changes, duplicate the point in both zones
  const result: ChartDataPoint[] = [];
  for (let i = 0; i < chartPoints.length; i++) {
    const current = chartPoints[i];
    const prev = i > 0 ? chartPoints[i - 1] : null;

    // Check if zone changed from previous point
    if (prev && prev.zoneColor !== current.zoneColor) {
      // Add a transition point with both zones populated
      // BUT: Don't mark transition point as anomaly (it's a duplicate for line continuity)
      const transitionPoint = { ...current, isAnomaly: false, anomalySeverity: undefined };
      if (prev.valueGreen !== null) transitionPoint.valueGreen = current.value;
      if (prev.valueYellow !== null) transitionPoint.valueYellow = current.value;
      if (prev.valueOrange !== null) transitionPoint.valueOrange = current.value;
      if (prev.valueRed !== null) transitionPoint.valueRed = current.value;
      result.push(transitionPoint);
    }

    result.push(current);
  }

  return result;
}

/**
 * Format rate of change for display
 */
export function formatRateOfChange(rate: number, unit: string): string {
  const absRate = Math.abs(rate);
  const direction = rate > 0 ? '↑' : rate < 0 ? '↓' : '→';

  if (absRate < 0.01) {
    return `${direction} Stable`;
  } else if (absRate < 1) {
    return `${direction} ${absRate.toFixed(2)} ${unit}/hr`;
  } else {
    return `${direction} ${absRate.toFixed(1)} ${unit}/hr`;
  }
}

/**
 * Detect anomalies (values outside 3 standard deviations)
 */
export interface Anomaly {
  timestamp: string;
  value: number;
  deviationsFromMean: number;
  severity: 'minor' | 'moderate' | 'severe';
}

export function detectAnomalies(
  data: MetricDataPoint[],
  stats: StatisticalAnalysis
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  data.forEach((point, index) => {
    // Use local moving average and rolling std dev if available (for Bollinger Bands)
    const meanAtPoint = stats.movingAverages ? stats.movingAverages[index] : stats.mean;
    let stdDevAtPoint = stats.stdDev;
    if (stats.rollingStdDevs && stats.rollingStdDevs[index] !== undefined) {
      stdDevAtPoint = stats.rollingStdDevs[index];
    }

    const deviationsFromMean = Math.abs(point.value - meanAtPoint) / stdDevAtPoint;

    if (deviationsFromMean > 2) {
      let severity: 'minor' | 'moderate' | 'severe';
      if (deviationsFromMean > 3) {
        severity = 'severe';
      } else if (deviationsFromMean > 2.5) {
        severity = 'moderate';
      } else {
        severity = 'minor';
      }

      anomalies.push({
        timestamp: typeof point.timestamp === 'string'
          ? point.timestamp
          : point.timestamp.toISOString(),
        value: point.value,
        deviationsFromMean,
        severity,
      });
    }
  });

  return anomalies;
}
