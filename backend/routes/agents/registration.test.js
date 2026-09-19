import { test } from 'node:test';
import assert from 'node:assert/strict';
import registrationRouter from './registration.js';

// Guards the agents.js → agents/registration.js split: the sub-router must
// load and expose exactly the 7 agent-facing registration/lifecycle endpoints.
test('registration router exposes all agent lifecycle endpoints', () => {
  const routes = registrationRouter.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter(m => m !== '_all')
    }));

  assert.equal(routes.length, 7);

  const paths = routes.map(r => `${r.methods[0].toUpperCase()} ${r.path}`).sort();
  assert.deepEqual(paths, [
    'POST /:agent_id/dashboard-link',
    'POST /:agent_id/heartbeat',
    'POST /:agent_id/metrics',
    'POST /:agent_id/release-registration',
    'POST /:agent_id/status',
    'POST /:agent_id/uninstall',
    'POST /register'
  ]);
});
