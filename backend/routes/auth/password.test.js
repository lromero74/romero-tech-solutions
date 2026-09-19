import { test } from 'node:test';
import assert from 'node:assert/strict';
import passwordRouter from './password.js';

// Guards the auth.js → auth/password.js split: the sub-router must load
// (all relative imports resolve) and expose exactly the 7 password endpoints.
test('password router exposes all password endpoints', () => {
  const routes = passwordRouter.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter(m => m !== '_all')
    }));

  assert.equal(routes.length, 7);

  const paths = routes.map(r => `${r.methods[0].toUpperCase()} ${r.path}`).sort();
  assert.deepEqual(paths, [
    'GET /password-expiration/:userId',
    'POST /change-password',
    'POST /forgot-password',
    'POST /password-history',
    'POST /password-history/check',
    'POST /reset-password',
    'POST /validate-password'
  ]);
});
