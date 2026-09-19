import { test } from 'node:test';
import assert from 'node:assert/strict';
import presetsRouter from './presets.js';

// Guards the serviceRequests.js → serviceRequests/presets.js split.
test('presets router exposes filter-preset CRUD', () => {
  const routes = presetsRouter.stack
    .filter(layer => layer.route)
    .map(layer => `${Object.keys(layer.route.methods).filter(m => m !== '_all')[0].toUpperCase()} ${layer.route.path}`)
    .sort();
  assert.deepEqual(routes, [
    'DELETE /service-requests/filter-presets/:id',
    'GET /service-requests/filter-presets/all',
    'POST /service-requests/filter-presets',
    'PUT /service-requests/filter-presets/:id'
  ]);
});
