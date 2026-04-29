import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stage4FeatureGate, isStage4Enabled } from './stage4FeatureGate.js';

// =============================================================================
// stage4FeatureGate — env-var gate for the Action Layer (Stage 4)
//
// Until STAGE_4_ENABLED=true is explicitly set in the environment, every
// Stage 4 route must short-circuit with 503 SERVICE_UNAVAILABLE. This is a
// safety guardrail: action-layer routes can reboot machines, install
// software, or run scripts as root, so we want a hard gate distinct from
// per-permission RBAC.
//
// The truthy values ('true', '1', 'yes') are matched case-insensitively.
// Anything else — including unset, empty string, 'false', 'no', '0',
// random text — counts as disabled.
// =============================================================================

function makeReq() { return {}; }
function makeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

const ORIG = process.env.STAGE_4_ENABLED;
function setEnv(v) {
  if (v === undefined) delete process.env.STAGE_4_ENABLED;
  else process.env.STAGE_4_ENABLED = v;
}
function restoreEnv() { setEnv(ORIG); }

test('isStage4Enabled: unset → false', () => {
  setEnv(undefined);
  try { assert.equal(isStage4Enabled(), false); }
  finally { restoreEnv(); }
});

test('isStage4Enabled: "true" → true (case-insensitive)', () => {
  for (const v of ['true', 'TRUE', 'True', 'tRuE']) {
    setEnv(v);
    try { assert.equal(isStage4Enabled(), true, `value ${v}`); }
    finally { restoreEnv(); }
  }
});

test('isStage4Enabled: "1" / "yes" → true', () => {
  for (const v of ['1', 'yes', 'YES']) {
    setEnv(v);
    try { assert.equal(isStage4Enabled(), true, `value ${v}`); }
    finally { restoreEnv(); }
  }
});

test('isStage4Enabled: "false" / "0" / "no" / "" → false', () => {
  for (const v of ['false', 'FALSE', '0', 'no', 'NO', '']) {
    setEnv(v);
    try { assert.equal(isStage4Enabled(), false, `value "${v}"`); }
    finally { restoreEnv(); }
  }
});

test('isStage4Enabled: random/garbage → false (deny by default)', () => {
  for (const v of ['enabled', 'on', 'maybe', 'foo']) {
    setEnv(v);
    try { assert.equal(isStage4Enabled(), false, `value ${v}`); }
    finally { restoreEnv(); }
  }
});

test('stage4FeatureGate: when disabled → 503 + does NOT call next()', () => {
  setEnv('false');
  try {
    const req = makeReq(), res = makeRes();
    let nextCalled = false;
    stage4FeatureGate(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'STAGE_4_DISABLED');
    assert.match(res.body.message, /Stage 4|Action Layer|disabled/i);
  } finally { restoreEnv(); }
});

test('stage4FeatureGate: when enabled → calls next() and does NOT respond', () => {
  setEnv('true');
  try {
    const req = makeReq(), res = makeRes();
    let nextCalled = false;
    stage4FeatureGate(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);  // unchanged
    assert.equal(res.body, null);
  } finally { restoreEnv(); }
});

test('stage4FeatureGate: env reread per request (not cached at module load)', () => {
  // Critical for ops: flipping the flag in the environment must take effect
  // on the next request — no restart required if we ever choose to set the
  // value at runtime. (Currently testbot sets it via systemd EnvironmentFile,
  // so a restart IS required there, but the gate itself doesn't cache.)
  setEnv('false');
  try {
    let req = makeReq(), res = makeRes(), called = false;
    stage4FeatureGate(req, res, () => { called = true; });
    assert.equal(called, false);

    setEnv('true');
    req = makeReq(); res = makeRes(); called = false;
    stage4FeatureGate(req, res, () => { called = true; });
    assert.equal(called, true);
  } finally { restoreEnv(); }
});
