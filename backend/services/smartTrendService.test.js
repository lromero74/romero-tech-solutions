// Pure-function tests for smartTrendService. The DB-querying paths
// (recomputeAllSmartTrends, getSmartTrend) are integration-tested by
// the nightly job after deploy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  severityFor,
  HIGH_TEMPERATURE_C,
  MIN_SMART_SAMPLES,
  SMART_WINDOW_DAYS,
} from './smartTrendService.js';

// ----- severityFor: critical -----

test('severityFor: failures_predicted > 0 → critical (vendor-flagged failure)', () => {
  assert.equal(severityFor({ failures_predicted_current: 1 }), 'critical');
  assert.equal(severityFor({ failures_predicted_current: 99 }), 'critical');
});

test('severityFor: failures_predicted=0 alone is NOT critical', () => {
  assert.equal(severityFor({ failures_predicted_current: 0 }), 'info');
});

// ----- severityFor: warning -----

test('severityFor: reallocated growing AND > 0 → warning', () => {
  assert.equal(severityFor({
    reallocated_sectors_current: 10,
    reallocated_growth_per_day: 0.5,
  }), 'warning');
});

test('severityFor: reallocated sitting at non-zero but flat → info (old reallocations)', () => {
  // Drive reallocated some sectors months ago, count hasn't moved → not actively dying.
  assert.equal(severityFor({
    reallocated_sectors_current: 50,
    reallocated_growth_per_day: 0,
  }), 'info');
});

test('severityFor: reallocated growth = 0.0 (flat) → info', () => {
  assert.equal(severityFor({
    reallocated_sectors_current: 10,
    reallocated_growth_per_day: 0,
  }), 'info');
});

test('severityFor: reallocated growing but current = 0 → info (regression noise)', () => {
  // If current is 0, growth slope is meaningless. Don't false-alarm.
  assert.equal(severityFor({
    reallocated_sectors_current: 0,
    reallocated_growth_per_day: 0.001,
  }), 'info');
});

test('severityFor: temperature exactly 60°C → info (>, not >=)', () => {
  assert.equal(severityFor({ max_temperature_c: 60 }), 'info');
});

test('severityFor: temperature 61°C → warning', () => {
  assert.equal(severityFor({ max_temperature_c: 61 }), 'warning');
});

test('severityFor: temperature 80°C → warning (would be critical with a real fan failure)', () => {
  assert.equal(severityFor({ max_temperature_c: 80 }), 'warning');
});

// ----- severityFor: combined / precedence -----

test('severityFor: critical wins over warning', () => {
  assert.equal(severityFor({
    failures_predicted_current: 1,
    reallocated_sectors_current: 10,
    reallocated_growth_per_day: 0.5,
    max_temperature_c: 80,
  }), 'critical');
});

test('severityFor: empty input → info (don\'t false-alarm on missing data)', () => {
  assert.equal(severityFor({}), 'info');
  assert.equal(severityFor(null), 'info');
  assert.equal(severityFor(undefined), 'info');
});

test('severityFor: all-null input → info', () => {
  assert.equal(severityFor({
    failures_predicted_current: null,
    reallocated_sectors_current: null,
    reallocated_growth_per_day: null,
    max_temperature_c: null,
  }), 'info');
});

test('severityFor: NaN inputs → treated as null (info)', () => {
  assert.equal(severityFor({
    failures_predicted_current: Number.NaN,
    reallocated_sectors_current: Number.NaN,
    reallocated_growth_per_day: Number.NaN,
    max_temperature_c: Number.NaN,
  }), 'info');
});

// ----- Tunable sanity guards -----

test('HIGH_TEMPERATURE_C is sane (50–80°C)', () => {
  assert.ok(HIGH_TEMPERATURE_C >= 50 && HIGH_TEMPERATURE_C <= 80,
    `HIGH_TEMPERATURE_C=${HIGH_TEMPERATURE_C} outside expected range`);
});

test('Tunables match PRP', () => {
  assert.equal(SMART_WINDOW_DAYS, 30);
  assert.ok(MIN_SMART_SAMPLES >= 10);
});
