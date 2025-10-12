/**
 * Indicator Confluence Alert System
 * Detects when multiple indicators signal similar conditions
 */

import type { TechnicalIndicators, CandleIndicators } from '../types/chartTypes';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertType = 'overbought' | 'oversold' | 'bullish' | 'bearish' | 'volatility_spike';

export interface IndicatorSignal {
  indicator: string;
  type: AlertType;
  value: number;
  threshold: number;
  description: string;
}

export interface ConfluenceAlert {
  severity: AlertSeverity;
  type: AlertType;
  count: number;
  signals: IndicatorSignal[];
  title: string;
  description: string;
}

/**
 * Detect individual indicator signals
 */
const detectIndicatorSignals = (
  indicators: TechnicalIndicators | CandleIndicators,
  latestIndex: number,
  activeIndicators: Record<string, boolean>
): IndicatorSignal[] => {
  const signals: IndicatorSignal[] = [];

  // Prevent index out of bounds
  if (latestIndex < 0 || latestIndex >= indicators.timestamps.length) {
    return signals;
  }

  // RSI signals
  if (activeIndicators.rsi && indicators.rsi && indicators.rsi[latestIndex] != null) {
    const rsi = indicators.rsi[latestIndex];

    if (rsi >= 80) {
      signals.push({
        indicator: 'RSI',
        type: 'overbought',
        value: rsi,
        threshold: 80,
        description: `RSI at ${rsi.toFixed(1)} (extreme overbought)`,
      });
    } else if (rsi >= 70) {
      signals.push({
        indicator: 'RSI',
        type: 'overbought',
        value: rsi,
        threshold: 70,
        description: `RSI at ${rsi.toFixed(1)} (overbought)`,
      });
    } else if (rsi <= 20) {
      signals.push({
        indicator: 'RSI',
        type: 'oversold',
        value: rsi,
        threshold: 20,
        description: `RSI at ${rsi.toFixed(1)} (extreme oversold)`,
      });
    } else if (rsi <= 30) {
      signals.push({
        indicator: 'RSI',
        type: 'oversold',
        value: rsi,
        threshold: 30,
        description: `RSI at ${rsi.toFixed(1)} (oversold)`,
      });
    }
  }

  // Stochastic signals
  if (activeIndicators.stochastic && indicators.stochastic) {
    const stochK = indicators.stochastic.k[latestIndex];
    const stochD = indicators.stochastic.d[latestIndex];

    if (stochK != null && stochD != null) {
      if (stochK >= 90 || stochD >= 90) {
        signals.push({
          indicator: 'Stochastic',
          type: 'overbought',
          value: Math.max(stochK, stochD),
          threshold: 90,
          description: `Stochastic at ${Math.max(stochK, stochD).toFixed(1)} (extreme overbought)`,
        });
      } else if (stochK >= 80 || stochD >= 80) {
        signals.push({
          indicator: 'Stochastic',
          type: 'overbought',
          value: Math.max(stochK, stochD),
          threshold: 80,
          description: `Stochastic at ${Math.max(stochK, stochD).toFixed(1)} (overbought)`,
        });
      } else if (stochK <= 10 || stochD <= 10) {
        signals.push({
          indicator: 'Stochastic',
          type: 'oversold',
          value: Math.min(stochK, stochD),
          threshold: 10,
          description: `Stochastic at ${Math.min(stochK, stochD).toFixed(1)} (extreme oversold)`,
        });
      } else if (stochK <= 20 || stochD <= 20) {
        signals.push({
          indicator: 'Stochastic',
          type: 'oversold',
          value: Math.min(stochK, stochD),
          threshold: 20,
          description: `Stochastic at ${Math.min(stochK, stochD).toFixed(1)} (oversold)`,
        });
      }

      // Detect bullish/bearish crossovers (when K crosses D)
      if (latestIndex > 0) {
        const prevK = indicators.stochastic.k[latestIndex - 1];
        const prevD = indicators.stochastic.d[latestIndex - 1];

        if (prevK != null && prevD != null) {
          // Bullish crossover (K crosses above D in oversold territory)
          if (prevK <= prevD && stochK > stochD && stochK < 30) {
            signals.push({
              indicator: 'Stochastic',
              type: 'bullish',
              value: stochK,
              threshold: 30,
              description: 'Stochastic bullish crossover in oversold zone',
            });
          }
          // Bearish crossover (K crosses below D in overbought territory)
          else if (prevK >= prevD && stochK < stochD && stochK > 70) {
            signals.push({
              indicator: 'Stochastic',
              type: 'bearish',
              value: stochK,
              threshold: 70,
              description: 'Stochastic bearish crossover in overbought zone',
            });
          }
        }
      }
    }
  }

  // Williams %R signals
  if (activeIndicators.williamsR && indicators.williamsR) {
    const williamsR = indicators.williamsR[latestIndex];

    if (williamsR != null) {
      if (williamsR >= -10) {
        signals.push({
          indicator: 'Williams %R',
          type: 'overbought',
          value: williamsR,
          threshold: -10,
          description: `Williams %R at ${williamsR.toFixed(1)} (extreme overbought)`,
        });
      } else if (williamsR >= -20) {
        signals.push({
          indicator: 'Williams %R',
          type: 'overbought',
          value: williamsR,
          threshold: -20,
          description: `Williams %R at ${williamsR.toFixed(1)} (overbought)`,
        });
      } else if (williamsR <= -90) {
        signals.push({
          indicator: 'Williams %R',
          type: 'oversold',
          value: williamsR,
          threshold: -90,
          description: `Williams %R at ${williamsR.toFixed(1)} (extreme oversold)`,
        });
      } else if (williamsR <= -80) {
        signals.push({
          indicator: 'Williams %R',
          type: 'oversold',
          value: williamsR,
          threshold: -80,
          description: `Williams %R at ${williamsR.toFixed(1)} (oversold)`,
        });
      }
    }
  }

  // MACD signals
  if (activeIndicators.macd && indicators.macd) {
    const macdLine = indicators.macd.macdLine[latestIndex];
    const signalLine = indicators.macd.signalLine[latestIndex];
    const histogram = indicators.macd.histogram[latestIndex];

    if (macdLine != null && signalLine != null && histogram != null && latestIndex > 0) {
      const prevMacd = indicators.macd.macdLine[latestIndex - 1];
      const prevSignal = indicators.macd.signalLine[latestIndex - 1];

      if (prevMacd != null && prevSignal != null) {
        // Bullish crossover (MACD crosses above signal)
        if (prevMacd <= prevSignal && macdLine > signalLine) {
          signals.push({
            indicator: 'MACD',
            type: 'bullish',
            value: histogram,
            threshold: 0,
            description: 'MACD bullish crossover (momentum shift up)',
          });
        }
        // Bearish crossover (MACD crosses below signal)
        else if (prevMacd >= prevSignal && macdLine < signalLine) {
          signals.push({
            indicator: 'MACD',
            type: 'bearish',
            value: histogram,
            threshold: 0,
            description: 'MACD bearish crossover (momentum shift down)',
          });
        }
        // Strong bullish momentum
        else if (histogram > 0 && Math.abs(histogram) > Math.abs(prevMacd) * 0.5) {
          signals.push({
            indicator: 'MACD',
            type: 'bullish',
            value: histogram,
            threshold: 0,
            description: 'MACD strong bullish momentum',
          });
        }
        // Strong bearish momentum
        else if (histogram < 0 && Math.abs(histogram) > Math.abs(prevMacd) * 0.5) {
          signals.push({
            indicator: 'MACD',
            type: 'bearish',
            value: histogram,
            threshold: 0,
            description: 'MACD strong bearish momentum',
          });
        }
      }
    }
  }

  // ROC signals
  if (activeIndicators.roc && indicators.roc) {
    const roc = indicators.roc[latestIndex];

    if (roc != null) {
      // Calculate average ROC to determine "extreme" values
      const recentROC = indicators.roc.slice(Math.max(0, latestIndex - 20), latestIndex + 1).filter(v => !isNaN(v));
      if (recentROC.length > 0) {
        const avgROC = recentROC.reduce((sum, v) => sum + Math.abs(v), 0) / recentROC.length;
        const threshold = avgROC * 2; // 2x average is considered significant

        if (Math.abs(roc) > threshold) {
          signals.push({
            indicator: 'ROC',
            type: roc > 0 ? 'bullish' : 'bearish',
            value: roc,
            threshold,
            description: `ROC at ${roc.toFixed(1)}% (${roc > 0 ? 'strong upward' : 'strong downward'} momentum)`,
          });
        }
      }
    }
  }

  // ATR signals (volatility)
  if (activeIndicators.atr && 'atr' in indicators && indicators.atr) {
    const atr = indicators.atr[latestIndex];

    if (atr != null && latestIndex >= 20) {
      // Calculate average ATR over last 20 periods
      const recentATR = indicators.atr.slice(latestIndex - 20, latestIndex + 1).filter(v => !isNaN(v));
      if (recentATR.length > 0) {
        const avgATR = recentATR.reduce((sum, v) => sum + v, 0) / recentATR.length;

        // If current ATR is 1.5x or more than average, it's a volatility spike
        if (atr >= avgATR * 1.5) {
          signals.push({
            indicator: 'ATR',
            type: 'volatility_spike',
            value: atr,
            threshold: avgATR * 1.5,
            description: `ATR at ${atr.toFixed(1)} (volatility spike, ${((atr / avgATR - 1) * 100).toFixed(0)}% above average)`,
          });
        }
      }
    }
  }

  // Bollinger Bands signals (for line charts)
  if (activeIndicators.bb && 'bb' in indicators && indicators.bb) {
    const latestValue = indicators.timestamps[latestIndex]; // This would need actual price data
    // Note: We'd need to compare current price to BB upper/lower bands
    // This would require access to the raw price data, which we can add later
  }

  return signals;
};

/**
 * Analyze indicator confluence and generate alerts
 */
export const analyzeConfluence = (
  indicators: TechnicalIndicators | CandleIndicators | null,
  activeIndicators: Record<string, boolean>
): ConfluenceAlert[] => {
  if (!indicators || !indicators.timestamps || indicators.timestamps.length === 0) {
    return [];
  }

  const latestIndex = indicators.timestamps.length - 1;
  const signals = detectIndicatorSignals(indicators, latestIndex, activeIndicators);

  if (signals.length === 0) {
    return [];
  }

  // Group signals by type
  const signalsByType: Record<AlertType, IndicatorSignal[]> = {
    overbought: [],
    oversold: [],
    bullish: [],
    bearish: [],
    volatility_spike: [],
  };

  signals.forEach(signal => {
    signalsByType[signal.type].push(signal);
  });

  const alerts: ConfluenceAlert[] = [];

  // Check each signal type for confluence
  Object.entries(signalsByType).forEach(([type, typeSignals]) => {
    if (typeSignals.length === 0) return;

    const alertType = type as AlertType;
    const count = typeSignals.length;

    // Determine severity based on confluence count and extreme values
    let severity: AlertSeverity = 'low';
    const hasExtreme = typeSignals.some(s =>
      (s.indicator === 'RSI' && (s.value >= 80 || s.value <= 20)) ||
      (s.indicator === 'Stochastic' && (s.value >= 90 || s.value <= 10)) ||
      (s.indicator === 'Williams %R' && (s.value >= -10 || s.value <= -90))
    );

    if (count === 1 && hasExtreme) {
      severity = 'medium'; // Single extreme indicator
    } else if (count === 2) {
      severity = 'medium'; // 2 indicators in confluence
    } else if (count === 3) {
      severity = 'high'; // 3 indicators in confluence
    } else if (count >= 4) {
      severity = 'critical'; // 4+ indicators in confluence
    } else if (count === 1 && !hasExtreme) {
      // Skip single non-extreme indicators
      return;
    }

    // Generate alert title and description
    const indicatorNames = typeSignals.map(s => s.indicator).join(', ');
    let title = '';
    let description = '';

    switch (alertType) {
      case 'overbought':
        title = `${count > 1 ? 'Confluence Alert: ' : ''}Overbought Condition`;
        description = count > 1
          ? `${count} indicators showing overbought: ${indicatorNames}`
          : typeSignals[0].description;
        break;
      case 'oversold':
        title = `${count > 1 ? 'Confluence Alert: ' : ''}Oversold Condition`;
        description = count > 1
          ? `${count} indicators showing oversold: ${indicatorNames}`
          : typeSignals[0].description;
        break;
      case 'bullish':
        title = `${count > 1 ? 'Confluence Alert: ' : ''}Bullish Signal`;
        description = count > 1
          ? `${count} indicators showing bullish momentum: ${indicatorNames}`
          : typeSignals[0].description;
        break;
      case 'bearish':
        title = `${count > 1 ? 'Confluence Alert: ' : ''}Bearish Signal`;
        description = count > 1
          ? `${count} indicators showing bearish momentum: ${indicatorNames}`
          : typeSignals[0].description;
        break;
      case 'volatility_spike':
        title = 'Volatility Spike Detected';
        description = typeSignals[0].description;
        break;
    }

    alerts.push({
      severity,
      type: alertType,
      count,
      signals: typeSignals,
      title,
      description,
    });
  });

  // Sort alerts by severity (critical > high > medium > low)
  const severityOrder: Record<AlertSeverity, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  return alerts.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
};
