import { test } from 'node:test';
import assert from 'node:assert/strict';
import attachmentsRouter from './attachments.js';

// Guards the serviceRequests.js → serviceRequests/attachments.js split.
test('attachments router exposes file delete and rename', () => {
  const routes = attachmentsRouter.stack
    .filter(layer => layer.route)
    .map(layer => `${Object.keys(layer.route.methods).filter(m => m !== '_all')[0].toUpperCase()} ${layer.route.path}`)
    .sort();
  assert.deepEqual(routes, [
    'DELETE /service-requests/:requestId/files/:fileId',
    'PATCH /service-requests/:requestId/files/:fileId/rename'
  ]);
});
