import { test } from 'node:test';
import assert from 'node:assert/strict';

// Stripe client refuses to construct without a key; a dummy key is enough
// because signature verification is fully local (HMAC, no network).
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_unit_tests';
const { constructWebhookEvent } = await import('./stripeService.js');

test('constructWebhookEvent rejects a forged signature', () => {
  const payload = JSON.stringify({ id: 'evt_test', object: 'event' });
  assert.throws(
    () => constructWebhookEvent(payload, 't=123,v1=deadbeef', 'whsec_test_secret'),
    /signature|Signature|verification|verified/i
  );
});

test('constructWebhookEvent rejects a missing secret', () => {
  const payload = JSON.stringify({ id: 'evt_test', object: 'event' });
  assert.throws(() => constructWebhookEvent(payload, 't=123,v1=deadbeef', undefined));
});
