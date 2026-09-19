import { test } from 'node:test';
import assert from 'node:assert/strict';
import inventoryRouter from './inventory.js';

// Guards the agents.js → agents/inventory.js split: the sub-router must load
// (all relative imports resolve) and expose exactly the 6 inventory endpoints.
test('inventory router exposes all inventory endpoints', () => {
  const routes = inventoryRouter.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter(m => m !== '_all')
    }));

  assert.equal(routes.length, 6);

  const paths = routes.map(r => `${r.methods[0].toUpperCase()} ${r.path}`).sort();
  assert.deepEqual(paths, [
    'GET /:agent_id/inventory/hardware',
    'GET /:agent_id/inventory/software',
    'GET /:agent_id/inventory/storage',
    'POST /:agent_id/inventory/hardware',
    'POST /:agent_id/inventory/software',
    'POST /:agent_id/inventory/storage'
  ]);
});
