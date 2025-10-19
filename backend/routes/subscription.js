import express from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { calculateGraduatedPrice, getMaxDevicesForTier } from '../utils/pricingUtils.js';

const router = express.Router();

/**
 * GET /api/subscription/pricing
 * Get current active pricing tiers
 * Public endpoint (no auth required) - used by agents and frontend
 */
router.get('/pricing', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        tier,
        base_devices,
        default_devices_allowed,
        price_per_additional_device,
        pricing_ranges,
        currency,
        billing_period
      FROM subscription_pricing
      WHERE is_active = TRUE
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
    console.error('❌ Error fetching subscription pricing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription pricing'
    });
  }
});

/**
 * GET /api/subscription/status
 * Get current user's subscription status
 * Requires authentication
 */
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's current subscription details
    const result = await query(`
      SELECT
        u.id,
        u.email,
        u.subscription_tier,
        u.devices_allowed,
        u.profile_completed,
        u.subscription_expires_at,
        b.business_name,
        b.id as business_id,
        (
          SELECT COUNT(*)
          FROM agent_devices ad
          WHERE ad.business_id = b.id AND ad.is_active = true
        ) as devices_used
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      WHERE u.id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];

    // Get pricing for current tier
    const pricingResult = await query(`
      SELECT
        tier,
        base_devices,
        default_devices_allowed,
        price_per_additional_device,
        pricing_ranges,
        currency,
        billing_period
      FROM subscription_pricing
      WHERE tier = $1 AND is_active = TRUE
    `, [user.subscription_tier]);

    const pricing = pricingResult.rows[0] || null;
    const devicesUsed = parseInt(user.devices_used);

    // Calculate monthly cost using graduated pricing
    let monthlyCost = 0;
    let costBreakdown = [];

    if (pricing && pricing.pricing_ranges && Array.isArray(pricing.pricing_ranges)) {
      const { totalCost, breakdown} = calculateGraduatedPrice(devicesUsed, pricing.pricing_ranges);
      monthlyCost = totalCost;
      costBreakdown = breakdown;
    } else {
      // Fallback to old flat-rate calculation if pricing_ranges not available
      const additionalDevices = Math.max(0, devicesUsed - parseInt(user.devices_allowed));
      monthlyCost = pricing ? additionalDevices * parseFloat(pricing.price_per_additional_device) : 0;
    }

    res.json({
      success: true,
      subscription: {
        tier: user.subscription_tier,
        devices_allowed: parseInt(user.devices_allowed),
        devices_used: devicesUsed,
        devices_remaining: Math.max(0, parseInt(user.devices_allowed) - devicesUsed),
        profile_completed: user.profile_completed,
        expires_at: user.subscription_expires_at,
        pricing: pricing,
        monthly_cost: monthlyCost,
        cost_breakdown: costBreakdown,
        business_name: user.business_name,
        business_id: user.business_id
      }
    });
  } catch (error) {
    console.error('❌ Error fetching subscription status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription status'
    });
  }
});

/**
 * POST /api/subscription/upgrade
 * Initiate subscription upgrade
 * Requires authentication and profile completion (for paid tiers)
 *
 * Request body:
 * {
 *   target_tier: 'subscribed' | 'enterprise',
 *   additional_devices: number (optional - how many devices beyond base)
 * }
 */
router.post('/upgrade', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { target_tier, additional_devices } = req.body;

    // Validate target tier
    if (!['subscribed', 'enterprise'].includes(target_tier)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid target tier. Must be "subscribed" or "enterprise".'
      });
    }

    // Get current user info
    const userResult = await query(`
      SELECT
        u.id,
        u.email,
        u.subscription_tier,
        u.devices_allowed,
        u.profile_completed,
        u.business_id
      FROM users u
      WHERE u.id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Check if already on target tier or higher
    const tierRank = { free: 1, subscribed: 2, enterprise: 3 };
    if (tierRank[user.subscription_tier] >= tierRank[target_tier]) {
      return res.status(400).json({
        success: false,
        message: `You are already on the ${user.subscription_tier} tier.`,
        code: 'ALREADY_ON_TIER'
      });
    }

    // Check profile completion for paid tiers
    if (!user.profile_completed) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your profile before upgrading to a paid subscription.',
        code: 'PROFILE_INCOMPLETE',
        data: {
          required_fields: ['first_name', 'last_name', 'business_id', 'email']
        }
      });
    }

    // Get pricing for target tier
    const pricingResult = await query(`
      SELECT
        tier,
        base_devices,
        default_devices_allowed,
        price_per_additional_device,
        pricing_ranges,
        currency,
        billing_period
      FROM subscription_pricing
      WHERE tier = $1::subscription_tier_type AND is_active = TRUE
    `, [target_tier]);

    if (pricingResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Pricing not found for ${target_tier} tier.`
      });
    }

    const pricing = pricingResult.rows[0];

    // Calculate total devices allowed
    // If additional_devices is specified, use it. Otherwise, use tier default
    const extraDevices = parseInt(additional_devices) || 0;
    const totalDevicesAllowed = extraDevices > 0
      ? parseInt(pricing.base_devices) + extraDevices
      : parseInt(pricing.default_devices_allowed);

    // Calculate maximum allowed for this tier
    const maxDevices = pricing.pricing_ranges
      ? getMaxDevicesForTier(pricing.pricing_ranges)
      : parseInt(pricing.default_devices_allowed);

    // Validate device count doesn't exceed tier maximum
    if (totalDevicesAllowed > maxDevices) {
      return res.status(400).json({
        success: false,
        message: `The ${target_tier} tier allows a maximum of ${maxDevices} devices. You requested ${totalDevicesAllowed}.`,
        code: 'EXCEEDS_TIER_MAXIMUM',
        data: {
          max_devices: maxDevices,
          requested_devices: totalDevicesAllowed
        }
      });
    }

    // Calculate monthly cost using graduated pricing
    let monthlyCost = 0;
    let costBreakdown = [];

    if (pricing.pricing_ranges && Array.isArray(pricing.pricing_ranges)) {
      const { totalCost, breakdown } = calculateGraduatedPrice(totalDevicesAllowed, pricing.pricing_ranges);
      monthlyCost = totalCost;
      costBreakdown = breakdown;
    } else {
      // Fallback to old flat-rate calculation
      const devicesAboveBase = Math.max(0, totalDevicesAllowed - parseInt(pricing.base_devices));
      monthlyCost = devicesAboveBase * parseFloat(pricing.price_per_additional_device);
    }

    // TODO: Integrate with payment processor (Stripe, etc.)
    // For now, we'll just return the upgrade details without processing payment

    res.json({
      success: true,
      message: 'Upgrade details calculated. Payment integration pending.',
      upgrade: {
        current_tier: user.subscription_tier,
        target_tier: target_tier,
        total_devices: totalDevicesAllowed,
        max_devices: maxDevices,
        devices_remaining: maxDevices - totalDevicesAllowed,
        monthly_cost: monthlyCost,
        cost_breakdown: costBreakdown,
        currency: pricing.currency,
        billing_period: pricing.billing_period,
        pricing_ranges: pricing.pricing_ranges || []
      },
      // TODO: Return payment session URL when payment integration is complete
      next_steps: [
        'Review upgrade details and cost breakdown',
        'Payment integration pending (Stripe/PayPal)',
        'Profile must be complete before payment',
        `Subscription will allow up to ${totalDevicesAllowed} devices`
      ]
    });

    // NOTE: Actual upgrade will happen after successful payment
    // Update users table with:
    // - subscription_tier = target_tier
    // - devices_allowed = totalDevicesAllowed (use default_devices_allowed if no additional_devices specified)
    // - subscription_expires_at = next billing date

  } catch (error) {
    console.error('❌ Error processing subscription upgrade:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process subscription upgrade'
    });
  }
});

/**
 * POST /api/subscription/cancel
 * Cancel current paid subscription
 * Requires authentication
 * Downgrades to free tier at end of billing period
 */
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get current user info
    const userResult = await query(`
      SELECT
        u.id,
        u.email,
        u.subscription_tier,
        u.devices_allowed,
        u.subscription_expires_at
      FROM users u
      WHERE u.id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    // Check if user is on free tier (nothing to cancel)
    if (user.subscription_tier === 'free') {
      return res.status(400).json({
        success: false,
        message: 'You are already on the free tier.',
        code: 'ALREADY_FREE_TIER'
      });
    }

    // TODO: Integrate with payment processor to cancel subscription
    // For now, we'll schedule the downgrade to happen at subscription_expires_at

    // In production, this would:
    // 1. Cancel the recurring subscription with payment processor
    // 2. Set subscription_expires_at to end of current billing period
    // 3. Keep user on current tier until expiration
    // 4. Downgrade to free tier after expiration

    res.json({
      success: true,
      message: 'Subscription cancellation scheduled. Payment integration pending.',
      cancellation: {
        current_tier: user.subscription_tier,
        will_downgrade_to: 'free',
        downgrade_date: user.subscription_expires_at || 'end of billing period',
        current_devices_allowed: parseInt(user.devices_allowed),
        free_tier_device_limit: 2
      },
      next_steps: [
        'Subscription will remain active until end of billing period',
        'After expiration, account will downgrade to free tier (2 devices)',
        'Remove excess devices before downgrade to avoid service interruption'
      ]
    });

  } catch (error) {
    console.error('❌ Error canceling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription'
    });
  }
});

export default router;
