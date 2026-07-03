/**
 * ZenithGrid software licensing -- admin CRUD (issue/revoke/list manual
 * licenses; view all licenses regardless of source).
 *
 * First slice of Phase 3 of ZenithGrid's executable-licensing PRP
 * (zenith-grid repo, docs/PRPs/executable-licensing.md). Self-serve
 * Stripe-sourced licenses are created by webhook sync (a later slice) --
 * this file covers manual issuance (comps/resellers/enterprise deals) and
 * status management for licenses of either source.
 *
 * No admin frontend page in this slice -- deliberately deferred until the
 * Stripe-driven path exists too, so the page reflects both source types at
 * once instead of needing a follow-up redesign.
 */
import express from 'express';
import crypto from 'crypto';
import { authMiddleware, requireEmployee } from '../../middleware/authMiddleware.js';
import { requirePermission } from '../../middleware/permissionMiddleware.js';
import { query } from '../../config/database.js';

const router = express.Router();

router.use(authMiddleware);
router.use(requireEmployee);

function generateLicenseKey() {
  // ZG-XXXX-XXXX-XXXX-XXXX, uppercase hex groups.
  const groups = Array.from({ length: 4 }, () => crypto.randomBytes(2).toString('hex').toUpperCase());
  return `ZG-${groups.join('-')}`;
}

/**
 * GET /api/admin/zenithgrid-licenses
 *
 * List all licenses (both sources) with their current activation, if any.
 */
router.get('/', requirePermission('manage.zenithgrid_licenses.enable'), async (req, res) => {
  try {
    const result = await query(`
      SELECT l.id, l.user_id, l.license_key, l.source, l.stripe_subscription_id,
             l.plan_name, l.status, l.expires_at, l.notes, l.created_at, l.updated_at,
             a.hardware_fingerprint AS active_fingerprint, a.device_name AS active_device_name,
             a.activated_at AS active_activated_at, a.last_heartbeat_at AS active_last_heartbeat_at
        FROM zenithgrid_licenses l
        LEFT JOIN zenithgrid_license_activations a
          ON a.license_id = l.id AND a.deactivated_at IS NULL
       ORDER BY l.created_at DESC
    `);
    res.json({ success: true, licenses: result.rows });
  } catch (error) {
    console.error('❌ Error listing ZenithGrid licenses:', error);
    res.status(500).json({ success: false, message: 'Failed to list licenses' });
  }
});

/**
 * POST /api/admin/zenithgrid-licenses
 *
 * Issue a manual license (comp/reseller/enterprise). Stripe-sourced
 * licenses are created by webhook sync, not this endpoint.
 */
router.post('/', requirePermission('manage.zenithgrid_licenses.enable'), async (req, res) => {
  try {
    const { user_id, plan_name, expires_at, notes } = req.body;
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'user_id is required' });
    }

    const licenseKey = generateLicenseKey();
    const result = await query(
      `INSERT INTO zenithgrid_licenses (user_id, license_key, source, plan_name, expires_at, notes)
       VALUES ($1, $2, 'manual', $3, $4, $5)
       RETURNING id, license_key, source, plan_name, status, expires_at, notes, created_at`,
      [user_id, licenseKey, plan_name || 'standard', expires_at || null, notes || null]
    );

    console.log(`✅ Manual ZenithGrid license issued: ${licenseKey} for user ${user_id}`);
    res.status(201).json({ success: true, license: result.rows[0] });
  } catch (error) {
    console.error('❌ Error issuing ZenithGrid license:', error);
    res.status(500).json({ success: false, message: 'Failed to issue license' });
  }
});

/**
 * PATCH /api/admin/zenithgrid-licenses/:id
 *
 * Revoke, suspend, reactivate, or extend a license of either source.
 */
router.patch('/:id', requirePermission('manage.zenithgrid_licenses.enable'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, expires_at, notes } = req.body;

    if (status && !['active', 'suspended', 'revoked', 'expired'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const result = await query(
      `UPDATE zenithgrid_licenses
          SET status = COALESCE($2, status),
              expires_at = COALESCE($3, expires_at),
              notes = COALESCE($4, notes),
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, license_key, source, plan_name, status, expires_at, notes, updated_at`,
      [id, status || null, expires_at || null, notes || null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'License not found' });
    }

    console.log(`✅ ZenithGrid license updated: ${result.rows[0].license_key} -> status=${result.rows[0].status}`);
    res.json({ success: true, license: result.rows[0] });
  } catch (error) {
    console.error('❌ Error updating ZenithGrid license:', error);
    res.status(500).json({ success: false, message: 'Failed to update license' });
  }
});

export default router;
