import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timezoneService } from './timezoneUtils.js';

// Fixed UTC instants spanning the Pacific DST boundary (AGENTS.md).
// Both are 12:30 AM Sunday Pacific wall-clock despite different UTC offsets.
test('getBusinessDayAndTime resolves winter PST instant', () => {
  const result = timezoneService.getBusinessDayAndTime(new Date('2026-02-08T08:30:00Z'));
  assert.equal(result.dayOfWeek, 0);
  assert.equal(result.timeString, '00:30:00');
});

test('getBusinessDayAndTime resolves summer PDT instant', () => {
  const result = timezoneService.getBusinessDayAndTime(new Date('2026-07-12T07:30:00Z'));
  assert.equal(result.dayOfWeek, 0);
  assert.equal(result.timeString, '00:30:00');
});

test('getBusinessDayAndTime handles a DST-transition day without drift', () => {
  // 2026-03-08 02:30 Pacific does not exist (spring forward); 10:30 UTC is
  // 03:30 PDT, still Sunday.
  const result = timezoneService.getBusinessDayAndTime(new Date('2026-03-08T10:30:00Z'));
  assert.equal(result.dayOfWeek, 0);
  assert.equal(result.timeString, '03:30:00');
});
