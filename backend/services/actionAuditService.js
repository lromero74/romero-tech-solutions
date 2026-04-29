import crypto from 'crypto';
import { query } from '../config/database.js';

// =============================================================================
// actionAuditService — hash-chained tamper-evident audit trail for Stage 4
// (patch approvals, deployments, script signing, etc.)
//
// Design (see docs/PRPs/STAGE4_ACTION_LAYER.md):
//   row_hash = SHA-256(prev_hash || canonicalJson({fields}))
//
// Where canonicalJson sorts object keys recursively so the hash input is
// byte-identical regardless of how Postgres returned the JSONB row. Without
// canonicalization, JSONB key reordering would silently invalidate the chain.
//
// The chain is append-only; tampering with any row's payload, action_type,
// timestamp, or prev_hash will cause verifyChainRows to detect a mismatch
// at the tamper site (and thereafter, since each subsequent row links to
// the prior row's hash).
//
// Concurrency: append() takes an advisory lock so two concurrent calls can't
// both read the same prev_hash and produce a fork. The lock is released
// automatically at transaction end.
// =============================================================================

// Arbitrary 32-bit advisory-lock key. Only this service should claim it.
const APPEND_LOCK_KEY = 0x57414c41;

/**
 * Deterministic JSON serialization. Sorts object keys recursively; arrays
 * keep their original order (positionally meaningful). Same logical input
 * → byte-identical output, suitable for hashing.
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

/**
 * Compute the row_hash for one audit entry.
 *
 * @param {object} args
 * @param {string|null} args.prevHash       64-hex SHA-256 of prior row, or null for genesis
 * @param {string}      args.actionType     e.g. 'patch.approve'
 * @param {string|null} args.actorEmployeeId UUID
 * @param {string|null} args.actorBusinessId UUID
 * @param {string|null} args.agentDeviceId  UUID
 * @param {object}      args.payload        Action-specific JSON payload
 * @param {string}      args.occurredAt     ISO-8601 UTC timestamp
 * @returns {string} 64-char lowercase hex SHA-256
 */
export function computeRowHash({
  prevHash,
  actionType,
  actorEmployeeId,
  actorBusinessId,
  agentDeviceId,
  payload,
  occurredAt
}) {
  const body = canonicalJson({
    action_type: actionType,
    actor_business_id: actorBusinessId,
    actor_employee_id: actorEmployeeId,
    agent_device_id: agentDeviceId,
    occurred_at: occurredAt,
    payload
  });
  // prevHash null → empty string prefix (valid for genesis row).
  const input = (prevHash || '') + body;
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Verify a sequence of audit rows (already fetched from DB, in chronological
 * order). Returns the 0-based index of the first tampered or out-of-place row,
 * or null if the chain is intact.
 *
 * Detects: payload edits, action_type edits, timestamp edits, prev_hash
 * tampering, and row deletion (the next row's prev_hash will no longer match
 * its predecessor).
 *
 * @param {Array<object>} rows Each row must have: prev_hash, row_hash,
 *   action_type, actor_employee_id, actor_business_id, agent_device_id,
 *   payload, occurred_at (the same shape returned by SELECT * FROM
 *   agent_action_audit ORDER BY occurred_at ASC, id ASC).
 * @returns {number|null} Index of first bad row, or null if intact.
 */
export function verifyChainRows(rows) {
  let expectedPrev = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Detect deletion / re-ordering: each row's prev_hash must equal the
    // prior row's row_hash (or null at genesis).
    if (r.prev_hash !== expectedPrev) {
      return i;
    }
    const occurredAt = r.occurred_at instanceof Date
      ? r.occurred_at.toISOString()
      : r.occurred_at;
    const recomputed = computeRowHash({
      prevHash: r.prev_hash,
      actionType: r.action_type,
      actorEmployeeId: r.actor_employee_id,
      actorBusinessId: r.actor_business_id,
      agentDeviceId: r.agent_device_id,
      payload: r.payload,
      occurredAt
    });
    if (recomputed !== r.row_hash) {
      return i;
    }
    expectedPrev = r.row_hash;
  }
  return null;
}

/**
 * Append a new audit row. Atomic: takes an advisory lock so two concurrent
 * appenders can't both link to the same prev_hash.
 *
 * @param {object} args
 * @param {string} args.actionType
 * @param {string|null} [args.actorEmployeeId]
 * @param {string|null} [args.actorBusinessId]
 * @param {string|null} [args.agentDeviceId]
 * @param {object} args.payload
 * @param {string|null} [args.sourceIp]
 * @param {string|null} [args.userAgent]
 * @returns {Promise<{id: string, row_hash: string, occurred_at: string}>}
 */
export async function append({
  actionType,
  actorEmployeeId = null,
  actorBusinessId = null,
  agentDeviceId = null,
  payload,
  sourceIp = null,
  userAgent = null
}) {
  if (!actionType || typeof actionType !== 'string') {
    throw new Error('actionType is required (non-empty string)');
  }
  if (payload === undefined || payload === null) {
    throw new Error('payload is required');
  }

  // Use a single connection so the advisory lock + read-tip + insert run as
  // one logical unit. pg_advisory_xact_lock auto-releases at transaction end.
  return await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [APPEND_LOCK_KEY]);

    const tipResult = await client.query(
      `SELECT row_hash FROM agent_action_audit
       ORDER BY occurred_at DESC, id DESC LIMIT 1`
    );
    const prevHash = tipResult.rows.length > 0 ? tipResult.rows[0].row_hash : null;

    // Use server time for occurred_at so all rows share one clock source.
    const tsResult = await client.query("SELECT now() AT TIME ZONE 'UTC' AS now");
    const occurredAt = new Date(tsResult.rows[0].now + 'Z').toISOString();

    const rowHash = computeRowHash({
      prevHash,
      actionType,
      actorEmployeeId,
      actorBusinessId,
      agentDeviceId,
      payload,
      occurredAt
    });

    const insertResult = await client.query(
      `INSERT INTO agent_action_audit (
         prev_hash, row_hash, action_type,
         actor_employee_id, actor_business_id, agent_device_id,
         payload, source_ip, user_agent, occurred_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, row_hash, occurred_at`,
      [
        prevHash, rowHash, actionType,
        actorEmployeeId, actorBusinessId, agentDeviceId,
        JSON.stringify(payload), sourceIp, userAgent, occurredAt
      ]
    );

    return insertResult.rows[0];
  });
}

/**
 * Walk the entire audit chain and return the first mismatch index (or null).
 * For very large chains this is O(N) and may be slow; prefer per-business
 * verification by filtering on actor_business_id or agent_device_id.
 *
 * @param {object} [filter]
 * @param {string} [filter.businessId]   only audit rows for this business
 * @param {string} [filter.agentDeviceId] only rows for this device
 * @returns {Promise<number|null>}
 */
export async function verifyChain(filter = {}) {
  const where = [];
  const params = [];
  let i = 1;
  if (filter.businessId) {
    where.push(`actor_business_id = $${i++}`);
    params.push(filter.businessId);
  }
  if (filter.agentDeviceId) {
    where.push(`agent_device_id = $${i++}`);
    params.push(filter.agentDeviceId);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const result = await query(
    `SELECT prev_hash, row_hash, action_type,
            actor_employee_id, actor_business_id, agent_device_id,
            payload, occurred_at
     FROM agent_action_audit
     ${whereClause}
     ORDER BY occurred_at ASC, id ASC`,
    params
  );
  return verifyChainRows(result.rows);
}

// withTransaction helper — wraps DB pool acquire + BEGIN/COMMIT/ROLLBACK so
// the advisory lock and the chain insert share one connection. Defined here
// (rather than in config/database.js) to keep this service self-contained.
async function withTransaction(fn) {
  const { pool } = await import('../config/database.js');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
