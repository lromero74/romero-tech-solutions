import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAction,
  validateTransition,
  validatePackageManager,
  validateApprovalNotes,
  applyDecision,
  VALID_ACTIONS,
  VALID_PACKAGE_MANAGERS
} from './patchApprovalDecisions.js';

// =============================================================================
// validateAction — incoming decision verb must be in the allowlist.
// Coercion of arbitrary strings into a state machine is a classic injection
// vector; pin it.
// =============================================================================

test('validateAction: allowlist exposes exactly the 3 verbs', () => {
  // Pinning the surface area — adding a new verb requires a deliberate
  // change here AND new transition rules in validateTransition.
  assert.deepEqual(VALID_ACTIONS.slice().sort(), ['approve', 'defer', 'reject']);
});

test('validateAction: each valid verb passes', () => {
  for (const a of ['approve', 'defer', 'reject']) {
    assert.equal(validateAction(a), null, `valid action: ${a}`);
  }
});

test('validateAction: rejects unknown / casing / whitespace', () => {
  for (const a of ['Approve', 'APPROVE', 'approve ', ' approve', 'yes', '', 'pending', null, undefined, 42]) {
    const err = validateAction(a);
    assert.ok(err, `must reject ${JSON.stringify(a)}`);
    assert.match(err, /action/i);
  }
});

// =============================================================================
// validateTransition — only pending rows can be decided. Anything else is
// either already finalized or in an unexpected state — both should fail.
// =============================================================================

test('validateTransition: pending → approve|defer|reject all OK', () => {
  for (const a of ['approve', 'defer', 'reject']) {
    assert.equal(validateTransition('pending', a), null, `pending → ${a}`);
  }
});

test('validateTransition: any non-pending current status is rejected', () => {
  for (const cur of ['approved', 'deferred', 'rejected', 'expired']) {
    const err = validateTransition(cur, 'approve');
    assert.ok(err, `current=${cur} must be rejected`);
    assert.match(err, /pending|status|already/i);
  }
});

test('validateTransition: validates action even if status is OK', () => {
  // Don't let a malformed action slip through just because status is fine.
  assert.ok(validateTransition('pending', 'YOLO'));
});

// =============================================================================
// validatePackageManager — at the ingest path; agents ought to send a
// known package manager. Reject anything else so an attacker can't seed
// fictional manager rows that collide with real records.
// =============================================================================

test('validatePackageManager: allowlist matches docs', () => {
  assert.deepEqual(VALID_PACKAGE_MANAGERS.slice().sort(),
    ['apt', 'brew', 'choco', 'dnf', 'pacman', 'winget', 'yum']);
});

test('validatePackageManager: each valid PM passes', () => {
  for (const pm of VALID_PACKAGE_MANAGERS) {
    assert.equal(validatePackageManager(pm), null);
  }
});

test('validatePackageManager: rejects unknowns + null + casing', () => {
  for (const pm of ['npm', 'snap', 'flatpak', 'APT', '', null, undefined]) {
    assert.ok(validatePackageManager(pm), `must reject ${JSON.stringify(pm)}`);
  }
});

// =============================================================================
// validateApprovalNotes — soft cap on length so attackers can't spam huge
// payloads through. 2000 chars is plenty for human notes.
// =============================================================================

test('validateApprovalNotes: empty / null / undefined → OK (notes are optional)', () => {
  assert.equal(validateApprovalNotes(undefined), null);
  assert.equal(validateApprovalNotes(null), null);
  assert.equal(validateApprovalNotes(''), null);
});

test('validateApprovalNotes: short note → OK', () => {
  assert.equal(validateApprovalNotes('Approved per ticket #1234'), null);
});

test('validateApprovalNotes: at the 2000-char boundary still OK', () => {
  assert.equal(validateApprovalNotes('a'.repeat(2000)), null);
});

test('validateApprovalNotes: > 2000 chars rejected', () => {
  const err = validateApprovalNotes('a'.repeat(2001));
  assert.ok(err);
  assert.match(err, /2000|length/i);
});

test('validateApprovalNotes: non-string types rejected', () => {
  for (const v of [42, true, {}, []]) {
    assert.ok(validateApprovalNotes(v), `non-string rejected: ${typeof v}`);
  }
});

// =============================================================================
// applyDecision — given an action + current row, return the SQL update fields
// for the patch_approvals row. Pure, no DB.
//
// Why this matters: the same decision changes both `status` AND records the
// approver/timestamp. Centralizing the mapping prevents one route from
// updating status without recording who did it (which would break the audit
// trail's "who" attribution).
// =============================================================================

test('applyDecision: approve → status=approved with approver fields set', () => {
  const out = applyDecision('approve', { employeeId: 'emp-1', notes: 'looks good', now: new Date('2026-04-29T17:00:00Z') });
  assert.equal(out.status, 'approved');
  assert.equal(out.approved_by, 'emp-1');
  assert.equal(out.approved_at, '2026-04-29T17:00:00.000Z');
  assert.equal(out.approval_notes, 'looks good');
});

test('applyDecision: defer → status=deferred', () => {
  const out = applyDecision('defer', { employeeId: 'emp-1', now: new Date('2026-04-29T17:00:00Z') });
  assert.equal(out.status, 'deferred');
  assert.equal(out.approved_by, 'emp-1');
});

test('applyDecision: reject → status=rejected', () => {
  const out = applyDecision('reject', { employeeId: 'emp-1', now: new Date('2026-04-29T17:00:00Z') });
  assert.equal(out.status, 'rejected');
  assert.equal(out.approved_by, 'emp-1');
});

test('applyDecision: unknown action throws (defense in depth — should be caught upstream)', () => {
  assert.throws(() => applyDecision('explode', { employeeId: 'x', now: new Date() }), /action/i);
});

test('applyDecision: notes default to null when omitted', () => {
  const out = applyDecision('approve', { employeeId: 'emp-1', now: new Date('2026-04-29T17:00:00Z') });
  assert.equal(out.approval_notes, null);
});
