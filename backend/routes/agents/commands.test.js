import { test } from 'node:test';
import assert from 'node:assert/strict';
import commandsRouter from './commands.js';

// Guards the agents.js → agents/commands.js split: the sub-router must load
// (all relative imports resolve) and expose exactly the 7 command endpoints.
test('commands router exposes all command endpoints', () => {
  const routes = commandsRouter.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter(m => m !== '_all')
    }));

  assert.equal(routes.length, 7);

  const paths = routes.map(r => `${r.methods[0].toUpperCase()} ${r.path}`).sort();
  assert.deepEqual(paths, [
    'GET /:agent_id/commands',
    'GET /:agent_id/commands/list',
    'POST /:agent_id/commands',
    'POST /:agent_id/commands/:command_id/progress',
    'POST /:agent_id/commands/:command_id/reboot-cancelled',
    'POST /:agent_id/commands/:command_id/result',
    'POST /:agent_id/commands/:command_id/started'
  ]);
});
