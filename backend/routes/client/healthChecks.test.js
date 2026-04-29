// Regression guards for the client-side health-check / transparency routes.
// Source-lint style — pins the wire-level contract (auth + tenant isolation +
// no permission key required) so a future cleanup can't widen access.
//
// See docs/PRPs/STAGE1_HEALTH_CHECKS.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, 'healthChecks.js'), 'utf8');

test('router applies authMiddleware globally', () => {
  assert.ok(/router\.use\(authMiddleware\)/.test(SRC),
    'all client health-check routes must require authMiddleware — anonymous access would leak across tenants');
});

// Find a route block by its path landmark and the next sibling boundary.
function findRouteBlock(path) {
  const startMarker = `router.get('${path}'`;
  const start = SRC.indexOf(startMarker);
  if (start < 0) return null;
  // Next route or end-of-file.
  let end = SRC.indexOf('router.get(', start + startMarker.length);
  if (end < 0) end = SRC.indexOf('export default', start + startMarker.length);
  if (end < 0) end = SRC.length;
  return SRC.slice(start, end);
}

test('GET /:agent_id/health-checks performs business_id ownership check before returning data', () => {
  const block = findRouteBlock('/:agent_id/health-checks');
  assert.ok(block, 'GET /:agent_id/health-checks must exist');
  const ownershipIdx = block.indexOf("WHERE id = $1 AND business_id = $2");
  const dataIdx = block.indexOf('FROM agent_check_results');
  assert.ok(ownershipIdx > 0, 'must verify "WHERE id = $1 AND business_id = $2" before reading');
  assert.ok(dataIdx > ownershipIdx, 'ownership check must precede the data fetch');
});

test('GET /:agent_id/transparency-report performs ownership check and returns no raw payload', () => {
  const block = findRouteBlock('/:agent_id/transparency-report');
  assert.ok(block, 'GET /:agent_id/transparency-report must exist');
  assert.ok(/WHERE id = \$1 AND business_id = \$2/.test(block),
    'transparency report must verify business_id ownership');
  // The summary SELECT must NOT pull payload column.
  const summaryStart = block.indexOf('SELECT check_type');
  const fromCheckResults = block.indexOf('FROM agent_check_results', summaryStart);
  const summarySlice = block.slice(summaryStart, fromCheckResults);
  assert.ok(!/\bpayload\b/.test(summarySlice),
    'transparency-report summary must NOT expose raw payload — privacy guarantee in PRP');
});

test('Routes 403 when business_id is missing from session', () => {
  for (const path of ['/:agent_id/health-checks', '/:agent_id/transparency-report']) {
    const block = findRouteBlock(path);
    assert.ok(block, `expected route ${path} to exist`);
    assert.ok(/businessId/.test(block) && /403/.test(block),
      `${path}: must check businessId and 403 if absent — protects against missing-claim leakage`);
  }
});

test('No requirePermission usage — client routes use ownership not permission', () => {
  assert.ok(!/requirePermission/.test(SRC),
    'client transparency routes must NOT call requirePermission (that path is keyed on employee.role_permissions; clients are gated by business_id ownership)');
});
