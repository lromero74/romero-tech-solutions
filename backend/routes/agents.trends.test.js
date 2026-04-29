// Regression guards for the Stage 2 trend / forecast / baseline routes
// added to agents.js. Source-lint style — pins auth + permission gates.
//
// See docs/PRPs/STAGE2_TRENDS.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, 'agents.js'), 'utf8');

function findRoute(method, path) {
  const start = SRC.indexOf(`router.${method}('${path}'`);
  if (start < 0) return null;
  let depth = 0;
  let i = start;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        const semi = SRC.indexOf(';', i);
        return SRC.slice(start, semi >= 0 ? semi + 1 : i + 1);
      }
    }
  }
  return null;
}

test('GET /:agent_id/disk-forecast requires view.agent_disk_forecast.enable', () => {
  const block = findRoute('get', '/:agent_id/disk-forecast');
  assert.ok(block, 'route must exist');
  assert.ok(block.includes('authMiddleware'), 'must use authMiddleware');
  assert.ok(/requirePermission\(\s*['"]view\.agent_disk_forecast\.enable['"]\s*\)/.test(block),
    'must enforce view.agent_disk_forecast.enable');
});

test('GET /:agent_id/disk-forecast clamps days param', () => {
  const block = findRoute('get', '/:agent_id/disk-forecast');
  assert.ok(/Math\.min/.test(block) && /Math\.max/.test(block),
    'days must be clamped to a sane range');
});

test('GET /:agent_id/baselines requires view.agent_trends.enable', () => {
  const block = findRoute('get', '/:agent_id/baselines');
  assert.ok(block);
  assert.ok(/requirePermission\(\s*['"]view\.agent_trends\.enable['"]\s*\)/.test(block));
});

test('GET /:agent_id/wan-ip-history requires view.agent_trends.enable', () => {
  const block = findRoute('get', '/:agent_id/wan-ip-history');
  assert.ok(block);
  assert.ok(/requirePermission\(\s*['"]view\.agent_trends\.enable['"]\s*\)/.test(block));
  assert.ok(/Math\.min.*Math\.max|Math\.max.*Math\.min/s.test(block),
    'limit must be clamped');
});

test('Anomaly evaluation hook is wired into metrics POST', () => {
  // The hook is fire-and-forget — must call evaluateMetricsForAnomalies and
  // route any returned anomalies through processHealthCheckResult.
  assert.ok(/evaluateMetricsForAnomalies\(agent_id, latestMetric\)/.test(SRC),
    'metrics POST must call evaluateMetricsForAnomalies');
  // Closure bug guard: the .then callback must NOT reference `agentInfo`
  // (declared LATER in the handler — would hit TDZ if the promise resolves
  // before the await). Snapshot req.agent locally instead.
  const evalIdx = SRC.indexOf('evaluateMetricsForAnomalies(agent_id, latestMetric)');
  const broadcastIdx = SRC.indexOf('Broadcast metrics update', evalIdx);
  const closureBlock = SRC.slice(evalIdx, broadcastIdx);
  assert.ok(!/agentInfo\.rows/.test(closureBlock),
    'anomaly .then closure must NOT reference agentInfo (TDZ); use req.agent locals');
});

test('Imports include the three Stage 2 services', () => {
  assert.ok(/from\s+['"]\.\.\/services\/diskForecastService\.js['"]/.test(SRC));
  assert.ok(/from\s+['"]\.\.\/services\/anomalyDetectionService\.js['"]/.test(SRC));
  assert.ok(/from\s+['"]\.\.\/services\/wanIpService\.js['"]/.test(SRC));
});
