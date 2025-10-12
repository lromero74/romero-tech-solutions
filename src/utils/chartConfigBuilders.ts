/**
 * Chart Configuration Builders
 * Functions to build ECharts grid, axis, and base configuration
 */

import { format } from 'date-fns';
import type { ActiveOscillator, ChartDisplayType, OscillatorHeights } from '../types/chartTypes';

/**
 * Build grid layout configuration for all panels
 */
export const buildGrids = (
  activeOscillators: ActiveOscillator[],
  oscillatorHeights: OscillatorHeights
): any[] => {
  const grids: any[] = [
    {
      left: 60,
      right: 20,
      top: 20,
      bottom: activeOscillators.length === 0 ? 80 : `${100 - oscillatorHeights.main}%`,
      containLabel: false,
    },
  ];

  // Add oscillator grids dynamically
  let cumulativeTop = oscillatorHeights.main;
  activeOscillators.forEach((osc, index) => {
    const isLast = index === activeOscillators.length - 1;
    grids.push({
      left: 60,
      right: 20,
      top: `${cumulativeTop}%`,
      height: isLast ? `${osc.height - 8}%` : `${osc.height}%`, // -8% for slider space on last panel
      containLabel: false,
    });
    cumulativeTop += osc.height;
  });

  return grids;
};

/**
 * Build xAxis configuration for all panels
 */
export const buildXAxes = (
  activeOscillators: ActiveOscillator[],
  chartDisplayType: ChartDisplayType,
  isDark: boolean
): any[] => {
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
        formatter: (value: number) => format(new Date(value), 'HH:mm'),
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
        show: isLast, // Only show labels on bottom-most panel
        color: isDark ? '#9ca3af' : '#6b7280',
        fontSize: 12,
        formatter: (value: number) => format(new Date(value), 'HH:mm'),
      },
      splitLine: {
        show: false,
      },
    });
  });

  return xAxes;
};

/**
 * Build yAxis configuration for all panels
 */
export const buildYAxes = (
  activeOscillators: ActiveOscillator[],
  isDark: boolean,
  unit: string
): any[] => {
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
        formatter: (value: number) => `${value.toFixed(1)}${unit}`,
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
      scale: true,
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

    // Set appropriate Y-axis ranges for each indicator type
    if (osc.key === 'rsi' || osc.key === 'stochastic') {
      config.min = 0;
      config.max = 100;
      config.axisLabel.formatter = (value: number) => `${value.toFixed(0)}`;
    } else if (osc.key === 'williamsR') {
      config.min = -100;
      config.max = 0;
      config.axisLabel.formatter = (value: number) => `${value.toFixed(0)}`;
    }
    // MACD, ROC, ATR use auto-scaling (no min/max specified)

    yAxes.push(config);
  });

  return yAxes;
};

/**
 * Build base ECharts configuration
 */
export const buildBaseConfig = (
  grids: any[],
  xAxes: any[],
  yAxes: any[],
  activeZoomRange: [number, number],
  isDark: boolean,
  unit: string
): any => {
  const sliderBottom = 10;

  return {
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
        xAxisIndex: Array.from({ length: xAxes.length }, (_, i) => i), // Apply to all x-axes
        start: activeZoomRange[0],
        end: activeZoomRange[1],
        zoomOnMouseWheel: 'shift',
        moveOnMouseMove: true,
        moveOnMouseWheel: true,
      },
      {
        type: 'slider',
        xAxisIndex: Array.from({ length: xAxes.length }, (_, i) => i), // Apply to all x-axes
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
};
