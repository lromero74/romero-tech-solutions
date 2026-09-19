import { test } from 'node:test';
import assert from 'node:assert/strict';
import uploadsRouter from './uploads.js';

// Guards the serviceRequests.js → serviceRequests/uploads.js split.
test('uploads router exposes the file upload endpoint', () => {
  const routes = uploadsRouter.stack
    .filter(layer => layer.route)
    .map(layer => `${Object.keys(layer.route.methods).filter(m => m !== '_all')[0].toUpperCase()} ${layer.route.path}`)
    .sort();
  assert.deepEqual(routes, [
    'POST /service-requests/:id/files/upload'
  ]);
});
