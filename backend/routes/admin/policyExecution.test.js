import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPolicyRunCommand } from './policyExecution.js';

// The execute endpoint must queue a real run_script agent command built
// from the policy's automation script — never a fake success.
const script = {
  id: 'script-1',
  script_name: 'Disk cleanup',
  script_type: 'bash',
  script_content: 'df -h',
  timeout_seconds: 300,
};
const policy = { id: 'policy-1', policy_name: 'Cleanup', policy_type: 'script_execution', script_id: 'script-1' };

test('builds a run_script command from the policy script', () => {
  const built = buildPolicyRunCommand({ policy, script, agentDeviceId: 'agent-1', requestedBy: 'emp-1' });
  assert.equal(built.command.commandType, 'run_script');
  assert.deepEqual(built.command.commandParams, { script: 'df -h' });
  assert.equal(built.command.agentDeviceId, 'agent-1');
  assert.equal(built.command.requestedBy, 'emp-1');
  assert.equal(built.history.policyId, 'policy-1');
  assert.equal(built.history.agentDeviceId, 'agent-1');
  assert.equal(built.history.executionType, 'manual');
  assert.equal(built.history.status, 'pending');
  assert.equal(built.history.scriptId, 'script-1');
});

test('rejects non-script policies with an honest error', () => {
  assert.throws(
    () => buildPolicyRunCommand({
      policy: { ...policy, policy_type: 'configuration', script_id: null },
      script: null,
      agentDeviceId: 'agent-1',
      requestedBy: 'emp-1',
    }),
    /script_execution/
  );
});

test('rejects script policies with no script content', () => {
  assert.throws(
    () => buildPolicyRunCommand({
      policy,
      script: { ...script, script_content: '' },
      agentDeviceId: 'agent-1',
      requestedBy: 'emp-1',
    }),
    /no script content/
  );
});

test('rejects a missing target agent', () => {
  assert.throws(
    () => buildPolicyRunCommand({ policy, script, agentDeviceId: '', requestedBy: 'emp-1' }),
    /agent_device_id/
  );
});
