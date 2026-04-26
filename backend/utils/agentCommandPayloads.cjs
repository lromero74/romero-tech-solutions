/**
 * Pure helpers for normalizing inbound agent-command payloads.
 *
 * Extracted from backend/routes/agents.js so the body-parsing /
 * coercion rules can be unit-tested without spinning up Express,
 * a database connection, or websockets.
 *
 * .cjs because package.json sets "type": "module" — Jest's CJS
 * runtime can't natively parse `export` from .js files in this repo,
 * so we keep this file CommonJS and let backend/routes/agents.js
 * (ESM) import from it via Node's ESM/CJS interop.
 */

/**
 * Normalize a /commands/:id/progress payload into the shape we persist
 * under agent_commands.result_payload.progress (and broadcast over
 * websockets). Used by Windows Update mid-install ticks.
 */
function normalizeProgressPayload(body, nowIso) {
  const b = body || {};
  return {
    phase: typeof b.phase === 'string' ? b.phase : '',
    percent: typeof b.percent === 'number' ? b.percent : 0,
    current_index: typeof b.current_index === 'number' ? b.current_index : -1,
    total: typeof b.total === 'number' ? b.total : 0,
    package: typeof b.package === 'string' ? b.package : '',
    message: typeof b.message === 'string' ? b.message : '',
    updated_at: nowIso || new Date().toISOString(),
  };
}

function buildProgressWsMessage({ command_id, agent_id, command_type, progress }) {
  return {
    type: 'agent.command.progress',
    data: {
      command_id,
      agent_id,
      command_type: command_type || null,
      stage: 'executing',
      progress,
    },
  };
}

function buildStartedWsMessage({ command_id, agent_id, command_type, started_at }) {
  return {
    type: 'agent.command.progress',
    data: {
      command_id,
      agent_id,
      command_type: command_type || null,
      stage: 'executing',
      started_at: started_at || new Date().toISOString(),
    },
  };
}

/**
 * Built when an agent reports that a scheduled reboot was cancelled
 * at the host (the user ran `shutdown -c` / `shutdown /a` before the
 * scheduled time). The dashboard listens for this to flip its
 * "Reboot scheduled at HH:MM" badge into "Reboot cancelled".
 *
 * Uses agent.command.progress as the wrapping event type so it
 * reuses the existing dashboard-side dispatcher; stage='cancelled'
 * is the discriminator.
 */
function buildRebootCancelledWsMessage({ command_id, agent_id, detected_at, source }) {
  return {
    type: 'agent.command.progress',
    data: {
      command_id,
      agent_id,
      command_type: 'reboot_host',
      stage: 'cancelled',
      cancelled_at: detected_at || new Date().toISOString(),
      // 'admin' = dashboard-initiated cancel; 'host' = user at the
      // host ran shutdown -c. Drives different copy in the UI banner.
      cancelled_by: source === 'admin' ? 'admin' : 'host',
    },
  };
}

module.exports = {
  normalizeProgressPayload,
  buildProgressWsMessage,
  buildStartedWsMessage,
  buildRebootCancelledWsMessage,
};
