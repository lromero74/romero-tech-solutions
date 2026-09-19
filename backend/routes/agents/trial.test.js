import { test } from 'node:test';
import assert from 'node:assert/strict';
import trialRouter from './trial.js';

// Guards the agents.js → agents/trial.js split: the sub-router must load
// (all relative imports resolve) and expose exactly the 10 trial endpoints.
test('trial router exposes all trial endpoints', () => {
  const routes = trialRouter.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter(m => m !== '_all')
    }));

  assert.equal(routes.length, 10);
  for (const route of routes) {
    assert.ok(
      route.path.startsWith('/trial/'),
      `expected trial path, got ${route.path}`
    );
  }

  const paths = routes.map(r => `${r.methods[0].toUpperCase()} ${r.path}`).sort();
  assert.deepEqual(paths, [
    'GET /trial/status/:trial_id',
    'POST /trial/convert',
    'POST /trial/heartbeat',
    'POST /trial/inventory/hardware',
    'POST /trial/inventory/software',
    'POST /trial/inventory/storage',
    'POST /trial/metrics',
    'POST /trial/resend-verification',
    'POST /trial/send-verification',
    'POST /trial/verify-email'
  ]);
});
