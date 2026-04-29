// =============================================================================
// patchApprovalDecisions — pure validators + decision mapper for the Stage 4
// patch-approval workflow. No DB, no I/O — fully testable in isolation.
//
// Used by routes/patchApprovals.js. Centralizing the rules here means the
// route file doesn't have to reimplement state-machine guards inline, and
// changing the verb set or transition rules requires touching one place.
// =============================================================================

export const VALID_ACTIONS = Object.freeze(['approve', 'defer', 'reject']);

export const VALID_PACKAGE_MANAGERS = Object.freeze([
  'apt',     // Debian / Ubuntu
  'dnf',     // Fedora / RHEL 8+
  'yum',     // RHEL / CentOS 7
  'brew',    // macOS Homebrew
  'winget',  // Windows Package Manager
  'choco',   // Chocolatey
  'pacman'   // Arch
]);

const NOTES_MAX_LENGTH = 2000;

const ACTION_TO_STATUS = {
  approve: 'approved',
  defer:   'deferred',
  reject:  'rejected'
};

/**
 * @param {string} action
 * @returns {string|null} error message or null if valid
 */
export function validateAction(action) {
  if (typeof action !== 'string' || !VALID_ACTIONS.includes(action)) {
    return `action must be one of: ${VALID_ACTIONS.join(', ')}`;
  }
  return null;
}

/**
 * Only pending rows can be decided. Already-decided rows are immutable from
 * the API surface; if they need correction, that's a manual DB op + audit row.
 *
 * @param {string} currentStatus
 * @param {string} action
 * @returns {string|null}
 */
export function validateTransition(currentStatus, action) {
  const actionErr = validateAction(action);
  if (actionErr) return actionErr;
  if (currentStatus !== 'pending') {
    return `cannot decide a row with status "${currentStatus}" — only pending rows accept decisions`;
  }
  return null;
}

/**
 * @param {string} pm
 * @returns {string|null}
 */
export function validatePackageManager(pm) {
  if (typeof pm !== 'string' || !VALID_PACKAGE_MANAGERS.includes(pm)) {
    return `package_manager must be one of: ${VALID_PACKAGE_MANAGERS.join(', ')}`;
  }
  return null;
}

/**
 * @param {*} notes — accept undefined / null / empty string as "no notes"
 * @returns {string|null}
 */
export function validateApprovalNotes(notes) {
  if (notes === undefined || notes === null || notes === '') return null;
  if (typeof notes !== 'string') return 'approval_notes must be a string';
  if (notes.length > NOTES_MAX_LENGTH) {
    return `approval_notes exceeds ${NOTES_MAX_LENGTH} character length cap`;
  }
  return null;
}

/**
 * Pure decision mapper — given an action + actor + timestamp, return the
 * fields to UPDATE on the patch_approvals row. Throws on unknown action
 * (callers should validate first; throwing here is defense-in-depth).
 *
 * @param {string} action
 * @param {object} ctx
 * @param {string} ctx.employeeId
 * @param {Date}   ctx.now
 * @param {string} [ctx.notes]
 * @returns {{status: string, approved_by: string, approved_at: string, approval_notes: string|null}}
 */
export function applyDecision(action, { employeeId, now, notes }) {
  const status = ACTION_TO_STATUS[action];
  if (!status) {
    throw new Error(`unknown action: ${action}`);
  }
  return {
    status,
    approved_by: employeeId,
    approved_at: now.toISOString(),
    approval_notes: notes === undefined || notes === null || notes === '' ? null : notes
  };
}
