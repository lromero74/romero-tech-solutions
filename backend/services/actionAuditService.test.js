import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { canonicalJson, computeRowHash, verifyChainRows } from './actionAuditService.js';

// =============================================================================
// canonicalJson — deterministic JSON for hashing
//
// Why this matters: hash inputs MUST be byte-identical across processes/
// languages/time. JSON.stringify is non-deterministic w.r.t. key order, so
// reading back from Postgres (which may reorder JSONB) and recomputing the
// hash would fail unpredictably without canonicalization.
// =============================================================================

test('canonicalJson: object keys sorted alphabetically', () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalJson({ z: 1, a: 2, m: 3 }), '{"a":2,"m":3,"z":1}');
});

test('canonicalJson: nested objects also sorted', () => {
  assert.equal(
    canonicalJson({ outer: { z: 1, a: 2 }, x: 'y' }),
    '{"outer":{"a":2,"z":1},"x":"y"}'
  );
});

test('canonicalJson: arrays preserve order (not sorted)', () => {
  // Arrays are positionally meaningful; sorting them would change semantics.
  assert.equal(canonicalJson([3, 1, 2]), '[3,1,2]');
});

test('canonicalJson: handles null / primitives', () => {
  assert.equal(canonicalJson(null), 'null');
  assert.equal(canonicalJson(42), '42');
  assert.equal(canonicalJson('hi'), '"hi"');
  assert.equal(canonicalJson(true), 'true');
  assert.equal(canonicalJson(false), 'false');
});

test('canonicalJson: empty object / array', () => {
  assert.equal(canonicalJson({}), '{}');
  assert.equal(canonicalJson([]), '[]');
});

test('canonicalJson: same input → byte-identical output (determinism)', () => {
  // Construct the same logical object two different ways; outputs must match.
  const a = { foo: { b: 2, a: 1 }, bar: [1, 2, 3] };
  const b = { bar: [1, 2, 3], foo: { a: 1, b: 2 } };
  assert.equal(canonicalJson(a), canonicalJson(b));
});

// =============================================================================
// computeRowHash — pure SHA-256 of (prevHash || canonicalJson({fields}))
//
// This is the chain-link function. It must be a pure function of its inputs.
// Identical inputs → identical hash. Different inputs → different hash (with
// SHA-256 collision-resistance probability).
// =============================================================================

const fixture = {
  prevHash: 'a'.repeat(64),
  actionType: 'patch.approve',
  actorEmployeeId: '11111111-1111-1111-1111-111111111111',
  actorBusinessId: '22222222-2222-2222-2222-222222222222',
  agentDeviceId: '33333333-3333-3333-3333-333333333333',
  payload: { patch_name: 'KB5023456', decision: 'approved' },
  occurredAt: '2026-04-29T17:00:00.000Z'
};

test('computeRowHash: returns 64-char lowercase hex', () => {
  const h = computeRowHash(fixture);
  assert.match(h, /^[0-9a-f]{64}$/);
});

test('computeRowHash: deterministic — same input → same hash', () => {
  assert.equal(computeRowHash(fixture), computeRowHash(fixture));
});

test('computeRowHash: changing payload changes hash', () => {
  const tampered = {
    ...fixture,
    payload: { ...fixture.payload, decision: 'rejected' }
  };
  assert.notEqual(computeRowHash(fixture), computeRowHash(tampered));
});

test('computeRowHash: changing prevHash changes hash (chain integrity)', () => {
  const fork = { ...fixture, prevHash: 'b'.repeat(64) };
  assert.notEqual(computeRowHash(fixture), computeRowHash(fork));
});

test('computeRowHash: null prevHash (genesis row) produces a valid hash', () => {
  const genesis = { ...fixture, prevHash: null };
  const h = computeRowHash(genesis);
  assert.match(h, /^[0-9a-f]{64}$/);
});

test('computeRowHash: payload key reordering does NOT change hash (canonicalization)', () => {
  // This is THE point of canonicalJson — the same logical payload hashed
  // two different ways must yield the same hash. Otherwise we couldn't
  // verify the chain after Postgres round-trips JSONB.
  const a = { ...fixture, payload: { patch_name: 'KB5023456', decision: 'approved' } };
  const b = { ...fixture, payload: { decision: 'approved', patch_name: 'KB5023456' } };
  assert.equal(computeRowHash(a), computeRowHash(b));
});

test('computeRowHash: matches manually-computed reference hash (pin the wire format)', () => {
  // If this test ever fails, someone changed the canonical form — every
  // existing audit-row hash on prod is now invalid. Pin it explicitly.
  const refInput = { ...fixture, prevHash: null };
  const expectedBody = '{"action_type":"patch.approve","actor_business_id":"22222222-2222-2222-2222-222222222222","actor_employee_id":"11111111-1111-1111-1111-111111111111","agent_device_id":"33333333-3333-3333-3333-333333333333","occurred_at":"2026-04-29T17:00:00.000Z","payload":{"decision":"approved","patch_name":"KB5023456"}}';
  const expected = crypto.createHash('sha256').update('' + expectedBody, 'utf8').digest('hex');
  assert.equal(computeRowHash(refInput), expected);
});

// =============================================================================
// verifyChainRows — given an ordered array of audit rows, return the index
// of the first tampered row, or null if the chain is intact.
//
// Pure function over already-fetched rows; the DB-fetching wrapper lives in
// the service module and is tested via integration.
// =============================================================================

function buildChain(entries) {
  // Helper: produce a valid sequence of rows from a list of partials.
  let prev = null;
  return entries.map((e, i) => {
    const occurredAt = `2026-04-29T17:00:0${i}.000Z`;
    const row = {
      prev_hash: prev,
      action_type: e.action_type,
      actor_employee_id: e.actor_employee_id || null,
      actor_business_id: e.actor_business_id || null,
      agent_device_id: e.agent_device_id || null,
      payload: e.payload || {},
      occurred_at: occurredAt
    };
    row.row_hash = computeRowHash({
      prevHash: row.prev_hash,
      actionType: row.action_type,
      actorEmployeeId: row.actor_employee_id,
      actorBusinessId: row.actor_business_id,
      agentDeviceId: row.agent_device_id,
      payload: row.payload,
      occurredAt: row.occurred_at
    });
    prev = row.row_hash;
    return row;
  });
}

test('verifyChainRows: empty chain → null (intact)', () => {
  assert.equal(verifyChainRows([]), null);
});

test('verifyChainRows: clean chain → null', () => {
  const chain = buildChain([
    { action_type: 'patch.approve', payload: { patch: 'KB1' } },
    { action_type: 'patch.deploy',  payload: { patch: 'KB1' } },
    { action_type: 'script.sign',   payload: { script_id: 'abc' } }
  ]);
  assert.equal(verifyChainRows(chain), null);
});

test('verifyChainRows: tampered payload → returns index of first bad row', () => {
  const chain = buildChain([
    { action_type: 'patch.approve', payload: { patch: 'KB1' } },
    { action_type: 'patch.deploy',  payload: { patch: 'KB1' } },
    { action_type: 'script.sign',   payload: { script_id: 'abc' } }
  ]);
  // Tamper row index 1: change payload but leave row_hash alone.
  chain[1].payload = { patch: 'KB-EVIL' };
  assert.equal(verifyChainRows(chain), 1);
});

test('verifyChainRows: tampered prev_hash → returns index of first bad row', () => {
  const chain = buildChain([
    { action_type: 'a', payload: {} },
    { action_type: 'b', payload: {} },
    { action_type: 'c', payload: {} }
  ]);
  chain[2].prev_hash = 'f'.repeat(64);
  assert.equal(verifyChainRows(chain), 2);
});

test('verifyChainRows: deleted row breaks the chain (next row prev_hash mismatch)', () => {
  const chain = buildChain([
    { action_type: 'a', payload: {} },
    { action_type: 'b', payload: {} },
    { action_type: 'c', payload: {} }
  ]);
  // Simulate row deletion by removing index 1.
  const truncated = [chain[0], chain[2]];
  // chain[2].prev_hash points at chain[1].row_hash, but chain[0].row_hash is
  // now what's expected. Detection happens at index 1 of the truncated array.
  assert.equal(verifyChainRows(truncated), 1);
});

test('verifyChainRows: genesis row has prev_hash = null (not detected as tamper)', () => {
  const chain = buildChain([
    { action_type: 'first', payload: {} }
  ]);
  // Genesis prev_hash should be null, and verifyChainRows must accept that.
  assert.equal(chain[0].prev_hash, null);
  assert.equal(verifyChainRows(chain), null);
});
