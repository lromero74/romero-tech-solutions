import express from 'express';
import { query } from '../../config/database.js';
import { authMiddleware, requireEmployee } from '../../middleware/authMiddleware.js';

const router = express.Router();

// All routes require admin authentication
router.use(authMiddleware);
router.use(requireEmployee);

/**
 * Helper function to rebuild pricing_ranges for a tier
 * Includes inherited pricing from lower tiers
 */
async function rebuildPricingRanges(tier) {
  // Get all pricing tiers
  const allTiers = await query(`
    SELECT tier, base_devices, default_devices_allowed, price_per_additional_device
    FROM subscription_pricing
    ORDER BY
      CASE tier
        WHEN 'free' THEN 1
        WHEN 'subscribed' THEN 2
        WHEN 'enterprise' THEN 3
      END
  `);

  const tiers = allTiers.rows;
  const freeTier = tiers.find(t => t.tier === 'free');
  const subscribedTier = tiers.find(t => t.tier === 'subscribed');
  const enterpriseTier = tiers.find(t => t.tier === 'enterprise');

  let pricingRanges = [];

  switch (tier) {
    case 'free':
      pricingRanges = [{
        start: 1,
        end: parseInt(freeTier.default_devices_allowed),
        price: 0,
        description: 'Free tier devices'
      }];
      break;

    case 'subscribed':
      // Inherit free tier range
      pricingRanges.push({
        start: 1,
        end: parseInt(freeTier.base_devices),
        price: 0,
        description: 'Free tier devices (inherited)'
      });
      // Add subscribed tier range
      pricingRanges.push({
        start: parseInt(freeTier.base_devices) + 1,
        end: parseInt(subscribedTier.default_devices_allowed),
        price: parseFloat(subscribedTier.price_per_additional_device),
        description: 'Pro tier devices'
      });
      break;

    case 'enterprise':
      // Inherit free tier range
      pricingRanges.push({
        start: 1,
        end: parseInt(freeTier.base_devices),
        price: 0,
        description: 'Free tier devices (inherited)'
      });
      // Inherit subscribed tier range
      pricingRanges.push({
        start: parseInt(freeTier.base_devices) + 1,
        end: parseInt(subscribedTier.default_devices_allowed),
        price: parseFloat(subscribedTier.price_per_additional_device),
        description: 'Pro tier devices (inherited)'
      });
      // Add enterprise tier range
      pricingRanges.push({
        start: parseInt(subscribedTier.default_devices_allowed) + 1,
        end: parseInt(enterpriseTier.default_devices_allowed),
        price: parseFloat(enterpriseTier.price_per_additional_device),
        description: 'Enterprise tier devices'
      });
      break;
  }

  return pricingRanges;
}

/**
 * GET /api/admin/subscription/pricing
 * Get all subscription pricing configurations (including inactive)
 */
router.get('/pricing', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        id,
        tier,
        base_devices,
        default_devices_allowed,
        price_per_additional_device,
        currency,
        billing_period,
        is_active,
        created_at,
        updated_at
      FROM subscription_pricing
      ORDER BY
        CASE tier
          WHEN 'free' THEN 1
          WHEN 'subscribed' THEN 2
          WHEN 'enterprise' THEN 3
        END
    `);

    res.json({
      success: true,
      pricing: result.rows
    });
  } catch (error) {
    console.error('❌ Error fetching admin pricing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pricing configuration'
    });
  }
});

/**
 * PUT /api/admin/subscription/pricing/:tier
 * Update pricing configuration for a specific tier
 *
 * Request body:
 * {
 *   base_devices: number,
 *   default_devices_allowed: number,
 *   price_per_additional_device: number,
 *   currency: string,
 *   billing_period: string,
 *   is_active: boolean
 * }
 */
router.put('/pricing/:tier', async (req, res) => {
  try {
    const { tier } = req.params;
    const {
      base_devices,
      default_devices_allowed,
      price_per_additional_device,
      currency,
      billing_period,
      is_active
    } = req.body;

    // Validate tier
    if (!['free', 'subscribed', 'enterprise'].includes(tier)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tier. Must be one of: free, subscribed, enterprise'
      });
    }

    // Validate required fields
    if (base_devices === undefined || default_devices_allowed === undefined || price_per_additional_device === undefined) {
      return res.status(400).json({
        success: false,
        message: 'base_devices, default_devices_allowed, and price_per_additional_device are required'
      });
    }

    // Validate numeric fields
    if (isNaN(base_devices) || isNaN(default_devices_allowed) || isNaN(price_per_additional_device) ||
        base_devices < 0 || default_devices_allowed < 0 || price_per_additional_device < 0) {
      return res.status(400).json({
        success: false,
        message: 'base_devices, default_devices_allowed, and price_per_additional_device must be non-negative numbers'
      });
    }

    // Update pricing configuration
    const result = await query(`
      UPDATE subscription_pricing
      SET
        base_devices = $1,
        default_devices_allowed = $2,
        price_per_additional_device = $3,
        currency = COALESCE($4, currency),
        billing_period = COALESCE($5, billing_period),
        is_active = COALESCE($6, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE tier = $7::subscription_tier_type
      RETURNING *
    `, [
      base_devices,
      default_devices_allowed,
      price_per_additional_device,
      currency,
      billing_period,
      is_active,
      tier
    ]);

    if (result.rows.length === 0) {
      // If tier doesn't exist, create it
      const insertResult = await query(`
        INSERT INTO subscription_pricing (
          tier,
          base_devices,
          default_devices_allowed,
          price_per_additional_device,
          currency,
          billing_period,
          is_active
        ) VALUES ($1::subscription_tier_type, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        tier,
        base_devices,
        default_devices_allowed,
        price_per_additional_device,
        currency || 'USD',
        billing_period || 'monthly',
        is_active !== undefined ? is_active : true
      ]);

      return res.json({
        success: true,
        message: 'Pricing configuration created successfully',
        pricing: insertResult.rows[0]
      });
    }

    // Recalculate pricing_ranges for this tier and any higher tiers that inherit from it
    const tiersToUpdate = [];
    if (tier === 'free') {
      tiersToUpdate.push('free', 'subscribed', 'enterprise');
    } else if (tier === 'subscribed') {
      tiersToUpdate.push('subscribed', 'enterprise');
    } else {
      tiersToUpdate.push('enterprise');
    }

    // Update pricing_ranges for each affected tier
    for (const tierToUpdate of tiersToUpdate) {
      const pricingRanges = await rebuildPricingRanges(tierToUpdate);
      await query(`
        UPDATE subscription_pricing
        SET pricing_ranges = $1::jsonb
        WHERE tier = $2::subscription_tier_type
      `, [JSON.stringify(pricingRanges), tierToUpdate]);
    }

    // Fetch the updated pricing to return to client
    const updatedResult = await query(`
      SELECT * FROM subscription_pricing WHERE tier = $1::subscription_tier_type
    `, [tier]);

    res.json({
      success: true,
      message: 'Pricing configuration updated successfully',
      pricing: updatedResult.rows[0]
    });
  } catch (error) {
    console.error('❌ Error updating pricing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update pricing configuration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/subscription/analytics
 * Get subscription analytics and statistics
 */
router.get('/analytics', async (req, res) => {
  try {
    // Get user counts by subscription tier
    const tierCountsResult = await query(`
      SELECT
        subscription_tier,
        COUNT(*) as user_count
      FROM users
      WHERE subscription_tier IS NOT NULL
      GROUP BY subscription_tier
      ORDER BY
        CASE subscription_tier
          WHEN 'free' THEN 1
          WHEN 'subscribed' THEN 2
          WHEN 'enterprise' THEN 3
        END
    `);

    // Get device usage statistics
    const deviceStatsResult = await query(`
      SELECT
        u.subscription_tier,
        COUNT(DISTINCT ad.id) as total_devices,
        AVG(CASE WHEN ad.is_active THEN 1 ELSE 0 END) as avg_active_ratio
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      LEFT JOIN agent_devices ad ON ad.business_id = b.id
      WHERE u.subscription_tier IS NOT NULL
      GROUP BY u.subscription_tier
      ORDER BY
        CASE u.subscription_tier
          WHEN 'free' THEN 1
          WHEN 'subscribed' THEN 2
          WHEN 'enterprise' THEN 3
        END
    `);

    // Get revenue projections (subscribed and enterprise tiers only)
    const revenueResult = await query(`
      SELECT
        user_tier_data.subscription_tier,
        COUNT(DISTINCT user_tier_data.user_id) as paying_users,
        SUM(
          GREATEST(0, user_tier_data.device_count - user_tier_data.devices_allowed) *
          user_tier_data.price_per_additional_device
        ) as projected_monthly_revenue
      FROM (
        SELECT
          u.id as user_id,
          u.subscription_tier,
          u.devices_allowed,
          COUNT(ad.id) as device_count,
          sp.price_per_additional_device
        FROM users u
        LEFT JOIN businesses b ON u.business_id = b.id
        LEFT JOIN agent_devices ad ON ad.business_id = b.id AND ad.is_active = true
        LEFT JOIN subscription_pricing sp ON sp.tier = u.subscription_tier AND sp.is_active = true
        WHERE u.subscription_tier IN ('subscribed', 'enterprise')
        GROUP BY u.id, u.subscription_tier, u.devices_allowed, sp.price_per_additional_device
      ) as user_tier_data
      GROUP BY user_tier_data.subscription_tier
    `);

    // Get total users and devices
    const totalsResult = await query(`
      SELECT
        COUNT(DISTINCT u.id) as total_users,
        COUNT(DISTINCT ad.id) as total_devices,
        COUNT(DISTINCT CASE WHEN ad.is_active THEN ad.id END) as active_devices
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      LEFT JOIN agent_devices ad ON ad.business_id = b.id
      WHERE u.subscription_tier IS NOT NULL
    `);

    // Calculate average devices per user by tier
    const avgDevicesResult = await query(`
      SELECT
        user_devices.subscription_tier,
        AVG(device_count) as avg_devices_per_user,
        MAX(device_count) as max_devices_per_user
      FROM (
        SELECT
          u.id,
          u.subscription_tier,
          COUNT(ad.id) as device_count
        FROM users u
        LEFT JOIN businesses b ON u.business_id = b.id
        LEFT JOIN agent_devices ad ON ad.business_id = b.id AND ad.is_active = true
        WHERE u.subscription_tier IS NOT NULL
        GROUP BY u.id, u.subscription_tier
      ) as user_devices
      GROUP BY user_devices.subscription_tier
      ORDER BY
        CASE user_devices.subscription_tier
          WHEN 'free' THEN 1
          WHEN 'subscribed' THEN 2
          WHEN 'enterprise' THEN 3
        END
    `);

    res.json({
      success: true,
      analytics: {
        tierCounts: tierCountsResult.rows,
        deviceStats: deviceStatsResult.rows,
        revenue: revenueResult.rows,
        totals: totalsResult.rows[0] || { total_users: 0, total_devices: 0, active_devices: 0 },
        averageDevices: avgDevicesResult.rows
      }
    });
  } catch (error) {
    console.error('❌ Error fetching subscription analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription analytics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/admin/subscription/users
 * Get detailed list of users with subscription information
 * Optional query params: tier, limit, offset
 */
router.get('/users', async (req, res) => {
  try {
    const { tier, limit = 50, offset = 0 } = req.query;

    let queryText = `
      SELECT
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.subscription_tier,
        u.devices_allowed,
        u.profile_completed,
        u.subscription_expires_at,
        u.created_at,
        b.business_name,
        COUNT(ad.id) FILTER (WHERE ad.is_active = true) as active_devices,
        COUNT(ad.id) as total_devices
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      LEFT JOIN agent_devices ad ON ad.business_id = b.id
      WHERE u.subscription_tier IS NOT NULL
    `;

    const params = [];
    let paramIndex = 1;

    if (tier && ['free', 'subscribed', 'enterprise'].includes(tier)) {
      queryText += ` AND u.subscription_tier = $${paramIndex}::subscription_tier_type`;
      params.push(tier);
      paramIndex++;
    }

    queryText += `
      GROUP BY u.id, u.email, u.first_name, u.last_name, u.subscription_tier,
               u.devices_allowed, u.profile_completed, u.subscription_expires_at,
               u.created_at, b.business_name
      ORDER BY u.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(parseInt(limit), parseInt(offset));

    const result = await query(queryText, params);

    // Get total count for pagination
    const countResult = await query(`
      SELECT COUNT(*) as total
      FROM users
      WHERE subscription_tier IS NOT NULL
      ${tier ? `AND subscription_tier = $1::subscription_tier_type` : ''}
    `, tier ? [tier] : []);

    res.json({
      success: true,
      users: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + result.rows.length < parseInt(countResult.rows[0].total)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching subscription users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
