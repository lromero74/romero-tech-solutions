import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// auth.js is only slice-tested per sub-router (a full import pulls server.js
// → pushRoutes, which needs VAPID keys). This guards the aggregate wiring
// statically: the shared router must be declared before any mount or route
// uses it. Missing it crashed prod boot (ReferenceError, v1.109.27 deploy).
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'auth.js'), 'utf8');

test('auth aggregate declares its router before first use', () => {
  const decl = src.indexOf('const router = express.Router();');
  assert.ok(decl !== -1, 'auth.js must declare const router = express.Router()');
  const firstUse = src.indexOf('router.');
  assert.ok(firstUse > decl, 'router must be declared before its first use');
});

test('every mounted sub-router is imported', () => {
  const mounts = [...src.matchAll(/router\.use\((\w+)\)/g)].map(m => m[1]);
  assert.ok(mounts.length > 0, 'expected sub-router mounts');
  for (const name of mounts) {
    assert.ok(
      new RegExp(`import[^;]*\\b${name}\\b`).test(src),
      `${name} is mounted but never imported`
    );
  }
});
