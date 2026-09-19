import { test } from 'node:test';
import assert from 'node:assert/strict';
import smsService from './smsService.js';

// Window-pruned entries must also drop the map key, otherwise the map grows
// one entry per phone number forever.
test('checkRateLimit evicts fully-expired numbers', () => {
  const phone = '+15550009999';
  smsService.sentMessages.delete(phone);

  smsService.recordSMSSend(phone);
  assert.equal(smsService.checkRateLimit(phone).allowed, true);

  // Age all entries past the 24-hour window: allowed AND key gone.
  smsService.sentMessages.set(phone, [Date.now() - 25 * 60 * 60 * 1000]);
  assert.equal(smsService.checkRateLimit(phone).allowed, true);
  assert.equal(smsService.sentMessages.has(phone), false);
});

test('sweepOldEntries deletes fully-expired idle numbers', () => {
  smsService.sentMessages.set('+15550001111', [Date.now() - 25 * 60 * 60 * 1000]);
  smsService.sentMessages.set('+15550002222', [Date.now()]);
  smsService.sweepOldEntries();
  assert.equal(smsService.sentMessages.has('+15550001111'), false);
  assert.equal(smsService.sentMessages.has('+15550002222'), true);
  smsService.sentMessages.delete('+15550002222');
});
