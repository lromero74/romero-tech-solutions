import { test } from 'node:test';
import assert from 'node:assert/strict';
import subscriptionRouter, { subscriptionWebhookRouter } from './subscription.js';

function routeList(router) {
  return router.stack
    .filter(layer => layer.route)
    .map(layer => `${Object.keys(layer.route.methods).filter(m => m !== '_all')[0].toUpperCase()} ${layer.route.path}`)
    .sort();
}

// Guards the subscription surface: public pricing, authenticated
// status/upgrade/cancel, and the raw-body webhook that alone activates tiers.
test('subscription router keeps its endpoints pinned', () => {
  assert.deepEqual(routeList(subscriptionRouter), [
    'GET /pricing',
    'GET /status',
    'POST /cancel',
    'POST /upgrade',
  ]);
});

test('subscription webhook router exposes the raw-body webhook', () => {
  assert.deepEqual(routeList(subscriptionWebhookRouter), [
    'POST /webhook',
  ]);
});
