import { test } from 'node:test';
import assert from 'node:assert/strict';
import queriesRouter from './queries.js';

// Guards the serviceRequests.js → serviceRequests/queries.js split.
test('queries router exposes all read endpoints', () => {
  const routes = queriesRouter.stack
    .filter(layer => layer.route)
    .map(layer => `${Object.keys(layer.route.methods).filter(m => m !== '_all')[0].toUpperCase()} ${layer.route.path}`)
    .sort();
  assert.deepEqual(routes, [
    'GET /service-requests',
    'GET /service-requests/:id/files',
    'GET /service-requests/:id/time-breakdown',
    'GET /service-requests/closure-reasons',
    'GET /service-requests/filter-presets',
    'GET /service-requests/statuses',
    'GET /service-requests/technicians'
  ]);
});
