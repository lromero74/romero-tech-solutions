import { test } from 'node:test';
import assert from 'node:assert/strict';
import monitoringRouter from './monitoring.js';

// Guards the agents.js → agents/monitoring.js split: the sub-router must load
// and expose exactly the 12 health-check / trend / aggregation endpoints.
test('monitoring router exposes all monitoring endpoints', () => {
  const routes = monitoringRouter.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter(m => m !== '_all')
    }));

  assert.equal(routes.length, 12);

  const paths = routes.map(r => `${r.methods[0].toUpperCase()} ${r.path}`).sort();
  assert.deepEqual(paths, [
    'GET /:agent_id/aggregation-settings',
    'GET /:agent_id/baselines',
    'GET /:agent_id/disk-forecast',
    'GET /:agent_id/health-checks',
    'GET /:agent_id/health-checks/:check_type/history',
    'GET /:agent_id/smart-trend',
    'GET /:agent_id/wan-ip-history',
    'GET /aggregation-levels',
    'GET /packages/vulnerabilities',
    'POST /:agent_id/backfill-candles',
    'POST /:agent_id/check-result',
    'PUT /:agent_id/aggregation-level'
  ]);
});
