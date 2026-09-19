import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Migrated router/service modules must log through utils/logger (prod-quiet,
// dev-verbose) instead of raw console — raw calls spam production logs.
// console.* inside *.test.js files is exempt.
const here = dirname(fileURLToPath(import.meta.url));
const FILES = [
  'auth/attemptTracker.js',
  'auth/mfa.js',
  'auth/magicLink.js',
  'auth/password.js',
  'auth/session.js',
  'agents/commands.js',
  'agents/devices.js',
  'agents/inventory.js',
  'agents/monitoring.js',
  'agents/registration.js',
  'agents/trial.js',
  'admin/serviceRequests/attachments.js',
  'admin/serviceRequests/lifecycle.js',
  'admin/serviceRequests/presets.js',
  'admin/serviceRequests/queries.js',
  'admin/serviceRequests/uploads.js'
];

test('migrated routers log via logger, not raw console', () => {
  const offenders = [];
  for (const f of FILES) {
    const src = readFileSync(join(here, f), 'utf8');
    const hits = [...src.matchAll(/^\s*console\.(log|warn|error)\(/gm)].map(m => m[1]);
    if (hits.length > 0) offenders.push(`${f}: ${hits.length} raw console call(s)`);
  }
  assert.deepEqual(offenders, [], 'raw console calls must go through utils/logger');
});
