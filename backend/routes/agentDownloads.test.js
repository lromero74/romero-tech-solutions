import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePlatform,
  normalizeAgentVersion,
  normalizeAgentArch,
  normalizeLinuxFormat,
  AGENT_LINUX_FORMATS,
  AGENT_VERSION_RE,
} from './agentDownloads.js';

test('normalizePlatform maps supported aliases and normalizes case', () => {
  assert.equal(normalizePlatform('darwin'), 'macos');
  assert.equal(normalizePlatform('Darwin'), 'macos');
  assert.equal(normalizePlatform('MACOS'), 'macos');
  assert.equal(normalizePlatform('windows'), 'windows');
});

test('normalizePlatform returns null for unknown platforms', () => {
  assert.equal(normalizePlatform('freebsd'), null);
  assert.equal(normalizePlatform(''), null);
  assert.equal(normalizePlatform(null), null);
});

test('normalizeAgentVersion accepts only semver-like tags', () => {
  assert.equal(AGENT_VERSION_RE.test('1.2.3'), true);
  assert.equal(AGENT_VERSION_RE.test('v1.2.3'), true);
  assert.equal(AGENT_VERSION_RE.test('2026-01-01'), false);
  assert.equal(AGENT_VERSION_RE.test('../1.2.3'), false);
});

test('normalizeAgentVersion rejects invalid values', () => {
  assert.equal(normalizeAgentVersion('v1.2'), null);
  assert.equal(normalizeAgentVersion('../../../etc/passwd'), null);
  assert.equal(normalizeAgentVersion(undefined), null);
});

test('normalizeAgentArch only accepts expected architecture strings', () => {
  assert.equal(normalizeAgentArch('amd64'), 'amd64');
  assert.equal(normalizeAgentArch('arm64'), 'arm64');
  assert.equal(normalizeAgentArch('386'), '386');
  assert.equal(normalizeAgentArch('x64'), null);
  assert.equal(normalizeAgentArch('../../'), null);
});

test('normalizeLinuxFormat enforces Linux download format allowlist', () => {
  assert.equal(normalizeLinuxFormat('deb'), 'deb');
  assert.equal(normalizeLinuxFormat('RPM'), 'rpm');
  assert.equal(normalizeLinuxFormat('pkg.tar.zst'), 'pkg.tar.zst');
  assert.equal(normalizeLinuxFormat(null), 'deb');
  assert.equal(normalizeLinuxFormat('exe'), null);
  assert.equal(normalizeLinuxFormat('../../'), null);
});

test('linux format allowlist is explicit and finite', () => {
  assert.deepEqual(Array.from(AGENT_LINUX_FORMATS).sort(), ['deb', 'pkg.tar.zst', 'rpm']);
});
