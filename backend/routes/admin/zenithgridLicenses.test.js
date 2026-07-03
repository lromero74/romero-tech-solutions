// Source-lint regression tests for routes/admin/zenithgridLicenses.js --
// same pattern as routes/securityActions.test.js. Pins auth + permission
// gating for issuing/revoking ZenithGrid licenses.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, 'zenithgridLicenses.js'), 'utf8');

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

test('module requires authMiddleware + requireEmployee for all routes', () => {
  assert.match(SRC, /router\.use\(authMiddleware\)/);
  assert.match(SRC, /router\.use\(requireEmployee\)/);
});

test('GET / requires manage.zenithgrid_licenses.enable', () => {
  const block = findRoute('get', '/');
  assert.ok(block, "router.get('/', ...) must exist");
  assert.match(block, /requirePermission\(\s*['"]manage\.zenithgrid_licenses\.enable['"]\s*\)/);
});

test('POST / requires manage.zenithgrid_licenses.enable and only issues manual licenses', () => {
  const block = findRoute('post', '/');
  assert.ok(block, "router.post('/', ...) must exist");
  assert.match(block, /requirePermission\(\s*['"]manage\.zenithgrid_licenses\.enable['"]\s*\)/);
  assert.match(block, /'manual'/, "must hardcode source='manual' -- Stripe-sourced licenses come from webhook sync, not this endpoint");
  assert.match(block, /user_id/);
});

test('PATCH /:id requires manage.zenithgrid_licenses.enable and validates status', () => {
  const block = findRoute('patch', '/:id');
  assert.ok(block, "router.patch('/:id', ...) must exist");
  assert.match(block, /requirePermission\(\s*['"]manage\.zenithgrid_licenses\.enable['"]\s*\)/);
  assert.match(block, /active.*suspended.*revoked.*expired|suspended.*revoked.*expired.*active/s);
});

test('license key generator produces the ZG-XXXX-XXXX-XXXX-XXXX format', () => {
  assert.match(SRC, /ZG-/);
  assert.match(SRC, /crypto\.randomBytes/);
});
