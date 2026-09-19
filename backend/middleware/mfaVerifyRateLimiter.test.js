import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mfaVerifyLimiter, clearMfaVerifyAttempts } from './mfaVerifyRateLimiter.js';

const makeReq = (email = 'user@example.com', ip = '9.9.9.9') => ({
  ip,
  body: { email },
  get: () => 'test-agent',
  connection: {}
});

const makeRes = () => {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    }
  };
  return res;
};

test('mfaVerifyLimiter allows attempts under the cap', async () => {
  clearMfaVerifyAttempts('9.9.9.9', 'fresh@example.com');
  const req = makeReq('fresh@example.com');
  for (let i = 0; i < 5; i++) {
    let nextCalled = false;
    await mfaVerifyLimiter(req, makeRes(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  }
});

test('mfaVerifyLimiter blocks the 6th attempt with 429 and retryAfter', async () => {
  clearMfaVerifyAttempts('9.9.9.9', 'brute@example.com');
  const req = makeReq('brute@example.com');
  let lastRes = null;
  for (let i = 0; i < 6; i++) {
    lastRes = makeRes();
    let nextCalled = false;
    await mfaVerifyLimiter(req, lastRes, () => { nextCalled = true; });
    if (i < 5) assert.equal(nextCalled, true);
    else assert.equal(nextCalled, false);
  }
  assert.equal(lastRes.statusCode, 429);
  assert.equal(lastRes.body.code, 'MFA_VERIFY_RATE_LIMIT_EXCEEDED');
  assert.ok(lastRes.body.retryAfter > 0);
});

test('mfaVerifyLimiter tracks email addresses independently', async () => {
  clearMfaVerifyAttempts('9.9.9.9', 'other@example.com');
  const req = makeReq('other@example.com');
  let nextCalled = false;
  await mfaVerifyLimiter(req, makeRes(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('mfaVerifyLimiter keys userId bodies independently (code issuance has no email)', async () => {
  clearMfaVerifyAttempts('9.9.9.9', undefined);
  const reqFor = (userId) => ({
    ip: '9.9.9.9',
    body: { userId },
    get: () => 'test-agent',
    connection: {}
  });
  for (let i = 0; i < 5; i++) {
    let nextCalled = false;
    await mfaVerifyLimiter(reqFor('user-A'), makeRes(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  }
  let blocked = false;
  const blockedRes = makeRes();
  await mfaVerifyLimiter(reqFor('user-A'), blockedRes, () => {});
  blocked = blockedRes.statusCode === 429;
  assert.equal(blocked, true);

  let otherOk = false;
  await mfaVerifyLimiter(reqFor('user-B'), makeRes(), () => { otherOk = true; });
  assert.equal(otherOk, true);
});
