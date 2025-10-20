/**
 * Confluence Detection Service
 * Analyzes agent metrics for technical indicator confluence and generates alerts
 */

import { query } from '../config/database.js';
import { alertConfigService } from './alertConfigService.js';
import { alertHistoryService } from './alertHistoryService.js';
import { candleAggregationService } from './candleAggregationService.js';

/**
 * Calculate technical indicators from metrics history
 * Uses time-aggregated candles based on agent's configuration
 * @param {string} agentId - Agent device ID
 * @param {number} lookbackPeriods - Number of historical data points to fetch
 * @param {string} metricType - Metric type to analyze ('cpu', 'memory', 'disk')
 * @returns {Promise<Object>} Technical indicators object
 */
async function calculateIndicators(agentId, lookbackPeriods = 50, metricType = 'cpu') {
  // Get effective aggregation level for this agent
  const aggregationLevel = await candleAggregationService.getEffectiveAggregationLevel(agentId);

  // Fetch data based on aggregation level
  const candles = await candleAggregationService.getCandles(agentId, aggregationLevel, lookbackPeriods);

  if (candles.length < 14) {
    // Not enough data for meaningful indicators
    console.log(`⏭️  Insufficient data for agent ${agentId}: ${candles.length} candles (need 14+)`);
    return null;
  }

  // Reverse to get oldest first for calculations
  const metrics = candles.reverse();

  // Extract values based on metric type and data format
  let values;
  if (aggregationLevel === 'raw') {
    // Raw data points - use direct values
    values = metrics.map(m => parseFloat(m[metricType] || 0));
  } else {
    // Candle data - use close prices
    values = metrics.map(m => parseFloat(m[metricType]?.close || 0));
  }

  const latestValue = values[values.length - 1];

  console.log(`📊 Calculating indicators for agent ${agentId} using ${aggregationLevel} aggregation (${values.length} data points)`);

  // Calculate RSI (Relative Strength Index)
  const rsi = calculateRSI(values, 14);

  // Calculate Stochastic Oscillator
  const stochastic = calculateStochastic(values, 14);

  // Calculate Williams %R
  const williamsR = calculateWilliamsR(values, 14);

  // Calculate MACD
  const macd = calculateMACD(values);

  // Calculate ROC (Rate of Change)
  const roc = calculateROC(values, 10);

  // Calculate ATR (Average True Range) - using metric volatility as proxy
  const atr = calculateATR(values, 14);

  return {
    rsi: {
      value: rsi,
      signal: determineRSISignal(rsi)
    },
    stochastic: {
      k: stochastic.k,
      d: stochastic.d,
      signal: determineStochasticSignal(stochastic)
    },
    williamsR: {
      value: williamsR,
      signal: determineWilliamsRSignal(williamsR)
    },
    macd: {
      macdLine: macd.macdLine,
      signalLine: macd.signalLine,
      histogram: macd.histogram,
      signal: determineMACDSignal(macd)
    },
    roc: {
      value: roc,
      signal: determineROCSignal(roc, values)
    },
    atr: {
      value: atr,
      signal: determineATRSignal(atr, values)
    },
    rawMetric: latestValue,
    metricType: metricType,
    aggregationLevel: aggregationLevel,
    dataPointsUsed: values.length,
    timestamp: new Date()
  };
}

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSI(values, period = 14) {
  if (values.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  // Initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Calculate RSI for remaining periods using EMA
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    avgGain = ((avgGain * (period - 1)) + (change > 0 ? change : 0)) / period;
    avgLoss = ((avgLoss * (period - 1)) + (change < 0 ? Math.abs(change) : 0)) / period;
  }

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate Stochastic Oscillator
 */
function calculateStochastic(values, period = 14) {
  if (values.length < period) return { k: null, d: null };

  const recentValues = values.slice(-period);
  const currentValue = values[values.length - 1];
  const highest = Math.max(...recentValues);
  const lowest = Math.min(...recentValues);

  const k = lowest === highest ? 50 : ((currentValue - lowest) / (highest - lowest)) * 100;

  // Calculate %D (3-period SMA of %K)
  // For simplicity, returning K as D (should calculate over 3 periods in production)
  const d = k;

  return { k, d };
}

/**
 * Calculate Williams %R
 */
function calculateWilliamsR(values, period = 14) {
  if (values.length < period) return null;

  const recentValues = values.slice(-period);
  const currentValue = values[values.length - 1];
  const highest = Math.max(...recentValues);
  const lowest = Math.min(...recentValues);

  if (highest === lowest) return -50;

  return ((highest - currentValue) / (highest - lowest)) * -100;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
function calculateMACD(values) {
  if (values.length < 26) return { macdLine: null, signalLine: null, histogram: null };

  const ema12 = calculateEMA(values, 12);
  const ema26 = calculateEMA(values, 26);
  const macdLine = ema12 - ema26;

  // Signal line is 9-period EMA of MACD (simplified here)
  const signalLine = macdLine * 0.9; // Simplified

  const histogram = macdLine - signalLine;

  return { macdLine, signalLine, histogram };
}

/**
 * Calculate Exponential Moving Average
 */
function calculateEMA(values, period) {
  if (values.length < period) return null;

  const k = 2 / (period + 1);
  let ema = values[0];

  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }

  return ema;
}

/**
 * Calculate ROC (Rate of Change)
 */
function calculateROC(values, period = 10) {
  if (values.length < period) return null;

  const currentValue = values[values.length - 1];
  const pastValue = values[values.length - period];

  if (pastValue === 0) return 0;

  return ((currentValue - pastValue) / pastValue) * 100;
}

/**
 * Calculate ATR (Average True Range) - simplified using standard deviation
 */
function calculateATR(values, period = 14) {
  if (values.length < period) return null;

  const recentValues = values.slice(-period);
  const mean = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
  const variance = recentValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recentValues.length;

  return Math.sqrt(variance);
}

/**
 * Determine signal types from indicators
 */
function determineRSISignal(rsi) {
  if (rsi === null) return null;
  if (rsi >= 80) return 'high_extreme';
  if (rsi >= 70) return 'high_moderate';
  if (rsi <= 20) return 'low_extreme';
  if (rsi <= 30) return 'low_moderate';
  return 'neutral';
}

function determineStochasticSignal(stochastic) {
  const { k, d } = stochastic;
  if (k === null) return null;
  if (k >= 90) return 'high_extreme';
  if (k >= 80) return 'high_moderate';
  if (k <= 10) return 'low_extreme';
  if (k <= 20) return 'low_moderate';
  if (k > d && k < 80) return 'rising_crossover';
  if (k < d && k > 20) return 'declining_crossover';
  return 'neutral';
}

function determineWilliamsRSignal(williamsR) {
  if (williamsR === null) return null;
  if (williamsR >= -10) return 'high_extreme';
  if (williamsR >= -20) return 'high_moderate';
  if (williamsR <= -90) return 'low_extreme';
  if (williamsR <= -80) return 'low_moderate';
  return 'neutral';
}

function determineMACDSignal(macd) {
  if (macd.macdLine === null) return null;
  if (macd.histogram > 0 && Math.abs(macd.histogram) > Math.abs(macd.macdLine) * 0.5) {
    return 'rising_momentum';
  }
  if (macd.histogram < 0 && Math.abs(macd.histogram) > Math.abs(macd.macdLine) * 0.5) {
    return 'declining_momentum';
  }
  if (macd.macdLine > macd.signalLine) return 'rising_crossover';
  if (macd.macdLine < macd.signalLine) return 'declining_crossover';
  return 'neutral';
}

function determineROCSignal(roc, values) {
  if (roc === null) return null;
  const avgChange = values.slice(-20).reduce((sum, val, i, arr) => {
    if (i === 0) return 0;
    return sum + Math.abs(val - arr[i - 1]);
  }, 0) / 19;

  if (Math.abs(roc) > avgChange * 2) {
    return roc > 0 ? 'rising_momentum' : 'declining_momentum';
  }
  return 'neutral';
}

function determineATRSignal(atr, values) {
  if (atr === null) return null;
  const recentATR = values.slice(-20).reduce((sum, val, i, arr) => {
    if (i === 0) return 0;
    return sum + Math.abs(val - arr[i - 1]);
  }, 0) / 19;

  if (atr > recentATR * 1.5) {
    return 'volatility_spike';
  }
  return 'neutral';
}

/**
 * Analyze indicators for confluence and match against alert configurations
 * @param {Object} indicators - Technical indicators
 * @param {Array} configurations - Active alert configurations
 * @returns {Array} Matched alerts
 */
function analyzeConfluence(indicators, configurations) {
  if (!indicators) return [];

  const alerts = [];

  for (const config of configurations) {
    if (!config.enabled) continue;

    const signals = [];

    // Check RSI
    if (config.rsi_thresholds?.enabled) {
      const rsiSignal = indicators.rsi.signal;
      if (rsiSignal && rsiSignal !== 'neutral') {
        const thresholds = config.rsi_thresholds;
        let isMatch = false;
        let isExtreme = false;

        if (config.alert_type === 'high_utilization') {
          isMatch = rsiSignal.includes('high');
          isExtreme = rsiSignal === 'high_extreme';
        } else if (config.alert_type === 'low_utilization') {
          isMatch = rsiSignal.includes('low');
          isExtreme = rsiSignal === 'low_extreme';
        }

        if (isMatch) {
          signals.push({ indicator: 'RSI', value: indicators.rsi.value, signal: rsiSignal, isExtreme });
        }
      }
    }

    // Check Stochastic
    if (config.stochastic_thresholds?.enabled) {
      const stochSignal = indicators.stochastic.signal;
      if (stochSignal && stochSignal !== 'neutral') {
        let isMatch = false;
        let isExtreme = false;

        if (config.alert_type === 'high_utilization') {
          isMatch = stochSignal.includes('high');
          isExtreme = stochSignal === 'high_extreme';
        } else if (config.alert_type === 'low_utilization') {
          isMatch = stochSignal.includes('low');
          isExtreme = stochSignal === 'low_extreme';
        } else if (config.alert_type === 'rising_trend' && stochSignal === 'rising_crossover') {
          isMatch = true;
        } else if (config.alert_type === 'declining_trend' && stochSignal === 'declining_crossover') {
          isMatch = true;
        }

        if (isMatch) {
          signals.push({ indicator: 'Stochastic', value: indicators.stochastic.k, signal: stochSignal, isExtreme });
        }
      }
    }

    // Check Williams %R
    if (config.williams_r_thresholds?.enabled) {
      const williamsSignal = indicators.williamsR.signal;
      if (williamsSignal && williamsSignal !== 'neutral') {
        let isMatch = false;
        let isExtreme = false;

        if (config.alert_type === 'high_utilization') {
          isMatch = williamsSignal.includes('high');
          isExtreme = williamsSignal === 'high_extreme';
        } else if (config.alert_type === 'low_utilization') {
          isMatch = williamsSignal.includes('low');
          isExtreme = williamsSignal === 'low_extreme';
        }

        if (isMatch) {
          signals.push({ indicator: 'Williams %R', value: indicators.williamsR.value, signal: williamsSignal, isExtreme });
        }
      }
    }

    // Check MACD
    if (config.macd_settings?.enabled) {
      const macdSignal = indicators.macd.signal;
      if (macdSignal && macdSignal !== 'neutral') {
        let isMatch = false;

        if (config.alert_type === 'rising_trend' && macdSignal.includes('rising')) {
          isMatch = true;
        } else if (config.alert_type === 'declining_trend' && macdSignal.includes('declining')) {
          isMatch = true;
        }

        if (isMatch) {
          signals.push({ indicator: 'MACD', value: indicators.macd.histogram, signal: macdSignal, isExtreme: false });
        }
      }
    }

    // Check ROC
    if (config.roc_settings?.enabled) {
      const rocSignal = indicators.roc.signal;
      if (rocSignal && rocSignal !== 'neutral') {
        let isMatch = false;

        if (config.alert_type === 'rising_trend' && rocSignal === 'rising_momentum') {
          isMatch = true;
        } else if (config.alert_type === 'declining_trend' && rocSignal === 'declining_momentum') {
          isMatch = true;
        }

        if (isMatch) {
          signals.push({ indicator: 'ROC', value: indicators.roc.value, signal: rocSignal, isExtreme: false });
        }
      }
    }

    // Check ATR
    if (config.atr_settings?.enabled) {
      const atrSignal = indicators.atr.signal;
      if (atrSignal && atrSignal !== 'neutral') {
        if (config.alert_type === 'volatility_spike' && atrSignal === 'volatility_spike') {
          signals.push({ indicator: 'ATR', value: indicators.atr.value, signal: atrSignal, isExtreme: true });
        }
      }
    }

    // Evaluate confluence
    if (signals.length > 0) {
      const hasExtreme = signals.some(s => s.isExtreme);
      const minCount = config.min_indicator_count || 2;

      // Allow alert if:
      // 1. Multiple indicators in confluence (>= minCount)
      // 2. Single indicator at extreme level (if require_extreme_for_single is true)
      const shouldAlert = signals.length >= minCount ||
                         (signals.length === 1 && config.require_extreme_for_single && hasExtreme);

      if (shouldAlert) {
        // Determine severity based on indicator count
        let severity;
        if (signals.length >= 5) severity = 'critical';
        else if (signals.length >= 4) severity = 'high';
        else if (signals.length >= 3) severity = 'medium';
        else severity = 'low';

        alerts.push({
          configurationId: config.id,
          alertName: config.alert_name,
          alertType: config.alert_type,
          severity,
          indicatorCount: signals.length,
          contributingIndicators: signals.reduce((acc, s) => {
            acc[s.indicator] = { value: s.value, signal: s.signal, isExtreme: s.isExtreme };
            return acc;
          }, {}),
          notifyEmail: config.notify_email,
          notifyDashboard: config.notify_dashboard,
          notifyWebsocket: config.notify_websocket
        });
      }
    }
  }

  return alerts;
}

/**
 * Process metrics and detect confluence alerts
 * @param {string} agentId - Agent device ID
 * @param {Object} currentMetric - Current metric data
 * @returns {Promise<Array>} Triggered alerts
 */
export async function detectAndCreateAlerts(agentId, currentMetric) {
  try {
    // Load active alert configurations
    const configurations = await alertConfigService.getAllConfigurations();
    const activeConfigs = configurations.filter(c => c.enabled);

    if (activeConfigs.length === 0) {
      return []; // No active configurations
    }

    // Calculate technical indicators
    const indicators = await calculateIndicators(agentId);

    if (!indicators) {
      return []; // Not enough data
    }

    // Analyze for confluence
    const matchedAlerts = analyzeConfluence(indicators, activeConfigs);

    if (matchedAlerts.length === 0) {
      return []; // No alerts triggered
    }

    // Create alert history entries
    const triggeredAlerts = [];

    for (const alert of matchedAlerts) {
      // Check for recent similar alert (debouncing)
      const hasRecent = await alertHistoryService.hasRecentSimilarAlert(
        agentId,
        alert.configurationId,
        15 // 15 minutes debounce
      );

      if (!hasRecent) {
        // Create alert
        const alertHistory = await alertHistoryService.saveAlert({
          agent_id: agentId,
          configuration_id: alert.configurationId,
          alert_name: alert.alertName,
          alert_type: alert.alertType,
          severity: alert.severity,
          indicator_count: alert.indicatorCount,
          contributing_indicators: alert.contributingIndicators,
          metric_values: {
            cpu_percent: currentMetric.cpu_percent || currentMetric.cpu_usage,
            memory_percent: currentMetric.memory_percent || currentMetric.memory_usage,
            disk_percent: currentMetric.disk_percent || currentMetric.disk_usage,
            timestamp: currentMetric.collected_at || new Date()
          },
          notify_email: alert.notifyEmail,
          notify_dashboard: alert.notifyDashboard,
          notify_websocket: alert.notifyWebsocket
        });

        triggeredAlerts.push({
          id: alertHistory.id,
          alert_name: alert.alertName,
          alert_type: alert.alertType,
          severity: alert.severity,
          indicator_count: alert.indicatorCount
        });

        console.log(`🚨 Alert triggered: ${alert.alertName} (${alert.severity}) - ${alert.indicatorCount} indicators`);
      } else {
        console.log(`⏭️  Skipping duplicate alert: ${alert.alertName} (recent alert within 15 minutes)`);
      }
    }

    return triggeredAlerts;

  } catch (error) {
    console.error('Confluence detection error:', error);
    return [];
  }
}

export const confluenceDetectionService = {
  detectAndCreateAlerts,
  calculateIndicators,
  analyzeConfluence
};
