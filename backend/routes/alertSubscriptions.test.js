import { test } from 'node:test';
import assert from 'node:assert/strict';
import alertRouter, { validateSubscriptionScope } from './alertSubscriptions.js';

function routeList(router) {
  return router.stack
    .filter(layer => layer.route)
    .map(layer => `${Object.keys(layer.route.methods).filter(m => m !== '_all')[0].toUpperCase()} ${layer.route.path}`)
    .sort();
}

test('alert subscriptions router keeps its endpoints pinned', () => {
  assert.deepEqual(routeList(alertRouter), [
    'DELETE /subscriptions/:id',
    'GET /my-subscriptions',
    'GET /subscription-stats',
    'GET /subscriptions',
    'POST /subscriptions',
    'PUT /subscriptions/:id',
  ]);
});

// Scope validation must verify referenced rows exist (businesses honor
// soft_delete, agents honor soft_delete) instead of an always-true stub —
// unknown scope ids must 404 rather than blow up on the FK with a 500.
function fakeQuery(tables) {
  return async (text, params) => ({
    rows: (tables[text] && tables[text][params[0]] ? [tables[text][params[0]]] : []),
  });
}

const BIZ = 'SELECT id FROM businesses WHERE id = $1 AND COALESCE(soft_delete, false) = false';
const LOC = 'SELECT id FROM service_locations WHERE id = $1';
const AGENT = 'SELECT id FROM agent_devices WHERE id = $1 AND soft_delete = false';

test('empty scope is valid (subscribe to everything)', async () => {
  const result = await validateSubscriptionScope({}, fakeQuery({}));
  assert.deepEqual(result, { ok: true });
});

test('unknown business scope fails with 404', async () => {
  const result = await validateSubscriptionScope(
    { business_id: 'nope' },
    fakeQuery({})
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 404);
  assert.match(result.message, /business/i);
});

test('unknown location and agent scopes fail with 404', async () => {
  const locResult = await validateSubscriptionScope({ service_location_id: 'nope' }, fakeQuery({}));
  assert.equal(locResult.ok, false);
  assert.equal(locResult.code, 404);

  const agentResult = await validateSubscriptionScope({ agent_id: 'nope' }, fakeQuery({}));
  assert.equal(agentResult.ok, false);
  assert.equal(agentResult.code, 404);
});

test('soft-deleted business scope fails', async () => {
  const q = async () => ({ rows: [] });
  const result = await validateSubscriptionScope({ business_id: 'gone' }, q);
  assert.equal(result.ok, false);
  assert.equal(result.code, 404);
});

test('all-known scope passes', async () => {
  const q = fakeQuery({
    [BIZ]: { b1: { id: 'b1' } },
    [LOC]: { l1: { id: 'l1' } },
    [AGENT]: { a1: { id: 'a1' } },
  });
  const result = await validateSubscriptionScope(
    { business_id: 'b1', service_location_id: 'l1', agent_id: 'a1' },
    q
  );
  assert.deepEqual(result, { ok: true });
});
