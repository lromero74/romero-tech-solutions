/**
 * Free-Tier Gate for Stage 1 Health Checks
 *
 * Decides whether a given check_type is allowed for a given agent.
 * Trial agents get a curated subset; paid agents get everything.
 *
 * MUST stay in lockstep with internal/freetier/checks.go in the rts-monitoring-agent
 * repo — if those lists diverge, the agent will report data the backend silently
 * drops (or vice versa).
 */
import { query } from '../config/database.js';

// Free-tier check types — available on trial agents.
export const STAGE1_CHECKS_FREE = Object.freeze([
  'reboot_pending',
  'time_drift',
  'crashdumps',
  'update_history_failures',
  'domain_status',
]);

// Paid-only check types — silently dropped on ingest if the agent is on trial.
export const STAGE1_CHECKS_PAID = Object.freeze([
  'top_processes',
  'listening_ports',
  'mapped_drives',
]);

const FREE_SET = new Set(STAGE1_CHECKS_FREE);
const PAID_SET = new Set(STAGE1_CHECKS_PAID);

/**
 * Pure decision function — testable without a DB.
 *
 * @param {string} checkType
 * @param {boolean|null} isTrial — null when the agent isn't found
 * @returns {boolean} true if the check should be persisted
 *
 * Decision matrix:
 *   - check_type unknown to Stage 1 → allow (future stages register their own gate)
 *   - check_type in FREE_SET → allow (trial or paid)
 *   - check_type in PAID_SET, isTrial === false → allow
 *   - check_type in PAID_SET, isTrial === true → deny
 *   - check_type in PAID_SET, isTrial === null (agent missing) → deny
 */
export function decideAllowed(checkType, isTrial) {
  if (!FREE_SET.has(checkType) && !PAID_SET.has(checkType)) {
    return true; // unknown → liberal
  }
  if (FREE_SET.has(checkType)) return true;
  // PAID set
  return isTrial === false;
}

/**
 * Defense-in-depth backend gate. Agent-side gate at internal/freetier/checks.go
 * SHOULD prevent the request from being made — this is the second layer.
 *
 * Silent-drop on disallowed (return false) so the agent's retry loop doesn't
 * spam 4xx logs.
 */
export async function isCheckAllowedForAgent(agentDeviceId, checkType) {
  if (!FREE_SET.has(checkType) && !PAID_SET.has(checkType)) return true;
  if (FREE_SET.has(checkType)) return true;

  const { rows } = await query(
    'SELECT is_trial FROM agent_devices WHERE id = $1',
    [agentDeviceId]
  );
  const isTrial = rows.length === 0 ? null : rows[0].is_trial;
  return decideAllowed(checkType, isTrial);
}
