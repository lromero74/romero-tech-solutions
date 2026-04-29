// Tests for diskForecastService — pure decision functions get unit tests.
// The DB-querying functions (recomputeAllForecasts, getLatestForecast,
// getDiskHistory) are integration paths and not covered here; smoke
// tests against testbot validate them.
//
// See docs/PRPs/STAGE2_TRENDS.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeForecast,
  forecastSeverity,
  MIN_SAMPLES_FOR_FORECAST,
  FORECAST_WINDOW_DAYS,
} from './diskForecastService.js';

// ----- computeForecast: math correctness -----

test('computeForecast: positive slope with capacity → days_until_full', () => {
  // Growing 1 GB/day = ~1.157e-5 GB/sec. With 100GB used / 200GB total,
  // 100GB remaining → 100 days until full.
  const slope = 1 / 86400;
  const f = computeForecast(slope, 100, 200);
  assert.equal(f.growth_gb_per_day, 1);
  assert.equal(f.days_until_full, 100);
  assert.ok(f.forecast_full_at instanceof Date);
});

test('computeForecast: high growth → short days_until_full', () => {
  // 10 GB/day, 5GB remaining → 0.5 days
  const slope = 10 / 86400;
  const f = computeForecast(slope, 95, 100);
  assert.equal(f.growth_gb_per_day, 10);
  assert.equal(f.days_until_full, 0.5);
});

test('computeForecast: zero slope → no days_until_full (steady disk)', () => {
  const f = computeForecast(0, 50, 100);
  assert.equal(f.growth_gb_per_day, 0);
  assert.equal(f.days_until_full, null);
  assert.equal(f.forecast_full_at, null);
});

test('computeForecast: negative slope (shrinking) → no days_until_full', () => {
  const f = computeForecast(-0.0001, 50, 100);
  assert.ok(f.growth_gb_per_day < 0);
  assert.equal(f.days_until_full, null);
  assert.equal(f.forecast_full_at, null);
});

test('computeForecast: null slope → all-null', () => {
  const f = computeForecast(null, 50, 100);
  assert.equal(f.growth_gb_per_day, null);
  assert.equal(f.days_until_full, null);
  assert.equal(f.forecast_full_at, null);
});

test('computeForecast: NaN slope → all-null (defensive)', () => {
  const f = computeForecast(Number.NaN, 50, 100);
  assert.equal(f.growth_gb_per_day, null);
});

test('computeForecast: capacity unknown → growth reported, no fill date', () => {
  const slope = 1 / 86400;
  const f = computeForecast(slope, 50, null);
  assert.equal(f.growth_gb_per_day, 1);
  assert.equal(f.days_until_full, null);
});

test('computeForecast: already-full disk reports 0 days', () => {
  const slope = 1 / 86400;
  const f = computeForecast(slope, 100, 100);
  assert.equal(f.days_until_full, 0);
  assert.ok(f.forecast_full_at instanceof Date);
});

test('computeForecast: over-reported usage (used > total) → 0 days', () => {
  const slope = 1 / 86400;
  const f = computeForecast(slope, 110, 100);
  assert.equal(f.days_until_full, 0);
});

// ----- forecastSeverity: alert boundaries -----

test('forecastSeverity: <14 days → critical', () => {
  assert.equal(forecastSeverity(13), 'critical');
  assert.equal(forecastSeverity(0), 'critical');
  assert.equal(forecastSeverity(13.99), 'critical');
});

test('forecastSeverity: exactly 14 days → warning (boundary is <, not <=)', () => {
  assert.equal(forecastSeverity(14), 'warning');
});

test('forecastSeverity: 14 to <30 days → warning', () => {
  assert.equal(forecastSeverity(20), 'warning');
  assert.equal(forecastSeverity(29.99), 'warning');
});

test('forecastSeverity: ≥30 days → null (no alert)', () => {
  assert.equal(forecastSeverity(30), null);
  assert.equal(forecastSeverity(100), null);
  assert.equal(forecastSeverity(9999), null);
});

test('forecastSeverity: null/NaN → null (no spurious alerts)', () => {
  assert.equal(forecastSeverity(null), null);
  assert.equal(forecastSeverity(undefined), null);
  assert.equal(forecastSeverity(Number.NaN), null);
});

// ----- Sanity guards on tunables -----

test('MIN_SAMPLES_FOR_FORECAST is sane (>=10)', () => {
  // Setting this too low produces noisy forecasts on freshly-enrolled agents.
  assert.ok(MIN_SAMPLES_FOR_FORECAST >= 10, `got ${MIN_SAMPLES_FOR_FORECAST}`);
});

test('FORECAST_WINDOW_DAYS aligns with PRP (30)', () => {
  assert.equal(FORECAST_WINDOW_DAYS, 30);
});
