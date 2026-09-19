import Stripe from 'stripe';
// NOTE: stripeService.js constructs its client at module load (throws
// without STRIPE_SECRET_KEY), so it is only ever lazy-imported inside the
// functions below — never statically (see routes/client/payments.js).

// Recurring-tier subscriptions via Stripe Checkout (hosted redirect).
// The monthly amount is computed by the graduated pricing engine, so the
// single source of truth stays in subscription_pricing — Stripe just bills
// the computed total each month. Activation always happens in the webhook,
// never in the checkout-creation response.
//
// The Stripe client is built lazily (never at module load) so importing
// this module without STRIPE_SECRET_KEY set never throws.
function stripeClient() {
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
  });
}

// Stripe minimum charge amounts (lowest common currency floor).
const MIN_AMOUNT_CENTS = 50;

export function buildSubscriptionCheckoutParams({
  customerId,
  customerEmail,
  amountCents,
  currency = 'usd',
  targetTier,
  totalDevices,
  userId,
  successUrl,
  cancelUrl,
}) {
  if (!userId) {
    throw new Error('user_id metadata is required to route the webhook');
  }
  if (!Number.isFinite(amountCents) || amountCents < MIN_AMOUNT_CENTS) {
    throw new Error(`Subscription amount must be at least the Stripe minimum (${MIN_AMOUNT_CENTS}c)`);
  }
  const metadata = {
    user_id: String(userId),
    target_tier: String(targetTier),
    total_devices: String(totalDevices),
    kind: 'subscription_upgrade',
  };
  return {
    mode: 'subscription',
    ...(customerId ? { customer: customerId } : { customer_email: customerEmail || undefined }),
    line_items: [
      {
        price_data: {
          currency,
          product_data: {
            name: `Romero Tech Solutions — ${targetTier} plan`,
            description: `Device monitoring subscription (${totalDevices} devices)`,
          },
          unit_amount: Math.round(amountCents),
          recurring: { interval: 'month' },
        },
        quantity: 1,
      },
    ],
    metadata,
    subscription_data: { metadata },
    success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
}

export async function createSubscriptionCheckout(args) {
  const params = buildSubscriptionCheckoutParams(args);
  const session = await stripeClient().checkout.sessions.create(params);
  return { sessionId: session.id, checkoutUrl: session.url };
}

export async function verifySubscriptionWebhook(payload, signature) {
  const { constructWebhookEvent } = await import('./stripeService.js');
  return constructWebhookEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

export async function getOrCreateSubscriptionCustomer({ email, userId }) {
  const { createOrGetCustomer } = await import('./stripeService.js');
  return createOrGetCustomer({ email, name: email, metadata: { user_id: userId } });
}

// Pure webhook decision: maps a verified Stripe event to the DB action the
// route must take. Tested without Stripe or a database.
export function resolveSubscriptionEvent(event) {
  const type = event?.type || '';
  const object = event?.data?.object || {};

  if (type === 'checkout.session.completed') {
    const metadata = object.metadata || {};
    if (object.mode !== 'subscription' || object.payment_status !== 'paid') {
      return { action: 'ignore' };
    }
    if (!metadata.user_id || !metadata.target_tier) {
      return { action: 'ignore' };
    }
    return {
      action: 'activate',
      userId: metadata.user_id,
      targetTier: metadata.target_tier,
      totalDevices: parseInt(metadata.total_devices || '0', 10) || 0,
      stripeCustomerId: object.customer || null,
      stripeSubscriptionId: object.subscription || null,
      sessionId: object.id || null,
    };
  }

  if (type === 'customer.subscription.deleted') {
    const metadata = object.metadata || {};
    return {
      action: 'downgrade',
      userId: metadata.user_id || null,
      stripeCustomerId: object.customer || null,
      stripeSubscriptionId: object.id || null,
    };
  }

  if (type === 'invoice.payment_failed') {
    return {
      action: 'flag',
      stripeCustomerId: object.customer || null,
      stripeSubscriptionId: object.subscription || null,
    };
  }

  return { action: 'ignore' };
}

