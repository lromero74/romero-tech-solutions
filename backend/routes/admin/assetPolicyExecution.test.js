import { test } from 'node:test';
import assert from 'node:assert/strict';
import assetRouter from './assetManagement.js';
import policyRouter from './policyAutomation.js';

function routeList(router) {
  return router.stack
    .filter(layer => layer.route)
    .map(layer => `${Object.keys(layer.route.methods).filter(m => m !== '_all')[0].toUpperCase()} ${layer.route.path}`)
    .sort();
}

function lastHandler(router, method, path) {
  const layer = router.stack.find(
    l => l.route && l.route.path === path && l.route.methods[method]
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} must stay mounted`);
  return layer.route.stack.at(-1).handle;
}

function mockRes() {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test('asset router keeps its endpoints pinned', () => {
  assert.deepEqual(routeList(assetRouter), [
    'GET /changes/:agent_id',
    'GET /hardware/:agent_id',
    'GET /licenses',
    'GET /network-devices',
    'GET /software/:agent_id',
    'GET /warranties/:agent_id',
    'POST /licenses',
    'POST /scan/:agent_id',
  ]);
});

test('policy automation router keeps its execute endpoint pinned', () => {
  assert.deepEqual(routeList(policyRouter), [
    'GET /execution-history',
    'GET /policies',
    'GET /policies/:policy_id/assignments',
    'GET /script-categories',
    'GET /scripts',
    'GET /scripts/:script_id',
    'GET /templates',
    'PATCH /policies/:policy_id',
    'POST /policies',
    'POST /policies/:policy_id/assign',
    'POST /policies/:policy_id/execute',
    'POST /scripts',
  ]);
});

// The agent firmware has no on-demand inventory-scan command (inventory
// uploads on its own 24h ticker), so the scan endpoint must answer 501
// honestly instead of a fake success — and must not touch the DB.
test('POST /scan/:agent_id answers 501 without claiming a scan', async () => {
  const handle = lastHandler(assetRouter, 'post', '/scan/:agent_id');
  const res = mockRes();
  await handle({ params: { agent_id: 'agent-1' }, body: {} }, res);
  assert.equal(res.statusCode, 501);
  assert.equal(res.body.success, false);
  assert.match(res.body.message, /not supported|not implemented/i);
});
