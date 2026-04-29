/**
 * Client-side Health Check + Transparency endpoints.
 *
 * Lets a client business owner see what's being collected for THEIR own devices.
 * Tenant isolation is by business_id ownership of the agent_device — there is
 * no permission key required (any authenticated client of the owning business
 * may view their own agent's transparency report).
 *
 * Mounted at /api/client/agents in backend/server.js.
 *
 * See docs/PRPs/STAGE1_HEALTH_CHECKS.md.
 */
import express from 'express';
import { query } from '../../config/database.js';
import { authMiddleware } from '../../middleware/authMiddleware.js';

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/client/agents/:agent_id/health-checks
 * Client-side: latest health-check results for the caller's own device.
 */
router.get('/:agent_id/health-checks', async (req, res) => {
  try {
    const { agent_id } = req.params;
    const businessId = req.user?.business?.id;
    if (!businessId) {
      return res.status(403).json({ success: false, message: 'Client access only' });
    }

    // Verify the agent belongs to the caller's business.
    const { rows: ownership } = await query(
      'SELECT id FROM agent_devices WHERE id = $1 AND business_id = $2',
      [agent_id, businessId]
    );
    if (ownership.length === 0) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    const { rows } = await query(`
      SELECT check_type, severity, passed, payload, collected_at, reported_at
        FROM agent_check_results
       WHERE agent_device_id = $1
       ORDER BY check_type
    `, [agent_id]);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Client health-checks fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch health checks' });
  }
});

/**
 * GET /api/client/agents/:agent_id/transparency-report
 *
 * Returns a privacy-preserving summary of what the agent reports to the central
 * platform for this device: which check_types ran in the last 30 days, latest
 * severity, and last-reported timestamp. Does NOT include raw payloads — those
 * are accessible only via the latest-state endpoint above (which the client
 * already owns).
 */
router.get('/:agent_id/transparency-report', async (req, res) => {
  try {
    const { agent_id } = req.params;
    const businessId = req.user?.business?.id;
    if (!businessId) {
      return res.status(403).json({ success: false, message: 'Client access only' });
    }

    const { rows: ownership } = await query(
      'SELECT id, device_name FROM agent_devices WHERE id = $1 AND business_id = $2',
      [agent_id, businessId]
    );
    if (ownership.length === 0) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    const { rows: summary } = await query(`
      SELECT check_type,
             severity AS latest_severity,
             passed   AS latest_passed,
             collected_at AS latest_collected_at
        FROM agent_check_results
       WHERE agent_device_id = $1
       ORDER BY check_type
    `, [agent_id]);

    const { rows: changeCounts } = await query(`
      SELECT check_type, COUNT(*)::int AS change_count_30d
        FROM agent_check_history
       WHERE agent_device_id = $1
         AND collected_at >= now() - INTERVAL '30 days'
       GROUP BY check_type
    `, [agent_id]);
    const changeMap = Object.fromEntries(changeCounts.map(r => [r.check_type, r.change_count_30d]));

    res.json({
      success: true,
      data: {
        agent_id,
        device_name: ownership[0].device_name,
        checks_collected: summary.map(s => ({
          ...s,
          change_count_30d: changeMap[s.check_type] || 0
        }))
      }
    });
  } catch (error) {
    console.error('Transparency report fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transparency report' });
  }
});

export default router;
