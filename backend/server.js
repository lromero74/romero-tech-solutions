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
import clientProfileRoutes from './routes/client/profile.js';
import clientMfaRoutes from './routes/client/mfa.js';
import clientServiceRequestRoutes from './routes/client/serviceRequests.js';
import clientSchedulerRoutes from './routes/client/scheduler.js';
import translationsRoutes from './routes/translations.js';
import trustedDevicesRoutes from './routes/trustedDevices.js';
import serviceAreasRoutes from './routes/serviceAreas.js';
import emailVerificationRoutes from './routes/emailVerification.js';
import emailValidationRoutes from './routes/emailValidation.js';
import serviceRequestWorkflowRoutes from './routes/serviceRequestWorkflow.js';
import employeeServiceRequestWorkflowRoutes from './routes/employee/serviceRequestWorkflow.js';
import serviceTypesRoutes from './routes/serviceTypes.js';

// Import session service for cleanup
import { sessionService } from './services/sessionService.js';

// Import verification cleanup service
import { verificationCleanupService } from './services/verificationCleanupService.js';

// Import WebSocket service
import { websocketService } from './services/websocketService.js';

// Import workflow scheduler
import { workflowScheduler } from './services/workflowScheduler.js';

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
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'", "https:", "wss:", "ws:"],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      childSrc: ["'self'"],
      frameSrc: ["'none'"],
      workerSrc: ["'self'"],
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

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing middleware for HttpOnly sessions
app.use(cookieParser());

// Global request logger for debugging
app.use((req, res, next) => {
  console.log(`🌐 INCOMING: ${req.method} ${req.path}`);
  next();
});

// CSRF Protection Configuration
// Define cookie name once for consistency
const CSRF_COOKIE_NAME = process.env.NODE_ENV === 'production' ? '__Host-csrf' : 'csrf-token';

const csrfOptions = {
  getSecret: () => process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
  getSessionIdentifier: (req) => {
    // Debug: Log all available cookies
    console.log(`🍪 All cookies available:`, req.cookies ? Object.keys(req.cookies) : 'NO COOKIES');

    // Use session token if available (post-authentication)
    // Check both session_token (snake_case) and sessionToken (camelCase)
    const sessionToken = req.cookies?.session_token || req.cookies?.sessionToken;
    if (sessionToken) {
      console.log(`🔐 CSRF session identifier: Using session token (authenticated request)`);
      return sessionToken;
    }

    // For pre-authentication, use CSRF cookie itself as the session identifier
    // This ensures the same session identifier is used for the entire pre-auth flow
    if (req.cookies && req.cookies[CSRF_COOKIE_NAME]) {
      console.log(`🔐 CSRF session identifier: Using ${CSRF_COOKIE_NAME} cookie (pre-auth request)`);
      return req.cookies[CSRF_COOKIE_NAME];
    }

    // Ultimate fallback for very first request (when no cookies exist yet)
    const identifier = `${req.ip || 'unknown'}-${req.get('user-agent') || 'unknown'}`;
    console.log(`🔐 CSRF session identifier: Using IP+UA (initial request): ${identifier.substring(0, 60)}...`);
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
    '/client-password-requirements'
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Romero Tech Solutions API',
    version: '1.0.0'
  });
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
app.use('/api/client/service-requests', generalLimiter, doubleCsrfProtection, clientServiceRequestRoutes); // Client service request + CSRF
app.use('/api/client', generalLimiter, doubleCsrfProtection, clientSchedulerRoutes); // Client scheduler + CSRF
app.use('/api/client/profile', generalLimiter, doubleCsrfProtection, clientProfileRoutes); // Client profile + CSRF
app.use('/api/client/mfa', generalLimiter, methodBasedCsrfProtection, clientMfaRoutes); // Client MFA (CSRF skipped for GET)
app.use('/api/translations', generalLimiter, translationsRoutes); // Translation system - mostly GET
app.use('/api/service-areas', generalLimiter, serviceAreasRoutes); // Service area validation - GET only
app.use('/api/service-types', generalLimiter, serviceTypesRoutes); // Service types management - GET public, admin CRUD
app.use('/api/service-request-workflow', generalLimiter, doubleCsrfProtection, serviceRequestWorkflowRoutes); // Service request workflow + CSRF
app.use('/api/employee/service-requests', generalLimiter, doubleCsrfProtection, employeeServiceRequestWorkflowRoutes); // Employee workflow actions (acknowledge, start, close) + CSRF
app.use('/api/auth', emailVerificationRoutes); // Email verification for client registration (no auth required)
app.use('/api', emailValidationRoutes); // Email domain validation proxy (no auth required)

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

// 404 handler
app.use('*', (req, res) => {
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

    // Start workflow scheduler for service request automation
    workflowScheduler.start();

    // Start the server
    httpServer.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🗄️  Database health: http://localhost:${PORT}/health/db`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔒 CORS origins: ${process.env.CORS_ORIGINS || 'http://localhost:5173'}`);
      console.log(`🔌 WebSocket service: ENABLED`);

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
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  stopSessionCleanup();
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