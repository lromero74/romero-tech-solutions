import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mfaVerifyLimiter, clearMfaVerifyAttempts, mfaVerifyAttempts } from './mfaVerifyRateLimiter.js';

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

test('mfaVerifyLimiter evicts fully-expired keys instead of leaking them', async () => {
  const ip = '8.8.8.8';
  const email = 'evict@example.com';
  clearMfaVerifyAttempts(ip, email);
  const req = makeReq(email, ip);
  let nextCalled = false;
  await mfaVerifyLimiter(req, makeRes(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  // Age the entry past the window, hit again: allowed AND stale timestamps
  // pruned (only the fresh attempt remains — the request itself re-records).
  mfaVerifyAttempts.set(`${ip}:${email}`, [Date.now() - 16 * 60 * 1000]);
  nextCalled = false;
  await mfaVerifyLimiter(req, makeRes(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  const kept = mfaVerifyAttempts.get(`${ip}:${email}`);
  assert.equal(kept.length, 1);
  assert.ok(Date.now() - kept[0] < 15 * 60 * 1000);
});

test('sweepMfaVerifyAttempts deletes fully-expired idle keys', async () => {
  const { sweepMfaVerifyAttempts } = await import('./mfaVerifyRateLimiter.js');
  mfaVerifyAttempts.set('1.1.1.1:stale@example.com', [Date.now() - 16 * 60 * 1000]);
  mfaVerifyAttempts.set('2.2.2.2:fresh@example.com', [Date.now()]);
  sweepMfaVerifyAttempts();
  assert.equal(mfaVerifyAttempts.has('1.1.1.1:stale@example.com'), false);
  assert.equal(mfaVerifyAttempts.has('2.2.2.2:fresh@example.com'), true);
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
