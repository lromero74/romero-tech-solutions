import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/permissionMiddleware.js';
import { getSecurityStats, SECURITY_EVENTS } from '../utils/securityMonitoring.js';
import { validateEnvironmentConfig, validateDatabaseSecurity } from '../utils/productionHardening.js';

const router = express.Router();

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

export default router;