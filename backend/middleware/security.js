import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';

// Environment-aware rate limiting: more lenient in development, strict in production
const isDevelopment = process.env.NODE_ENV === 'development';

// General API rate limiting
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 5000 : 100, // dev: 5000 requests, production: 100 requests
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin API rate limiting
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 2000 : 50, // dev: 2000 requests, production: 50 requests
  message: {
    success: false,
    message: 'Too many admin requests from this IP, please try again later.',
    code: 'ADMIN_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth endpoint protection (login attempts)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 500 : 10, // dev: 500 attempts, production: 10 attempts
  message: {
    success: false,
    message: 'Too many login attempts from this IP, please try again later.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Slow down repeated requests
export const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // allow 50 requests per windowMs without delay
  delayMs: () => 500, // add 500ms delay per request after delayAfter (v2 syntax)
  maxDelayMs: 20000, // maximum delay of 20 seconds
});

// IP whitelist for admin routes (add your IPs here)
const ADMIN_IP_WHITELIST = [
  '127.0.0.1',
  '::1',
  // Add your office/home IPs here for production
  // 'YOUR_OFFICE_IP',
  // 'YOUR_HOME_IP'
];

export const adminIPWhitelist = (req, res, next) => {
  // Skip IP check in development
  if (true) { // IP whitelist disabled - allow admin access from anywhere
    return next();
  }

  const clientIP = req.ip || req.connection.remoteAddress;
  console.log(`Admin access attempt from IP: ${clientIP}`);

  if (!ADMIN_IP_WHITELIST.includes(clientIP)) {
    console.log(`Admin access denied for IP: ${clientIP}`);
    return res.status(403).json({
      success: false,
      message: 'Access denied from this IP address',
      code: 'IP_ACCESS_DENIED'
    });
  }

  next();
};

// Security headers middleware
export const securityHeaders = (req, res, next) => {
  res.setHeader('X-API-Version', '1.0.0');
  res.setHeader('X-Powered-By', 'Romero Tech Solutions');
  next();
};