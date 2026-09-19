import { test } from 'node:test';
import assert from 'node:assert/strict';
import lifecycleRouter, { detailsRoutes, rescheduleRoutes } from './lifecycle.js';

// Guards the serviceRequests.js → serviceRequests/lifecycle.js split.
// Three routers preserve registration order around the presets/uploads mounts.
function routeList(router) {
  return router.stack
    .filter(layer => layer.route)
    .map(layer => `${Object.keys(layer.route.methods).filter(m => m !== '_all')[0].toUpperCase()} ${layer.route.path}`)
    .sort();
}

test('lifecycle router exposes detail and status-transition endpoints', () => {
  assert.deepEqual(routeList(lifecycleRouter), [
    'DELETE /service-requests/:id',
    'GET /service-requests/:id',
    'POST /service-requests',
    'POST /service-requests/:id/uncancel',
    'PUT /service-requests/:id/acknowledge',
    'PUT /service-requests/:id/assign',
    'PUT /service-requests/:id/close',
    'PUT /service-requests/:id/status',
    'PUT /service-requests/:id/time-entry'
  ]);
});

test('details router exposes the details patch', () => {
  assert.deepEqual(routeList(detailsRoutes), [
    'PATCH /service-requests/:id/details'
  ]);
});

test('reschedule router exposes the reschedule patch', () => {
  assert.deepEqual(routeList(rescheduleRoutes), [
    'PATCH /service-requests/:id/reschedule'
  ]);
});
