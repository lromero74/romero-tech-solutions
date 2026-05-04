import express from 'express';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { promisify } from 'util';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { getSecurityStats, SECURITY_EVENTS } from '../utils/securityMonitoring.js';
import { validateEnvironmentConfig, validateDatabaseSecurity } from '../utils/productionHardening.js';

const router = express.Router();
const execFileAsync = promisify(execFile);

// fail2ban jails this UI exposes. The first two are RTS-app-emitted —
// soft (1h) for behavior issues, hard (2y) for adversarial events.
// nginx-exploit / nginx-bad-request are shared OS-wide jails (any site
// behind nginx including RTS). sshd protects the host itself (key-only
// auth — any password attempt = ban). Names must match exactly what's
// in /etc/fail2ban/jail.local.
const RTS_RELEVANT_JAILS = [
  'romerotechsolutions-intrusion-hard',
  'romerotechsolutions-intrusion-soft',
  'nginx-exploit',
  'nginx-bad-request',
  'sshd',
];

// Strict pattern guards in addition to the sudoers constraints. We never
// concatenate user input into a shell — execFile with array args. This
// regex still bounds what we'll even pass.
const JAIL_NAME_RE = /^[a-z][a-zA-Z0-9-]{0,63}$/;
const IPV4_RE = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

// Distrobox bridge: when running inside an rts-box distrobox on fedora.local,
// fail2ban-client lives on the host (the binary isn't installed in the
// container, and the unix socket isn't bind-mounted). distrobox-host-exec
// routes the call back to the host. On testbot / non-distrobox the prefix is
// empty and execFile invokes sudo + fail2ban-client directly.
const F2B_CMD_PREFIX = (
  process.env.CONTAINER_ID && existsSync('/usr/bin/distrobox-host-exec')
) ? ['/usr/bin/distrobox-host-exec'] : [];

const runFail2banClient = async (args) => {
  // sudo -n: never prompt; rely on the NOPASSWD entry in
  // /etc/sudoers.d/romero-fail2ban being present.
  const cmd = [...F2B_CMD_PREFIX, 'sudo', '-n', '/usr/bin/fail2ban-client', ...args];
  const { stdout, stderr } = await execFileAsync(cmd[0], cmd.slice(1), {
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  return { stdout, stderr };
};

// Parse `fail2ban-client status <jail>` output.
//   Status for the jail: <jail>
//   |- Filter
//   |  |- Currently failed: N
//   |  |- Total failed:     N
//   |  `- File list:        <path>
//   `- Actions
//      |- Currently banned: N
//      |- Total banned:     N
//      `- Banned IP list:   1.2.3.4 5.6.7.8
const parseJailStatus = (stdout) => {
  const grab = (label) => {
    const m = stdout.match(new RegExp(`^\\s*[|\`-]+\\s*${label}:\\s*(.*)$`, 'm'));
    return m ? m[1].trim() : '';
  };
  const currentlyFailed = parseInt(grab('Currently failed') || '0', 10);
  const totalFailed = parseInt(grab('Total failed') || '0', 10);
  const currentlyBanned = parseInt(grab('Currently banned') || '0', 10);
  const totalBanned = parseInt(grab('Total banned') || '0', 10);
  const fileList = grab('File list');
  const ipsRaw = grab('Banned IP list');
  const bannedIps = ipsRaw ? ipsRaw.split(/\s+/).filter(Boolean) : [];
  return { currentlyFailed, totalFailed, currentlyBanned, totalBanned, fileList, bannedIps };
};

/**
 * Security monitoring and administration routes
 * Protected by admin authentication
 */

// GET /api/security/stats - Get security statistics
router.get('/stats', authMiddleware, requirePermission('manage.security_sessions.enable'), async (req, res) => {
  try {
    const stats = getSecurityStats();

    res.status(200).json({
      success: true,
      message: 'Security statistics retrieved successfully',
      data: stats
    });
  } catch (error) {
    console.error('Error retrieving security stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve security statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/security/health - Comprehensive security health check
router.get('/health', authMiddleware, requirePermission('manage.security_sessions.enable'), async (req, res) => {
  try {
    console.log('🔍 Admin requested security health check');

    // Environment validation
    const envValidation = validateEnvironmentConfig();

    // Database security validation
    const dbValidation = await validateDatabaseSecurity();

    // Security statistics
    const securityStats = getSecurityStats();

    // Overall health assessment
    const overallHealth = {
      status: (envValidation.valid && dbValidation.valid) ? 'healthy' : 'warning',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    };

    const healthReport = {
      overall: overallHealth,
      environment: envValidation,
      database: dbValidation,
      monitoring: securityStats,
      recommendations: [
        ...envValidation.recommendations || [],
        ...dbValidation.recommendations || []
      ]
    };

    res.status(200).json({
      success: true,
      message: 'Security health check completed',
      data: healthReport
    });

  } catch (error) {
    console.error('Error performing security health check:', error);
    res.status(500).json({
      success: false,
      message: 'Security health check failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/security/events - Get recent security events (admin only)
router.get('/events', authMiddleware, requirePermission('manage.security_sessions.enable'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const eventType = req.query.type; // Optional filter by event type

    // In a production system, this would query a database
    // For now, return mock data structure
    const events = {
      total: 0,
      events: [],
      eventTypes: Object.values(SECURITY_EVENTS),
      message: 'Security event logging is active but no events stored in current session'
    };

    res.status(200).json({
      success: true,
      message: 'Security events retrieved successfully',
      data: events
    });

  } catch (error) {
    console.error('Error retrieving security events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve security events',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/security/test-alert - Test security alerting system (development only)
router.post('/test-alert', authMiddleware, requirePermission('manage.security_sessions.enable'), async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Alert testing is not available in production'
      });
    }

    const { alertType = 'TEST_ALERT', testData = {} } = req.body;

    // Import and trigger test alert
    const { logSecurityEvent } = await import('../utils/securityMonitoring.js');

    logSecurityEvent(alertType, {
      ...testData,
      test: true,
      triggeredBy: req.user.email,
      timestamp: new Date().toISOString()
    }, req);

    res.status(200).json({
      success: true,
      message: `Test security alert (${alertType}) triggered successfully`,
      data: {
        alertType,
        testData,
        triggeredBy: req.user.email
      }
    });

  } catch (error) {
    console.error('Error triggering test alert:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger test alert',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/security/jails - list status of every jail relevant to RTS.
// Returns banned IP lists + counts so the admin Security tab can render
// the same info ZenithGrid + sister sites surface.
router.get('/jails', authMiddleware, requirePermission('manage.security_sessions.enable'), async (req, res) => {
  try {
    const jails = [];
    for (const jail of RTS_RELEVANT_JAILS) {
      try {
        const { stdout } = await runFail2banClient(['status', jail]);
        jails.push({
          jail,
          available: true,
          ...parseJailStatus(stdout),
        });
      } catch (err) {
        // fail2ban-client returns non-zero if a jail isn't loaded — surface
        // that to the UI rather than 500-ing the whole list.
        jails.push({
          jail,
          available: false,
          error: (err.stderr || err.message || '').toString().split('\n')[0].slice(0, 200),
        });
      }
    }
    res.json({ success: true, data: { jails } });
  } catch (error) {
    console.error('Error listing fail2ban jails:', error);
    res.status(500).json({ success: false, message: 'Failed to list jails' });
  }
});

// POST /api/security/jails/:jail/unban - body: { ip }
// Validates jail + IP shape, then runs fail2ban-client set <jail> unbanip <ip>.
router.post('/jails/:jail/unban', authMiddleware, requirePermission('manage.security_sessions.enable'), async (req, res) => {
  const { jail } = req.params;
  const { ip } = req.body || {};

  if (!JAIL_NAME_RE.test(jail) || !RTS_RELEVANT_JAILS.includes(jail)) {
    return res.status(400).json({ success: false, message: 'Unknown jail' });
  }
  if (!ip || !IPV4_RE.test(ip)) {
    return res.status(400).json({ success: false, message: 'Invalid IPv4 address' });
  }

  try {
    const { stdout } = await runFail2banClient(['set', jail, 'unbanip', ip]);
    // fail2ban-client prints "1" on success (number unbanned) or "0" if not banned.
    const unbanned = parseInt(stdout.trim(), 10) > 0;
    console.log(`🔓 Unban ${ip} from ${jail} by ${req.user?.email || 'unknown'}: ${unbanned ? 'success' : 'not banned'}`);
    res.json({ success: true, data: { jail, ip, unbanned, output: stdout.trim() } });
  } catch (error) {
    console.error(`Error unbanning ${ip} from ${jail}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to unban IP',
      error: process.env.NODE_ENV === 'development' ? (error.stderr || error.message) : undefined,
    });
  }
});

export default router;