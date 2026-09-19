import { v4 as uuidv4 } from 'uuid';
import { query } from '../../config/database.js';

// Policy execution wiring: a script_execution automation policy runs by
// queueing a run_script agent command (the agent executes cmd.payload.script
// via its OS shell and reports back through the command result endpoint).
// Non-script policies have no agent-side runner, so building a command for
// them is an honest 400, never a fake success.

export function buildPolicyRunCommand({ policy, script, agentDeviceId, requestedBy }) {
  if (!agentDeviceId) {
    const err = new Error('agent_device_id is required to execute a policy');
    err.statusCode = 400;
    throw err;
  }
  if (!policy || policy.policy_type !== 'script_execution') {
    const err = new Error('Only script_execution policies can be executed on an agent');
    err.statusCode = 400;
    throw err;
  }
  if (!script || !script.script_content) {
    const err = new Error('Policy has no script content to execute');
    err.statusCode = 400;
    throw err;
  }
  return {
    command: {
      commandType: 'run_script',
      commandParams: { script: script.script_content },
      agentDeviceId,
      requestedBy,
    },
    history: {
      policyId: policy.id,
      agentDeviceId,
      executionType: 'manual',
      triggeredBy: requestedBy,
      scriptId: script.id,
      status: 'pending',
    },
  };
}

export async function fetchPolicyWithScript(policyId) {
  const result = await query(
    `SELECT p.*, s.script_content, s.script_type, s.script_name, s.timeout_seconds
     FROM automation_policies p
     LEFT JOIN automation_scripts s ON s.id = p.script_id
     WHERE p.id = $1`,
    [policyId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    policy: {
      id: row.id,
      policy_name: row.policy_name,
      policy_type: row.policy_type,
      script_id: row.script_id,
    },
    script: row.script_id
      ? {
          id: row.script_id,
          script_name: row.script_name,
          script_type: row.script_type,
          script_content: row.script_content,
          timeout_seconds: row.timeout_seconds,
        }
      : null,
  };
}

export async function agentExists(agentDeviceId) {
  const result = await query(
    'SELECT id FROM agent_devices WHERE id = $1 AND soft_delete = false',
    [agentDeviceId]
  );
  return result.rows.length > 0;
}

// Queues the agent command and records the execution-history row.
// Mirrors the agent_commands INSERT contract in routes/agents/commands.js
// (auto-approved: approval_required false, approved_by = requester).
export async function queuePolicyExecution(built, assignmentId = null) {
  const commandId = uuidv4();
  await query(
    `INSERT INTO agent_commands (
       id, agent_device_id, command_type, command_params,
       requested_by, approval_required, approved_by, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      commandId,
      built.command.agentDeviceId,
      built.command.commandType,
      JSON.stringify(built.command.commandParams),
      built.command.requestedBy,
      false,
      built.command.requestedBy,
      'pending',
    ]
  );
  const historyResult = await query(
    `INSERT INTO policy_execution_history (
       policy_id, assignment_id, agent_device_id, execution_type,
       triggered_by_employee_id, script_id, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      built.history.policyId,
      assignmentId,
      built.history.agentDeviceId,
      built.history.executionType,
      built.history.triggeredBy,
      built.history.scriptId,
      built.history.status,
    ]
  );
  return { commandId, executionId: historyResult.rows[0].id };
}
