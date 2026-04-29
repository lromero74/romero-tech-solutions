// Regression guards for the Stage 1 health-check routes added to agents.js.
// Source-lint style (no DB / network) — pins the wire-level contract so a
// future cleanup can't silently weaken auth/permission/validation.
//
// See docs/PRPs/STAGE1_HEALTH_CHECKS.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, 'agents.js'), 'utf8');

// Locate a route handler block by method + path. Returns the source slice
// from `router.METHOD('PATH'` to the closing `});` of the same handler.
function findRoute(method, path) {
  const start = SRC.indexOf(`router.${method}('${path}'`);
  if (start < 0) return null;
  // Walk forward and balance parens to find the matching close.
  let depth = 0;
  let i = start;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        // Consume up to the next ';'
        const semi = SRC.indexOf(';', i);
        return SRC.slice(start, semi >= 0 ? semi + 1 : i + 1);
      }
    }
  }
  return null;
}

test('POST /:agent_id/check-result is gated by authenticateAgent + requireAgentMatch', () => {
  const block = findRoute('post', '/:agent_id/check-result');
  assert.ok(block, 'POST /:agent_id/check-result must exist');
  assert.ok(block.includes('authenticateAgent'), 'must use authenticateAgent middleware');
  assert.ok(block.includes('requireAgentMatch'), 'must use requireAgentMatch (agent ↔ token binding)');
});

test('POST /:agent_id/check-result validates check_type against allowlist', () => {
  const block = findRoute('post', '/:agent_id/check-result');
  assert.ok(block.includes('VALID_CHECK_TYPES'),
    'check-result must validate against VALID_CHECK_TYPES — accepting arbitrary check_type would let a compromised agent inject rows under any name');
});

test('POST /:agent_id/check-result enforces free-tier gate', () => {
  const block = findRoute('post', '/:agent_id/check-result');
  assert.ok(block.includes('isCheckAllowedForAgent'),
    'check-result must call isCheckAllowedForAgent — defense-in-depth against a compromised free-tier agent reporting paid-only checks');
});

test('POST /:agent_id/check-result writes both latest snapshot and history', () => {
  const block = findRoute('post', '/:agent_id/check-result');
  assert.ok(/INTO\s+agent_check_results/.test(block), 'must INSERT into agent_check_results');
  assert.ok(/INTO\s+agent_check_history/.test(block), 'must INSERT into agent_check_history (audit trail)');
});

test('POST /:agent_id/check-result history insert is conditional on payload change', () => {
  const block = findRoute('post', '/:agent_id/check-result');
  assert.ok(/payloadChanged/.test(block),
    'history insert must be guarded by payloadChanged — unconditional inserts would balloon the table');
});

test('POST /:agent_id/check-result emits agent-check-result over WebSocket', () => {
  const block = findRoute('post', '/:agent_id/check-result');
  assert.ok(/'agent-check-result'/.test(block),
    'WebSocket event name "agent-check-result" is part of the frontend contract');
});

test('GET /:agent_id/health-checks requires view.agent_health_checks.enable permission', () => {
  const block = findRoute('get', '/:agent_id/health-checks');
  assert.ok(block, 'GET /:agent_id/health-checks must exist');
  assert.ok(/requirePermission\(\s*['"]view\.agent_health_checks\.enable['"]\s*\)/.test(block),
    'must enforce view.agent_health_checks.enable — never role-check inline');
});

test('GET history endpoint requires same permission and validates check_type', () => {
  const block = findRoute('get', '/:agent_id/health-checks/:check_type/history');
  assert.ok(block, 'history GET must exist');
  assert.ok(/requirePermission\(\s*['"]view\.agent_health_checks\.enable['"]\s*\)/.test(block),
    'history GET must enforce view.agent_health_checks.enable');
  assert.ok(/VALID_CHECK_TYPES/.test(block),
    'history GET must validate check_type — open-ended params let a caller probe arbitrary string columns');
});

test('GET history endpoint clamps days parameter to a sane range', () => {
  const block = findRoute('get', '/:agent_id/health-checks/:check_type/history');
  assert.ok(/Math\.min/.test(block) && /Math\.max/.test(block),
    'days param must be bounded — unbounded would let a caller force a slow query');
});

test('imports include freetier gate and requirePermission', () => {
  assert.ok(/from\s+['"]\.\.\/services\/freetierGate\.js['"]/.test(SRC),
    'agents.js must import from services/freetierGate.js');
  assert.ok(/requirePermission/.test(SRC) && /permissionMiddleware\.js/.test(SRC),
    'agents.js must import requirePermission from permissionMiddleware.js');
});

test('POST /:agent_id/check-result fires alert pipeline for warning/critical only', () => {
  const block = findRoute('post', '/:agent_id/check-result');
  assert.ok(/sev === 'warning' \|\| sev === 'critical'/.test(block),
    'alert hook must gate on severity warning/critical — info severity must NOT fire alerts');
  assert.ok(/alertEscalationService\.processHealthCheckResult/.test(block),
    'must call alertEscalationService.processHealthCheckResult to fire the alert pipeline');
  assert.ok(/processHealthCheckResult\([\s\S]+?\)\.catch\(/.test(block),
    'alert call must be fire-and-forget — failures must not block the check_result write');
});
