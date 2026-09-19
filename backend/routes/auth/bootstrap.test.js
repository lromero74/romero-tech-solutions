import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasAnyAdmin } from './bootstrap.js';

// Zero-admin gate for POST /auth/bootstrap-admin: single-use by
// construction — the moment one admin row exists, bootstrap must refuse.
test('hasAnyAdmin is true when an admin row exists', async () => {
  const queryFn = async () => ({ rows: [{ admin_count: '2' }] });
  assert.equal(await hasAnyAdmin(queryFn), true);
});

test('hasAnyAdmin is false on an empty admin table', async () => {
  const queryFn = async () => ({ rows: [{ admin_count: '0' }] });
  assert.equal(await hasAnyAdmin(queryFn), false);
});
