import React, { useState, useRef, useEffect } from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
  Scatter,
  Brush,
} from 'recharts';
import { format } from 'date-fns';
import {
  type AveragingMode,
  type BandMode,
} from '../../utils/metricsStats';
import { themeClasses, useTheme } from '../../contexts/ThemeContext';
import type { MetricsChartProps, ChartDisplayType } from './MetricsChart.types';
import { useChartData } from './hooks/useChartData';
import { useChartDomain } from './hooks/useChartDomain';
import { useZoomControls } from './hooks/useZoomControls';
import { useAnomalyNavigation } from './hooks/useAnomalyNavigation';
import ChartHeader from './MetricsChart/ChartHeader';
import ChartControls from './MetricsChart/ChartControls';
import { AveragingControls, StatisticsSummary } from './MetricsChart/SimpleComponents';
import AnomalyWarning from './MetricsChart/AnomalyWarning';

const MetricsChart: React.FC<MetricsChartProps> = ({
  data,
  title,
  dataKey,
  unit,
  showStdDev = true,
  showRateOfChange = true,
  height = 300,
}) => {
  const { isDark } = useTheme();

  // State for chart display type
  const [chartDisplayType, setChartDisplayType] = useState<ChartDisplayType>('line');

  // State for candlestick period (in minutes)
  const [candlestickPeriod, setCandlestickPeriod] = useState<number>(30);

  // State for averaging mode and window size
  const [averagingMode, setAveragingMode] = useState<AveragingMode>('moving');
  const [windowSize, setWindowSize] = useState<number>(20);
  const [bandMode, setBandMode] = useState<BandMode>('dynamic');

  // State for Y-axis autofitting
  const [autoFitYAxis, setAutoFitYAxis] = useState<boolean>(true);

  // State for time window selection
  const [selectedTimeWindow, setSelectedTimeWindow] = useState<number>(4);

  // Chart refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  const initialZoomDomainRef = useRef<{ startIndex: number; endIndex: number } | null>(null);
  const lastSelectedTimeWindowRef = useRef<number>(selectedTimeWindow);

  // Use chart data hook for data processing
  const {
    stats,
    anomalies,
    filteredAnomalies,
    chartData,
    candlestickData,
    heikenAshiData,
    activeData,
  } = useChartData({
    data,
    unit,
    title,
    averagingMode,
    windowSize,
    bandMode,
    chartDisplayType,
    candlestickPeriod,
  });

  // Use chart domain hook for domain calculations
  const {
    calculateInitialZoomDomain,
    yAxisDomain,
    yAxisDecimalPlaces,
    visibleDataRange,
  } = useChartDomain({
    chartData,
    candlestickData,
    heikenAshiData,
    chartDisplayType,
    selectedTimeWindow,
    unit,
    autoFitYAxis,
    initialZoomDomainRef,
    lastSelectedTimeWindowRef,
  });

  // Use zoom controls hook
  const {
    zoomDomain,
    activeDomain,
    zoomPercentage,
    setZoomDomain,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
    handleBrushChange,
    handleJumpToNow,
  } = useZoomControls({
    chartData,
    candlestickData,
    heikenAshiData,
    chartDisplayType,
    selectedTimeWindow,
    calculateInitialZoomDomain,
  });

  // Use anomaly navigation hook
  const {
    anomalyNavigationExpanded,
    anomalySeverityFilter,
    currentAnomalyIndex,
    highlightedAnomalyTimestamp,
    navigateToAnomaly,
    handlePreviousAnomaly,
    handleNextAnomaly,
    handleToggleAnomalyNavigation,
    handleSeverityFilterChange,
  } = useAnomalyNavigation({
    filteredAnomalies,
    chartData,
    setZoomDomain,
  });

  // When selectedTimeWindow changes, reset the cached initial zoom domain
  useEffect(() => {
    initialZoomDomainRef.current = null;
  }, [selectedTimeWindow]);

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
      {/* Header with stats and time controls */}
      <ChartHeader
        title={title}
        stats={stats}
        unit={unit}
        showRateOfChange={showRateOfChange}
        selectedTimeWindow={selectedTimeWindow}
        onTimeWindowChange={(window) => {
          setSelectedTimeWindow(window);
          initialZoomDomainRef.current = null;
        }}
        onJumpToNow={handleJumpToNow}
      />

      <div className="flex justify-between items-start mb-4">
        <div className="flex-1" />

        {/* Chart Controls */}
        <ChartControls
          chartDisplayType={chartDisplayType}
          onChartDisplayTypeChange={setChartDisplayType}
          candlestickPeriod={candlestickPeriod}
          onCandlestickPeriodChange={setCandlestickPeriod}
          autoFitYAxis={autoFitYAxis}
          onAutoFitYAxisToggle={() => setAutoFitYAxis(!autoFitYAxis)}
          zoomPercentage={zoomPercentage}
          zoomDomain={zoomDomain}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetZoom={handleResetZoom}
        />
      </div>

      {/* Averaging Mode Controls */}
      <AveragingControls
        averagingMode={averagingMode}
        onAveragingModeChange={setAveragingMode}
        windowSize={windowSize}
        onWindowSizeChange={setWindowSize}
        bandMode={bandMode}
        onBandModeChange={setBandMode}
      />

      {/* Anomaly Warning and Navigation */}
      <AnomalyWarning
        anomalies={anomalies}
        filteredAnomalies={filteredAnomalies}
        anomalyNavigationExpanded={anomalyNavigationExpanded}
        anomalySeverityFilter={anomalySeverityFilter}
        currentAnomalyIndex={currentAnomalyIndex}
        unit={unit}
        onToggle={handleToggleAnomalyNavigation}
        onSeverityFilterChange={handleSeverityFilterChange}
        onPrevious={handlePreviousAnomaly}
        onNext={handleNextAnomaly}
        onNavigate={navigateToAnomaly}
      />

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
          <ComposedChart
            data={activeData}
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
              if (typeof value === 'number' && isFinite(value)) {
                if (value > 1000000) {
                  return '';
                }
                if (unit === '%') {
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

          {/* Standard Deviation Lines */}
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

          {/* Anomaly markers */}
          <Scatter
            dataKey="value"
            fill="none"
            isAnimationActive={false}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            shape={(props: any) => {
              const { cx, cy, payload } = props;
              if (!payload.isAnomaly) return null;

              const severityColors = {
                severe: '#dc2626',
                moderate: '#f59e0b',
                minor: '#eab308'
              };
              const color = severityColors[payload.anomalySeverity as keyof typeof severityColors] || '#dc2626';

              const isHighlighted = highlightedAnomalyTimestamp === payload.timestamp;

              return (
                <g>
                  {/* Blue halo for highlighted anomaly */}
                  {isHighlighted && (
                    <>
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
              <Scatter
                dataKey="high"
                fill="none"
                isAnimationActive={false}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                shape={(props: any) => {
                  const { cx, payload } = props;
                  if (!payload) return null;

                  const [minDomain, maxDomain] = yAxisDomain as [number, number];
                  const range = maxDomain - minDomain;

                  const openPercent = (payload.open - minDomain) / range;
                  const closePercent = (payload.close - minDomain) / range;
                  const highPercent = (payload.high - minDomain) / range;
                  const lowPercent = (payload.low - minDomain) / range;

                  const renderHeight = height - 100;
                  const topMargin = 30;

                  const openY = topMargin + renderHeight * (1 - openPercent);
                  const closeY = topMargin + renderHeight * (1 - closePercent);
                  const highY = topMargin + renderHeight * (1 - highPercent);
                  const lowY = topMargin + renderHeight * (1 - lowPercent);

                  const candleWidth = 8;
                  const wickWidth = 2;

                  const fillColor = payload.isGreen
                    ? (isDark ? '#22c55e' : '#16a34a')
                    : (isDark ? '#ef4444' : '#dc2626');

                  const strokeColor = payload.isGreen
                    ? (isDark ? '#16a34a' : '#15803d')
                    : (isDark ? '#dc2626' : '#b91c1c');

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
                        height={Math.max(Math.abs(closeY - openY), 1)}
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
            if (!activeData || activeData.length < 2) {
              return null;
            }

            let brushStartIndex: number | undefined = undefined;
            let brushEndIndex: number | undefined = undefined;

            if (activeDomain && activeData.length > 0) {
              if (chartDisplayType === 'candlestick' && chartData.length > 0 && candlestickData.length > 0) {
                const ratio = candlestickData.length / chartData.length;
                brushStartIndex = Math.max(0, Math.floor(activeDomain.startIndex * ratio));
                brushEndIndex = Math.min(candlestickData.length - 1, Math.ceil(activeDomain.endIndex * ratio));
              } else if (chartDisplayType === 'heiken-ashi' && chartData.length > 0 && heikenAshiData.length > 0) {
                const ratio = heikenAshiData.length / chartData.length;
                brushStartIndex = Math.max(0, Math.floor(activeDomain.startIndex * ratio));
                brushEndIndex = Math.min(heikenAshiData.length - 1, Math.ceil(activeDomain.endIndex * ratio));
              } else if (chartDisplayType === 'line') {
                brushStartIndex = Math.max(0, Math.min(activeDomain.startIndex, activeData.length - 1));
                brushEndIndex = Math.max(0, Math.min(activeDomain.endIndex, activeData.length - 1));
              }

              if (!Number.isFinite(brushStartIndex) || !Number.isFinite(brushEndIndex) ||
                  brushStartIndex < 0 || brushEndIndex < 0 ||
                  brushStartIndex >= activeData.length || brushEndIndex >= activeData.length ||
                  brushStartIndex >= brushEndIndex) {
                brushStartIndex = undefined;
                brushEndIndex = undefined;
              }
            } else {
              brushStartIndex = 0;
              brushEndIndex = activeData.length - 1;
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
      <StatisticsSummary stats={stats} unit={unit} />
    </div>
  );
};

export default MetricsChart;
