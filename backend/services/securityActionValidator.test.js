import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSecurityAction,
  VALID_CAPABILITIES,
  VALID_ACTIONS_BY_CAPABILITY,
  isValidCombination
} from './securityActionValidator.js';

// =============================================================================
// VALID_CAPABILITIES — three concrete capability buckets the operator can act
// against. Pin the surface area so adding a new capability requires a deliberate
// change here AND a matching agent-side handler.
// =============================================================================

test('VALID_CAPABILITIES is exactly clamav / native_av / firewall', () => {
  assert.deepEqual(VALID_CAPABILITIES.slice().sort(), ['clamav', 'firewall', 'native_av']);
});

test('VALID_ACTIONS_BY_CAPABILITY: clamav allows install + uninstall only', () => {
  assert.deepEqual(VALID_ACTIONS_BY_CAPABILITY.clamav.slice().sort(), ['install', 'uninstall']);
});

test('VALID_ACTIONS_BY_CAPABILITY: native_av + firewall allow enable + disable only', () => {
  assert.deepEqual(VALID_ACTIONS_BY_CAPABILITY.native_av.slice().sort(), ['disable', 'enable']);
  assert.deepEqual(VALID_ACTIONS_BY_CAPABILITY.firewall.slice().sort(), ['disable', 'enable']);
});

// =============================================================================
// isValidCombination — pure helper exposed for tests + UI guard symmetry.
// =============================================================================

test('isValidCombination: known good combinations return true', () => {
  assert.equal(isValidCombination('clamav', 'install'), true);
  assert.equal(isValidCombination('clamav', 'uninstall'), true);
  assert.equal(isValidCombination('native_av', 'enable'), true);
  assert.equal(isValidCombination('native_av', 'disable'), true);
  assert.equal(isValidCombination('firewall', 'enable'), true);
  assert.equal(isValidCombination('firewall', 'disable'), true);
});

test('isValidCombination: cross-capability action mismatches are rejected', () => {
  // You can't "install" a firewall (it's always present at the OS level).
  assert.equal(isValidCombination('firewall', 'install'), false);
  assert.equal(isValidCombination('firewall', 'uninstall'), false);
  // You can't "install" native_av either — Defender / XProtect are part of OS.
  assert.equal(isValidCombination('native_av', 'install'), false);
  assert.equal(isValidCombination('native_av', 'uninstall'), false);
  // Conversely, "enable" on clamav is meaningless — install IS the enable step.
  assert.equal(isValidCombination('clamav', 'enable'), false);
  assert.equal(isValidCombination('clamav', 'disable'), false);
});

test('isValidCombination: unknown capability or action → false', () => {
  assert.equal(isValidCombination('mcafee', 'install'), false);
  assert.equal(isValidCombination('clamav', 'reboot'), false);
  assert.equal(isValidCombination('', ''), false);
  assert.equal(isValidCombination(null, 'install'), false);
});

// =============================================================================
// validateSecurityAction — full validator, returns null on OK / message on error.
// This is what the route handler calls. Mirrors patchApprovalDecisions.validateAction
// pattern: errors are human-readable strings ready to put in a 400 response.
// =============================================================================

test('validateSecurityAction: valid combinations pass', () => {
  for (const [cap, actions] of Object.entries(VALID_ACTIONS_BY_CAPABILITY)) {
    for (const action of actions) {
      assert.equal(
        validateSecurityAction(cap, action), null,
        `valid combination should pass: ${cap} + ${action}`
      );
    }
  }
});

test('validateSecurityAction: missing fields are flagged distinctly', () => {
  const err1 = validateSecurityAction(undefined, 'install');
  assert.match(err1 || '', /capability/i);
  const err2 = validateSecurityAction('clamav', undefined);
  assert.match(err2 || '', /action/i);
});

test('validateSecurityAction: rejects whitespace + casing variants (no silent coercion)', () => {
  // Allowing ' clamav ' or 'CLAMAV' to slip through means an attacker can
  // probe the validator with edge cases — pin strict matching.
  for (const cap of [' clamav', 'clamav ', 'CLAMAV', 'ClamAV']) {
    assert.ok(validateSecurityAction(cap, 'install'),
      `non-canonical capability must reject: "${cap}"`);
  }
  for (const action of [' install', 'INSTALL', 'Install']) {
    assert.ok(validateSecurityAction('clamav', action),
      `non-canonical action must reject: "${action}"`);
  }
});

test('validateSecurityAction: invalid combination produces a combination-specific error', () => {
  const err = validateSecurityAction('firewall', 'install');
  assert.ok(err);
  // Error should reference the offending capability + action (debugging aid).
  assert.match(err, /firewall/i);
  assert.match(err, /install/i);
});

test('validateSecurityAction: rejects non-string types (defense in depth)', () => {
  assert.ok(validateSecurityAction(42, 'install'));
  assert.ok(validateSecurityAction('clamav', 42));
  assert.ok(validateSecurityAction({}, []));
});
