// Source-lint regression tests for routes/zenithgridLicensing.js -- same
// pattern as routes/securityActions.test.js. Pins the structured error
// codes and validation a machine client (the zenithgrid binary) relies on.
//
// No DB / network. Reads the source as a string and asserts the relevant
// substrings exist; future refactors can't silently weaken these.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, 'zenithgridLicensing.js'), 'utf8');

function findRoute(method, path) {
  const re = new RegExp(
    `router\\.${method}\\(\\s*['"]${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`
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

test('signing uses ES256 (asymmetric) not the app default HS256', () => {
  assert.match(SRC, /algorithm:\s*['"]ES256['"]/);
});

test('signing key comes from ZENITHGRID_LICENSE_SIGNING_PRIVATE_KEY, not the app JWT_SECRET', () => {
  assert.match(SRC, /ZENITHGRID_LICENSE_SIGNING_PRIVATE_KEY/);
  assert.doesNotMatch(SRC, /jwt\.sign\([^)]*JWT_SECRET/);
});

test('POST /activate exists and validates required fields', () => {
  const block = findRoute('post', '/activate');
  assert.ok(block, "router.post('/activate', ...) must exist");
  assert.match(block, /license_key/);
  assert.match(block, /hardware_fingerprint/);
  assert.match(block, /MISSING_FIELDS/);
});

test('POST /activate rejects an unknown license key with a structured code', () => {
  const block = findRoute('post', '/activate');
  assert.match(block, /LICENSE_NOT_FOUND/);
});

test('POST /activate deactivates the previous activation inside a transaction', () => {
  const block = findRoute('post', '/activate');
  assert.match(block, /transaction\(/, 'must use the transaction() helper, not two separate query() calls');
  assert.match(block, /deactivated_at\s*=\s*NOW\(\)/);
});

test('POST /heartbeat exists and validates required fields', () => {
  const block = findRoute('post', '/heartbeat');
  assert.ok(block, "router.post('/heartbeat', ...) must exist");
  assert.match(block, /MISSING_FIELDS/);
});

test('POST /heartbeat rejects a fingerprint that does not match the active activation', () => {
  const block = findRoute('post', '/heartbeat');
  assert.match(block, /FINGERPRINT_MISMATCH/);
});

test('every 4xx business-logic response includes a structured `code` field', () => {
  // 4xx branches are business-logic decisions a machine client needs to
  // branch on; 500s are generic uncaught errors and intentionally don't
  // carry one.
  const statusCalls = SRC.match(/res\.status\(4\d{2}\)\.json\(\{[^}]*\}\)/gs) || [];
  assert.ok(statusCalls.length > 0, 'expected at least one 4xx structured response to check');
  for (const call of statusCalls) {
    assert.match(call, /code:/, `missing structured code in: ${call.slice(0, 80)}...`);
  }
});
