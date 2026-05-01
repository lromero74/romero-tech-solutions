// Source-lint regression tests for routes/securityActions.js — same pattern
// as routes/patchApprovals.test.js. Pins auth + RBAC + audit wiring.
//
// No DB / network. Reads the source as a string and asserts the relevant
// substrings exist; future refactors can't silently weaken safeguards.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, 'securityActions.js'), 'utf8');

function findRoute(routerVar, method, path) {
  const re = new RegExp(
    `${routerVar}\\.${method}\\(\\s*['"]${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`
  );
  const m = SRC.match(re);
  if (!m) return null;
  const start = m.index;
  let depth = 0;
  for (let i = start; i < SRC.length; i++) {
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

test('module imports the validator from securityActionValidator', () => {
  assert.match(SRC, /from\s+['"]\.\.\/services\/securityActionValidator\.js['"]/);
});

test('module imports actionAuditService for the audit hook', () => {
  assert.match(SRC, /from\s+['"]\.\.\/services\/actionAuditService\.js['"]/);
});

// The ONE route this file exposes: POST /:agent_id/security-action
//
// Mounted in server.js at /api/agents under stage4FeatureGate. The router
// delegates auth checks to the route line so they're unit-testable here.

test('POST /:agent_id/security-action exists', () => {
  const block = findRoute('router', 'post', '/:agent_id/security-action');
  assert.ok(block, "router.post('/:agent_id/security-action', ...) must exist");
});

test('POST /:agent_id/security-action requires authMiddleware (employee session)', () => {
  const block = findRoute('router', 'post', '/:agent_id/security-action');
  // The route is for operators (employees) — agents don't trigger their own
  // remediation; authMiddleware is the right gate, not authenticateAgent.
  assert.ok(/\bauthMiddleware\b/.test(block),
    'must use authMiddleware — security actions are operator-initiated');
});

test('POST /:agent_id/security-action requires manage.security_actions.enable permission', () => {
  const block = findRoute('router', 'post', '/:agent_id/security-action');
  assert.ok(block.includes("requirePermission('manage.security_actions.enable')"),
    'must require the new manage.security_actions.enable permission');
});

test('POST /:agent_id/security-action validates body via validateSecurityAction', () => {
  const block = findRoute('router', 'post', '/:agent_id/security-action');
  assert.ok(block.includes('validateSecurityAction'),
    'request body must be validated against the (capability, action) allowlist');
});

test('POST /:agent_id/security-action verifies the agent belongs to caller business (multi-tenant safety)', () => {
  const block = findRoute('router', 'post', '/:agent_id/security-action');
  // Customers must only act on agents within their own business; employees
  // (other than admin/executive) similarly. A SELECT against agent_devices
  // is the canonical guard.
  assert.ok(/agent_devices/.test(block),
    'route must look up the agent row to verify ownership before issuing a command');
  assert.ok(/business_id/.test(block),
    'tenant isolation: business_id must be checked');
});

test('POST /:agent_id/security-action writes a row to agent_commands', () => {
  const block = findRoute('router', 'post', '/:agent_id/security-action');
  assert.ok(/INTO\s+agent_commands/i.test(block),
    'must INSERT INTO agent_commands — that is the agent-side delivery pipe');
  assert.ok(/security_action/.test(block),
    "command_type must be 'security_action' so the agent dispatches to the right handler");
});

test('POST /:agent_id/security-action writes a hash-chained audit row', () => {
  const block = findRoute('router', 'post', '/:agent_id/security-action');
  assert.ok(/actionAudit\.append|append\(/.test(block),
    'must call actionAuditService.append() — every Stage 4 action transition is audited');
  // Action type stays under the security_action.* namespace so admins can
  // filter the audit chain by feature.
  assert.ok(
    /actionType\s*:\s*[`'"]security_action\./.test(block),
    'audit row action_type must start with security_action.* — keeps the chain filterable'
  );
});

test('POST /:agent_id/security-action records actor = req.session.userId (no body-supplied actor)', () => {
  const block = findRoute('router', 'post', '/:agent_id/security-action');
  assert.ok(/req\.session\.userId|session\.userId/.test(block),
    'actor identity must come from session, never from request body');
});
