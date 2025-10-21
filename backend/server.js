import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { doubleCsrf } from 'csrf-csrf';
import { testConnection } from './config/database.js';

// Import routes
import clientRegistrationRoutes from './routes/clientRegistration.js';
import uploadRoutes from './routes/uploads.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import adminWorkflowConfigRoutes from './routes/admin/workflowConfiguration.js';
import adminInvoiceRoutes from './routes/admin/invoices.js';
import locationRoutes from './routes/locations.js';
import publicRoutes from './routes/public.js';
import securityRoutes from './routes/security.js';
import clientFilesRoutes from './routes/client/files.js';
import clientFoldersRoutes from './routes/client/folders.js';
import clientProfileRoutes from './routes/client/profile.js';
import clientMfaRoutes from './routes/client/mfa.js';
import clientServiceRequestRoutes from './routes/client/serviceRequests.js';
import clientSchedulerRoutes from './routes/client/scheduler.js';
import clientPaymentRoutes, { webhookRouter } from './routes/client/payments.js';
import clientInvoiceRoutes from './routes/client/invoices.js';
import clientAlertSubscriptionRoutes from './routes/client/alertSubscriptions.js';
import translationsRoutes from './routes/translations.js';
import trustedDevicesRoutes from './routes/trustedDevices.js';
import serviceAreasRoutes from './routes/serviceAreas.js';
import emailVerificationRoutes from './routes/emailVerification.js';
import emailValidationRoutes from './routes/emailValidation.js';
import serviceRequestWorkflowRoutes from './routes/serviceRequestWorkflow.js';
import employeeServiceRequestWorkflowRoutes from './routes/employee/serviceRequestWorkflow.js';
import serviceTypesRoutes from './routes/serviceTypes.js';
import pushRoutes from './routes/pushRoutes.js';
import serviceRatingsRoutes from './routes/serviceRatings.js';
import adminTestimonialsRoutes from './routes/admin/testimonials.js';
import adminRatingQuestionsRoutes from './routes/admin/ratingQuestions.js';
import adminAlertsRoutes from './routes/admin/alerts.js';
import adminSubscriptionRoutes from './routes/admin/subscription.js';
import agentRoutes from './routes/agents.js';
import agentDownloadRoutes from './routes/agentDownloads.js';
import automationRoutes from './routes/automation.js';
import deploymentRoutes from './routes/deployment.js';
import subscriptionRoutes from './routes/subscription.js';

// Import session service for cleanup
import { sessionService } from './services/sessionService.js';

// Import verification cleanup service
import { verificationCleanupService } from './services/verificationCleanupService.js';

// Import metrics cleanup service
import { metricsCleanupService } from './services/metricsCleanupService.js';

// Import audit log cleanup service
import { auditLogCleanupService } from './services/auditLogCleanupService.js';

// Import alert cleanup service
import { alertCleanupService } from './services/alertCleanupService.js';

// Import WebSocket service
import { websocketService } from './services/websocketService.js';

// Import workflow scheduler
import { workflowScheduler } from './services/workflowScheduler.js';

// Import agent monitoring service
import { startAgentMonitoring, stopAgentMonitoring } from './services/agentMonitoringService.js';

// Import alert configuration service
import { alertConfigService } from './services/alertConfigService.js';

// Import policy scheduler service
import { policySchedulerService } from './services/policySchedulerService.js';

// Import escalation monitor
import escalationMonitor from './jobs/escalationMonitor.js';

// Import environment-aware logger
import { loggers as log } from './utils/logger.js';

// Import security middleware
import {
  generalLimiter,
  adminLimiter,
  authLimiter,
  heartbeatLimiter,
  speedLimiter,
  adminIPWhitelist,
  securityHeaders
} from './middleware/security.js';

// Import authentication middleware
import authMiddleware from './middleware/authMiddleware.js';

// Import enhanced security utilities
import {
  trackFailedLoginMiddleware,
  trackRateLimitMiddleware,
  trackSuspiciousInputMiddleware
} from './utils/securityMonitoring.js';

import {
  apiVersioningMiddleware,
  secureErrorHandler,
  performStartupSecurityCheck
} from './utils/productionHardening.js';

import { sanitizeInputMiddleware } from './utils/inputValidation.js';

// Load environment variables with priority: .env.local > .env
dotenv.config({ path: '.env.local' }); // Higher priority - local development with production DB
dotenv.config(); // Lower priority - default configuration

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy - required when behind nginx reverse proxy
// This allows express-rate-limit to correctly identify users via X-Forwarded-For header
app.set('trust proxy', 1);

// Create HTTP server for Socket.IO integration
const httpServer = createServer(app);

// Enhanced Security middleware with comprehensive CSP
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://m.stripe.network"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://js.stripe.com",
        "https://m.stripe.network",
        "'sha256-7PZaH7TzFg4JdT5xJguN7Och6VcMcP1LW4N3fQ936Fs='",
        "'sha256-MqH8JJslY2fF2bGYY1rZlpCNrRCnWKRzrrDefixUJTI='",
        "'sha256-ZswfTY7H35rbv8WC7NXBoiC7WNu86vSzCDChNWwZZDM='",
        "'sha256-e357n1PxCJ8d03/QCSKaHFmHF1JADyvSHdSfshxM494='",
        "'sha256-5DA+a07wxWmEka9IdoWjSPVHb17Cp5284/lJzfbl8KA='",
        "'sha256-/5Guo2nzv5n/w6ukZpOBZOtTJBJPSkJ6mhHpnBgm3Ls='"
      ],
      scriptSrcElem: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://js.stripe.com",
        "https://m.stripe.network",
        "'sha256-7PZaH7TzFg4JdT5xJguN7Och6VcMcP1LW4N3fQ936Fs='",
        "'sha256-MqH8JJslY2fF2bGYY1rZlpCNrRCnWKRzrrDefixUJTI='",
        "'sha256-ZswfTY7H35rbv8WC7NXBoiC7WNu86vSzCDChNWwZZDM='",
        "'sha256-e357n1PxCJ8d03/QCSKaHFmHF1JADyvSHdSfshxM494='",
        "'sha256-5DA+a07wxWmEka9IdoWjSPVHb17Cp5284/lJzfbl8KA='",
        "'sha256-/5Guo2nzv5n/w6ukZpOBZOtTJBJPSkJ6mhHpnBgm3Ls='"
      ],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "https:", "data:"],
      connectSrc: [
        "'self'",
        ...(process.env.NODE_ENV === 'development' ? ["http:"] : []),
        "https:",
        "wss:",
        "ws:",
        "https://api.stripe.com",
        "https://m.stripe.network"
      ],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      childSrc: ["'self'", "https://js.stripe.com", "https://m.stripe.network"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://m.stripe.network"],
      workerSrc: ["'self'", "blob:"],
      manifestSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  // Enhanced security headers
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: ["no-referrer", "strict-origin-when-cross-origin"] }
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
      : ['http://localhost:5173'];

    // Check for exact matches first
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    // Check for wildcard patterns (like *.amplifyapp.com)
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin.includes('*')) {
        const regex = new RegExp('^' + allowedOrigin.replace(/\*/g, '.*') + '$');
        return regex.test(origin);
      }
      return false;
    });

    if (isAllowed) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Apply security headers globally
app.use(securityHeaders);

// Apply speed limiter globally to slow down repeated requests
app.use(speedLimiter);

// Enhanced security monitoring middleware
app.use(trackRateLimitMiddleware);
app.use(trackSuspiciousInputMiddleware);
app.use(trackFailedLoginMiddleware);

// API versioning middleware
app.use('/api', apiVersioningMiddleware('1.0', ['1.0']));

// Input sanitization middleware
app.use(sanitizeInputMiddleware);

// IMPORTANT: Stripe webhook must be registered BEFORE body parsing
// It needs access to raw request body for signature verification
app.use('/api/client/payments', webhookRouter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing middleware for HttpOnly sessions
app.use(cookieParser());

// Global request logger for debugging (trace level - only in dev)
app.use((req, res, next) => {
  log.request.trace(`INCOMING: ${req.method} ${req.path}`);
  next();
});

// CSRF Protection Configuration
// Define cookie name once for consistency
const CSRF_COOKIE_NAME = process.env.NODE_ENV === 'production' ? '__Host-csrf' : 'csrf-token';

const csrfOptions = {
  getSecret: () => process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
  getSessionIdentifier: (req) => {
    // Debug: Log all available cookies (trace level)
    log.csrf.trace(`All cookies available:`, req.cookies ? Object.keys(req.cookies) : 'NO COOKIES');

    // Use session token if available (post-authentication)
    // Check both session_token (snake_case) and sessionToken (camelCase)
    const sessionToken = req.cookies?.session_token || req.cookies?.sessionToken;
    if (sessionToken) {
      log.csrf.trace(`CSRF session identifier: Using session token (authenticated request)`);
      return sessionToken;
    }

    // For pre-authentication, use CSRF cookie itself as the session identifier
    // This ensures the same session identifier is used for the entire pre-auth flow
    if (req.cookies && req.cookies[CSRF_COOKIE_NAME]) {
      log.csrf.trace(`CSRF session identifier: Using ${CSRF_COOKIE_NAME} cookie (pre-auth request)`);
      return req.cookies[CSRF_COOKIE_NAME];
    }

    // Ultimate fallback for very first request (when no cookies exist yet)
    const identifier = `${req.ip || 'unknown'}-${req.get('user-agent') || 'unknown'}`;
    log.csrf.trace(`CSRF session identifier: Using IP+UA (initial request): ${identifier.substring(0, 60)}...`);
    return identifier;
  },
  // Use __Host- prefix only in production (requires HTTPS)
  cookieName: CSRF_COOKIE_NAME,
  cookieOptions: {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax', // lax for development
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getTokenFromRequest: (req) => {
    const token = req.headers['x-csrf-token'];
    const cookie = req.cookies[CSRF_COOKIE_NAME];
    const sessionToken = req.cookies['sessionToken'];
    console.log(`🔐 CSRF validation - Token header: ${token ? token.substring(0, 20) + '...' : 'MISSING'}, Cookie (${CSRF_COOKIE_NAME}): ${cookie ? cookie.substring(0, 20) + '...' : 'MISSING'}, Session: ${sessionToken ? sessionToken.substring(0, 20) + '...' : 'MISSING'}`);
    return token;
  },
};

// Destructure the utilities from doubleCsrf
const {
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf(csrfOptions);

// Export generateCsrfToken for use in auth routes
export { generateCsrfToken };

// Create conditional CSRF protection that skips pre-authentication endpoints
const conditionalCsrfProtection = (req, res, next) => {
  // Skip CSRF for pre-authentication endpoints (before session cookie exists)
  // NOTE: When middleware is mounted at /api/auth, req.path does NOT include the /api/auth prefix
  const preAuthEndpoints = [
    '/admin-login-mfa',
    '/verify-admin-mfa',
    '/verify-client-mfa',
    '/login',
    '/signin',
    '/client-login',
    '/check-admin',
    '/trusted-device-login',
    '/send-verification',
    '/register-client',
    '/client-password-requirements',
    '/trial-magic-login',
    '/agent-magic-login',
    '/heartbeat',  // Session heartbeat - already secured by session token validation
    '/validate-session',  // Session validation - already secured by session token validation
    '/extend-session'  // Session extension - already secured by session token validation
  ];

  // Check if this is a pre-auth endpoint
  if (preAuthEndpoints.some(endpoint => req.path === endpoint || req.path.startsWith(endpoint))) {
    console.log(`🔓 Skipping CSRF protection for pre-auth endpoint: ${req.path}`);
    return next();
  }

  // Apply CSRF protection for all other endpoints
  console.log(`🔒 Applying CSRF protection for endpoint: ${req.path}`);
  return doubleCsrfProtection(req, res, next);
};

// Create method-based CSRF protection that skips GET requests
const methodBasedCsrfProtection = (req, res, next) => {
  // Skip CSRF for GET requests (read-only operations)
  if (req.method === 'GET') {
    console.log(`🔓 Skipping CSRF protection for GET request: ${req.path}`);
    return next();
  }

  // Apply CSRF protection for POST, PUT, DELETE, PATCH (state-changing operations)
  console.log(`🔒 Applying CSRF protection for ${req.method} request: ${req.path}`);
  return doubleCsrfProtection(req, res, next);
};

// CSRF token endpoint (unprotected so clients can get initial token)
app.get('/api/csrf-token', (req, res) => {
  // Generate token using the generateCsrfToken function
  const token = generateCsrfToken(req, res);
  res.json({
    success: true,
    csrfToken: token
  });
});

// Logging middleware
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Romero Tech Solutions API',
    version: '1.0.0'
  });
});

// API Health check endpoint (comprehensive)
app.get('/api/health', async (req, res) => {
  try {
    const dbConnected = await testConnection();
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    const health = {
      status: dbConnected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      service: 'Romero Tech Solutions API',
      version: '1.0.0',
      uptime: {
        seconds: Math.floor(uptime),
        formatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`
      },
      database: {
        connected: dbConnected,
        status: dbConnected ? 'ok' : 'error'
      },
      memory: {
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`
      },
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version
    };

    // Return 503 if database is not connected
    const statusCode = dbConnected ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      service: 'Romero Tech Solutions API',
      error: error.message
    });
  }
});

// Database health check
app.get('/health/db', async (req, res) => {
  try {
    const isConnected = await testConnection();
    if (isConnected) {
      res.status(200).json({
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'error',
        database: 'disconnected',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'error',
      database: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Conditional rate limiter for auth routes: different limits for different endpoint types
const authRateLimiter = (req, res, next) => {
  // Session management endpoints need more frequent access
  if (req.path === '/heartbeat' || req.path === '/validate-session') {
    return heartbeatLimiter(req, res, next);
  }
  // Public check endpoints (pre-authentication)
  if (req.path === '/check-admin') {
    return generalLimiter(req, res, next);
  }
  // Magic-link authentication endpoints use general limiting (more lenient than auth limiter)
  // These are token-based and already have expiration, so we can be more permissive
  if (req.path === '/trial-magic-login' || req.path === '/agent-magic-login') {
    return generalLimiter(req, res, next);
  }
  // Login and MFA endpoints use strict auth limiting
  return authLimiter(req, res, next);
};

// API Routes with security middleware
app.use('/api/auth', authRateLimiter, conditionalCsrfProtection, authRoutes); // Conditional rate limiting (heartbeat vs auth) + conditional CSRF
app.use('/api/admin', adminLimiter, adminIPWhitelist, doubleCsrfProtection, adminRoutes); // Admin rate limiting + IP whitelist + CSRF
app.use('/api/admin/workflow-configuration', adminLimiter, adminIPWhitelist, doubleCsrfProtection, adminWorkflowConfigRoutes); // Workflow configuration (admin only) + CSRF
app.use('/api/admin', adminLimiter, adminIPWhitelist, doubleCsrfProtection, adminInvoiceRoutes); // Invoice routes (admin/executive/client) + CSRF
app.use('/api/security', adminLimiter, adminIPWhitelist, securityRoutes); // Security monitoring (admin only) - GET only
app.use('/api/public', generalLimiter, publicRoutes); // General rate limiting for public routes - mostly GET
app.use('/api/locations', generalLimiter, doubleCsrfProtection, locationRoutes); // General rate limiting + CSRF
app.use('/api/clients', generalLimiter, doubleCsrfProtection, clientRegistrationRoutes); // General rate limiting + CSRF
app.use('/api/uploads', generalLimiter, doubleCsrfProtection, uploadRoutes); // General rate limiting + CSRF
app.use('/api/client/files', generalLimiter, doubleCsrfProtection, clientFilesRoutes); // Client file management + CSRF
app.use('/api/client/folders', generalLimiter, doubleCsrfProtection, clientFoldersRoutes); // Client folder management + CSRF
app.use('/api/client/service-requests', generalLimiter, doubleCsrfProtection, clientServiceRequestRoutes); // Client service request + CSRF
app.use('/api/client', generalLimiter, doubleCsrfProtection, clientSchedulerRoutes); // Client scheduler + CSRF
app.use('/api/client/profile', generalLimiter, doubleCsrfProtection, clientProfileRoutes); // Client profile + CSRF
app.use('/api/client/mfa', generalLimiter, methodBasedCsrfProtection, clientMfaRoutes); // Client MFA (CSRF skipped for GET)
app.use('/api/client/payments', generalLimiter, doubleCsrfProtection, clientPaymentRoutes); // Client payments (Stripe) + CSRF
app.use('/api/client/invoices', generalLimiter, methodBasedCsrfProtection, clientInvoiceRoutes); // Client invoices (CSRF skipped for GET)
app.use('/api/client/alert-subscriptions', generalLimiter, methodBasedCsrfProtection, clientAlertSubscriptionRoutes); // Client alert subscriptions (CSRF skipped for GET)
app.use('/api/translations', generalLimiter, translationsRoutes); // Translation system - mostly GET
app.use('/api/service-areas', generalLimiter, serviceAreasRoutes); // Service area validation - GET only
app.use('/api/service-types', generalLimiter, serviceTypesRoutes); // Service types management - GET public, admin CRUD
app.use('/api/service-request-workflow', generalLimiter, doubleCsrfProtection, serviceRequestWorkflowRoutes); // Service request workflow + CSRF
app.use('/api/employee/service-requests', generalLimiter, doubleCsrfProtection, employeeServiceRequestWorkflowRoutes); // Employee workflow actions (acknowledge, start, close) + CSRF
app.use('/api/push', generalLimiter, pushRoutes); // Push notification subscription management (auth handled per route)
app.use('/api/auth', emailVerificationRoutes); // Email verification for client registration (no auth required)
app.use('/api', emailValidationRoutes); // Email domain validation proxy (no auth required)
app.use('/api/ratings', generalLimiter, serviceRatingsRoutes); // Public rating submission (token-based auth)
app.use('/api/admin/testimonials', adminLimiter, adminIPWhitelist, doubleCsrfProtection, adminTestimonialsRoutes); // Admin testimonials management
app.use('/api/admin/rating-questions', adminLimiter, adminIPWhitelist, doubleCsrfProtection, adminRatingQuestionsRoutes); // Admin rating questions management
app.use('/api/admin/alerts', adminLimiter, adminIPWhitelist, doubleCsrfProtection, adminAlertsRoutes); // Admin alert management (confluence alerts)
app.use('/api/admin/subscription', adminLimiter, adminIPWhitelist, doubleCsrfProtection, adminSubscriptionRoutes); // Admin subscription pricing & analytics
app.use('/api/agents', generalLimiter, agentRoutes); // MSP Agent monitoring system (mixed auth: agent JWT + employee session)
app.use('/api/agent', generalLimiter, agentDownloadRoutes); // Agent binary downloads (public - no auth required)
app.use('/api/automation', generalLimiter, methodBasedCsrfProtection, automationRoutes); // Policy automation and script library
app.use('/api/deployment', generalLimiter, methodBasedCsrfProtection, deploymentRoutes); // Software deployment and package management
app.use('/api/subscription', generalLimiter, subscriptionRoutes); // Subscription management (mixed auth: pricing public, status/upgrade authenticated)

// Pre-authentication trusted device check (no auth required)
app.post('/api/trusted-devices/check-pre-auth', generalLimiter, async (req, res) => {
  try {
    const { checkTrustedDevice } = await import('./utils/trustedDeviceUtils.js');
    const db = await import('./config/database.js');

    const { deviceFingerprint, userEmail } = req.body;

    if (!deviceFingerprint || !userEmail) {
      return res.status(400).json({
        success: false,
        message: 'Device fingerprint and user email are required'
      });
    }

    // Determine user type based on email domain
    const userType = userEmail.includes('@romerotechsolutions.com') ? 'employee' : 'client';

    // Find user by email to get userId
    let userQuery;
    if (userType === 'employee') {
      userQuery = 'SELECT id FROM employees WHERE email = $1';
    } else {
      userQuery = 'SELECT id FROM users WHERE email = $1';
    }

    const pool = await db.getPool();
    const userResult = await pool.query(userQuery, [userEmail]);

    if (userResult.rows.length === 0) {
      return res.json({
        success: true,
        trusted: false,
        message: 'User not found'
      });
    }

    const userId = userResult.rows[0].id;
    const trustedDevice = await checkTrustedDevice(userId, userType, deviceFingerprint);

    if (trustedDevice) {
      res.json({
        success: true,
        trusted: true,
        data: {
          deviceName: trustedDevice.device_name,
          lastUsed: trustedDevice.last_used,
          expiresAt: trustedDevice.expires_at,
          isSharedDevice: trustedDevice.is_shared_device
        }
      });
    } else {
      res.json({
        success: true,
        trusted: false,
        message: 'Device is not trusted'
      });
    }

  } catch (error) {
    console.error('Error checking pre-auth trusted device:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check trusted device',
      trusted: false // Default to not trusted on error
    });
  }
});

app.use('/api/trusted-devices', generalLimiter, authMiddleware, trustedDevicesRoutes); // Trusted device management

// 404 handler (Express 5: removed path to match all unmatched routes)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Enhanced secure global error handler
app.use(secureErrorHandler);

// Session cleanup process
let cleanupInterval = null;

const startSessionCleanup = async () => {
  console.log('🧹 Starting automated session cleanup...');

  // Run cleanup immediately on startup
  try {
    const cleanedCount = await sessionService.cleanupExpiredSessions();
    console.log(`🧹 Initial cleanup: ${cleanedCount} expired sessions removed`);
  } catch (error) {
    console.error('❌ Error during initial session cleanup:', error);
  }

  // Set up recurring cleanup every 15 minutes
  cleanupInterval = setInterval(async () => {
    try {
      const cleanedCount = await sessionService.cleanupExpiredSessions();
      if (cleanedCount > 0) {
        console.log(`🧹 Scheduled cleanup: ${cleanedCount} expired sessions removed`);
      }
    } catch (error) {
      console.error('❌ Error during scheduled session cleanup:', error);
    }
  }, 15 * 60 * 1000); // 15 minutes

  console.log('✅ Session cleanup scheduled every 15 minutes');
};

const stopSessionCleanup = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('🧹 Session cleanup stopped');
  }
};

// Start server
const startServer = async () => {
  try {
    // Perform comprehensive startup security validation
    console.log('🔒 Starting comprehensive security validation...');
    const securityValidation = await performStartupSecurityCheck();

    // Test database connection
    console.log('🔍 Testing database connection...');
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.warn('⚠️  Database connection failed, but starting server anyway...');
    }

    // Initialize WebSocket service
    websocketService.initialize(httpServer);

    // Make WebSocket service available to routes via req.app
    app.set('websocketService', websocketService);

    // Start workflow scheduler for service request automation
    workflowScheduler.start();

    // Start agent heartbeat monitoring
    startAgentMonitoring();

    // Start metrics cleanup service
    metricsCleanupService.start();

    // Start audit log cleanup service (SOC 2 / GDPR compliance)
    auditLogCleanupService.start();

    // Start alert cleanup service (resolved alerts retention)
    alertCleanupService.start();

    // Load alert configurations
    console.log('⚙️  Loading alert configurations...');
    try {
      await alertConfigService.loadConfigurations();
    } catch (error) {
      console.warn('⚠️  Failed to load alert configurations:', error.message);
    }

    // Start policy scheduler service
    console.log('🤖 Starting policy scheduler...');
    try {
      await policySchedulerService.start();
    } catch (error) {
      console.warn('⚠️  Failed to start policy scheduler:', error.message);
    }

    // Start escalation monitor
    console.log('🔔 Starting alert escalation monitor...');
    try {
      escalationMonitor.start();
    } catch (error) {
      console.warn('⚠️  Failed to start escalation monitor:', error.message);
    }

    // Start the server
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🗄️  Database health: http://localhost:${PORT}/health/db`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔒 CORS origins: ${process.env.CORS_ORIGINS || 'http://localhost:5173'}`);
      console.log(`🔌 WebSocket service: ENABLED`);
      console.log(`📡 Agent monitoring: ENABLED`);
      console.log(`🧹 Metrics cleanup: ENABLED (1-year retention)`);
      console.log(`🚨 Alert configurations: LOADED`);
      console.log(`🤖 Policy scheduler: ENABLED`);
      console.log(`🔔 Escalation monitor: ENABLED (checks every 5 minutes)`);

      // Start session cleanup process
      startSessionCleanup();
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  stopSessionCleanup();
  stopAgentMonitoring();
  metricsCleanupService.stop();
  auditLogCleanupService.stop();
  alertCleanupService.stop();
  policySchedulerService.stop();
  escalationMonitor.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  stopSessionCleanup();
  stopAgentMonitoring();
  metricsCleanupService.stop();
  auditLogCleanupService.stop();
  alertCleanupService.stop();
  policySchedulerService.stop();
  escalationMonitor.stop();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer();

export default app;