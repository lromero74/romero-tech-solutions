import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { themeClasses, useTheme } from '../../../contexts/ThemeContext';
import type { MetricsChartEChartsProps } from './types';

// Hooks
import { useChartState } from './hooks/useChartState';
import { useChartData } from './hooks/useChartData';
import { useOscillatorHeights } from './hooks/useOscillatorHeights';
import { useChartResize } from './hooks/useChartResize';
import { useChartEffects } from './hooks/useChartEffects';

// Components
import { ChartHeader } from './components/ChartHeader';
import { ChartToolbar } from './components/ChartToolbar';
import { ChartContainer } from './components/ChartContainer';
import { BottomStatsBar } from './components/BottomStatsBar';
import { IndicatorsDropdown } from './components/IndicatorsDropdown';
import { ConfluenceAlerts } from './components/ConfluenceAlerts';

// Utils
import { buildChartOption } from './utils/buildChartOption';

const MetricsChartECharts: React.FC<MetricsChartEChartsProps> = ({
  data,
  title,
  dataKey,
  unit,
  color = '#3b82f6',
  showStdDev = true,
  showRateOfChange = true,
  height = 300,
  highlightTimeRange = null,
  scrollToTimestamp = null,
  indicatorOverlay = null,
}) => {
  const { isDark } = useTheme();
  const [containerWidth, setContainerWidth] = React.useState<number>(0);

  // Initialize all state
  const chartState = useChartState(height);

  // Calculate all data
  const chartDataResults = useChartData({
    data,
    unit,
    averagingMode: chartState.averagingMode,
    windowSize: chartState.windowSize,
    bandMode: chartState.bandMode,
    candlestickPeriod: chartState.candlestickPeriod,
    activeIndicators: chartState.activeIndicators,
    chartDisplayType: chartState.chartDisplayType,
  });

  // Filter anomalies based on severity
  const filteredAnomalies = useMemo(() => {
    if (chartState.anomalySeverityFilter === 'severe') {
      return chartDataResults.anomalies.filter(a => a.severity === 'severe');
    }
    return chartDataResults.anomalies;
  }, [chartDataResults.anomalies, chartState.anomalySeverityFilter]);

  // Setup oscillator height management
  useOscillatorHeights({
    activeIndicators: chartState.activeIndicators,
    setOscillatorHeights: chartState.setOscillatorHeights,
  });

  // Setup resize handling
  const { handleResizeMouseDown } = useChartResize({
    isDragging: chartState.isDragging,
    setIsDragging: chartState.setIsDragging,
    chartContainerRef: chartState.chartContainerRef,
    dragOffsetRef: chartState.dragOffsetRef,
    oscillatorHeights: chartState.oscillatorHeights,
    setOscillatorHeights: chartState.setOscillatorHeights,
    setChartHeight: chartState.setChartHeight,
    activeIndicators: chartState.activeIndicators,
  });

  // Setup effects (click-outside, zoom, etc.)
  const { activeZoomRange } = useChartEffects({
    showIndicatorsMenu: chartState.showIndicatorsMenu,
    setShowIndicatorsMenu: chartState.setShowIndicatorsMenu,
    indicatorsButtonRef: chartState.indicatorsButtonRef,
    dropdownRef: chartState.dropdownRef,
    selectedTimeWindow: chartState.selectedTimeWindow,
    setCurrentZoom: chartState.setCurrentZoom,
    setIsInitialRender: chartState.setIsInitialRender,
    zoomTimeoutRef: chartState.zoomTimeoutRef,
    chartData: chartDataResults.chartData,
    currentZoom: chartState.currentZoom,
    isInitialRender: chartState.isInitialRender,
  });

  // Track container width for dynamic candle sizing
  React.useEffect(() => {
    const container = chartState.chartContainerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const width = container.getBoundingClientRect().width;
      setContainerWidth(width);
    };

    // Initial measurement
    updateWidth();

    // Track resize
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [chartState.chartContainerRef]);

  // Handle navigation context (scroll to timestamp, highlight range, enable indicator)
  React.useEffect(() => {
    if (scrollToTimestamp && chartDataResults.chartData.length > 0) {
      console.log('📍 Scrolling to timestamp:', scrollToTimestamp);

      const targetTime = new Date(scrollToTimestamp).getTime();
      const dataIndex = chartDataResults.chartData.findIndex(d =>
        new Date(d.timestamp).getTime() >= targetTime
      );

      if (dataIndex !== -1) {
        // Calculate zoom range to center on this timestamp (±30 minutes)
        const windowMs = 30 * 60 * 1000; // 30 minutes
        const startTime = targetTime - windowMs;
        const endTime = targetTime + windowMs;

        chartState.setCurrentZoom({
          start: startTime,
          end: endTime,
        });

        console.log('✅ Zoomed to timestamp:', {
          targetTime: new Date(targetTime).toISOString(),
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
        });
      }
    }
  }, [scrollToTimestamp, chartDataResults.chartData, chartState]);

  // Handle indicator overlay from navigation
  React.useEffect(() => {
    if (indicatorOverlay) {
      console.log('📊 Enabling indicator overlay:', indicatorOverlay);

      // Map indicator names to chart state keys
      const indicatorMap: Record<string, keyof ActiveIndicators> = {
        'RSI': 'rsi',
        'Stochastic': 'stochastic',
        'Williams %R': 'williamsR',
        'MACD': 'macd',
        'ROC': 'roc',
        'ATR': 'atr',
      };

      const indicatorKey = indicatorMap[indicatorOverlay];
      if (indicatorKey && !chartState.activeIndicators[indicatorKey]) {
        chartState.setActiveIndicators(prev => ({
          ...prev,
          [indicatorKey]: true,
        }));
        console.log('✅ Enabled indicator:', indicatorKey);
      }
    }
  }, [indicatorOverlay, chartState]);

  // Build ECharts option
  const option = useMemo(() => {
    return buildChartOption({
      stats: chartDataResults.stats,
      chartData: chartDataResults.chartData,
      candlestickData: chartDataResults.candlestickData,
      heikenAshiData: chartDataResults.heikenAshiData,
      chartDisplayType: chartState.chartDisplayType,
      showStdDev,
      dataKey,
      unit,
      isDark,
      activeZoomRange,
      candlestickPeriod: chartState.candlestickPeriod,
      anomalies: chartDataResults.anomalies,
      autoFitYAxis: chartState.autoFitYAxis,
      bollingerBands: chartDataResults.bollingerBands,
      validatedData: chartDataResults.validatedData,
      activeIndicators: chartState.activeIndicators,
      technicalIndicators: chartDataResults.technicalIndicators,
      candleIndicators: chartDataResults.candleIndicators,
      color,
      dataGaps: chartDataResults.dataGaps,
      oscillatorHeights: chartState.oscillatorHeights,
      highlightTimeRange, // Add highlight time range for alert navigation
      containerWidth, // Add container width for dynamic candle sizing
    });
  }, [
    chartDataResults.stats,
    chartDataResults.chartData,
    chartDataResults.candlestickData,
    chartDataResults.heikenAshiData,
    chartDataResults.anomalies,
    chartDataResults.bollingerBands,
    chartDataResults.validatedData,
    chartDataResults.technicalIndicators,
    chartDataResults.candleIndicators,
    chartDataResults.dataGaps,
    chartState.chartDisplayType,
    chartState.candlestickPeriod,
    chartState.autoFitYAxis,
    chartState.activeIndicators,
    chartState.oscillatorHeights,
    showStdDev,
    dataKey,
    unit,
    isDark,
    activeZoomRange,
    color,
    highlightTimeRange, // Include in dependencies
    containerWidth, // Include in dependencies for dynamic sizing
  ]);

  // Memoize chart events
  const onChartEvents = useMemo(() => ({
    dataZoom: (params: any) => {
      // ECharts handles zoom internally
    },
  }), []);

  // Memoize the chart element
  const chartElement = useMemo(() => (
    <ReactECharts
      option={option}
      style={{ height: `${chartState.chartHeight}px` }}
      opts={{ renderer: 'canvas' }}
      notMerge={true} // Force complete chart rebuild when indicators change
      lazyUpdate={false} // Always update immediately for smooth resizing
      onEvents={onChartEvents}
    />
  ), [option, chartState.chartHeight, onChartEvents]);

  // Handle indicators dropdown toggle
  const handleToggleIndicatorsMenu = () => {
    if (!chartState.showIndicatorsMenu && chartState.indicatorsButtonRef.current) {
      const rect = chartState.indicatorsButtonRef.current.getBoundingClientRect();
      chartState.setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left,
        right: window.innerWidth - rect.right,
      });
    }
    chartState.setShowIndicatorsMenu(!chartState.showIndicatorsMenu);
  };

  // Handle indicator toggle
  const handleToggleIndicator = (key: keyof typeof chartState.activeIndicators) => {
    chartState.setActiveIndicators(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Early returns for edge cases
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

  if (!chartDataResults.stats) {
    return null;
  }

  return (
    <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
      {/* Header */}
      <ChartHeader
        title={title}
        unit={unit}
        stats={chartDataResults.stats}
        autoFitYAxis={chartState.autoFitYAxis}
        onToggleAutoFit={() => chartState.setAutoFitYAxis(!chartState.autoFitYAxis)}
      />

      {/* Toolbar */}
      <ChartToolbar
        chartDisplayType={chartState.chartDisplayType}
        onChartTypeChange={chartState.setChartDisplayType}
        candlestickPeriod={chartState.candlestickPeriod}
        onCandlestickPeriodChange={chartState.setCandlestickPeriod}
        selectedTimeWindow={chartState.selectedTimeWindow}
        onTimeWindowChange={chartState.setSelectedTimeWindow}
        activeIndicators={chartState.activeIndicators}
        showIndicatorsMenu={chartState.showIndicatorsMenu}
        onToggleIndicatorsMenu={handleToggleIndicatorsMenu}
        indicatorsButtonRef={chartState.indicatorsButtonRef}
      />

      {/* Indicators Dropdown */}
      <IndicatorsDropdown
        show={chartState.showIndicatorsMenu}
        dropdownPosition={chartState.dropdownPosition}
        dropdownRef={chartState.dropdownRef}
        activeIndicators={chartState.activeIndicators}
        onToggleIndicator={handleToggleIndicator}
      />

      {/* Confluence Alerts */}
      {chartDataResults.confluenceAlerts && chartDataResults.confluenceAlerts.length > 0 && (
        <ConfluenceAlerts alerts={chartDataResults.confluenceAlerts} />
      )}

      {/* Chart */}
      <ChartContainer
        chartElement={chartElement}
        chartContainerRef={chartState.chartContainerRef}
        activeIndicators={chartState.activeIndicators}
        oscillatorHeights={chartState.oscillatorHeights}
        isDragging={chartState.isDragging}
        handleResizeMouseDown={handleResizeMouseDown}
      />

      {/* Bottom Stats Bar */}
      <BottomStatsBar
        stats={chartDataResults.stats}
        unit={unit}
        showRateOfChange={showRateOfChange}
      />
    </div>
  );
};

export default MetricsChartECharts;
