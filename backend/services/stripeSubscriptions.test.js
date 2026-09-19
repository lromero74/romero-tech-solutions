import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSubscriptionCheckoutParams,
  resolveSubscriptionEvent,
} from './stripeSubscriptions.js';

// Recurring-tier checkout must be a subscription-mode session whose single
// line item carries the graduated monthly cost (single source of truth stays
// in subscription_pricing) plus routing metadata for the webhook.
test('builds subscription-mode checkout params', () => {
  const params = buildSubscriptionCheckoutParams({
    customerId: 'cus_1',
    customerEmail: 'owner@example.com',
    amountCents: 2499,
    currency: 'usd',
    targetTier: 'subscribed',
    totalDevices: 8,
    userId: 'user-1',
    successUrl: 'https://app.example/clogin?subscription=success',
    cancelUrl: 'https://app.example/clogin?subscription=cancelled',
  });
  assert.equal(params.mode, 'subscription');
  assert.equal(params.customer, 'cus_1');
  assert.ok(!('customer_email' in params), 'customer id wins over email (no duplicate customers)');
  assert.equal(params.line_items.length, 1);
  assert.equal(params.line_items[0].quantity, 1);
  assert.equal(params.line_items[0].price_data.unit_amount, 2499);
  assert.equal(params.line_items[0].price_data.currency, 'usd');
  assert.equal(params.line_items[0].price_data.recurring.interval, 'month');
  assert.equal(params.metadata.user_id, 'user-1');
  assert.equal(params.metadata.target_tier, 'subscribed');
  assert.equal(params.metadata.total_devices, '8');
  assert.equal(params.subscription_data.metadata.user_id, 'user-1');
  assert.ok(params.success_url.includes('subscription=success'));
});

test('rejects amounts below the Stripe minimum', () => {
  assert.throws(
    () => buildSubscriptionCheckoutParams({
      customerEmail: 'a@b.c', amountCents: 20, currency: 'usd',
      targetTier: 'subscribed', totalDevices: 3, userId: 'u',
      successUrl: 'https://x/s', cancelUrl: 'https://x/c',
    }),
    /minimum/
  );
});

test('rejects missing routing metadata', () => {
  assert.throws(
    () => buildSubscriptionCheckoutParams({
      customerEmail: 'a@b.c', amountCents: 500, currency: 'usd',
      targetTier: 'subscribed', totalDevices: 3, userId: '',
      successUrl: 'https://x/s', cancelUrl: 'https://x/c',
    }),
    /user_id/
  );
});

// Webhook decisions are pure so they can be pinned without Stripe or a DB.
const completedSession = (overrides = {}) => ({
  type: 'checkout.session.completed',
  data: { object: {
    id: 'cs_1', mode: 'subscription', payment_status: 'paid',
    customer: 'cus_1', subscription: 'sub_1',
    metadata: { user_id: 'user-1', target_tier: 'subscribed', total_devices: '8' },
    ...overrides,
  } },
});

test('paid subscription checkout resolves to activate', () => {
  const decision = resolveSubscriptionEvent(completedSession());
  assert.deepEqual(decision, {
    action: 'activate',
    userId: 'user-1',
    targetTier: 'subscribed',
    totalDevices: 8,
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    sessionId: 'cs_1',
  });
});

test('unpaid or non-subscription sessions resolve to ignore', () => {
  assert.deepEqual(
    resolveSubscriptionEvent(completedSession({ payment_status: 'unpaid' })).action,
    'ignore'
  );
  assert.deepEqual(
    resolveSubscriptionEvent(completedSession({ mode: 'payment' })).action,
    'ignore'
  );
  assert.deepEqual(
    resolveSubscriptionEvent({ type: 'ping', data: { object: {} } }).action,
    'ignore'
  );
});

test('subscription deletion resolves to downgrade', () => {
  const decision = resolveSubscriptionEvent({
    type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_1', customer: 'cus_1', metadata: { user_id: 'user-1' } } },
  });
  assert.deepEqual(decision, {
    action: 'downgrade',
    userId: 'user-1',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
  });
});

test('failed invoice payment resolves to flag', () => {
  const decision = resolveSubscriptionEvent({
    type: 'invoice.payment_failed',
    data: { object: { subscription: 'sub_1', customer: 'cus_1', metadata: {} } },
  });
  assert.equal(decision.action, 'flag');
  assert.equal(decision.stripeSubscriptionId, 'sub_1');
});
