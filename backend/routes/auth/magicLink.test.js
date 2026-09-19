import { test } from 'node:test';
import assert from 'node:assert/strict';
import magicLinkRouter from './magicLink.js';

// Guards the auth.js → auth/magicLink.js split: the sub-router must load
// (all relative imports resolve) and expose exactly the 4 login endpoints.
test('magicLink router exposes all login endpoints', () => {
  const routes = magicLinkRouter.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter(m => m !== '_all')
    }));

  assert.equal(routes.length, 4);

  const paths = routes.map(r => `${r.methods[0].toUpperCase()} ${r.path}`).sort();
  assert.deepEqual(paths, [
    'POST /agent-magic-login',
    'POST /client-login',
    'POST /trial-magic-login',
    'POST /trusted-device-login'
  ]);
});
