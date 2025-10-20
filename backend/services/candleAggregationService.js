/**
 * Candle Aggregation Service
 * Generates time-aggregated OHLC candles from raw agent metrics
 * Supports: 15min, 30min, 1hour, 4hour, 1day aggregation levels
 */

import { query } from '../config/database.js';

/**
 * Aggregation level configuration
 */
const AGGREGATION_LEVELS = {
  '15min': {
    interval: '15 minutes',
    minutes: 15,
    description: 'Very sensitive - fewer false alarms than raw, but still responsive'
  },
  '30min': {
    interval: '30 minutes',
    minutes: 30,
    description: 'Balanced - good compromise between responsiveness and reliability'
  },
  '1hour': {
    interval: '1 hour',
    minutes: 60,
    description: 'Conservative - fewer alerts, higher confidence'
  },
  '4hour': {
    interval: '4 hours',
    minutes: 240,
    description: 'Very conservative - minimal false alarms, delayed notifications'
  },
  '1day': {
    interval: '1 day',
    minutes: 1440,
    description: 'Daily trends - best for long-term monitoring'
  }
};

/**
 * Generate candles for a specific agent and time range
 * @param {string} agentId - Agent device ID
 * @param {string} aggregationLevel - Aggregation level (15min, 30min, 1hour, 4hour, 1day)
 * @param {Date} startTime - Start of time range
 * @param {Date} endTime - End of time range
 * @returns {Promise<number>} Number of candles created/updated
 */
export async function generateCandles(agentId, aggregationLevel, startTime, endTime) {
  try {
    if (!AGGREGATION_LEVELS[aggregationLevel]) {
      throw new Error(`Invalid aggregation level: ${aggregationLevel}`);
    }

    const result = await query(
      `SELECT generate_metric_candles($1, $2, $3, $4) as candles_created`,
      [agentId, aggregationLevel, startTime, endTime]
    );

    const candlesCreated = result.rows[0]?.candles_created || 0;
    console.log(`✅ Generated ${candlesCreated} ${aggregationLevel} candles for agent ${agentId}`);

    return candlesCreated;

  } catch (error) {
    console.error(`Error generating candles for agent ${agentId}:`, error);
    throw error;
  }
}

/**
 * Generate candles for all active agents and aggregation levels
 * @param {Date} startTime - Start of time range
 * @param {Date} endTime - End of time range
 * @returns {Promise<Object>} Summary of candles generated
 */
export async function generateCandlesForAllAgents(startTime, endTime) {
  try {
    // Get all active agents
    const agentsResult = await query(
      `SELECT id, hostname FROM agent_devices WHERE is_active = true`
    );

    const agents = agentsResult.rows;
    console.log(`📊 Generating candles for ${agents.length} active agents...`);

    const summary = {
      agents_processed: 0,
      total_candles_created: 0,
      by_level: {},
      errors: []
    };

    // Generate candles for each aggregation level
    for (const level of Object.keys(AGGREGATION_LEVELS)) {
      summary.by_level[level] = 0;

      for (const agent of agents) {
        try {
          const candlesCreated = await generateCandles(
            agent.id,
            level,
            startTime,
            endTime
          );

          summary.by_level[level] += candlesCreated;
          summary.total_candles_created += candlesCreated;

        } catch (error) {
          console.error(`Failed to generate ${level} candles for ${agent.hostname}:`, error.message);
          summary.errors.push({
            agent_id: agent.id,
            hostname: agent.hostname,
            level,
            error: error.message
          });
        }
      }

      summary.agents_processed = agents.length;
    }

    console.log(`✅ Candle generation complete:`, {
      agents: summary.agents_processed,
      total_candles: summary.total_candles_created,
      by_level: summary.by_level,
      errors: summary.errors.length
    });

    return summary;

  } catch (error) {
    console.error('Error in generateCandlesForAllAgents:', error);
    throw error;
  }
}

/**
 * Generate recent candles (last 24 hours) for all agents
 * Called by scheduled task to keep candles up-to-date
 * @returns {Promise<Object>} Summary of candles generated
 */
export async function generateRecentCandles() {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago

  console.log(`🔄 Generating recent candles (last 24 hours)...`);
  return await generateCandlesForAllAgents(startTime, endTime);
}

/**
 * Backfill historical candles for a specific agent
 * Used when enabling aggregated alerting for the first time
 * @param {string} agentId - Agent device ID
 * @param {number} daysBack - Number of days to backfill
 * @returns {Promise<Object>} Summary of candles generated
 */
export async function backfillCandlesForAgent(agentId, daysBack = 7) {
  try {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - daysBack * 24 * 60 * 60 * 1000);

    console.log(`📦 Backfilling ${daysBack} days of candles for agent ${agentId}...`);

    const summary = {
      agent_id: agentId,
      days_backfilled: daysBack,
      by_level: {},
      total_candles: 0
    };

    for (const level of Object.keys(AGGREGATION_LEVELS)) {
      const candlesCreated = await generateCandles(agentId, level, startTime, endTime);
      summary.by_level[level] = candlesCreated;
      summary.total_candles += candlesCreated;
    }

    console.log(`✅ Backfill complete for agent ${agentId}:`, summary);
    return summary;

  } catch (error) {
    console.error(`Error backfilling candles for agent ${agentId}:`, error);
    throw error;
  }
}

/**
 * Backfill historical candles for all active agents
 * @param {number} daysBack - Number of days to backfill
 * @returns {Promise<Object>} Summary of candles generated
 */
export async function backfillCandlesForAllAgents(daysBack = 7) {
  try {
    const agentsResult = await query(
      `SELECT id, hostname FROM agent_devices WHERE is_active = true`
    );

    const agents = agentsResult.rows;
    console.log(`📦 Backfilling ${daysBack} days of candles for ${agents.length} agents...`);

    const summary = {
      agents_processed: 0,
      total_candles: 0,
      by_level: {},
      errors: []
    };

    // Initialize by_level counters
    for (const level of Object.keys(AGGREGATION_LEVELS)) {
      summary.by_level[level] = 0;
    }

    for (const agent of agents) {
      try {
        const agentSummary = await backfillCandlesForAgent(agent.id, daysBack);

        summary.agents_processed++;
        summary.total_candles += agentSummary.total_candles;

        for (const level of Object.keys(AGGREGATION_LEVELS)) {
          summary.by_level[level] += agentSummary.by_level[level] || 0;
        }

      } catch (error) {
        console.error(`Failed to backfill candles for ${agent.hostname}:`, error.message);
        summary.errors.push({
          agent_id: agent.id,
          hostname: agent.hostname,
          error: error.message
        });
      }
    }

    console.log(`✅ Backfill complete:`, summary);
    return summary;

  } catch (error) {
    console.error('Error in backfillCandlesForAllAgents:', error);
    throw error;
  }
}

/**
 * Get candles for a specific agent and aggregation level
 * @param {string} agentId - Agent device ID
 * @param {string} aggregationLevel - Aggregation level
 * @param {number} limit - Maximum number of candles to fetch
 * @returns {Promise<Array>} Array of candle objects
 */
export async function getCandles(agentId, aggregationLevel, limit = 50) {
  try {
    if (aggregationLevel === 'raw') {
      // Return raw metrics instead of candles
      const result = await query(
        `SELECT
          id,
          collected_at as timestamp,
          cpu_percent,
          memory_percent,
          disk_percent
         FROM agent_metrics
         WHERE agent_device_id = $1
         ORDER BY collected_at DESC
         LIMIT $2`,
        [agentId, limit]
      );

      return result.rows.map(row => ({
        timestamp: row.timestamp,
        cpu: row.cpu_percent,
        memory: row.memory_percent,
        disk: row.disk_percent,
        type: 'raw'
      }));
    }

    // Fetch candles
    const result = await query(
      `SELECT
        id,
        candle_start,
        candle_end,
        cpu_open, cpu_high, cpu_low, cpu_close,
        memory_open, memory_high, memory_low, memory_close,
        disk_open, disk_high, disk_low, disk_close,
        data_points_count
       FROM agent_metrics_candles
       WHERE agent_device_id = $1
         AND aggregation_level = $2
       ORDER BY candle_start DESC
       LIMIT $3`,
      [agentId, aggregationLevel, limit]
    );

    return result.rows.map(row => ({
      timestamp: row.candle_start,
      candle_end: row.candle_end,
      cpu: {
        open: parseFloat(row.cpu_open),
        high: parseFloat(row.cpu_high),
        low: parseFloat(row.cpu_low),
        close: parseFloat(row.cpu_close)
      },
      memory: {
        open: parseFloat(row.memory_open),
        high: parseFloat(row.memory_high),
        low: parseFloat(row.memory_low),
        close: parseFloat(row.memory_close)
      },
      disk: {
        open: parseFloat(row.disk_open),
        high: parseFloat(row.disk_high),
        low: parseFloat(row.disk_low),
        close: parseFloat(row.disk_close)
      },
      data_points: row.data_points_count,
      type: 'candle'
    }));

  } catch (error) {
    console.error(`Error fetching candles for agent ${agentId}:`, error);
    throw error;
  }
}

/**
 * Get effective aggregation level for an agent
 * Resolution order: device override → user default → 'raw'
 * @param {string} agentId - Agent device ID
 * @returns {Promise<string>} Effective aggregation level
 */
export async function getEffectiveAggregationLevel(agentId) {
  try {
    const result = await query(
      `SELECT effective_aggregation_level
       FROM agent_aggregation_settings
       WHERE agent_id = $1`,
      [agentId]
    );

    if (result.rows.length === 0) {
      console.warn(`Agent ${agentId} not found in aggregation settings, defaulting to 'raw'`);
      return 'raw';
    }

    return result.rows[0].effective_aggregation_level || 'raw';

  } catch (error) {
    console.error(`Error getting aggregation level for agent ${agentId}:`, error);
    return 'raw'; // Fallback to raw on error
  }
}

/**
 * Update aggregation level for an agent device
 * @param {string} agentId - Agent device ID
 * @param {string} aggregationLevel - New aggregation level (or null to use user default)
 * @returns {Promise<Object>} Updated settings
 */
export async function updateAgentAggregationLevel(agentId, aggregationLevel) {
  try {
    // Validate aggregation level
    if (aggregationLevel !== null &&
        aggregationLevel !== 'raw' &&
        !AGGREGATION_LEVELS[aggregationLevel]) {
      throw new Error(`Invalid aggregation level: ${aggregationLevel}`);
    }

    const result = await query(
      `UPDATE agent_devices
       SET alert_aggregation_level = $2
       WHERE id = $1
       RETURNING id, alert_aggregation_level`,
      [agentId, aggregationLevel]
    );

    if (result.rows.length === 0) {
      throw new Error(`Agent ${agentId} not found`);
    }

    console.log(`✅ Updated aggregation level for agent ${agentId} to ${aggregationLevel || 'null (use user default)'}`);

    // Get effective level
    const effectiveLevel = await getEffectiveAggregationLevel(agentId);

    return {
      agent_id: agentId,
      device_override: aggregationLevel,
      effective_level: effectiveLevel
    };

  } catch (error) {
    console.error(`Error updating aggregation level for agent ${agentId}:`, error);
    throw error;
  }
}

/**
 * Update default aggregation level for a user
 * @param {string} userId - User ID
 * @param {string} aggregationLevel - New default aggregation level
 * @returns {Promise<Object>} Updated settings
 */
export async function updateUserDefaultAggregationLevel(userId, aggregationLevel) {
  try {
    // Validate aggregation level
    if (!aggregationLevel ||
        (aggregationLevel !== 'raw' && !AGGREGATION_LEVELS[aggregationLevel])) {
      throw new Error(`Invalid aggregation level: ${aggregationLevel}`);
    }

    const result = await query(
      `UPDATE users
       SET default_alert_aggregation_level = $2
       WHERE id = $1
       RETURNING id, default_alert_aggregation_level`,
      [userId, aggregationLevel]
    );

    if (result.rows.length === 0) {
      throw new Error(`User ${userId} not found`);
    }

    console.log(`✅ Updated default aggregation level for user ${userId} to ${aggregationLevel}`);

    return {
      user_id: userId,
      default_aggregation_level: aggregationLevel
    };

  } catch (error) {
    console.error(`Error updating default aggregation level for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Get aggregation level descriptions
 * @returns {Object} Map of aggregation levels to descriptions
 */
export function getAggregationLevelInfo() {
  return {
    raw: {
      interval: '5 minutes',
      minutes: 5,
      description: 'Raw data points - most sensitive, most false alarms'
    },
    ...AGGREGATION_LEVELS
  };
}

/**
 * Clean up old candles beyond retention period
 * @param {number} daysToKeep - Number of days to keep (default: 365)
 * @returns {Promise<number>} Number of candles deleted
 */
export async function cleanupOldCandles(daysToKeep = 365) {
  try {
    const result = await query(
      `DELETE FROM agent_metrics_candles
       WHERE candle_start < NOW() - INTERVAL '1 day' * $1`,
      [daysToKeep]
    );

    const deletedCount = result.rowCount || 0;
    console.log(`🗑️  Cleaned up ${deletedCount} old candles (older than ${daysToKeep} days)`);

    return deletedCount;

  } catch (error) {
    console.error('Error cleaning up old candles:', error);
    throw error;
  }
}

/**
 * Get candle generation statistics
 * @returns {Promise<Object>} Statistics about candle storage
 */
export async function getCandleStats() {
  try {
    const result = await query(`
      SELECT
        aggregation_level,
        COUNT(*) as candle_count,
        COUNT(DISTINCT agent_device_id) as agent_count,
        MIN(candle_start) as oldest_candle,
        MAX(candle_start) as newest_candle,
        AVG(data_points_count) as avg_data_points
      FROM agent_metrics_candles
      GROUP BY aggregation_level
      ORDER BY aggregation_level
    `);

    return result.rows.map(row => ({
      level: row.aggregation_level,
      candles: parseInt(row.candle_count),
      agents: parseInt(row.agent_count),
      oldest: row.oldest_candle,
      newest: row.newest_candle,
      avg_points: parseFloat(row.avg_data_points).toFixed(1)
    }));

  } catch (error) {
    console.error('Error fetching candle stats:', error);
    throw error;
  }
}

export const candleAggregationService = {
  generateCandles,
  generateCandlesForAllAgents,
  generateRecentCandles,
  backfillCandlesForAgent,
  backfillCandlesForAllAgents,
  getCandles,
  getEffectiveAggregationLevel,
  updateAgentAggregationLevel,
  updateUserDefaultAggregationLevel,
  getAggregationLevelInfo,
  cleanupOldCandles,
  getCandleStats
};
