import React, { useMemo, useState } from 'react';
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
} from 'recharts';
import { format } from 'date-fns';
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
}) => {
  const { isDark } = useTheme();

  // State for averaging mode and window size (default to moving average with 20-point window and dynamic Bollinger Bands)
  const [averagingMode, setAveragingMode] = useState<AveragingMode>('moving');
  const [windowSize, setWindowSize] = useState<number>(20);
  const [bandMode, setBandMode] = useState<BandMode>('dynamic');

  // Validate and normalize data (especially for percentages)
  const validatedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return data.map(point => {
      let value = point.value;

      // For percentage metrics, ensure values are in 0-100 range
      if (unit === '%') {
        // If value is suspiciously large (like a timestamp), default to 0
        if (value > 100 || value < 0 || !isFinite(value)) {
          console.warn(`Invalid percentage value detected: ${value}, defaulting to 0`);
          value = 0;
        }
      }

      return {
        timestamp: point.timestamp,
        value: value
      };
    });
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

  // Calculate Y-axis domain
  const yAxisDomain = useMemo(() => {
    if (unit === '%') {
      return [0, 100];
    }
    // For non-percentage metrics, use auto with some padding
    return ['auto', 'auto'];
  }, [unit]);

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
      {/* Header with stats */}
      <div className="flex justify-between items-start mb-4">
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
        <div className="text-right">
          <div className={`text-sm ${themeClasses.text.secondary}`}>
            <span className="font-medium">Avg:</span> {stats.mean.toFixed(1)}{unit}
          </div>
          <div className={`text-xs ${themeClasses.text.tertiary} mt-1`}>
            σ: {stats.stdDev.toFixed(1)}{unit}
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

      {/* Anomaly Warning */}
      {anomalies.length > 0 && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-900 dark:text-yellow-100">
            ⚠️ {anomalies.length} anomal{anomalies.length === 1 ? 'y' : 'ies'} detected
            ({anomalies.filter(a => a.severity === 'severe').length} severe)
          </p>
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
          />
          <YAxis
            tick={{ fontSize: 12, fill: isDark ? '#9ca3af' : '#6b7280' }}
            label={{
              value: unit,
              angle: -90,
              position: 'insideLeft',
              fontSize: 12,
              fill: isDark ? '#9ca3af' : '#6b7280'
            }}
            stroke={isDark ? '#4b5563' : '#d1d5db'}
            domain={yAxisDomain as [number, number] | ['auto', 'auto']}
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

              return (
                <g>
                  {/* Warning triangle */}
                  <polygon
                    points={`${cx},${cy - 8} ${cx - 7},${cy + 4} ${cx + 7},${cy + 4}`}
                    fill={color}
                    stroke="white"
                    strokeWidth={1.5}
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
