import { test } from 'node:test';
import assert from 'node:assert/strict';
import sessionRouter from './session.js';

// Guards the auth.js → auth/session.js split: the sub-router must load
// (all relative imports resolve) and expose exactly the 7 session endpoints.
test('session router exposes all session endpoints', () => {
  const routes = sessionRouter.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter(m => m !== '_all')
    }));

  assert.equal(routes.length, 7);

  const paths = routes.map(r => `${r.methods[0].toUpperCase()} ${r.path}`).sort();
  assert.deepEqual(paths, [
    'GET /check-admin',
    'GET /validate-session',
    'POST /admin-login-mfa',
    'POST /extend-session',
    'POST /heartbeat',
    'POST /login',
    'POST /logout'
  ]);
});
