/**
 * Chart Types and Interfaces
 * Shared types for the metrics charting system
 */

export type ChartDisplayType = 'line' | 'candlestick' | 'heiken-ashi';

export interface ActiveIndicators {
  sma7?: boolean;
  sma20?: boolean;
  sma25?: boolean;
  sma99?: boolean;
  ema12?: boolean;
  ema26?: boolean;
  bb?: boolean;
  rsi?: boolean;
  macd?: boolean;
  stochastic?: boolean;
  williamsR?: boolean;
  roc?: boolean;
  atr?: boolean;
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

export interface ActiveOscillator {
  key: 'rsi' | 'macd' | 'stochastic' | 'williamsR' | 'roc' | 'atr';
  active: boolean;
  height: number;
}

export interface TechnicalIndicators {
  sma7: number[];
  sma20: number[];
  sma25: number[];
  sma99: number[];
  ema12: number[];
  ema26: number[];
  rsi: number[];
  macd: {
    macdLine: number[];
    signalLine: number[];
    histogram: number[];
  };
  stochastic: {
    k: number[];
    d: number[];
  };
  williamsR: number[];
  roc: number[];
  timestamps: number[];
}

export interface CandleIndicators {
  sma7: number[];
  sma20: number[];
  sma25: number[];
  sma99: number[];
  ema12: number[];
  ema26: number[];
  bb: {
    upper: number[];
    middle: number[];
    lower: number[];
  };
  atr: number[];
  timestamps: number[];
}

export interface BollingerBand {
  timestamp: string;
  sma: number;
  upper: number;
  lower: number;
}

export interface CandlestickDataPoint {
  timestamp: number;
  value: [number, number, number, number]; // [open, close, low, high]
  close: number;
  mean?: number;
  stdDev?: number;
  upperBB?: number;
  lowerBB?: number;
}
