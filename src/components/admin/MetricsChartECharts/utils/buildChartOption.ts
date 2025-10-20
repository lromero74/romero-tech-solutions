import { format } from 'date-fns';
import type { ChartDisplayType, ActiveIndicators, OscillatorHeights } from '../types';
import {
  buildLineChartSeries,
  buildCandlestickSeries,
  buildHeikenAshiSeries,
  buildOscillatorSeries,
} from '../../../../utils/chartSeriesBuilders';

interface BuildChartOptionProps {
  stats: any;
  chartData: any[];
  candlestickData: any[];
  heikenAshiData: any[];
  chartDisplayType: ChartDisplayType;
  showStdDev: boolean;
  dataKey: string;
  unit: string;
  isDark: boolean;
  activeZoomRange: [number, number];
  candlestickPeriod: number;
  anomalies: any[];
  autoFitYAxis: boolean;
  bollingerBands: any[];
  validatedData: any[];
  activeIndicators: ActiveIndicators;
  technicalIndicators: any;
  candleIndicators: any;
  color: string;
  dataGaps: Array<{ start: number; end: number }>;
  oscillatorHeights: OscillatorHeights;
  highlightTimeRange?: {
    start: string;
    end: string;
  } | null;
  containerWidth: number;
}

export const buildChartOption = ({
  stats,
  chartData,
  candlestickData,
  heikenAshiData,
  chartDisplayType,
  showStdDev,
  dataKey,
  unit,
  isDark,
  activeZoomRange,
  candlestickPeriod,
  anomalies,
  autoFitYAxis,
  bollingerBands,
  validatedData,
  activeIndicators,
  technicalIndicators,
  candleIndicators,
  color,
  dataGaps,
  oscillatorHeights,
  highlightTimeRange,
  containerWidth,
}: BuildChartOptionProps) => {
  if (!stats || !chartData || chartData.length === 0) return {};

  // Calculate dynamic candle width based on container size and number of candles
  const calculateDynamicBarWidth = () => {
    if (containerWidth === 0) return 8; // Fallback to static value

    // Account for chart margins (left: 70px, right: 20px from grid config)
    const effectiveWidth = containerWidth - 90;

    // Calculate number of visible candles based on zoom range
    const zoomPercent = (activeZoomRange[1] - activeZoomRange[0]) / 100;
    const numCandles = chartDisplayType === 'candlestick' || chartDisplayType === 'heiken-ashi'
      ? candlestickData.length
      : 0;

    if (numCandles === 0) return 8;

    const visibleCandles = Math.ceil(numCandles * zoomPercent);

    // Calculate width per candle, using 60% for candle and 40% for spacing
    const widthPerCandle = effectiveWidth / visibleCandles;
    const barWidth = widthPerCandle * 0.6;

    // Clamp between reasonable min/max values
    return Math.max(2, Math.min(80, barWidth));
  };

  const dynamicBarWidth = calculateDynamicBarWidth();

  const timestamps = chartData.map(d => new Date(d.timestamp).getTime());

  // Find day boundaries (midnight timestamps) for vertical lines
  const dayBoundaries: number[] = [];
  const seenDates = new Set<string>();

  timestamps.forEach(ts => {
    const date = new Date(ts);
    const dateKey = format(date, 'yyyy-MM-dd');

    // Check if this is midnight (00:00) and we haven't seen this date yet
    if (date.getHours() === 0 && date.getMinutes() === 0 && !seenDates.has(dateKey)) {
      dayBoundaries.push(ts);
      seenDates.add(dateKey);
    }
  });

  // Calculate grid layout based on active oscillators
  const activeOscillators = [
    { key: 'rsi', active: activeIndicators.rsi === true, height: oscillatorHeights.rsi },
    { key: 'macd', active: activeIndicators.macd === true, height: oscillatorHeights.macd },
    { key: 'stochastic', active: activeIndicators.stochastic === true, height: oscillatorHeights.stochastic },
    { key: 'williamsR', active: activeIndicators.williamsR === true, height: oscillatorHeights.williamsR },
    { key: 'roc', active: activeIndicators.roc === true, height: oscillatorHeights.roc },
    { key: 'atr', active: activeIndicators.atr === true, height: oscillatorHeights.atr },
  ].filter(osc => osc.active);

  const oscillatorCount = activeOscillators.length;
  const sliderBottom = 10;
  const sliderHeight = 30;
  const xAxisLabelSpace = 30; // Space for x-axis labels (increased to prevent overlap)
  const sliderGap = 8; // Gap between x-axis labels and slider
  const sliderTotalSpace = sliderGap + sliderHeight + sliderBottom; // gap + height + bottom margin
  const bottomPanelSpace = xAxisLabelSpace + sliderTotalSpace; // Total space needed at bottom

  // Build grids array dynamically
  const grids: any[] = [
    {
      left: 70,
      right: 20,
      top: 20,
      bottom: oscillatorCount === 0 ? 80 : `${100 - oscillatorHeights.main}%`,
      containLabel: false,
    },
  ];

  // Add oscillator grids dynamically
  let cumulativeTop = oscillatorHeights.main;
  activeOscillators.forEach((osc, index) => {
    const isLast = index === activeOscillators.length - 1;
    grids.push({
      left: 70,
      right: 20,
      top: `${cumulativeTop}%`,
      height: isLast ? `${osc.height - 8}%` : `${osc.height}%`, // -8% for slider space on last panel
      containLabel: false,
    });
    cumulativeTop += osc.height;
  });

  // Build xAxis array dynamically
  const xAxes: any[] = [
    {
      type: 'time',
      gridIndex: 0,
      boundaryGap: (chartDisplayType === 'candlestick' || chartDisplayType === 'heiken-ashi') ? ['2%', '2%'] : ['0%', '0%'],
      axisLine: {
        lineStyle: {
          color: isDark ? '#4b5563' : '#d1d5db',
        },
      },
      axisLabel: {
        color: isDark ? '#9ca3af' : '#6b7280',
        fontSize: 12,
        formatter: (value: number) => {
          const date = new Date(value);
          // If it's midnight (00:00), show day and date
          if (date.getHours() === 0 && date.getMinutes() === 0) {
            return format(date, 'EEE M/d');
          }
          // Otherwise just show time
          return format(date, 'HH:mm');
        },
      },
      splitLine: {
        show: false,
      },
    },
  ];

  // Add xAxis for each oscillator dynamically
  activeOscillators.forEach((osc, index) => {
    const isLast = index === activeOscillators.length - 1;
    xAxes.push({
      type: 'time',
      gridIndex: index + 1,
      boundaryGap: (chartDisplayType === 'candlestick' || chartDisplayType === 'heiken-ashi') ? ['2%', '2%'] : ['0%', '0%'],
      axisLine: {
        lineStyle: {
          color: isDark ? '#4b5563' : '#d1d5db',
        },
      },
      axisLabel: {
        show: isLast,
        color: isDark ? '#9ca3af' : '#6b7280',
        fontSize: 12,
        formatter: (value: number) => {
          const date = new Date(value);
          // If it's midnight (00:00), show day and date
          if (date.getHours() === 0 && date.getMinutes() === 0) {
            return format(date, 'EEE M/d');
          }
          // Otherwise just show time
          return format(date, 'HH:mm');
        },
      },
      splitLine: {
        show: false,
      },
    });
  });

  // Build yAxis array dynamically
  const yAxes: any[] = [
    {
      type: 'value',
      gridIndex: 0,
      scale: true,
      axisLine: {
        lineStyle: {
          color: isDark ? '#4b5563' : '#d1d5db',
        },
      },
      axisLabel: {
        color: isDark ? '#9ca3af' : '#6b7280',
        fontSize: 12,
        formatter: (value: number) => value != null ? `${value.toFixed(1)}${unit}` : '',
      },
      splitLine: {
        lineStyle: {
          color: isDark ? '#374151' : '#e5e7eb',
          type: 'dashed',
        },
      },
    },
  ];

  // Add yAxis for each oscillator dynamically with appropriate ranges
  activeOscillators.forEach((osc, index) => {
    const config: any = {
      type: 'value',
      gridIndex: index + 1,
      scale: false, // Disable auto-scaling to prevent overflow
      boundaryGap: [0, 0], // No gaps at top/bottom
      axisLine: {
        lineStyle: {
          color: isDark ? '#4b5563' : '#d1d5db',
        },
      },
      axisLabel: {
        color: isDark ? '#9ca3af' : '#6b7280',
        fontSize: 10,
      },
      splitLine: {
        lineStyle: {
          color: isDark ? '#374151' : '#e5e7eb',
          type: 'dashed',
        },
      },
    };

    // Set appropriate Y-axis ranges for each indicator type with strict bounds
    if (osc.key === 'rsi' || osc.key === 'stochastic') {
      config.min = 0;
      config.max = 100;
      config.axisLabel.formatter = (value: number) => value != null ? `${value.toFixed(0)}` : '';
    } else if (osc.key === 'williamsR') {
      config.min = -100;
      config.max = 0;
      config.axisLabel.formatter = (value: number) => value != null ? `${value.toFixed(0)}` : '';
    } else {
      // For MACD, ROC, ATR - use scale but with strict bounds
      config.scale = true;
    }

    yAxes.push(config);
  });

  // Base configuration
  const baseOption: any = {
    backgroundColor: 'transparent',
    animation: true,
    animationDuration: 300,
    animationEasing: 'cubicOut',
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
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
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: Array.from({ length: xAxes.length }, (_, i) => i),
        start: activeZoomRange[0],
        end: activeZoomRange[1],
        zoomOnMouseWheel: 'shift',
        moveOnMouseMove: true,
        moveOnMouseWheel: true,
      },
      {
        type: 'slider',
        xAxisIndex: Array.from({ length: xAxes.length }, (_, i) => i),
        start: activeZoomRange[0],
        end: activeZoomRange[1],
        height: 30,
        bottom: sliderBottom,
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

  // Build series based on chart display type
  let series: any[] = [];

  if (chartDisplayType === 'line') {
    series = buildLineChartSeries(
      activeIndicators,
      technicalIndicators,
      bollingerBands,
      validatedData,
      dataKey,
      color,
      isDark
    );
  } else if (chartDisplayType === 'candlestick') {
    series = buildCandlestickSeries(
      activeIndicators,
      candleIndicators,
      candlestickData,
      dataKey,
      isDark,
      dynamicBarWidth
    );
  } else if (chartDisplayType === 'heiken-ashi') {
    series = buildHeikenAshiSeries(
      activeIndicators,
      candleIndicators,
      heikenAshiData,
      dataKey,
      isDark,
      dynamicBarWidth
    );
  }

  // Add oscillator series (use candle-based indicators for candlestick/heiken-ashi modes)
  const oscillatorSeries = buildOscillatorSeries(
    activeOscillators,
    technicalIndicators,
    candleIndicators,
    isDark,
    chartDisplayType
  );

  baseOption.series = [...series, ...oscillatorSeries];

  // Add gap indicators
  if (dataGaps.length > 0) {
    baseOption.series.unshift({
      name: 'Data Gaps',
      type: 'line',
      data: [],
      markArea: {
        silent: true,
        itemStyle: {
          color: 'rgba(239, 68, 68, 0.25)',
          borderWidth: 0,
        },
        emphasis: {
          disabled: true,
        },
        data: dataGaps.map(gap => [
          {
            xAxis: gap.start,
          },
          {
            xAxis: gap.end,
          },
        ]),
      },
      z: 15,
    });
  }

  // Add vertical dashed lines at day boundaries
  if (dayBoundaries.length > 0) {
    baseOption.series.unshift({
      name: 'Day Boundaries',
      type: 'line',
      data: [],
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: {
          type: 'dashed',
          color: isDark ? '#4b5563' : '#d1d5db',
          width: 1,
        },
        label: {
          show: false,
        },
        data: dayBoundaries.map(boundary => ({
          xAxis: boundary,
        })),
      },
      z: 5, // Behind most elements but visible
    });
  }

  // Add highlight time range from alert navigation
  if (highlightTimeRange) {
    const startTime = new Date(highlightTimeRange.start).getTime();
    const endTime = new Date(highlightTimeRange.end).getTime();

    baseOption.series.unshift({
      name: 'Alert Time Range',
      type: 'line',
      data: [],
      markArea: {
        silent: true,
        itemStyle: {
          color: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)', // Blue highlight
          borderWidth: 2,
          borderColor: isDark ? 'rgba(59, 130, 246, 0.5)' : 'rgba(59, 130, 246, 0.4)',
        },
        emphasis: {
          disabled: true,
        },
        data: [[
          {
            xAxis: startTime,
          },
          {
            xAxis: endTime,
          },
        ]],
      },
      z: 10, // Below data gaps but above main chart
    });
  }

  // Y-axis autofitting
  if (autoFitYAxis && chartData.length > 0) {
    const values = chartData.map(d => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const buffer = (maxVal - minVal) * 0.1;
    baseOption.yAxis[0].scale = true; // Enable auto-scaling
    baseOption.yAxis[0].min = Math.max(0, minVal - buffer);
    baseOption.yAxis[0].max = maxVal + buffer;
  } else {
    if (unit === '%') {
      baseOption.yAxis[0].scale = false; // Disable auto-scaling to show full 0-100% range
      baseOption.yAxis[0].min = 0;
      baseOption.yAxis[0].max = 100;
    } else {
      baseOption.yAxis[0].scale = true; // Keep auto-scaling for non-percentage metrics
    }
  }

  return baseOption;
};
