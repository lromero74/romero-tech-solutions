// =============================================================================
// routes/patchApprovals.js — Stage 4 patch approval workflow
//
// Two routers exported:
//   * agentRouter     — POST / : agent ingests detected pending patches
//                       (mounted at /api/agents/:agent_id/patch-approvals/ingest)
//   * operatorRouter  — list pending + decide approve|defer|reject
//                       (mounted at /api/patch-approvals)
//
// Both routers MUST be mounted behind `stage4FeatureGate` in server.js so
// the entire feature class can be turned off via STAGE_4_ENABLED env var.
//
// Every state transition writes a row to agent_action_audit via
// actionAuditService.append — that's the tamper-evident trail.
// =============================================================================

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { authenticateAgent, requireAgentMatch } from '../middleware/agentAuthMiddleware.js';
import {
  validateAction,
  validateTransition,
  validatePackageManager,
  validateApprovalNotes,
  applyDecision
} from '../services/patchApprovalDecisions.js';
import * as actionAudit from '../services/actionAuditService.js';

const operatorRouter = express.Router();
const agentRouter = express.Router({ mergeParams: true });

// ============================================================================
// AGENT INGEST: POST /api/agents/:agent_id/patch-approvals/ingest
// ============================================================================
// Body: { patches: [{ patch_name, patch_version?, package_manager, is_security_patch? }, ...] }
//
// Upserts one row per (agent_device_id, patch_name, package_manager). Existing
// approved/deferred/rejected rows are preserved (we only touch detected_at on
// already-pending rows, so a re-detection doesn't reset the queue). Status
// stays 'pending' for new rows.
//
// Notes:
//   * Multi-tenancy: business_id is taken from req.agent.business_id (set by
//     authenticateAgent). Never from the body — that would let a compromised
//     agent seed rows under another tenant.
//   * authenticateAgent + requireAgentMatch are applied at the mount point,
//     not here, so the router can be tested with the source-lint pattern
//     without those imports leaking in.
agentRouter.post('/', async (req, res) => {
  try {
    const agentId = req.agent.id;
    const businessId = req.agent.business_id;
    const patches = Array.isArray(req.body?.patches) ? req.body.patches : null;

    if (!patches || patches.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_PATCHES',
        message: 'body.patches must be a non-empty array'
      });
    }
    if (patches.length > 500) {
      // Sanity cap. A box with 500+ pending patches is broken; cap protects DB.
      return res.status(400).json({
        success: false,
        code: 'TOO_MANY_PATCHES',
        message: 'patches array exceeds 500 entries — split into multiple posts'
      });
    }

    // Validate each entry up front; reject the whole batch if any are bad.
    for (let i = 0; i < patches.length; i++) {
      const p = patches[i];
      if (!p || typeof p.patch_name !== 'string' || p.patch_name.length === 0) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_PATCH_NAME',
          message: `patches[${i}].patch_name must be a non-empty string`
        });
      }
      const pmErr = validatePackageManager(p.package_manager);
      if (pmErr) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_PACKAGE_MANAGER',
          message: `patches[${i}]: ${pmErr}`
        });
      }
    }

    // Upsert — ON CONFLICT against the unique (agent_device_id, patch_name,
    // package_manager) constraint. Existing rows: keep status, refresh
    // patch_version + is_security_patch + detected_at (only if still pending).
    let inserted = 0;
    let refreshed = 0;
    for (const p of patches) {
      const result = await query(
        `INSERT INTO patch_approvals
           (id, agent_device_id, business_id, patch_name, patch_version,
            package_manager, is_security_patch, detected_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 'pending')
         ON CONFLICT (agent_device_id, patch_name, package_manager)
         DO UPDATE SET
           patch_version = COALESCE(EXCLUDED.patch_version, patch_approvals.patch_version),
           is_security_patch = COALESCE(EXCLUDED.is_security_patch, patch_approvals.is_security_patch),
           detected_at = CASE
             WHEN patch_approvals.status = 'pending' THEN NOW()
             ELSE patch_approvals.detected_at
           END
         RETURNING (xmax = 0) AS was_insert`,
        [
          uuidv4(),
          agentId,
          businessId,
          p.patch_name,
          p.patch_version || null,
          p.package_manager,
          p.is_security_patch === true
        ]
      );
      if (result.rows[0]?.was_insert) inserted++; else refreshed++;
    }

    res.json({ success: true, data: { inserted, refreshed, total: patches.length } });
  } catch (err) {
    console.error('Patch approvals ingest error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to ingest patch approvals',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ============================================================================
// OPERATOR: GET /api/patch-approvals — list pending
// ============================================================================
// Customers see only their business's pending rows; employees see all unless
// they pass ?business_id=X to scope down.
operatorRouter.get('/', authMiddleware, requirePermission('view.patch_approvals.enable'), async (req, res) => {
  try {
    const isEmployee = req.user.role !== 'customer';
    const params = [];
    let where = `pa.status = 'pending'`;
    if (!isEmployee) {
      params.push(req.user.business_id);
      where += ` AND pa.business_id = $${params.length}`;
    } else if (req.query.business_id) {
      params.push(req.query.business_id);
      where += ` AND pa.business_id = $${params.length}`;
    }

    const result = await query(
      `SELECT
         pa.id, pa.agent_device_id, pa.business_id,
         pa.patch_name, pa.patch_version, pa.package_manager,
         pa.is_security_patch, pa.detected_at, pa.status,
         ad.device_name, b.business_name
       FROM patch_approvals pa
       LEFT JOIN agent_devices ad ON ad.id = pa.agent_device_id
       LEFT JOIN businesses b     ON b.id = pa.business_id
       WHERE ${where}
       ORDER BY pa.is_security_patch DESC, pa.detected_at ASC
       LIMIT 500`,
      params
    );

    res.json({ success: true, data: { approvals: result.rows, count: result.rows.length } });
  } catch (err) {
    console.error('List patch approvals error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to list patch approvals',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ============================================================================
// OPERATOR: POST /api/patch-approvals/:id/decision
// ============================================================================
// Body: { action: 'approve'|'defer'|'reject', notes?: string }
//
// Validates action verb + state transition + notes length. Updates the row
// via the pure applyDecision mapper. Writes a hash-chained audit row.
operatorRouter.post(
  '/:id/decision',
  authMiddleware,
  requirePermission('manage.patch_approvals.enable'),
  async (req, res) => {
    try {
      const id = req.params.id;
      const action = req.body?.action;
      const notes = req.body?.notes;

      const actionErr = validateAction(action);
      if (actionErr) {
        return res.status(400).json({ success: false, code: 'INVALID_ACTION', message: actionErr });
      }
      const notesErr = validateApprovalNotes(notes);
      if (notesErr) {
        return res.status(400).json({ success: false, code: 'INVALID_NOTES', message: notesErr });
      }

      // Read current row for tenant scope check + transition validation.
      const currentResult = await query(
        `SELECT id, business_id, agent_device_id, patch_name, patch_version,
                package_manager, status
         FROM patch_approvals WHERE id = $1`,
        [id]
      );
      if (currentResult.rows.length === 0) {
        return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Patch approval not found' });
      }
      const row = currentResult.rows[0];

      // Tenant scope: customers can only decide their own business's rows.
      const isEmployee = req.user.role !== 'customer';
      if (!isEmployee && row.business_id !== req.user.business_id) {
        return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Cross-tenant access denied' });
      }

      const transitionErr = validateTransition(row.status, action);
      if (transitionErr) {
        return res.status(409).json({ success: false, code: 'INVALID_TRANSITION', message: transitionErr });
      }

      // Apply via the pure decision mapper — guarantees status + approver +
      // timestamp move together. No inline status writes anywhere else.
      const decision = applyDecision(action, {
        employeeId: req.session.userId,
        now: new Date(),
        notes
      });

      await query(
        `UPDATE patch_approvals
         SET status = $1, approved_by = $2, approved_at = $3, approval_notes = $4
         WHERE id = $5`,
        [decision.status, decision.approved_by, decision.approved_at, decision.approval_notes, id]
      );

      // Audit hook — every decision writes a chain row. action_type uses a
      // dotted namespace so an admin filtering for "patch.*" sees the lot.
      await actionAudit.append({
        actionType: `patch.${action}`,
        actorEmployeeId: req.session.userId,
        actorBusinessId: row.business_id,
        agentDeviceId: row.agent_device_id,
        payload: {
          patch_approval_id: id,
          patch_name: row.patch_name,
          patch_version: row.patch_version,
          package_manager: row.package_manager,
          previous_status: row.status,
          new_status: decision.status,
          notes: decision.approval_notes
        },
        sourceIp: req.ip,
        userAgent: req.headers['user-agent'] || null
      });

      res.json({ success: true, data: { id, status: decision.status } });
    } catch (err) {
      console.error('Patch approval decision error:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to record decision',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }
);

export { operatorRouter, agentRouter };
