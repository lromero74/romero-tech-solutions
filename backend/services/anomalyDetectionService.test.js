// Tests for anomalyDetectionService — pure logic only. The DB-querying
// functions (recomputeAllBaselines, getBaselines, evaluateMetricsForAnomalies)
// are exercised by integration smoke tests against testbot.
//
// See docs/PRPs/STAGE2_TRENDS.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAnomalous,
  nextAnomalyState,
  TRACKED_METRICS,
  ANOMALY_SIGMA,
  SUSTAINED_MINUTES,
  BASELINE_WINDOW_DAYS,
  MIN_BASELINE_SAMPLES,
} from './anomalyDetectionService.js';

// ----- isAnomalous -----

test('isAnomalous: value within 1σ → not anomalous', () => {
  assert.equal(isAnomalous(52, { mean: 50, stddev: 5 }), false);
  assert.equal(isAnomalous(48, { mean: 50, stddev: 5 }), false);
});

test('isAnomalous: value at exactly 2σ → not anomalous (>, not >=)', () => {
  // |60 - 50| = 10 = 2*5; threshold is strictly greater than, so 10 doesn't fire.
  assert.equal(isAnomalous(60, { mean: 50, stddev: 5 }), false);
});

test('isAnomalous: value just past 2σ → anomalous', () => {
  assert.equal(isAnomalous(60.01, { mean: 50, stddev: 5 }), true);
});

test('isAnomalous: anomalous below the mean (sign-symmetric)', () => {
  assert.equal(isAnomalous(39, { mean: 50, stddev: 5 }), true);
});

test('isAnomalous: zero stddev → never anomalous (constant metric)', () => {
  assert.equal(isAnomalous(100, { mean: 50, stddev: 0 }), false);
});

test('isAnomalous: missing baseline → never anomalous (no false alarms)', () => {
  assert.equal(isAnomalous(100, null), false);
  assert.equal(isAnomalous(100, undefined), false);
});

test('isAnomalous: null/NaN value → never anomalous', () => {
  assert.equal(isAnomalous(null, { mean: 50, stddev: 5 }), false);
  assert.equal(isAnomalous(undefined, { mean: 50, stddev: 5 }), false);
  assert.equal(isAnomalous(Number.NaN, { mean: 50, stddev: 5 }), false);
});

// ----- nextAnomalyState -----

const now = new Date('2026-04-29T12:00:00Z');
const TEN_MIN_AGO = new Date(now.getTime() - 10 * 60 * 1000);
const SIXTEEN_MIN_AGO = new Date(now.getTime() - 16 * 60 * 1000);

test('nextAnomalyState: normal reading, no prior state → all-clear, no fire', () => {
  const { state, fire } = nextAnomalyState(null, 52, false, now);
  assert.equal(state.anomaly_started_at, null);
  assert.equal(state.alert_fired_at, null);
  assert.equal(fire, false);
});

test('nextAnomalyState: normal reading clears prior anomaly state', () => {
  const prior = { anomaly_started_at: TEN_MIN_AGO, alert_fired_at: TEN_MIN_AGO };
  const { state, fire } = nextAnomalyState(prior, 52, false, now);
  assert.equal(state.anomaly_started_at, null);
  assert.equal(state.alert_fired_at, null);
  assert.equal(fire, false);
});

test('nextAnomalyState: first anomalous reading → start tracking, no fire', () => {
  const { state, fire } = nextAnomalyState(null, 99, true, now);
  // anomaly_started_at is now (just started).
  assert.deepEqual(state.anomaly_started_at, now);
  assert.equal(state.alert_fired_at, null);
  assert.equal(fire, false);
});

test('nextAnomalyState: anomaly continuing under 15min → no fire', () => {
  const prior = { anomaly_started_at: TEN_MIN_AGO, alert_fired_at: null };
  const { state, fire } = nextAnomalyState(prior, 99, true, now);
  // Started-at preserved, no alert.
  assert.deepEqual(state.anomaly_started_at, TEN_MIN_AGO);
  assert.equal(state.alert_fired_at, null);
  assert.equal(fire, false);
});

test('nextAnomalyState: anomaly continuing past 15min → FIRE once', () => {
  const prior = { anomaly_started_at: SIXTEEN_MIN_AGO, alert_fired_at: null };
  const { state, fire } = nextAnomalyState(prior, 99, true, now);
  assert.deepEqual(state.anomaly_started_at, SIXTEEN_MIN_AGO);
  assert.deepEqual(state.alert_fired_at, now);
  assert.equal(fire, true);
});

test('nextAnomalyState: anomaly continuing AFTER fire → no re-fire', () => {
  const fireTime = new Date(now.getTime() - 5 * 60 * 1000);
  const prior = { anomaly_started_at: SIXTEEN_MIN_AGO, alert_fired_at: fireTime };
  const { state, fire } = nextAnomalyState(prior, 99, true, now);
  // alert_fired_at preserved (no re-fire).
  assert.deepEqual(state.alert_fired_at, fireTime);
  assert.equal(fire, false);
});

test('nextAnomalyState: anomaly→normal→anomaly cycle re-arms re-fire', () => {
  // 1) Sustained anomaly fires.
  let prior = { anomaly_started_at: SIXTEEN_MIN_AGO, alert_fired_at: null };
  const r1 = nextAnomalyState(prior, 99, true, now);
  assert.equal(r1.fire, true);

  // 2) Normal reading clears state.
  const r2 = nextAnomalyState(r1.state, 52, false, new Date(now.getTime() + 1000));
  assert.equal(r2.state.anomaly_started_at, null);
  assert.equal(r2.state.alert_fired_at, null);

  // 3) Fresh anomaly starts tracking again, but doesn't fire yet (just started).
  const r3 = nextAnomalyState(r2.state, 99, true, new Date(now.getTime() + 2000));
  assert.equal(r3.fire, false);
  assert.ok(r3.state.anomaly_started_at);
});

// ----- Tunable sanity guards -----

test('TRACKED_METRICS contains the expected six', () => {
  assert.deepEqual([...TRACKED_METRICS].sort(), [
    'cpu_percent', 'disk_percent', 'load_average_1m',
    'memory_percent', 'network_rx_bytes', 'network_tx_bytes',
  ]);
});

test('Tunables match PRP', () => {
  assert.equal(ANOMALY_SIGMA, 2);
  assert.equal(SUSTAINED_MINUTES, 15);
  assert.equal(BASELINE_WINDOW_DAYS, 7);
  assert.ok(MIN_BASELINE_SAMPLES >= 100, 'too few samples → noisy baselines');
});
