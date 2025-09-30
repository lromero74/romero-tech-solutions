import express from 'express';
import { query } from '../../config/database.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import { requirePermission } from '../../middleware/permissionMiddleware.js';

const router = express.Router();

/**
 * GET /api/admin/permission-audit-log
 * Fetch permission audit log entries
 * Only accessible by Executive role
 */
router.get(
  '/',
  authMiddleware,
  requirePermission('view.permission_audit_log.enable'),
  async (req, res) => {
    try {
      const result = await query(`
        SELECT
          pal.id,
          pal.employee_id,
          e.first_name || ' ' || e.last_name AS employee_name,
          e.email AS employee_email,
          pal.permission_key,
          pal.result,
          pal.ip_address,
          pal.user_agent,
          pal.created_at
        FROM permission_audit_log pal
        LEFT JOIN employees e ON pal.employee_id = e.id
        ORDER BY pal.created_at DESC
        LIMIT 10000
      `);

      res.json({
        success: true,
        auditLogs: result.rows
      });
    } catch (error) {
      console.error('Error fetching permission audit log:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch permission audit log',
        error: error.message
      });
    }
  }
);

export default router;