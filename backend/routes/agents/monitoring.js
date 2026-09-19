import express from 'express';
import { logger } from '../../utils/logger.js';
import { query } from '../../config/database.js';
import { authenticateAgent, requireAgentMatch } from '../../middleware/agentAuthMiddleware.js';
import { authMiddleware, requireEmployee } from '../../middleware/authMiddleware.js';
import { requirePermission } from '../../middleware/permissionMiddleware.js';
import { websocketService } from '../../services/websocketService.js';
import { candleAggregationService } from '../../services/candleAggregationService.js';
import { alertEscalationService } from '../../services/alertEscalationService.js';
import { getLatestForecast, getDiskHistory, forecastSeverity } from '../../services/diskForecastService.js';
import { getBaselines } from '../../services/anomalyDetectionService.js';
import { getHistory as getWanIpHistory } from '../../services/wanIpService.js';
import { getSmartTrend } from '../../services/smartTrendService.js';

const router = express.Router();

// =============================================================================
// Stage 1 Health Checks — see docs/PRPs/STAGE1_HEALTH_CHECKS.md
//   POST /:agent_id/check-result            (agent → backend, agent JWT)
//   GET  /:agent_id/health-checks           (employee, requires permission)
//   GET  /:agent_id/health-checks/:check_type/history  (employee, requires permission)
// Client transparency endpoint lives at /api/client/agents/:agent_id/transparency-report
// (separate router, gated by business_id ownership instead of permission key).
// =============================================================================

const VALID_CHECK_TYPES = new Set([
  // Stage 1
  'reboot_pending', 'time_drift', 'crashdumps', 'top_processes',
  'listening_ports', 'update_history_failures', 'domain_status', 'mapped_drives',
  // Stage 2.4 / 2.5 / 2.6
  'battery_health', 'power_policy', 'gpu_status',
  // Stage 3.7 / 3.5 / 3.2
  'certificate_expiry', 'scheduled_tasks', 'peripherals',
  // Stage 3.6 / 3.3 / 3.4
  'logon_history', 'browser_extensions', 'license_keys'
]);

router.post('/:agent_id/check-result', authenticateAgent, requireAgentMatch, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { check_type, severity, passed, payload, collected_at } = req.body;

    if (!check_type || typeof check_type !== 'string' || !VALID_CHECK_TYPES.has(check_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing check_type',
        code: 'INVALID_CHECK_TYPE'
      });
    }
    if (payload === undefined || payload === null) {
      return res.status(400).json({
        success: false,
        message: 'Missing payload',
        code: 'MISSING_PAYLOAD'
      });
    }
    const sev = ['info', 'warning', 'critical'].includes(severity) ? severity : 'info';

    // No per-check gating here — the subscription model is per-device-count,
    // not per-feature. Quota enforcement lives at registration time. Every
    // device that successfully authed gets every check_type.

    // Look up business_id (denormalized into the row for tenant isolation).
    const { rows: agentRows } = await query(
      'SELECT business_id, device_name, status FROM agent_devices WHERE id = $1',
      [agent_id]
    );
    if (agentRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    const business_id = agentRows[0].business_id;

    // Compare to previous to drive change-only history inserts.
    const { rows: prevRows } = await query(
      `SELECT payload FROM agent_check_results
        WHERE agent_device_id = $1 AND check_type = $2`,
      [agent_id, check_type]
    );
    const previous = prevRows[0]?.payload ?? null;

    // Upsert latest snapshot.
    const collectedTimestamp = collected_at ? new Date(collected_at) : new Date();
    await query(`
      INSERT INTO agent_check_results
        (agent_device_id, business_id, check_type, severity, passed, payload, collected_at, reported_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, now())
      ON CONFLICT (agent_device_id, check_type) DO UPDATE
        SET severity = EXCLUDED.severity,
            passed = EXCLUDED.passed,
            payload = EXCLUDED.payload,
            collected_at = EXCLUDED.collected_at,
            reported_at = now()
    `, [agent_id, business_id, check_type, sev, !!passed, JSON.stringify(payload), collectedTimestamp]);

    // Append to history only on payload change (bounds growth by churn rate).
    const payloadChanged = !previous || JSON.stringify(previous) !== JSON.stringify(payload);
    if (payloadChanged) {
      await query(`
        INSERT INTO agent_check_history
          (agent_device_id, business_id, check_type, severity, passed, payload, collected_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [agent_id, business_id, check_type, sev, !!passed, JSON.stringify(payload), collectedTimestamp]);
    }

    // Live broadcast for the admin Health Checks tab.
    if (websocketService && websocketService.io) {
      websocketService.io.emit('agent-check-result', {
        agentId: agent_id,
        businessId: business_id,
        deviceName: agentRows[0].device_name,
        checkType: check_type,
        severity: sev,
        passed: !!passed,
        payload,
        collectedAt: collectedTimestamp.toISOString(),
        changed: payloadChanged
      });
    }

    // Fire alert pipeline for warning/critical (deduped 4h, opt-in subscribers
    // via alert_subscribers / client_alert_subscriptions). Async — failures here
    // never block the check_result write path.
    if (sev === 'warning' || sev === 'critical') {
      alertEscalationService.processHealthCheckResult({
        agent_device_id: agent_id,
        business_id,
        check_type,
        severity: sev,
        payload,
        device_name: agentRows[0].device_name,
      }).catch(err => {
        logger.error(`❌ processHealthCheckResult failed for agent ${agent_id} check ${check_type}:`, err);
      });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Agent check-result upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to ingest check result',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/:agent_id/health-checks',
  authMiddleware,
  requirePermission('view.agent_health_checks.enable'),
  async (req, res) => {
    try {
      const { agent_id } = req.params;
      const { rows } = await query(`
        SELECT check_type, severity, passed, payload, collected_at, reported_at
          FROM agent_check_results
         WHERE agent_device_id = $1
         ORDER BY check_type
      `, [agent_id]);
      res.json({ success: true, data: rows });
    } catch (error) {
      logger.error('Health checks fetch error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch health checks' });
    }
  }
);

router.get('/:agent_id/health-checks/:check_type/history',
  authMiddleware,
  requirePermission('view.agent_health_checks.enable'),
  async (req, res) => {
    try {
      const { agent_id, check_type } = req.params;
      if (!VALID_CHECK_TYPES.has(check_type)) {
        return res.status(400).json({ success: false, message: 'Invalid check_type' });
      }
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
      const { rows } = await query(`
        SELECT severity, passed, payload, collected_at
          FROM agent_check_history
         WHERE agent_device_id = $1
           AND check_type = $2
           AND collected_at >= now() - ($3::int || ' days')::interval
         ORDER BY collected_at DESC
         LIMIT 200
      `, [agent_id, check_type, days]);
      res.json({ success: true, data: rows });
    } catch (error) {
      logger.error('Health check history fetch error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch history' });
    }
  }
);

// =============================================================================
// Stage 2 — Trends / Forecast / Baseline read endpoints
// See docs/PRPs/STAGE2_TRENDS.md.
// =============================================================================

router.get('/:agent_id/disk-forecast',
  authMiddleware,
  requirePermission('view.agent_disk_forecast.enable'),
  async (req, res) => {
    try {
      const { agent_id } = req.params;
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
      const [forecast, history] = await Promise.all([
        getLatestForecast(agent_id),
        getDiskHistory(agent_id, days),
      ]);
      const severity = forecast ? forecastSeverity(forecast.days_until_full) : null;
      res.json({ success: true, data: { forecast, history, severity } });
    } catch (error) {
      logger.error('Disk forecast fetch error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch disk forecast' });
    }
  }
);

router.get('/:agent_id/baselines',
  authMiddleware,
  requirePermission('view.agent_trends.enable'),
  async (req, res) => {
    try {
      const { agent_id } = req.params;
      const baselines = await getBaselines(agent_id);
      res.json({ success: true, data: baselines });
    } catch (error) {
      logger.error('Baselines fetch error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch baselines' });
    }
  }
);

router.get('/:agent_id/wan-ip-history',
  authMiddleware,
  requirePermission('view.agent_trends.enable'),
  async (req, res) => {
    try {
      const { agent_id } = req.params;
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
      const rows = await getWanIpHistory(agent_id, limit);
      res.json({ success: true, data: rows });
    } catch (error) {
      logger.error('WAN IP history fetch error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch WAN IP history' });
    }
  }
);

router.get('/:agent_id/smart-trend',
  authMiddleware,
  requirePermission('view.agent_trends.enable'),
  async (req, res) => {
    try {
      const { agent_id } = req.params;
      const trend = await getSmartTrend(agent_id);
      res.json({ success: true, data: trend });
    } catch (error) {
      logger.error('SMART trend fetch error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch SMART trend' });
    }
  }
);

// AGGREGATION LEVEL CONFIGURATION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get Aggregation Level Information
 * GET /api/agents/aggregation-levels
 *
 * Returns available aggregation levels with descriptions
 */
router.get('/aggregation-levels', authMiddleware, async (req, res) => {
  try {
    const levels = candleAggregationService.getAggregationLevelInfo();

    res.json({
      success: true,
      data: levels
    });

  } catch (error) {
    logger.error('Get aggregation levels error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve aggregation levels',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Update Agent Aggregation Level
 * PUT /api/agents/:agent_id/aggregation-level
 *
 * Sets the alert aggregation level for a specific agent device
 * Clients can only update their own devices
 * Pass null to remove override and use user default
 */
router.put('/:agent_id/aggregation-level', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { aggregation_level } = req.body;
    const isEmployee = req.user.role !== 'customer' && req.user.role !== 'client';

    logger.debug(`⚙️  UPDATE aggregation level: agent=${agent_id}, level=${aggregation_level}, user=${req.user.email}`);

    // Verify ownership/access to this agent
    let accessCheckQuery = `
      SELECT ad.id, ad.business_id, ad.device_name, ad.trial_user_id, ad.is_trial
      FROM agent_devices ad
      WHERE ad.id = $1 AND ad.soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      // For clients: Check if this is a trial agent owned by the user OR a regular agent in their business
      accessCheckQuery += ' AND (ad.trial_user_id = $2 OR ad.business_id = $3)';
      accessParams.push(req.user.id);
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

    // Update aggregation level
    const updated = await candleAggregationService.updateAgentAggregationLevel(
      agent_id,
      aggregation_level
    );

    res.json({
      success: true,
      message: 'Aggregation level updated successfully',
      data: updated
    });

  } catch (error) {
    logger.error('Update agent aggregation level error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update aggregation level',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get Agent Aggregation Settings
 * GET /api/agents/:agent_id/aggregation-settings
 *
 * Returns current aggregation settings for an agent
 */
router.get('/:agent_id/aggregation-settings', authMiddleware, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const isEmployee = req.user.role !== 'customer' && req.user.role !== 'client';

    // Verify ownership/access to this agent
    let accessCheckQuery = `
      SELECT
        ad.id,
        ad.device_name,
        ad.alert_aggregation_level as device_override,
        u.default_alert_aggregation_level as user_default,
        COALESCE(ad.alert_aggregation_level, u.default_alert_aggregation_level, 'raw') as effective_level
      FROM agent_devices ad
      LEFT JOIN users u ON ad.trial_user_id = u.id OR (ad.business_id = u.business_id AND u.is_primary_contact = true)
      WHERE ad.id = $1 AND ad.soft_delete = false
    `;
    const accessParams = [agent_id];

    if (!isEmployee) {
      // For clients: Check if this is a trial agent owned by the user OR a regular agent in their business
      accessCheckQuery += ' AND (ad.trial_user_id = $2 OR ad.business_id = $3)';
      accessParams.push(req.user.id);
      accessParams.push(req.user.business_id);
    }

    const result = await query(accessCheckQuery, accessParams);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found or access denied',
        code: 'AGENT_NOT_FOUND'
      });
    }

    const settings = result.rows[0];

    res.json({
      success: true,
      data: {
        agent_id: agent_id,
        device_name: settings.device_name,
        device_override: settings.device_override,
        user_default: settings.user_default,
        effective_level: settings.effective_level
      }
    });

  } catch (error) {
    logger.error('Get agent aggregation settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve aggregation settings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Backfill Candles for Agent
 * POST /api/agents/:agent_id/backfill-candles
 *
 * Backfill historical candles for an agent (employee only)
 * Used when enabling aggregated alerting for the first time
 */
router.post('/:agent_id/backfill-candles', authMiddleware, requireEmployee, async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { days_back = 7 } = req.body;

    logger.debug(`📦 BACKFILL CANDLES: agent=${agent_id}, days=${days_back}, user=${req.user.email}`);

    // Verify agent exists
    const agentResult = await query(
      `SELECT id, device_name FROM agent_devices WHERE id = $1 AND soft_delete = false`,
      [agent_id]
    );

    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found',
        code: 'AGENT_NOT_FOUND'
      });
    }

    // Trigger backfill
    const summary = await candleAggregationService.backfillCandlesForAgent(agent_id, days_back);

    res.json({
      success: true,
      message: 'Candle backfill completed',
      data: summary
    });

  } catch (error) {
    logger.error('Backfill candles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to backfill candles',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get vulnerability advisories for a package version range
 * GET /api/agents/packages/vulnerabilities?ecosystem=PyPI&package=X&from_version=A&to_version=B
 *
 * Used by the dashboard's "click on Latest version → see what's
 * changed / what CVEs were patched" flow. Backed by OSV.dev's free
 * /v1/query API — covers PyPI / npm / Go / Maven / RubyGems / Crates /
 * Packagist / Linux distros (Debian, Ubuntu, Alpine, Rocky, etc.) /
 * NPM / OSS-Fuzz. Returns vulnerabilities affecting any version
 * `> from_version` and `<= to_version` so the user sees what they're
 * gaining by updating.
 *
 * In-memory cache keyed on (ecosystem, package, from, to) with 1h TTL
 * to keep us a polite OSV.dev citizen — the free tier doesn't ratelimit
 * but published etiquette is "cache aggressively".
 */
const osvCache = new Map(); // key → { fetchedAt: ms, payload }
const OSV_TTL_MS = 60 * 60 * 1000;

router.get('/packages/vulnerabilities', authMiddleware, async (req, res) => {
  try {
    const { ecosystem, package: pkgName, from_version, to_version } = req.query;
    if (!ecosystem || !pkgName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required query params: ecosystem, package',
      });
    }

    const cacheKey = `${ecosystem}|${pkgName}|${from_version || ''}|${to_version || ''}`;
    const cached = osvCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < OSV_TTL_MS) {
      return res.json(cached.payload);
    }

    // OSV /v1/query — sending package alone returns ALL vulns ever
    // recorded for that package; we filter client-side by the version
    // range below. Sending {version: from} narrows to "what affects
    // this version" but we want the diff, not the snapshot.
    const osvBody = { package: { ecosystem, name: pkgName } };
    const osvResp = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(osvBody),
    });
    if (!osvResp.ok) {
      const text = await osvResp.text();
      return res.status(502).json({
        success: false,
        message: `OSV.dev returned ${osvResp.status}`,
        detail: text.slice(0, 500),
      });
    }
    const osvData = await osvResp.json();
    const allVulns = Array.isArray(osvData.vulns) ? osvData.vulns : [];

    // Filter to vulnerabilities whose `affected[].ranges[].events`
    // intersect (from_version, to_version]. OSV's range model is
    // event-stream; rather than reimplement semver semantics here we
    // keep it lenient: include the vuln if ANY of its `affected`
    // entries lists from_version or any version literally between
    // them, OR if from_version isn't supplied (return everything).
    const fromV = from_version ? String(from_version) : null;
    const toV = to_version ? String(to_version) : null;

    // Lightweight filtering — OSV format is rich enough that doing
    // bulletproof range-intersection client-side is its own project.
    // For v1 we return all vulns that mention from_version in their
    // affected ranges as "introduced" or "fixed", AND we leave the
    // rest out only when from_version is set; that's a useful
    // approximation for "what changed between A and B?".
    const filtered = !fromV
      ? allVulns
      : allVulns.filter(v => {
          if (!Array.isArray(v.affected)) return true; // be inclusive on uncertain shape
          for (const a of v.affected) {
            if (!Array.isArray(a.ranges)) continue;
            for (const r of a.ranges) {
              if (!Array.isArray(r.events)) continue;
              for (const e of r.events) {
                // OSV "fixed" events for the to_version side — vulnerabilities
                // patched in or before our target are exactly what we want.
                if (e.fixed && toV && versionLte(e.fixed, toV)) return true;
                if (e.introduced && fromV && versionLte(e.introduced, toV)) return true;
              }
            }
          }
          return false;
        });

    // Trim each vuln to a UI-friendly subset; full CVE blob is huge.
    const trimmed = filtered.map(v => ({
      id: v.id,
      summary: v.summary || '',
      details: v.details || '',
      severity: v.severity || [],
      aliases: Array.isArray(v.aliases) ? v.aliases : [],
      references: Array.isArray(v.references) ? v.references.map(r => ({ type: r.type, url: r.url })) : [],
      published: v.published,
      modified: v.modified,
    }));

    const payload = {
      success: true,
      data: {
        ecosystem, package: pkgName, from_version: fromV, to_version: toV,
        count: trimmed.length, vulnerabilities: trimmed,
      },
    };
    osvCache.set(cacheKey, { fetchedAt: Date.now(), payload });
    return res.json(payload);
  } catch (error) {
    logger.error('OSV vulnerability lookup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to look up vulnerabilities',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// versionLte does a tolerant lexicographic-with-numeric-promotion
// compare. OSV often sends pre-release / build-metadata strings that
// strict semver libraries reject; for our display-only "did the patch
// land before our target?" query, this approximation is adequate.
function versionLte(a, b) {
  const partsA = String(a).split(/[.\-+]/).map(p => /^\d+$/.test(p) ? parseInt(p, 10) : p);
  const partsB = String(b).split(/[.\-+]/).map(p => /^\d+$/.test(p) ? parseInt(p, 10) : p);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const x = partsA[i] === undefined ? 0 : partsA[i];
    const y = partsB[i] === undefined ? 0 : partsB[i];
    if (typeof x === typeof y) {
      if (x < y) return true;
      if (x > y) return false;
    } else {
      // Mixed types: numeric is "less than" string (1 < "1.0-alpha")
      if (typeof x === 'number') return true;
      if (typeof y === 'number') return false;
    }
  }
  return true; // equal
}

export default router;
