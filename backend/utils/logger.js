/**
 * Environment-aware logging utility for backend
 * Reduces console spam in production while maintaining debugging capabilities in development
 */

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Log levels for controlling verbosity
 */
const LogLevel = {
  ERROR: 0,    // Always logged (errors, critical issues)
  WARN: 1,     // Warnings (potential issues)
  INFO: 2,     // Important information (auth, database operations, critical events)
  DEBUG: 3,    // Detailed debugging (request/response, queries)
  TRACE: 4,    // Very verbose (all operations, emoji logs)
};

// Set default log level based on environment
const currentLogLevel = isProduction ? LogLevel.INFO : LogLevel.TRACE;

/**
 * Conditional logger that respects environment and log levels
 */
export const logger = {
  /**
   * Critical errors - always logged
   */
  error: (...args) => {
    if (currentLogLevel >= LogLevel.ERROR) {
      console.error(...args);
    }
  },

  /**
   * Warnings - logged in dev and production
   */
  warn: (...args) => {
    if (currentLogLevel >= LogLevel.WARN) {
      console.warn(...args);
    }
  },

  /**
   * Important information - auth, database operations, critical events
   */
  info: (...args) => {
    if (currentLogLevel >= LogLevel.INFO) {
      console.log(...args);
    }
  },

  /**
   * Debug information - requests, queries, state changes
   * Only shown in development by default
   */
  debug: (...args) => {
    if (currentLogLevel >= LogLevel.DEBUG) {
      console.log(...args);
    }
  },

  /**
   * Trace - very verbose, emoji-heavy logs for detailed debugging
   * Only shown in development
   */
  trace: (...args) => {
    if (currentLogLevel >= LogLevel.TRACE) {
      console.log(...args);
    }
  },

  /**
   * Development-only logs (completely removed in production)
   */
  dev: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
};

/**
 * Category-specific loggers for better organization
 */
export const loggers = {
  auth: {
    info: (msg, ...args) => logger.info(`🔐 ${msg}`, ...args),
    debug: (msg, ...args) => logger.debug(`🔐 ${msg}`, ...args),
    trace: (msg, ...args) => logger.trace(`🔐 ${msg}`, ...args),
  },
  websocket: {
    info: (msg, ...args) => logger.info(`🔌 ${msg}`, ...args),
    debug: (msg, ...args) => logger.debug(`🔌 ${msg}`, ...args),
    trace: (msg, ...args) => logger.trace(`🔌 ${msg}`, ...args),
  },
  database: {
    info: (msg, ...args) => logger.info(`💾 ${msg}`, ...args),
    debug: (msg, ...args) => logger.debug(`💾 ${msg}`, ...args),
    error: (msg, ...args) => logger.error(`❌ ${msg}`, ...args),
  },
  api: {
    info: (msg, ...args) => logger.info(`📡 ${msg}`, ...args),
    debug: (msg, ...args) => logger.debug(`📡 ${msg}`, ...args),
    trace: (msg, ...args) => logger.trace(`📡 ${msg}`, ...args),
  },
  csrf: {
    debug: (msg, ...args) => logger.debug(`🔐 ${msg}`, ...args),
    trace: (msg, ...args) => logger.trace(`🔐 ${msg}`, ...args),
  },
  request: {
    trace: (msg, ...args) => logger.trace(`🌐 ${msg}`, ...args),
  },
};

export default logger;
