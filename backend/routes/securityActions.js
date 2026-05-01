// =============================================================================
// routes/securityActions.js — Stage 4 M4 security action panel
//
// Single route:
//   POST /api/agents/:agent_id/security-action  body: {capability, action}
//
// Issues an agent_commands row (command_type='security_action') that the
// agent picks up via its existing commands poller. The agent dispatches by
// (capability, action, runtime.GOOS, distro) to the right OS-level call.
//
// All Stage 4 routes sit behind stage4FeatureGate (mounted in server.js).
// This route additionally requires the operator session + the
// manage.security_actions.enable permission, plus a tenant-isolation check
// against the targeted agent's business.
//
// Every successful request appends a hash-chained audit row.
// =============================================================================

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { validateSecurityAction } from '../services/securityActionValidator.js';
import * as actionAudit from '../services/actionAuditService.js';

const router = express.Router();

router.post(
  '/:agent_id/security-action',
  authMiddleware,
  requirePermission('manage.security_actions.enable'),
  async (req, res) => {
    try {
      const agentId = req.params.agent_id;
      const capability = req.body?.capability;
      const action = req.body?.action;

      const validationErr = validateSecurityAction(capability, action);
      if (validationErr) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_SECURITY_ACTION',
          message: validationErr
        });
      }

      // Tenant isolation: load the agent row and verify ownership.
      // Employees (admin / executive / etc.) can act on any agent; customers
      // can only act on agents in their own business.
      const agentResult = await query(
        `SELECT id, device_name, business_id, os_type
         FROM agent_devices WHERE id = $1 AND soft_delete = false`,
        [agentId]
      );
      if (agentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          code: 'AGENT_NOT_FOUND',
          message: 'Agent not found'
        });
      }
      const agent = agentResult.rows[0];

      const isEmployee = req.user.role !== 'customer';
      if (!isEmployee && agent.business_id !== req.user.business_id) {
        return res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Cross-tenant access denied'
        });
      }

      // Issue the command. command_params carries capability+action; the
      // agent reads runtime.GOOS itself for distro selection (we don't try
      // to second-guess what binary it should run).
      const commandId = uuidv4();
      const employeeId = req.session.userId;

      await query(
        `INSERT INTO agent_commands (
           id, agent_device_id, command_type, command_params,
           status, requested_by, approved_by, requires_approval
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          commandId,
          agentId,
          'security_action',
          JSON.stringify({ capability, action }),
          'pending',
          employeeId,
          employeeId, // operator-initiated and self-approved at issue time
          false
        ]
      );

      // Audit hook — every issued command writes a chain row. action_type
      // uses a dotted namespace so admins can filter "security_action.*".
      await actionAudit.append({
        actionType: `security_action.${capability}.${action}`,
        actorEmployeeId: employeeId,
        actorBusinessId: agent.business_id,
        agentDeviceId: agentId,
        payload: {
          capability,
          action,
          command_id: commandId,
          device_name: agent.device_name,
          os_type: agent.os_type
        },
        sourceIp: req.ip,
        userAgent: req.headers['user-agent'] || null
      });

      return res.json({
        success: true,
        data: {
          command_id: commandId,
          agent_id: agentId,
          capability,
          action,
          status: 'pending'
        }
      });
    } catch (err) {
      console.error('Security action error:', err);
      return res.status(500).json({
        success: false,
        message: 'Failed to issue security action',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }
);

export default router;
