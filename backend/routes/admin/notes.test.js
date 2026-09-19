import { test } from 'node:test';
import assert from 'node:assert/strict';
import notesRouter from './notes.js';

// Guards the serviceRequests.js → admin/notes.js split: the sub-router must
// load (all relative imports resolve) and expose exactly the 2 note endpoints.
test('notes router exposes all note endpoints', () => {
  const routes = notesRouter.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter(m => m !== '_all')
    }));

  assert.equal(routes.length, 2);

  const paths = routes.map(r => `${r.methods[0].toUpperCase()} ${r.path}`).sort();
  assert.deepEqual(paths, [
    'GET /service-requests/:id/notes',
    'POST /service-requests/:id/notes'
  ]);
});
