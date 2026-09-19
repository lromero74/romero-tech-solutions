import { test } from 'node:test';
import assert from 'node:assert/strict';
import devicesRouter from './devices.js';

// Guards the agents.js → agents/devices.js split: the sub-router must load
// and expose exactly the 10 employee-facing device management endpoints.
test('devices router exposes all device management endpoints', () => {
  const routes = devicesRouter.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter(m => m !== '_all')
    }));

  assert.equal(routes.length, 10);

  const paths = routes.map(r => `${r.methods[0].toUpperCase()} ${r.path}`).sort();
  assert.deepEqual(paths, [
    'DELETE /:agent_id',
    'GET /',
    'GET /:agent_id',
    'GET /:agent_id/alerts',
    'GET /:agent_id/metrics/history',
    'GET /:agent_id/policies',
    'PATCH /:agent_id',
    'POST /:agent_id/regenerate-token',
    'POST /registration-tokens',
    'PUT /:agent_id/deactivate'
  ]);
});
