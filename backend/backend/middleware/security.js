import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';

// General API rate limiting
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict admin API rate limiting
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 admin requests per windowMs
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
  max: 10, // limit each IP to 10 login attempts per windowMs
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
  delayMs: 500, // add 500ms delay per request after delayAfter
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
  if (process.env.NODE_ENV === 'development') {
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