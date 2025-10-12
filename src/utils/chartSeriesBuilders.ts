/**
 * Chart Series Builders
 * Functions to build ECharts series for all chart types and oscillators
 */

import type {
  ActiveOscillator,
  TechnicalIndicators,
  CandleIndicators,
  BollingerBand,
  CandlestickDataPoint,
} from '../types/chartTypes';
import type { MetricDataPoint } from './metricsStats';

interface ActiveIndicators {
  sma7?: boolean;
  sma20?: boolean;
  sma25?: boolean;
  sma99?: boolean;
  ema12?: boolean;
  ema26?: boolean;
  bb?: boolean;
  [key: string]: boolean | undefined;
}

/**
 * Build series for line chart mode
 */
export const buildLineChartSeries = (
  activeIndicators: ActiveIndicators,
  technicalIndicators: TechnicalIndicators | null,
  bollingerBands: BollingerBand[],
  validatedData: MetricDataPoint[],
  dataKey: string,
  color: string,
  isDark: boolean
): any[] => {
  const series: any[] = [];

  // Add moving averages
  if (activeIndicators.sma7 && technicalIndicators) {
    const sma7Data = technicalIndicators.timestamps
      .map((t, i) => [t, technicalIndicators.sma7[i]])
      .filter(([t, v]) => !isNaN(v as number));
    series.push({
      name: 'SMA(7)',
      type: 'line',
      data: sma7Data,
      lineStyle: { color: '#f59e0b', width: 1.5 },
      symbol: 'none',
      smooth: false,
    });
  }

  if (activeIndicators.sma20 && technicalIndicators) {
    const sma20Data = technicalIndicators.timestamps
      .map((t, i) => [t, technicalIndicators.sma20[i]])
      .filter(([t, v]) => !isNaN(v as number));
    series.push({
      name: 'SMA(20)',
      type: 'line',
      data: sma20Data,
      lineStyle: { color: '#64748b', width: 1.5 },
      symbol: 'none',
      smooth: false,
    });
  }

  if (activeIndicators.sma25 && technicalIndicators) {
    const sma25Data = technicalIndicators.timestamps
      .map((t, i) => [t, technicalIndicators.sma25[i]])
      .filter(([t, v]) => !isNaN(v as number));
    series.push({
      name: 'SMA(25)',
      type: 'line',
      data: sma25Data,
      lineStyle: { color: '#10b981', width: 1.5 },
      symbol: 'none',
      smooth: false,
    });
  }

  if (activeIndicators.sma99 && technicalIndicators) {
    const sma99Data = technicalIndicators.timestamps
      .map((t, i) => [t, technicalIndicators.sma99[i]])
      .filter(([t, v]) => !isNaN(v as number));
    series.push({
      name: 'SMA(99)',
      type: 'line',
      data: sma99Data,
      lineStyle: { color: '#8b5cf6', width: 1.5 },
      symbol: 'none',
      smooth: false,
    });
  }

  if (activeIndicators.ema12 && technicalIndicators) {
    const ema12Data = technicalIndicators.timestamps
      .map((t, i) => [t, technicalIndicators.ema12[i]])
      .filter(([t, v]) => !isNaN(v as number));
    series.push({
      name: 'EMA(12)',
      type: 'line',
      data: ema12Data,
      lineStyle: { color: '#06b6d4', width: 1.5 },
      symbol: 'none',
      smooth: false,
    });
  }

  if (activeIndicators.ema26 && technicalIndicators) {
    const ema26Data = technicalIndicators.timestamps
      .map((t, i) => [t, technicalIndicators.ema26[i]])
      .filter(([t, v]) => !isNaN(v as number));
    series.push({
      name: 'EMA(26)',
      type: 'line',
      data: ema26Data,
      lineStyle: { color: '#ec4899', width: 1.5 },
      symbol: 'none',
      smooth: false,
    });
  }

  // Bollinger Bands (TradingView style)
  if (activeIndicators.bb && bollingerBands.length > 0) {
    const bbUpperData = bollingerBands
      .map(bb => [new Date(bb.timestamp).getTime(), bb.upper])
      .filter(([t, v]) => !isNaN(v as number));

    const bbMiddleData = bollingerBands
      .map(bb => [new Date(bb.timestamp).getTime(), bb.sma])
      .filter(([t, v]) => !isNaN(v as number));

    const bbLowerData = bollingerBands
      .map(bb => [new Date(bb.timestamp).getTime(), bb.lower])
      .filter(([t, v]) => !isNaN(v as number));

    const bbColor = '#2962FF';
    const bbWidth = 1;

    // Add smooth fill area between upper and lower bands using stack
    series.push({
      name: 'BB Base',
      type: 'line',
      data: bbLowerData,
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0 },
      stack: 'bb-fill',
      symbol: 'none',
      smooth: true,
      z: 0,
    });

    const bbDiffData = bollingerBands
      .map(bb => [new Date(bb.timestamp).getTime(), bb.upper - bb.lower])
      .filter(([t, v]) => !isNaN(v as number));

    series.push({
      name: 'BB Fill',
      type: 'line',
      data: bbDiffData,
      lineStyle: { opacity: 0 },
      areaStyle: {
        color: 'rgba(41, 98, 255, 0.15)',
      },
      stack: 'bb-fill',
      symbol: 'none',
      smooth: true,
      z: 0,
    });

    series.push({
      name: 'BB Upper',
      type: 'line',
      data: bbUpperData,
      lineStyle: { color: bbColor, width: bbWidth },
      symbol: 'none',
      smooth: true,
    });

    series.push({
      name: 'BB Middle',
      type: 'line',
      data: bbMiddleData,
      lineStyle: { color: bbColor, width: bbWidth },
      symbol: 'none',
      smooth: true,
    });

    series.push({
      name: 'BB Lower',
      type: 'line',
      data: bbLowerData,
      lineStyle: { color: bbColor, width: bbWidth },
      symbol: 'none',
      smooth: true,
    });
  }

  // Main data line
  series.push({
    name: dataKey,
    type: 'line',
    data: validatedData.map(point => [new Date(point.timestamp).getTime(), point.value]),
    lineStyle: { color: color, width: 2 },
    symbol: 'none',
    smooth: false,
    z: 10, // Ensure data line is on top
  });

  return series;
};

/**
 * Build moving average series for candlestick/heiken-ashi modes
 */
const buildCandleMAsSeries = (
  activeIndicators: ActiveIndicators,
  candleIndicators: CandleIndicators | null
): any[] => {
  const series: any[] = [];

  if (activeIndicators.sma7 && candleIndicators) {
    const sma7Data = candleIndicators.timestamps
      .map((t, i) => [t, candleIndicators.sma7[i]])
      .filter(([t, v]) => !isNaN(v as number));
    series.push({
      name: 'SMA(7)',
      type: 'line',
      data: sma7Data,
      lineStyle: { color: '#f59e0b', width: 2 },
      symbol: 'none',
      smooth: false,
    });
  }

  if (activeIndicators.sma20 && candleIndicators) {
    const sma20Data = candleIndicators.timestamps
      .map((t, i) => [t, candleIndicators.sma20[i]])
      .filter(([t, v]) => !isNaN(v as number));
    series.push({
      name: 'SMA(20)',
      type: 'line',
      data: sma20Data,
      lineStyle: { color: '#64748b', width: 2 },
      symbol: 'none',
      smooth: false,
    });
  }

  if (activeIndicators.sma25 && candleIndicators) {
    const sma25Data = candleIndicators.timestamps
      .map((t, i) => [t, candleIndicators.sma25[i]])
      .filter(([t, v]) => !isNaN(v as number));
    series.push({
      name: 'SMA(25)',
      type: 'line',
      data: sma25Data,
      lineStyle: { color: '#10b981', width: 2 },
      symbol: 'none',
      smooth: false,
    });
  }

  if (activeIndicators.sma99 && candleIndicators) {
    const sma99Data = candleIndicators.timestamps
      .map((t, i) => [t, candleIndicators.sma99[i]])
      .filter(([t, v]) => !isNaN(v as number));
    series.push({
      name: 'SMA(99)',
      type: 'line',
      data: sma99Data,
      lineStyle: { color: '#8b5cf6', width: 2 },
      symbol: 'none',
      smooth: false,
    });
  }

  if (activeIndicators.ema12 && candleIndicators) {
    const ema12Data = candleIndicators.timestamps
      .map((t, i) => [t, candleIndicators.ema12[i]])
      .filter(([t, v]) => !isNaN(v as number));
    series.push({
      name: 'EMA(12)',
      type: 'line',
      data: ema12Data,
      lineStyle: { color: '#06b6d4', width: 2 },
      symbol: 'none',
      smooth: false,
    });
  }

  if (activeIndicators.ema26 && candleIndicators) {
    const ema26Data = candleIndicators.timestamps
      .map((t, i) => [t, candleIndicators.ema26[i]])
      .filter(([t, v]) => !isNaN(v as number));
    series.push({
      name: 'EMA(26)',
      type: 'line',
      data: ema26Data,
      lineStyle: { color: '#ec4899', width: 2 },
      symbol: 'none',
      smooth: false,
    });
  }

  if (activeIndicators.bb && candleIndicators) {
    const bbUpperData = candleIndicators.timestamps
      .map((t, i) => [t, candleIndicators.bb.upper[i]])
      .filter(([t, v]) => !isNaN(v as number));

    const bbMiddleData = candleIndicators.timestamps
      .map((t, i) => [t, candleIndicators.bb.middle[i]])
      .filter(([t, v]) => !isNaN(v as number));

    const bbLowerData = candleIndicators.timestamps
      .map((t, i) => [t, candleIndicators.bb.lower[i]])
      .filter(([t, v]) => !isNaN(v as number));

    const bbColor = '#2962FF';
    const bbWidth = 1;

    series.push({
      name: 'BB Base',
      type: 'line',
      data: bbLowerData,
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0 },
      stack: 'bb-fill',
      symbol: 'none',
      smooth: false,
      z: 0,
    });

    const bbDiffData = candleIndicators.timestamps
      .map((t, i) => [t, candleIndicators.bb.upper[i] - candleIndicators.bb.lower[i]])
      .filter(([t, v]) => !isNaN(v as number));

    series.push({
      name: 'BB Fill',
      type: 'line',
      data: bbDiffData,
      lineStyle: { opacity: 0 },
      areaStyle: {
        color: 'rgba(41, 98, 255, 0.15)',
      },
      stack: 'bb-fill',
      symbol: 'none',
      smooth: false,
      z: 0,
    });

    series.push({
      name: 'BB Upper',
      type: 'line',
      data: bbUpperData,
      lineStyle: { color: bbColor, width: bbWidth },
      symbol: 'none',
      smooth: false,
    });

    series.push({
      name: 'BB Middle',
      type: 'line',
      data: bbMiddleData,
      lineStyle: { color: bbColor, width: bbWidth },
      symbol: 'none',
      smooth: false,
    });

    series.push({
      name: 'BB Lower',
      type: 'line',
      data: bbLowerData,
      lineStyle: { color: bbColor, width: bbWidth },
      symbol: 'none',
      smooth: false,
    });
  }

  return series;
};

/**
 * Build series for candlestick chart mode
 */
export const buildCandlestickSeries = (
  activeIndicators: ActiveIndicators,
  candleIndicators: CandleIndicators | null,
  candlestickData: CandlestickDataPoint[],
  dataKey: string,
  isDark: boolean
): any[] => {
  const candleTimestamps = candlestickData.map(d => d.timestamp);
  const series: any[] = [];

  // Add indicators first (so they're behind candles)
  series.push(...buildCandleMAsSeries(activeIndicators, candleIndicators));

  // Candlesticks on top
  series.push({
    name: dataKey,
    type: 'candlestick',
    data: candleTimestamps.map((t, i) => [t, ...candlestickData[i].value]),
    itemStyle: {
      color: isDark ? '#22c55e' : '#16a34a',
      color0: isDark ? '#ef4444' : '#dc2626',
      borderColor: isDark ? '#16a34a' : '#15803d',
      borderColor0: isDark ? '#dc2626' : '#b91c1c',
    },
    z: 10, // Ensure candles are on top
  });

  return series;
};

/**
 * Build series for Heiken Ashi chart mode
 */
export const buildHeikenAshiSeries = (
  activeIndicators: ActiveIndicators,
  candleIndicators: CandleIndicators | null,
  heikenAshiData: CandlestickDataPoint[],
  dataKey: string,
  isDark: boolean
): any[] => {
  const haTimestamps = heikenAshiData.map(d => d.timestamp);
  const series: any[] = [];

  // Add indicators first (so they're behind candles)
  series.push(...buildCandleMAsSeries(activeIndicators, candleIndicators));

  // Heiken Ashi candles on top
  series.push({
    name: dataKey,
    type: 'candlestick',
    data: haTimestamps.map((t, i) => [t, ...heikenAshiData[i].value]),
    itemStyle: {
      color: isDark ? '#22c55e' : '#16a34a',
      color0: isDark ? '#ef4444' : '#dc2626',
      borderColor: isDark ? '#16a34a' : '#15803d',
      borderColor0: isDark ? '#dc2626' : '#b91c1c',
    },
    z: 10, // Ensure candles are on top
  });

  return series;
};

/**
 * Build oscillator panel series
 */
export const buildOscillatorSeries = (
  activeOscillators: ActiveOscillator[],
  technicalIndicators: TechnicalIndicators | null,
  candleIndicators: CandleIndicators | null,
  isDark: boolean
): any[] => {
  const series: any[] = [];

  activeOscillators.forEach((osc, index) => {
    const axisIndex = index + 1; // +1 because main chart is index 0

    if (osc.key === 'rsi' && technicalIndicators) {
      // RSI line (purple)
      const rsiData = technicalIndicators.timestamps
        .map((t, i) => [t, technicalIndicators.rsi[i]])
        .filter(([t, v]) => !isNaN(v as number));

      series.push({
        name: 'RSI',
        type: 'line',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: rsiData,
        lineStyle: { color: '#a855f7', width: 2 },
        symbol: 'none',
        smooth: false,
      });

      // RSI reference lines (30 oversold, 70 overbought)
      series.push({
        name: 'RSI Oversold',
        type: 'line',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: technicalIndicators.timestamps.map(t => [t, 30]),
        lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', width: 1, type: 'dashed' },
        symbol: 'none',
        silent: true,
      });

      series.push({
        name: 'RSI Overbought',
        type: 'line',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: technicalIndicators.timestamps.map(t => [t, 70]),
        lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', width: 1, type: 'dashed' },
        symbol: 'none',
        silent: true,
      });
    }

    if (osc.key === 'macd' && technicalIndicators) {
      // MACD line (blue)
      const macdLineData = technicalIndicators.timestamps
        .map((t, i) => [t, technicalIndicators.macd.macdLine[i]])
        .filter(([t, v]) => !isNaN(v as number));

      series.push({
        name: 'MACD',
        type: 'line',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: macdLineData,
        lineStyle: { color: '#3b82f6', width: 2 },
        symbol: 'none',
        smooth: false,
      });

      // Signal line (orange)
      const signalLineData = technicalIndicators.timestamps
        .map((t, i) => [t, technicalIndicators.macd.signalLine[i]])
        .filter(([t, v]) => !isNaN(v as number));

      series.push({
        name: 'Signal',
        type: 'line',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: signalLineData,
        lineStyle: { color: '#f97316', width: 2 },
        symbol: 'none',
        smooth: false,
      });

      // MACD histogram (red/green bars)
      const histogramData = technicalIndicators.timestamps
        .map((t, i) => {
          const val = technicalIndicators.macd.histogram[i];
          return [t, isNaN(val) ? null : val];
        });

      series.push({
        name: 'MACD Histogram',
        type: 'bar',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: histogramData,
        itemStyle: {
          color: (params: any) => {
            return params.value[1] >= 0 ? '#22c55e' : '#ef4444';
          },
        },
        barWidth: '60%',
      });

      // Zero line
      series.push({
        name: 'MACD Zero',
        type: 'line',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: technicalIndicators.timestamps.map(t => [t, 0]),
        lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', width: 1, type: 'solid' },
        symbol: 'none',
        silent: true,
      });
    }

    if (osc.key === 'stochastic' && technicalIndicators) {
      // Stochastic %K line (blue)
      const stochKData = technicalIndicators.timestamps
        .map((t, i) => [t, technicalIndicators.stochastic.k[i]])
        .filter(([t, v]) => !isNaN(v as number));

      series.push({
        name: 'Stoch %K',
        type: 'line',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: stochKData,
        lineStyle: { color: '#3b82f6', width: 2 },
        symbol: 'none',
        smooth: false,
      });

      // Stochastic %D line (orange)
      const stochDData = technicalIndicators.timestamps
        .map((t, i) => [t, technicalIndicators.stochastic.d[i]])
        .filter(([t, v]) => !isNaN(v as number));

      series.push({
        name: 'Stoch %D',
        type: 'line',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: stochDData,
        lineStyle: { color: '#f97316', width: 2 },
        symbol: 'none',
        smooth: false,
      });

      // Stochastic reference lines (20 oversold, 80 overbought)
      series.push({
        name: 'Stoch Oversold',
        type: 'line',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: technicalIndicators.timestamps.map(t => [t, 20]),
        lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', width: 1, type: 'dashed' },
        symbol: 'none',
        silent: true,
      });

      series.push({
        name: 'Stoch Overbought',
        type: 'line',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: technicalIndicators.timestamps.map(t => [t, 80]),
        lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', width: 1, type: 'dashed' },
        symbol: 'none',
        silent: true,
      });
    }

    if (osc.key === 'williamsR' && technicalIndicators) {
      // Williams %R line (purple)
      const williamsRData = technicalIndicators.timestamps
        .map((t, i) => [t, technicalIndicators.williamsR[i]])
        .filter(([t, v]) => !isNaN(v as number));

      series.push({
        name: 'Williams %R',
        type: 'line',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: williamsRData,
        lineStyle: { color: '#a855f7', width: 2 },
        symbol: 'none',
        smooth: false,
      });

      // Williams %R reference lines (-20 overbought, -80 oversold)
      series.push({
        name: 'Williams Overbought',
        type: 'line',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: technicalIndicators.timestamps.map(t => [t, -20]),
        lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', width: 1, type: 'dashed' },
        symbol: 'none',
        silent: true,
      });

      series.push({
        name: 'Williams Oversold',
        type: 'line',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: technicalIndicators.timestamps.map(t => [t, -80]),
        lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', width: 1, type: 'dashed' },
        symbol: 'none',
        silent: true,
      });
    }

    if (osc.key === 'roc' && technicalIndicators) {
      // ROC line (cyan)
      const rocData = technicalIndicators.timestamps
        .map((t, i) => [t, technicalIndicators.roc[i]])
        .filter(([t, v]) => !isNaN(v as number));

      series.push({
        name: 'ROC',
        type: 'line',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: rocData,
        lineStyle: { color: '#06b6d4', width: 2 },
        symbol: 'none',
        smooth: false,
      });

      // ROC zero line
      series.push({
        name: 'ROC Zero',
        type: 'line',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: technicalIndicators.timestamps.map(t => [t, 0]),
        lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', width: 1, type: 'solid' },
        symbol: 'none',
        silent: true,
      });
    }

    if (osc.key === 'atr' && candleIndicators) {
      // ATR line (orange) - requires candlestick data
      const atrData = candleIndicators.timestamps
        .map((t, i) => [t, candleIndicators.atr[i]])
        .filter(([t, v]) => !isNaN(v as number));

      series.push({
        name: 'ATR',
        type: 'line',
        xAxisIndex: axisIndex,
        yAxisIndex: axisIndex,
        data: atrData,
        lineStyle: { color: '#f59e0b', width: 2 },
        symbol: 'none',
        smooth: false,
      });
    }
  });

  return series;
};
