import { query } from '../config/database.js';

/**
 * Production Hardening and Environment Validation
 * Ensures secure configuration and environment setup
 */

// Required environment variables for secure operation
const REQUIRED_ENV_VARS = {
  production: [
    'NODE_ENV',
    'PORT',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'JWT_SECRET',
    'CORS_ORIGINS',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION'
  ],
  development: [
    'NODE_ENV',
    'PORT',
    'DB_HOST',
    'DB_NAME',
    'JWT_SECRET'
  ]
};

// Security configuration requirements
const SECURITY_REQUIREMENTS = {
  production: {
    JWT_SECRET: { minLength: 64 },
    DB_PASSWORD: { minLength: 12 },
    SESSION_SECRET: { minLength: 32 }
  },
  development: {
    JWT_SECRET: { minLength: 32 }
  }
};

/**
 * Validate environment configuration on startup
 * @returns {object} - Validation result with errors and warnings
 */
export const validateEnvironmentConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  const requiredVars = REQUIRED_ENV_VARS[env] || REQUIRED_ENV_VARS.development;
  const securityReqs = SECURITY_REQUIREMENTS[env] || SECURITY_REQUIREMENTS.development;

  const errors = [];
  const warnings = [];
  const recommendations = [];

  console.log(`🔍 Validating environment configuration for: ${env.toUpperCase()}`);

  // Check required environment variables
  requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (!value) {
      errors.push(`Missing required environment variable: ${varName}`);
    } else {
      // Check security requirements
      const requirement = securityReqs[varName];
      if (requirement && requirement.minLength && value.length < requirement.minLength) {
        errors.push(`${varName} does not meet minimum length requirement (${requirement.minLength} characters)`);
      }
    }
  });

  // Production-specific validations
  if (env === 'production') {
    // SSL/TLS requirements
    if (process.env.DB_SSL !== 'true') {
      warnings.push('Database SSL is not enabled in production');
    }

    // CORS origin validation
    const corsOrigins = process.env.CORS_ORIGINS;
    if (corsOrigins && corsOrigins.includes('*')) {
      errors.push('Wildcard CORS origins are not allowed in production');
    }

    // Port security
    const port = parseInt(process.env.PORT);
    if (port < 1024 && port !== 80 && port !== 443) {
      warnings.push(`Running on privileged port ${port} - consider using port > 1024 with reverse proxy`);
    }

    // Session configuration
    if (!process.env.SESSION_SECRET) {
      errors.push('SESSION_SECRET is required in production');
    }

    // Rate limiting
    if (!process.env.RATE_LIMIT_MAX) {
      recommendations.push('Consider setting RATE_LIMIT_MAX for production rate limiting');
    }
  }

  // Development warnings
  if (env === 'development') {
    if (process.env.DEBUG_LOGGING !== 'true') {
      recommendations.push('Consider enabling DEBUG_LOGGING=true for development');
    }
  }

  return {
    environment: env,
    valid: errors.length === 0,
    errors,
    warnings,
    recommendations
  };
};

/**
 * Validate database connection security
 * @returns {Promise<object>} - Database security validation result
 */
export const validateDatabaseSecurity = async () => {
  const errors = [];
  const warnings = [];
  const recommendations = [];

  try {
    console.log('🔍 Validating database security configuration...');

    // Test basic connectivity
    const connectionTest = await query('SELECT 1 as test');
    if (!connectionTest || connectionTest.rows.length === 0) {
      errors.push('Database connection test failed');
      return { valid: false, errors, warnings, recommendations };
    }

    // Check SSL status
    try {
      const sslResult = await query('SHOW ssl');
      const sslEnabled = sslResult.rows[0]?.ssl === 'on';

      if (!sslEnabled && process.env.NODE_ENV === 'production') {
        warnings.push('Database SSL is not enabled on server side');
      }
    } catch (err) {
      // SSL status check might not be available in all environments
      console.log('Could not check database SSL status:', err.message);
    }

    // Check connection limits
    try {
      const connectionLimitResult = await query('SHOW max_connections');
      const maxConnections = parseInt(connectionLimitResult.rows[0]?.max_connections || 0);

      if (maxConnections < 100 && process.env.NODE_ENV === 'production') {
        recommendations.push(`Database max_connections is ${maxConnections} - consider increasing for production load`);
      }
    } catch (err) {
      console.log('Could not check database connection limits:', err.message);
    }

    // Validate connection pool configuration
    const poolConfig = {
      max: parseInt(process.env.DB_POOL_MAX || 25),
      min: parseInt(process.env.DB_POOL_MIN || 2),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || 30000)
    };

    if (poolConfig.max > 50) {
      warnings.push(`Database pool max (${poolConfig.max}) is quite high - monitor connection usage`);
    }

    if (poolConfig.min === 0 && process.env.NODE_ENV === 'production') {
      recommendations.push('Consider setting DB_POOL_MIN > 0 for production to maintain warm connections');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      recommendations,
      poolConfig
    };

  } catch (error) {
    errors.push(`Database validation failed: ${error.message}`);
    return { valid: false, errors, warnings, recommendations };
  }
};

/**
 * API versioning and deprecation middleware
 * @param {string} currentVersion - Current API version
 * @param {array} supportedVersions - Array of supported versions
 */
export const apiVersioningMiddleware = (currentVersion = '1.0', supportedVersions = ['1.0']) => {
  return (req, res, next) => {
    // Extract version from headers or URL
    const requestedVersion = req.headers['api-version'] ||
                            req.query.version ||
                            req.path.match(/^\/api\/v(\d+\.\d+)/)?.[1] ||
                            currentVersion;

    // Validate version
    if (!supportedVersions.includes(requestedVersion)) {
      return res.status(400).json({
        success: false,
        message: `API version ${requestedVersion} is not supported`,
        supportedVersions,
        currentVersion
      });
    }

    // Add version info to request
    req.apiVersion = requestedVersion;

    // Add deprecation warning for old versions
    if (requestedVersion !== currentVersion) {
      res.set('Deprecation', 'true');
      res.set('Sunset', new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()); // 90 days

      console.log(`⚠️  API Version Warning: Client using deprecated version ${requestedVersion} from ${req.ip}`);
    }

    // Set current version in response header
    res.set('API-Version', requestedVersion);
    res.set('API-Current-Version', currentVersion);

    next();
  };
};

/**
 * Enhanced error handling with security considerations
 * @param {object} error - Error object
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
export const secureErrorHandler = (error, req, res, next) => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const timestamp = new Date().toISOString();
  const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Log error securely (without sensitive data)
  const logError = {
    errorId,
    timestamp,
    message: error.message,
    stack: isDevelopment ? error.stack : undefined,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  };

  console.error('🚨 Application Error:', logError);

  // Determine error type and status code
  let statusCode = error.statusCode || error.status || 500;
  let message = 'Internal server error';

  // Security-focused error handling
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Invalid input data';
  } else if (error.name === 'UnauthorizedError' || statusCode === 401) {
    statusCode = 401;
    message = 'Authentication required';
  } else if (error.name === 'ForbiddenError' || statusCode === 403) {
    statusCode = 403;
    message = 'Access denied';
  } else if (error.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    message = 'File too large';
  } else if (error.code === 'EBADCSRFTOKEN') {
    statusCode = 403;
    message = 'Invalid security token';
  }

  // Rate limiting errors
  if (statusCode === 429) {
    message = 'Too many requests';
  }

  // Don't expose internal errors in production
  if (!isDevelopment && statusCode === 500) {
    message = 'Something went wrong';
  }

  // Response
  const response = {
    success: false,
    message,
    errorId,
    timestamp
  };

  // Add debug info in development
  if (isDevelopment) {
    response.debug = {
      originalMessage: error.message,
      stack: error.stack,
      errorType: error.name
    };
  }

  res.status(statusCode).json(response);
};

/**
 * Startup security validation and reporting
 * @returns {Promise<object>} - Complete security validation report
 */
export const performStartupSecurityCheck = async () => {
  console.log('\n🔒 PERFORMING STARTUP SECURITY VALIDATION');
  console.log('==========================================');

  const results = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    checks: {}
  };

  // Environment validation
  console.log('\n1. Environment Configuration...');
  results.checks.environment = validateEnvironmentConfig();

  if (results.checks.environment.valid) {
    console.log('✅ Environment configuration is valid');
  } else {
    console.log('❌ Environment configuration has issues:');
    results.checks.environment.errors.forEach(error => console.log(`   - ${error}`));
  }

  // Database security validation
  console.log('\n2. Database Security...');
  try {
    results.checks.database = await validateDatabaseSecurity();

    if (results.checks.database.valid) {
      console.log('✅ Database security is configured correctly');
    } else {
      console.log('❌ Database security has issues:');
      results.checks.database.errors.forEach(error => console.log(`   - ${error}`));
    }
  } catch (error) {
    console.log('❌ Database security check failed:', error.message);
    results.checks.database = { valid: false, errors: [error.message] };
  }

  // Overall validation
  const allValid = Object.values(results.checks).every(check => check.valid);

  console.log('\n🔒 SECURITY VALIDATION SUMMARY');
  console.log('==============================');

  if (allValid) {
    console.log('✅ All security checks passed!');
  } else {
    console.log('⚠️  Some security issues detected - review above');
  }

  // Show warnings and recommendations
  Object.values(results.checks).forEach(check => {
    if (check.warnings && check.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      check.warnings.forEach(warning => console.log(`   - ${warning}`));
    }

    if (check.recommendations && check.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      check.recommendations.forEach(rec => console.log(`   - ${rec}`));
    }
  });

  console.log('\n==========================================\n');

  return results;
};

export default {
  validateEnvironmentConfig,
  validateDatabaseSecurity,
  apiVersioningMiddleware,
  secureErrorHandler,
  performStartupSecurityCheck
};