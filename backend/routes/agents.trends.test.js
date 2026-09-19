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
// God-file split: routes now live across agents.js and agents/*.js. These are
// wire-contract guards (auth gates, validation), so SRC covers every router
// file — file layout itself is pinned by agents/mounts.test.js.
const REG_SRC = readFileSync(join(here, 'agents', 'registration.js'), 'utf8');
const MON_SRC = readFileSync(join(here, 'agents', 'monitoring.js'), 'utf8');
const ALL_SRC = SRC + '\n' + REG_SRC + '\n' + MON_SRC;

function findRoute(method, path) {
  const start = ALL_SRC.indexOf(`router.${method}('${path}'`);
  if (start < 0) return null;
  let depth = 0;
  let i = start;
  for (; i < ALL_SRC.length; i++) {
    const c = ALL_SRC[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        const semi = ALL_SRC.indexOf(';', i);
        return ALL_SRC.slice(start, semi >= 0 ? semi + 1 : i + 1);
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
  assert.ok(/evaluateMetricsForAnomalies\(agent_id, latestMetric\)/.test(ALL_SRC),
    'metrics POST must call evaluateMetricsForAnomalies');
  // Closure bug guard: the .then callback must NOT reference `agentInfo`
  // (declared LATER in the handler — would hit TDZ if the promise resolves
  // before the await). Snapshot req.agent locally instead.
  const evalIdx = ALL_SRC.indexOf('evaluateMetricsForAnomalies(agent_id, latestMetric)');
  const broadcastIdx = ALL_SRC.indexOf('Broadcast metrics update', evalIdx);
  const closureBlock = ALL_SRC.slice(evalIdx, broadcastIdx);
  assert.ok(!/agentInfo\.rows/.test(closureBlock),
    'anomaly .then closure must NOT reference agentInfo (TDZ); use req.agent locals');
});

test('Imports include the three Stage 2 services', () => {
  // Router files live at two depths (routes/ and routes/agents/), so accept
  // either ../services/ or ../../services/ import paths.
  for (const svc of ['diskForecastService', 'anomalyDetectionService', 'wanIpService']) {
    assert.ok(
      new RegExp(`from\\s+['"]\\.\\./(\\.\\./)?services\\/${svc}\\.js['"]`).test(ALL_SRC),
      `${svc} must be imported by one of the agents router files`
    );
  }
});
