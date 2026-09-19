import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../config/database.js';
import { authenticateAgent, requireAgentMatch } from '../../middleware/agentAuthMiddleware.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { websocketService } from '../../services/websocketService.js';
import { policySchedulerService } from '../../services/policySchedulerService.js';

const router = express.Router();

/**
 * List Commands for Agent (Admin View)
 * GET /api/agents/:agent_id/commands/list
 *
 * Admins can view all commands for an agent
 */
router.get('/:agent_id/commands/list', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { status } = req.query;
    const isEmployee = req.user.role !== 'customer' && req.user.role !== 'client';

    // Verify access to this agent
    let accessCheckQuery = `
      SELECT business_id FROM agent_devices
      WHERE id = $1 AND soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      accessCheckQuery += ' AND business_id = $2';
      accessParams.push(req.user.business_id);
    }

    const accessResult = await query(accessCheckQuery, accessParams);

    if (accessResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Build query for commands
    let queryText = `
      SELECT
        ac.id,
        ac.command_type,
        ac.command_params,
        ac.status,
        ac.requested_by,
        ac.approved_by,
        ac.approval_required,
        ac.exit_code,
        ac.stdout,
        ac.stderr,
        ac.error_message,
        ac.created_at,
        ac.sent_at,
        ac.started_at,
        ac.completed_at,
        e.first_name || ' ' || e.last_name as requested_by_name
      FROM agent_commands ac
      LEFT JOIN employees e ON ac.requested_by = e.id
      WHERE ac.agent_device_id = $1
    `;

    const params = [agent_id];
    let paramIndex = 2;

    // Filter by status if provided
    if (status) {
      queryText += ` AND ac.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    queryText += ' ORDER BY ac.created_at DESC LIMIT 100';

    const commandsResult = await query(queryText, params);

    res.json({
      success: true,
      data: {
        commands: commandsResult.rows,
        count: commandsResult.rows.length
      }
    });

  } catch (error) {
    console.error('Get agent commands list error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch agent commands',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Pending Commands for Agent
 * GET /api/agents/:agent_id/commands
 *
 * Agent polls for commands to execute
 */
router.get('/:agent_id/commands', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;

    // Fetch pending commands
    const commandsResult = await query(
      `SELECT id, command_type, command_params, requested_by, created_at
       FROM agent_commands
       WHERE agent_device_id = $1
         AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 10`,
      [agent_id]
    );

    // Mark commands as delivered
    if (commandsResult.rows.length > 0) {
      const commandIds = commandsResult.rows.map(c => c.id);
      await query(
        `UPDATE agent_commands
         SET status = 'delivered', delivered_at = NOW()
         WHERE id = ANY($1)`,
        [commandIds]
      );
    }

    res.json({
      success: true,
      data: {
        commands: commandsResult.rows.map(cmd => ({
          id: cmd.id,
          command_type: cmd.command_type,
          payload: cmd.command_params,
          requested_at: cmd.created_at
        }))
      }
    });

  } catch (error) {
    console.error('Get agent commands error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch commands',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Submit Command Result
 * POST /api/agents/:agent_id/commands/:command_id/result
 *
 * Agent reports that it has started executing a command. Updates the
 * row's started_at + status='executing' and broadcasts an
 * agent.command.progress websocket event so the dashboard modal can
 * flip from "Waiting for the agent to pick it up" to "Update running…"
 * without waiting for the final result. Best-effort: a stale row or a
 * delivery race shouldn't block the agent — we 200 either way.
 */
router.post('/:agent_id/commands/:command_id/started', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id, command_id } = req.params;
    await query(
      `UPDATE agent_commands
       SET status = 'executing', started_at = NOW()
       WHERE id = $1 AND agent_device_id = $2 AND status IN ('pending', 'delivered')`,
      [command_id, agent_id]
    );
    try {
      const cmdRow = await query(
        `SELECT command_type, requested_by FROM agent_commands WHERE id = $1`,
        [command_id]
      );
      const message = buildStartedWsMessage({
        command_id,
        agent_id,
        command_type: cmdRow.rows[0]?.command_type,
      });
      websocketService.broadcastToAdmins(message);
      const requestedBy = cmdRow.rows[0]?.requested_by;
      if (requestedBy) websocketService.broadcastToUser(requestedBy, message);
    } catch (wsErr) {
      console.error('agent.command.progress broadcast failed:', wsErr);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Command started notification error:', error);
    // Don't 5xx the agent — this endpoint is informational.
    res.json({ success: false, message: error?.message });
  }
});

/**
 * Agent posts progress for a long-running command (currently used
 * by the Windows Update flow which can run 10+ minutes). Stores the
 * latest tick on agent_commands.result_payload.progress so a
 * dashboard that opens mid-install can pull it from the row, and
 * broadcasts an agent.command.progress websocket event so any
 * dashboard already viewing the modal updates in real time.
 *
 * Best-effort like /started — we never 5xx the agent on failures
 * since the install continues regardless of whether progress
 * updates land.
 */
router.post('/:agent_id/commands/:command_id/progress', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id, command_id } = req.params;
    const progress = normalizeProgressPayload(req.body);

    // No agent_commands.result_payload column exists in this schema —
    // we used to write progress JSONB there but the writes silently
    // 5xx'd. The dashboard observes progress via the websocket
    // broadcast below, which is the path the UpdatePackageDialog
    // actually subscribes to. If a refresh-after-mount source of
    // truth is needed later, add a result_payload JSONB column via
    // migration first.
    void progress;

    try {
      const cmdRow = await query(
        `SELECT command_type, requested_by FROM agent_commands WHERE id = $1`,
        [command_id]
      );
      const wsMessage = buildProgressWsMessage({
        command_id,
        agent_id,
        command_type: cmdRow.rows[0]?.command_type,
        progress,
      });
      websocketService.broadcastToAdmins(wsMessage);
      const requestedBy = cmdRow.rows[0]?.requested_by;
      if (requestedBy) websocketService.broadcastToUser(requestedBy, wsMessage);
    } catch (wsErr) {
      console.error('agent.command.progress broadcast failed:', wsErr);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Command progress notification error:', error);
    res.json({ success: false, message: error?.message });
  }
});

/**
 * POST /api/agents/:agent_id/commands/:command_id/reboot-cancelled
 *
 * Agent reports that a previously-scheduled reboot was cancelled at
 * the host (e.g. user ran `shutdown -c` on Linux/macOS or `shutdown
 * /a` on Windows). The agent detects this by waking up after the
 * scheduled delay + 30s grace and finding itself still alive — the
 * host clearly didn't reboot, so a human cancelled.
 *
 * We mark the command row as 'failed' with a 'cancelled-by-user'
 * status, and broadcast an agent.command.progress event with
 * stage='cancelled' so the dashboard can flip the per-row "Reboot
 * scheduled" badge to "Reboot cancelled".
 *
 * Best-effort like /started + /progress — never 5xx the agent.
 */
router.post('/:agent_id/commands/:command_id/reboot-cancelled', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id, command_id } = req.params;
    const { detected_at, source } = req.body || {};
    // 'host' = user ran shutdown -c at the host; 'admin' = the
    // dashboard issued a cancel_reboot command. Either way the
    // command_id row's status flips to 'cancelled' and a
    // websocket fires.
    const cancellationSource = source === 'admin' ? 'admin' : 'host';
    // No result_payload JSONB column in this schema — record the
    // cancellation source/timestamp in stdout (free-form text)
    // alongside flipping status. The dashboard learns about the
    // cancellation via the websocket broadcast below; this is just
    // an audit trail on the row.
    await query(
      `UPDATE agent_commands
       SET status = 'cancelled',
           completed_at = NOW(),
           stdout = COALESCE(stdout, '') ||
                    E'\n[reboot-cancelled] source=' || $1 ||
                    E'\n[reboot-cancelled] detected_at=' || $2
       WHERE id = $3 AND agent_device_id = $4`,
      [cancellationSource, detected_at || new Date().toISOString(), command_id, agent_id]
    );
    try {
      const cmdRow = await query(
        `SELECT requested_by FROM agent_commands WHERE id = $1`,
        [command_id]
      );
      const message = buildRebootCancelledWsMessage({
        command_id,
        agent_id,
        detected_at,
        source: cancellationSource,
      });
      websocketService.broadcastToAdmins(message);
      const requestedBy = cmdRow.rows[0]?.requested_by;
      if (requestedBy) websocketService.broadcastToUser(requestedBy, message);
    } catch (wsErr) {
      console.error('reboot-cancelled broadcast failed:', wsErr);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('reboot-cancelled notification error:', error);
    res.json({ success: false, message: error?.message });
  }
});

/**
 * Agent submits execution result for a command
 */
router.post('/:agent_id/commands/:command_id/result', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id, command_id } = req.params;
    const { status, result, error } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: status',
        code: 'MISSING_STATUS'
      });
    }

    // Validate status. `completed_with_failures` is the partial-success
    // case (e.g. update_packages where some packages succeeded and some
    // failed) — distinct from outright `failed` so the dashboard can
    // render it differently.
    if (!['completed', 'completed_with_failures', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "completed", "completed_with_failures", or "failed"',
        code: 'INVALID_STATUS'
      });
    }

    // Update command status
    await query(
      `UPDATE agent_commands
       SET status = $1,
           stdout = $2,
           error_message = $3,
           completed_at = NOW()
       WHERE id = $4 AND agent_device_id = $5`,
      [status, result ? JSON.stringify(result) : null, error, command_id, agent_id]
    );

    // Update policy execution history if this command is related to a policy
    await policySchedulerService.updateExecutionHistory(
      command_id,
      status,
      result,
      error
    );

    // Push to whoever's currently watching the dashboard so the modal
    // flips from "running" to "done" the moment the agent finishes.
    // We hit BOTH (a) admin sockets (any logged-in employee) AND
    // (b) the specific requester's socket if the requester is a
    // client — clients aren't in adminSockets so they'd otherwise
    // miss the event. Idempotent: a single connected admin who
    // happens to also be the requester only sees one event because
    // adminSockets and connectedUsers are tracked under different
    // socket sets.
    try {
      const cmdRow = await query(
        `SELECT command_type, requested_by FROM agent_commands WHERE id = $1`,
        [command_id]
      );
      const message = {
        type: 'agent.command.completed',
        data: {
          command_id,
          agent_id,
          command_type: cmdRow.rows[0]?.command_type,
          status,
          result,
          error,
          completed_at: new Date().toISOString(),
        },
      };
      websocketService.broadcastToAdmins(message);
      const requestedBy = cmdRow.rows[0]?.requested_by;
      if (requestedBy) {
        websocketService.broadcastToUser(requestedBy, message);
      }
    } catch (wsErr) {
      // Never let websocket failure block the result write — the row
      // is already persisted; the dashboard will catch up on next poll.
      console.error('agent.command.completed broadcast failed:', wsErr);
    }

    res.json({
      success: true,
      message: 'Command result received'
    });

  } catch (error) {
    console.error('Command result submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit command result',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Create Remote Command
 * POST /api/agents/:agent_id/commands
 *
 * Creates a command for the agent to execute. Authorized for:
 *   - Employees: any agent in the system (MSP admins / technicians)
 *   - Clients (business owners / agent owners): only agents in their
 *     own business (they can manage their own devices)
 *
 * Mirrors the access pattern used by GET /:agent_id/commands/list
 * above. The /commands route was originally employee-only; opened up
 * to clients in 2026-04-25 so the device owner can trigger
 * update_packages from the agent-magic-link dashboard view.
 */
router.post('/:agent_id/commands', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { command_type, command_params, requires_approval } = req.body;
    const isEmployee = req.user.role !== 'customer' && req.user.role !== 'client';

    if (!command_type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: command_type',
        code: 'MISSING_COMMAND_TYPE'
      });
    }

    // Verify agent exists. For non-employees we additionally constrain
    // to agents in the requester's own business so a client can only
    // act on their own devices.
    let accessQuery = 'SELECT id, business_id FROM agent_devices WHERE id = $1 AND soft_delete = false';
    const accessParams = [agent_id];
    if (!isEmployee) {
      accessQuery += ' AND business_id = $2';
      accessParams.push(req.user.business_id);
    }
    const agentResult = await query(accessQuery, accessParams);

    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    const commandId = uuidv4();
    const employeeId = req.user.id;

    // Create command
    await query(
      `INSERT INTO agent_commands (
        id,
        agent_device_id,
        command_type,
        command_params,
        requested_by,
        approval_required,
        approved_by,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        commandId,
        agent_id,
        command_type,
        command_params ? JSON.stringify(command_params) : null,
        employeeId,
        requires_approval || false,
        requires_approval ? null : employeeId, // Auto-approve if not required
        'pending'
      ]
    );

    res.json({
      success: true,
      message: 'Command created',
      data: {
        command_id: commandId,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('Create command error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create command',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
