import express from 'express';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { calculateGraduatedPrice, getMaxDevicesForTier } from '../utils/pricingUtils.js';
import {
  createSubscriptionCheckout,
  getOrCreateSubscriptionCustomer,
  resolveSubscriptionEvent,
  verifySubscriptionWebhook,
} from '../services/stripeSubscriptions.js';
import Stripe from 'stripe';

const router = express.Router();

// Client app base URL for Stripe's return redirect (overridable per env).
const clientAppUrl = (process.env.CLIENT_APP_URL || 'https://romerotechsolutions.com/clogin').replace(/\/$/, '');

function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

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

    if (!stripeConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Payments are not configured. Please contact support.',
        code: 'PAYMENTS_UNCONFIGURED'
      });
    }

    // Get or create the Stripe customer for this user
    const customer = await getOrCreateSubscriptionCustomer({ email: user.email, userId });

    const amountCents = Math.round(monthlyCost * 100);
    const { sessionId, checkoutUrl } = await createSubscriptionCheckout({
      customerId: customer.id,
      customerEmail: user.email,
      amountCents,
      currency: (pricing.currency || 'usd').toLowerCase(),
      targetTier: target_tier,
      totalDevices: totalDevicesAllowed,
      userId,
      successUrl: `${clientAppUrl}?subscription=success`,
      cancelUrl: `${clientAppUrl}?subscription=cancelled`,
    });
    const session = { id: sessionId, url: checkoutUrl };

    // Track the checkout so the webhook activates exactly the right tier.
    await query(
      `INSERT INTO subscription_checkouts (
         user_id, stripe_session_id, target_tier, devices_allowed,
         amount_cents, currency, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [userId, session.id, target_tier, totalDevicesAllowed, amountCents, (pricing.currency || 'usd').toLowerCase()]
    );

    // NOTE: the tier upgrade itself happens in the webhook
    // (checkout.session.completed) — never here.

    res.json({
      success: true,
      message: 'Checkout session created. Complete payment on Stripe to activate.',
      session_id: session.id,
      checkout_url: session.url,
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
      next_steps: [
        'Review upgrade details and cost breakdown',
        'Complete payment on the Stripe checkout page',
        `Subscription will allow up to ${totalDevicesAllowed} devices`
      ]
    });

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
        u.subscription_expires_at,
        u.stripe_subscription_id
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

    if (!stripeConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Payments are not configured. Please contact support.',
        code: 'PAYMENTS_UNCONFIGURED'
      });
    }

    if (!user.stripe_subscription_id) {
      return res.status(400).json({
        success: false,
        message: 'No active Stripe subscription on file. Please contact support to cancel.',
        code: 'NO_STRIPE_SUBSCRIPTION'
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
    });
    const subscription = await stripe.subscriptions.update(user.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    const periodEnd = new Date(subscription.current_period_end * 1000);

    await query(
      'UPDATE users SET subscription_expires_at = $1 WHERE id = $2',
      [periodEnd.toISOString(), userId]
    );

    res.json({
      success: true,
      message: 'Subscription cancellation scheduled.',
      cancellation: {
        current_tier: user.subscription_tier,
        will_downgrade_to: 'free',
        downgrade_date: periodEnd.toISOString(),
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

// ---------------------------------------------------------------------------
// Subscription webhook (raw body — must be mounted BEFORE express.json()).
// Activates tiers on checkout.session.completed, downgrades on
// customer.subscription.deleted, logs invoice.payment_failed for ops.
// Activation ONLY happens here, never in the checkout-creation response.
// ---------------------------------------------------------------------------
export const subscriptionWebhookRouter = express.Router();

subscriptionWebhookRouter.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return res.status(500).json({ success: false, message: 'Webhook not configured' });
    }

    let event;
    try {
      event = await verifySubscriptionWebhook(req.body, signature);
    } catch (error) {
      console.error('❌ Invalid subscription webhook signature:', error.message);
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const decision = resolveSubscriptionEvent(event);

    try {
      if (decision.action === 'activate') {
        // Idempotency: already-completed sessions are duplicates.
        const existing = await query(
          'SELECT status, user_id FROM subscription_checkouts WHERE stripe_session_id = $1',
          [decision.sessionId]
        );
        if (existing.rows.length > 0 && existing.rows[0].status === 'completed') {
          return res.json({ success: true, duplicate: true });
        }
        const checkoutUserId = existing.rows.length > 0 ? existing.rows[0].user_id : decision.userId;

        // Best-effort: bill through the Stripe period end; fall back to +30d.
        let expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        try {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
            apiVersion: '2024-12-18.acacia',
          });
          const sub = await stripe.subscriptions.retrieve(decision.stripeSubscriptionId);
          expiresAt = new Date(sub.current_period_end * 1000);
        } catch (periodError) {
          console.error('⚠️ Could not read Stripe period end, using +30d:', periodError.message);
        }

        await query(
          `UPDATE users
           SET subscription_tier = $1::subscription_tier_type,
               devices_allowed = $2,
               stripe_customer_id = $3,
               stripe_subscription_id = $4,
               subscription_expires_at = $5
           WHERE id = $6`,
          [decision.targetTier, decision.totalDevices, decision.stripeCustomerId,
           decision.stripeSubscriptionId, expiresAt.toISOString(), checkoutUserId]
        );
        await query(
          "UPDATE subscription_checkouts SET status = 'completed', updated_at = NOW() WHERE stripe_session_id = $1",
          [decision.sessionId]
        );
        console.log(`✅ Activated ${decision.targetTier} for user ${checkoutUserId} (session ${decision.sessionId})`);
      } else if (decision.action === 'downgrade') {
        const userResult = decision.userId
          ? await query('SELECT id FROM users WHERE id = $1', [decision.userId])
          : await query(
              'SELECT id FROM users WHERE stripe_customer_id = $1 OR stripe_subscription_id = $2',
              [decision.stripeCustomerId, decision.stripeSubscriptionId]
            );
        if (userResult.rows.length > 0) {
          await query(
            `UPDATE users
             SET subscription_tier = 'free'::subscription_tier_type,
                 devices_allowed = 2,
                 stripe_subscription_id = NULL
             WHERE id = $1`,
            [userResult.rows[0].id]
          );
          console.log(`✅ Downgraded user ${userResult.rows[0].id} to free (subscription ${decision.stripeSubscriptionId} ended)`);
        }
      } else if (decision.action === 'flag') {
        console.warn(
          `⚠️ Subscription payment failed: customer=${decision.stripeCustomerId} subscription=${decision.stripeSubscriptionId} — ops follow-up required`
        );
      }
      // 'ignore' and unknown types: acknowledge without action.
      return res.json({ success: true });
    } catch (error) {
      console.error('❌ Subscription webhook handling failed:', error);
      return res.status(500).json({ success: false, message: 'Webhook handling failed' });
    }
  }
);
