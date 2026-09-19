import { test } from 'node:test';
import assert from 'node:assert/strict';
import servicesRouter from './services.js';

// services.js must only own /services routes. A stale demo GET
// /service-requests lived here returning [] — shadowed by the real
// serviceRequests.js route, but one mount reorder away from serving
// unpermissioned demo data. This pins the file's route inventory.
test('services router exposes only service catalog endpoints', () => {
  const routes = servicesRouter.stack
    .filter(layer => layer.route)
    .map(layer => `${Object.keys(layer.route.methods).filter(m => m !== '_all')[0].toUpperCase()} ${layer.route.path}`)
    .sort();
  assert.deepEqual(routes, [
    'GET /services',
    'POST /services'
  ]);
});
