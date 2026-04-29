import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideAllowed,
  STAGE1_CHECKS_FREE,
  STAGE1_CHECKS_PAID,
} from './freetierGate.js';

// The free/paid sets are part of the agent ↔ backend contract; pin them.
test('STAGE1_CHECKS_FREE has the expected set', () => {
  assert.deepEqual([...STAGE1_CHECKS_FREE].sort(), [
    'crashdumps',
    'domain_status',
    'reboot_pending',
    'time_drift',
    'update_history_failures',
  ]);
});

test('STAGE1_CHECKS_PAID has the expected set', () => {
  assert.deepEqual([...STAGE1_CHECKS_PAID].sort(), [
    'listening_ports',
    'mapped_drives',
    'top_processes',
  ]);
});

test('free/paid sets do not overlap', () => {
  const free = new Set(STAGE1_CHECKS_FREE);
  for (const k of STAGE1_CHECKS_PAID) {
    assert.ok(!free.has(k), `paid check "${k}" must not be in free set`);
  }
});

// Decision matrix
const cases = [
  // [checkType, isTrial, expected, label]
  ['reboot_pending',          true,  true,  'free check on trial agent → allow'],
  ['reboot_pending',          false, true,  'free check on paid agent → allow'],
  ['time_drift',              null,  true,  'free check on missing agent still allowed (free is unconditional)'],
  ['top_processes',           true,  false, 'paid check on trial agent → deny'],
  ['top_processes',           false, true,  'paid check on paid agent → allow'],
  ['top_processes',           null,  false, 'paid check on missing agent → deny'],
  ['listening_ports',         true,  false, 'paid check on trial agent → deny'],
  ['mapped_drives',           false, true,  'paid check on paid agent → allow'],
  ['something_from_stage_5',  true,  true,  'unknown check_type → liberal (future stages opt-in)'],
  ['',                        true,  true,  'empty string → unknown → liberal'],
];

for (const [checkType, isTrial, expected, label] of cases) {
  test(`decideAllowed: ${label}`, () => {
    assert.equal(decideAllowed(checkType, isTrial), expected);
  });
}
