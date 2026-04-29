import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRecordIpChange, normalizeIp } from './wanIpService.js';

test('normalizeIp: strips IPv6-mapped IPv4 prefix', () => {
  assert.equal(normalizeIp('::ffff:1.2.3.4'), '1.2.3.4');
  assert.equal(normalizeIp('::FFFF:1.2.3.4'), '1.2.3.4');
});

test('normalizeIp: leaves plain IPv4/IPv6 alone', () => {
  assert.equal(normalizeIp('1.2.3.4'), '1.2.3.4');
  assert.equal(normalizeIp('2001:db8::1'), '2001:db8::1');
});

test('normalizeIp: trims whitespace', () => {
  assert.equal(normalizeIp(' 1.2.3.4 '), '1.2.3.4');
});

test('normalizeIp: empty/null → empty string', () => {
  assert.equal(normalizeIp(''), '');
  assert.equal(normalizeIp(null), '');
  assert.equal(normalizeIp(undefined), '');
});

test('shouldRecordIpChange: first sighting → true', () => {
  assert.equal(shouldRecordIpChange('1.2.3.4', null), true);
  assert.equal(shouldRecordIpChange('1.2.3.4', undefined), true);
});

test('shouldRecordIpChange: same IP → false', () => {
  assert.equal(shouldRecordIpChange('1.2.3.4', '1.2.3.4'), false);
});

test('shouldRecordIpChange: different IP → true', () => {
  assert.equal(shouldRecordIpChange('1.2.3.4', '5.6.7.8'), true);
});

test('shouldRecordIpChange: IPv6-mapped vs plain IPv4 are equal', () => {
  // The whole point of normalization — we must NOT churn the table when
  // the request comes through with the IPv6-mapped form vs the plain one.
  assert.equal(shouldRecordIpChange('::ffff:1.2.3.4', '1.2.3.4'), false);
  assert.equal(shouldRecordIpChange('1.2.3.4', '::ffff:1.2.3.4'), false);
});

test('shouldRecordIpChange: empty new IP → false (no recording)', () => {
  // Defensive — middleware shouldn't pass empty, but if it does we
  // should NOT record an empty row.
  assert.equal(shouldRecordIpChange('', '1.2.3.4'), false);
  assert.equal(shouldRecordIpChange(null, '1.2.3.4'), false);
});
