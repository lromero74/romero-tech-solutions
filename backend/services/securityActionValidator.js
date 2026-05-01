// =============================================================================
// securityActionValidator — pure validator for the Stage 4 security-action
// route. No DB, no I/O — exercise via Node's built-in test runner.
//
// Three capabilities are exposed:
//
//   * clamav    — install / uninstall (it's a third-party package; missing
//                 by default on most hosts, so install IS the "turn on")
//   * native_av — enable / disable (the OS vendor's own AV: Defender on
//                 Windows. macOS XProtect is partially controllable; Linux
//                 has no native AV — agent-side dispatcher will refuse where
//                 unsupported.)
//   * firewall  — enable / disable (always present at the OS level: ufw,
//                 firewalld, socketfilterfw, netsh advfirewall).
//
// The (capability, action) combination set is intentionally small: only the
// combinations that map to a real OS-level operation are valid. A pure
// allow-list keeps the surface area auditable.
// =============================================================================

export const VALID_CAPABILITIES = Object.freeze(['clamav', 'native_av', 'firewall']);

export const VALID_ACTIONS_BY_CAPABILITY = Object.freeze({
  clamav:    Object.freeze(['install', 'uninstall']),
  native_av: Object.freeze(['enable', 'disable']),
  firewall:  Object.freeze(['enable', 'disable'])
});

/**
 * Pure helper — true iff the (capability, action) pair is in the allowlist.
 * Strict equality — no casing/whitespace coercion (those should fail).
 */
export function isValidCombination(capability, action) {
  if (typeof capability !== 'string' || typeof action !== 'string') return false;
  const actions = VALID_ACTIONS_BY_CAPABILITY[capability];
  if (!actions) return false;
  return actions.includes(action);
}

/**
 * Full validator — returns a human-readable error message string, or null
 * if the input is OK. Mirrors patchApprovalDecisions.validateAction shape.
 *
 * @param {string} capability — must be in VALID_CAPABILITIES
 * @param {string} action     — must be in VALID_ACTIONS_BY_CAPABILITY[capability]
 * @returns {string|null}
 */
export function validateSecurityAction(capability, action) {
  if (typeof capability !== 'string' || capability.length === 0) {
    return `capability must be one of: ${VALID_CAPABILITIES.join(', ')}`;
  }
  if (typeof action !== 'string' || action.length === 0) {
    return `action is required`;
  }
  if (!VALID_CAPABILITIES.includes(capability)) {
    return `capability must be one of: ${VALID_CAPABILITIES.join(', ')}`;
  }
  if (!isValidCombination(capability, action)) {
    const allowed = VALID_ACTIONS_BY_CAPABILITY[capability].join(', ');
    return `action "${action}" is not valid for capability "${capability}" — allowed: ${allowed}`;
  }
  return null;
}
