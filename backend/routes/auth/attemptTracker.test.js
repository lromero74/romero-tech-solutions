import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  failedAttempts,
  recordFailedAttempt,
  clearFailedAttempts,
  checkFailedAttempts
} from './attemptTracker.js';

// Window-pruned entries must also drop the map key, otherwise the map grows
// one entry per unique IP forever (attacker-controlled key space).
test('checkFailedAttempts evicts fully-expired keys', () => {
  const ip = '10.9.9.9';
  clearFailedAttempts(ip);
  recordFailedAttempt(ip);
  assert.equal(checkFailedAttempts(ip).blocked, false);

  for (let i = 0; i < 5; i++) recordFailedAttempt(ip);
  assert.equal(checkFailedAttempts(ip).blocked, true);

  // Age all entries past the 15-minute window, then re-check: unblocked AND
  // the key must be gone, not left behind as an empty array.
  failedAttempts.set(ip, [Date.now() - 16 * 60 * 1000]);
  assert.equal(checkFailedAttempts(ip).blocked, false);
  assert.equal(failedAttempts.has(ip), false);
});

test('sweepAttemptTracker deletes fully-expired idle keys', async () => {
  const { sweepAttemptTracker } = await import('./attemptTracker.js');
  failedAttempts.set('10.10.10.10', [Date.now() - 16 * 60 * 1000]);
  failedAttempts.set('10.10.10.11', [Date.now()]);
  sweepAttemptTracker();
  assert.equal(failedAttempts.has('10.10.10.10'), false);
  assert.equal(failedAttempts.has('10.10.10.11'), true);
  clearFailedAttempts('10.10.10.11');
});
