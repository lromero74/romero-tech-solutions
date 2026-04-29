// Tests for the Stage 1 health-check alert hookup added to
// alertEscalationService.js — pure decision functions get unit tests, the
// processHealthCheckResult shape gets source-lint guards (DB/network paths
// are integration-only and not covered by the in-tree test suite).
//
// See docs/PRPs/STAGE1_HEALTH_CHECKS.md.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { shouldFireHealthCheckAlert, healthCheckLabel } from './alertEscalationService.js';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(here, 'alertEscalationService.js'), 'utf8');

// ----- shouldFireHealthCheckAlert: severity gate -----

test('shouldFireHealthCheckAlert: info does not fire', () => {
  assert.equal(shouldFireHealthCheckAlert('info'), false);
});
test('shouldFireHealthCheckAlert: warning fires', () => {
  assert.equal(shouldFireHealthCheckAlert('warning'), true);
});
test('shouldFireHealthCheckAlert: critical fires', () => {
  assert.equal(shouldFireHealthCheckAlert('critical'), true);
});
test('shouldFireHealthCheckAlert: unknown severity does not fire', () => {
  // Defensive default — unknown severity must not mass-fire.
  assert.equal(shouldFireHealthCheckAlert('catastrophic'), false);
  assert.equal(shouldFireHealthCheckAlert(''), false);
  assert.equal(shouldFireHealthCheckAlert(null), false);
  assert.equal(shouldFireHealthCheckAlert(undefined), false);
});

// ----- healthCheckLabel: friendly text mapping -----

test('healthCheckLabel: known check types use the curated label', () => {
  assert.equal(healthCheckLabel('reboot_pending'), 'Reboot pending');
  assert.equal(healthCheckLabel('time_drift'), 'System clock drift');
  assert.equal(healthCheckLabel('crashdumps'), 'Crash dumps detected');
  assert.equal(healthCheckLabel('top_processes'), 'Top resource consumers');
  assert.equal(healthCheckLabel('listening_ports'), 'Listening ports changed');
  assert.equal(healthCheckLabel('update_history_failures'), 'OS update failure');
  assert.equal(healthCheckLabel('domain_status'), 'Domain join status');
  assert.equal(healthCheckLabel('mapped_drives'), 'Mapped drive issue');
});

test('healthCheckLabel: unknown check_type humanizes snake_case', () => {
  assert.equal(healthCheckLabel('future_stage_2_check'), 'Future Stage 2 Check');
  assert.equal(healthCheckLabel('battery_health'), 'Battery Health');
});

test('healthCheckLabel: empty/null falls back gracefully', () => {
  // Empty/null go through the humanize path which title-cases word boundaries,
  // so the fallback default 'Health check' renders as 'Health Check'.
  assert.equal(healthCheckLabel(''), 'Health Check');
  assert.equal(healthCheckLabel(null), 'Health Check');
  assert.equal(healthCheckLabel(undefined), 'Health Check');
});

// ----- Source-lint: processHealthCheckResult shape -----

test('processHealthCheckResult exists on the prototype', () => {
  assert.ok(/AlertEscalationService\.prototype\.processHealthCheckResult\s*=/.test(SRC),
    'must attach processHealthCheckResult to AlertEscalationService prototype');
});

test('dedupe query checks within HEALTH_CHECK_DEDUPE_HOURS and skips resolved alerts', () => {
  assert.ok(/HEALTH_CHECK_DEDUPE_HOURS\s*=\s*4/.test(SRC),
    'dedupe window constant must be 4 hours per PRP');
  // Find the dedupe SELECT block (text between "Dedupe:" comment and the next semicolon)
  const dedupeStart = SRC.indexOf('Dedupe:');
  const dedupeBlock = SRC.slice(dedupeStart, dedupeStart + 1500);
  assert.ok(/alert_type = 'health_check'/.test(dedupeBlock),
    'dedupe must scope to alert_type=health_check (avoid matching CPU/disk alerts)');
  assert.ok(/indicators_triggered ->> 'check_type'/.test(dedupeBlock),
    'dedupe must filter by check_type from JSONB (the discriminator)');
  assert.ok(/resolved_at IS NULL/.test(dedupeBlock),
    'dedupe must skip resolved alerts — resolved → safe to refire on new occurrence');
});

test('insert hooks the existing alert_history pipeline', () => {
  assert.ok(/INSERT INTO alert_history/.test(SRC),
    'must INSERT INTO alert_history (existing pipeline is keyed on this table)');
  assert.ok(/alertNotificationService\.routeAlert/.test(SRC),
    'must call alertNotificationService.routeAlert(...) for actual delivery');
});

test('insert references the seeded alert_configurations row via _getHealthCheckConfigId', () => {
  assert.ok(/_getHealthCheckConfigId/.test(SRC),
    'must look up alert_config_id via _getHealthCheckConfigId — null config_id silently breaks client notifications');
  assert.ok(/alert_type = 'health_check' AND alert_name = 'Stage 1 Health Check'/.test(SRC),
    'config lookup must match the migration-seeded alert_name exactly');
});

test('routeAlert is called fire-and-forget (errors logged, not thrown)', () => {
  assert.ok(/routeAlert\([^)]+\)\.catch\(/.test(SRC),
    'routeAlert call must be wrapped in .catch — notification failure must not block check-result writes');
});

test('skips silently for severity below threshold', () => {
  assert.ok(/shouldFireHealthCheckAlert\(severity\)/.test(SRC),
    'processHealthCheckResult must early-return via shouldFireHealthCheckAlert');
});
