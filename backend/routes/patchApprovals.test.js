// Source-lint regression tests for routes/patchApprovals.js — pins the wire-
// level contract (auth middleware order, RBAC permissions, validator usage,
// audit-trail wiring) so a future cleanup can't silently weaken safeguards.
//
// Same pattern as agents.healthchecks.test.js. No DB / network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, 'patchApprovals.js'), 'utf8');

function findRoute(routerVar, method, path) {
  // Tolerate optional whitespace/newlines between .post( and the path string.
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

// ============================================================================
// Module exports — server.js mounts these on different base paths.
// ============================================================================
test('module exports two routers: operatorRouter and agentRouter', () => {
  assert.match(SRC, /export\s+\{[^}]*operatorRouter[^}]*\}/);
  assert.match(SRC, /export\s+\{[^}]*agentRouter[^}]*\}/);
});

test('imports the validators from patchApprovalDecisions', () => {
  assert.match(SRC, /from\s+['"]\.\.\/services\/patchApprovalDecisions\.js['"]/);
});

test('imports actionAuditService for audit hook', () => {
  assert.match(SRC, /from\s+['"]\.\.\/services\/actionAuditService\.js['"]/);
});

// ============================================================================
// Agent-side ingest route: POST /:agent_id/patch-approvals/ingest
// (mounted at /api/agents in server.js so the absolute path is
//  /api/agents/:agent_id/patch-approvals/ingest)
//
// The router itself uses path '/' since the :agent_id is a parent param.
// ============================================================================

test('agentRouter: POST / (ingest) exists', () => {
  // The agent router is mounted at .../patch-approvals/ingest, so its own
  // route path is '/'.
  const block = findRoute('agentRouter', 'post', '/');
  assert.ok(block, 'agentRouter.post(\'/\', ...) ingest route must exist');
});

test('agentRouter ingest: validates package_manager via validatePackageManager', () => {
  const block = findRoute('agentRouter', 'post', '/');
  assert.ok(block.includes('validatePackageManager'),
    'ingest must call validatePackageManager — accepting arbitrary package managers would let a compromised agent seed fictional rows');
});

test('agentRouter ingest: upserts into patch_approvals (one row per device×patch×pm)', () => {
  const block = findRoute('agentRouter', 'post', '/');
  assert.ok(/INTO\s+patch_approvals/i.test(block), 'must INSERT INTO patch_approvals');
  assert.ok(/ON CONFLICT/i.test(block), 'must use ON CONFLICT (upsert) — agents repost the same patches across heartbeats');
});

test('agentRouter ingest: scopes the row to the agent\'s business (multi-tenant safety)', () => {
  const block = findRoute('agentRouter', 'post', '/');
  // The req.agent.business_id (set by authenticateAgent) must be the source
  // of business_id on the row — never the request body. Otherwise a
  // compromised agent could seed rows under another tenant.
  assert.ok(/req\.agent\.business_id|agent\.business_id/.test(block),
    'business_id must come from req.agent (set by authenticateAgent), never from the request body');
});

// ============================================================================
// Operator routes (employee-facing) under /api/patch-approvals/...
// ============================================================================

test('operatorRouter: GET / list pending requires view.patch_approvals.enable', () => {
  const block = findRoute('operatorRouter', 'get', '/');
  assert.ok(block, 'operatorRouter.get(\'/\', ...) must exist');
  assert.ok(block.includes("requirePermission('view.patch_approvals.enable')"),
    'list must require view.patch_approvals.enable');
});

test('operatorRouter list: filters by req.user business when caller is a customer', () => {
  const block = findRoute('operatorRouter', 'get', '/');
  // Same multi-tenant rule as elsewhere — customers see only their business.
  assert.ok(/business_id/.test(block));
});

test('operatorRouter: POST /:id/decision requires manage.patch_approvals.enable', () => {
  const block = findRoute('operatorRouter', 'post', '/:id/decision');
  assert.ok(block, 'operatorRouter.post(\'/:id/decision\', ...) must exist');
  assert.ok(block.includes("requirePermission('manage.patch_approvals.enable')"),
    'decision endpoint must require manage.patch_approvals.enable');
});

test('operatorRouter decision: validates action via validateAction', () => {
  const block = findRoute('operatorRouter', 'post', '/:id/decision');
  assert.ok(block.includes('validateAction'),
    'decision must validate the action verb against the allowlist');
});

test('operatorRouter decision: validates state transition via validateTransition', () => {
  const block = findRoute('operatorRouter', 'post', '/:id/decision');
  assert.ok(block.includes('validateTransition'),
    'decision must validate the current → next state transition');
});

test('operatorRouter decision: applies the decision via applyDecision (no inline status mapping)', () => {
  const block = findRoute('operatorRouter', 'post', '/:id/decision');
  assert.ok(block.includes('applyDecision'),
    'decision must use applyDecision pure mapper — inline status writes risk forgetting to record approver/timestamp');
});

test('operatorRouter decision: writes to agent_action_audit via actionAuditService.append', () => {
  const block = findRoute('operatorRouter', 'post', '/:id/decision');
  // The whole point of Stage 4 is the audit trail. If the route updates
  // patch_approvals without writing a chain row, the action is invisible.
  assert.ok(/actionAudit\.append|append\(/.test(block),
    'decision must call actionAuditService.append() — every Stage 4 action transition is audited');
  // Action type must be in the patch.* namespace. Accept either a template
  // literal (`patch.${action}`) or a quoted literal ('patch.approve', etc).
  assert.ok(
    /actionType\s*:\s*[`'"]patch\./.test(block),
    'audit row action_type must start with patch.* — keeps the chain filterable by namespace'
  );
});

test('operatorRouter decision: records approver = req.session.userId (not body-supplied)', () => {
  const block = findRoute('operatorRouter', 'post', '/:id/decision');
  assert.ok(/req\.session\.userId|session\.userId/.test(block),
    'approver identity must come from req.session.userId — never from request body (impersonation guard)');
});
