/**
 * Technical Indicators Calculation Functions
 * All indicator calculations extracted for reusability and testing
 */

import type { TechnicalIndicators, CandleIndicators, CandlestickDataPoint } from '../types/chartTypes';

/**
 * Calculate Simple Moving Average
 */
export const calculateSMA = (values: number[], period: number): number[] => {
  const sma: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      sma.push(NaN);
    } else {
      const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
  }
  return sma;
};

/**
 * Calculate Exponential Moving Average
 */
export const calculateEMA = (values: number[], period: number): number[] => {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < Math.min(period, values.length); i++) {
    sum += values[i];
    ema.push(i === period - 1 ? sum / period : NaN);
  }

  // Calculate EMA
  for (let i = period; i < values.length; i++) {
    ema.push((values[i] - ema[i - 1]) * multiplier + ema[i - 1]);
  }

  return ema;
};

/**
 * Calculate Relative Strength Index (RSI)
 */
export const calculateRSI = (values: number[], period: number = 14): number[] => {
  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;

  // First RSI calculation
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  rsi.push(...Array(period).fill(NaN));
  rsi.push(100 - (100 / (1 + avgGain / avgLoss)));

  // Smooth RSI
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi.push(100 - (100 / (1 + avgGain / avgLoss)));
  }

  return rsi;
};

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
export const calculateMACD = (values: number[]): {
  macdLine: number[];
  signalLine: number[];
  histogram: number[];
} => {
  const ema12 = calculateEMA(values, 12);
  const ema26 = calculateEMA(values, 26);
  const macdLine = ema12.map((val, i) => val - ema26[i]);

  // Signal line (9-period EMA of MACD)
  const signalLine: number[] = [];
  const multiplier = 2 / (9 + 1);
  let emaValue = 0;
  let count = 0;

  for (let i = 0; i < macdLine.length; i++) {
    if (isNaN(macdLine[i])) {
      signalLine.push(NaN);
      continue;
    }

    if (count < 9) {
      emaValue += macdLine[i];
      count++;
      if (count === 9) {
        emaValue = emaValue / 9;
        signalLine.push(emaValue);
      } else {
        signalLine.push(NaN);
      }
    } else {
      emaValue = (macdLine[i] - emaValue) * multiplier + emaValue;
      signalLine.push(emaValue);
    }
  }

  const histogram = macdLine.map((val, i) => val - signalLine[i]);

  return { macdLine, signalLine, histogram };
};

/**
 * Calculate Stochastic Oscillator
 */
export const calculateStochastic = (
  values: number[],
  period: number = 14,
  smoothK: number = 3,
  smoothD: number = 3
): { k: number[]; d: number[] } => {
  const rawK: number[] = [];
  const stochK: number[] = [];
  const stochD: number[] = [];

  // Calculate raw %K
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      rawK.push(NaN);
    } else {
      const window = values.slice(i - period + 1, i + 1);
      const high = Math.max(...window);
      const low = Math.min(...window);
      const current = values[i];
      const k = low === high ? 50 : ((current - low) / (high - low)) * 100;
      rawK.push(k);
    }
  }

  // Smooth %K (SMA of raw %K)
  for (let i = 0; i < rawK.length; i++) {
    if (i < smoothK - 1 || isNaN(rawK[i])) {
      stochK.push(NaN);
    } else {
      const sum = rawK.slice(i - smoothK + 1, i + 1)
        .filter(v => !isNaN(v))
        .reduce((a, b) => a + b, 0);
      stochK.push(sum / smoothK);
    }
  }

  // Calculate %D (SMA of %K)
  for (let i = 0; i < stochK.length; i++) {
    if (i < smoothD - 1 || isNaN(stochK[i])) {
      stochD.push(NaN);
    } else {
      const sum = stochK.slice(i - smoothD + 1, i + 1)
        .filter(v => !isNaN(v))
        .reduce((a, b) => a + b, 0);
      stochD.push(sum / smoothD);
    }
  }

  return { k: stochK, d: stochD };
};

/**
 * Calculate Williams %R
 */
export const calculateWilliamsR = (values: number[], period: number = 14): number[] => {
  const williamsR: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      williamsR.push(NaN);
    } else {
      const window = values.slice(i - period + 1, i + 1);
      const high = Math.max(...window);
      const low = Math.min(...window);
      const current = values[i];
      const wr = low === high ? -50 : ((high - current) / (high - low)) * -100;
      williamsR.push(wr);
    }
  }

  return williamsR;
};

/**
 * Calculate Rate of Change (ROC)
 */
export const calculateROC = (values: number[], period: number = 12): number[] => {
  const roc: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      roc.push(NaN);
    } else {
      const current = values[i];
      const past = values[i - period];
      const rocValue = past === 0 ? 0 : ((current - past) / past) * 100;
      roc.push(rocValue);
    }
  }

  return roc;
};

/**
 * Calculate all technical indicators for line chart data
 */
export const calculateAllTechnicalIndicators = (
  values: number[],
  timestamps: number[]
): TechnicalIndicators => {
  return {
    sma7: calculateSMA(values, 7),
    sma20: calculateSMA(values, 20),
    sma25: calculateSMA(values, 25),
    sma99: calculateSMA(values, 99),
    ema12: calculateEMA(values, 12),
    ema26: calculateEMA(values, 26),
    rsi: calculateRSI(values, 14),
    macd: calculateMACD(values),
    stochastic: calculateStochastic(values, 14, 3, 3),
    williamsR: calculateWilliamsR(values, 14),
    roc: calculateROC(values, 12),
    timestamps,
  };
};

/**
 * Calculate Bollinger Bands
 */
export const calculateBollingerBands = (
  closes: number[],
  period: number = 20
): { upper: number[]; middle: number[]; lower: number[] } => {
  const upper: number[] = [];
  const middle: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      middle.push(NaN);
      lower.push(NaN);
    } else {
      const windowCloses = closes.slice(i - period + 1, i + 1);
      const sma = windowCloses.reduce((sum, v) => sum + v, 0) / period;
      const variance = windowCloses.reduce((sum, v) => sum + Math.pow(v - sma, 2), 0) / period;
      const stdDev = Math.sqrt(variance);

      middle.push(sma);
      upper.push(sma + (2 * stdDev));
      lower.push(sma - (2 * stdDev));
    }
  }

  return { upper, middle, lower };
};

/**
 * Calculate Average True Range (ATR)
 */
export const calculateATR = (
  candlestickData: CandlestickDataPoint[],
  period: number = 14
): number[] => {
  if (!candlestickData || candlestickData.length < 2) return [];

  const trueRanges: number[] = [];
  const atr: number[] = [];

  // Calculate True Range for each candle
  for (let i = 0; i < candlestickData.length; i++) {
    const candle = candlestickData[i];
    const [, , low, high] = candle.value;

    if (i === 0) {
      // First candle: TR = High - Low
      trueRanges.push(high - low);
      atr.push(NaN);
    } else {
      const prevClose = candlestickData[i - 1].close;

      // True Range = max(High - Low, |High - PrevClose|, |Low - PrevClose|)
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);

      if (i < period) {
        atr.push(NaN);
      } else if (i === period) {
        // First ATR is simple average of first 14 TRs
        const sum = trueRanges.slice(1, period + 1).reduce((a, b) => a + b, 0);
        atr.push(sum / period);
      } else {
        // Subsequent ATRs use smoothing: ATR = ((Prior ATR * 13) + Current TR) / 14
        const prevATR = atr[i - 1];
        const smoothedATR = ((prevATR * (period - 1)) + tr) / period;
        atr.push(smoothedATR);
      }
    }
  }

  return atr;
};

/**
 * Calculate all indicators for candlestick data
 */
export const calculateCandleIndicators = (
  candlestickData: CandlestickDataPoint[]
): CandleIndicators => {
  const closes = candlestickData.map(c => c.close);
  const timestamps = candlestickData.map(c => c.timestamp);

  return {
    sma7: calculateSMA(closes, 7),
    sma20: calculateSMA(closes, 20),
    sma25: calculateSMA(closes, 25),
    sma99: calculateSMA(closes, 99),
    ema12: calculateEMA(closes, 12),
    ema26: calculateEMA(closes, 26),
    bb: calculateBollingerBands(closes, 20),
    rsi: calculateRSI(closes, 14),
    macd: calculateMACD(closes),
    stochastic: calculateStochastic(closes, 14, 3, 3),
    williamsR: calculateWilliamsR(closes, 14),
    roc: calculateROC(closes, 12),
    atr: calculateATR(candlestickData, 14),
    timestamps,
  };
};
