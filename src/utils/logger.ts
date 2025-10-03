/**
 * Environment-aware logging utility
 * Reduces console spam in production while maintaining debugging capabilities in development
 */

const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
const isProduction = import.meta.env.PROD || import.meta.env.MODE === 'production';

/**
 * Log levels for controlling verbosity
 */
export enum LogLevel {
  ERROR = 0,    // Always logged (errors, critical issues)
  WARN = 1,     // Warnings (potential issues)
  INFO = 2,     // Important information (auth, navigation, data mutations)
  DEBUG = 3,    // Detailed debugging (network requests, state changes)
  TRACE = 4,    // Very verbose (all operations, emoji logs)
}

// Set default log level based on environment
const currentLogLevel: LogLevel = isProduction ? LogLevel.INFO : LogLevel.TRACE;

/**
 * Conditional logger that respects environment and log levels
 */
export const logger = {
  /**
   * Critical errors - always logged
   */
  error: (...args: any[]) => {
    if (currentLogLevel >= LogLevel.ERROR) {
      console.error(...args);
    }
  },

  /**
   * Warnings - logged in dev and production
   */
  warn: (...args: any[]) => {
    if (currentLogLevel >= LogLevel.WARN) {
      console.warn(...args);
    }
  },

  /**
   * Important information - auth, navigation, critical state changes
   */
  info: (...args: any[]) => {
    if (currentLogLevel >= LogLevel.INFO) {
      console.log(...args);
    }
  },

  /**
   * Debug information - network requests, state changes, data flow
   * Only shown in development by default
   */
  debug: (...args: any[]) => {
    if (currentLogLevel >= LogLevel.DEBUG) {
      console.log(...args);
    }
  },

  /**
   * Trace - very verbose, emoji-heavy logs for detailed debugging
   * Only shown in development
   */
  trace: (...args: any[]) => {
    if (currentLogLevel >= LogLevel.TRACE) {
      console.log(...args);
    }
  },

  /**
   * Development-only logs (completely removed in production)
   */
  dev: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  /**
   * Group logging for better organization
   */
  group: (label: string, level: LogLevel = LogLevel.DEBUG) => {
    if (currentLogLevel >= level) {
      console.group(label);
    }
  },

  groupEnd: () => {
    if (isDevelopment) {
      console.groupEnd();
    }
  },
};

/**
 * Category-specific loggers for better organization
 */
export const loggers = {
  auth: {
    info: (msg: string, ...args: any[]) => logger.info(`🔐 ${msg}`, ...args),
    debug: (msg: string, ...args: any[]) => logger.debug(`🔐 ${msg}`, ...args),
    trace: (msg: string, ...args: any[]) => logger.trace(`🔐 ${msg}`, ...args),
  },
  websocket: {
    info: (msg: string, ...args: any[]) => logger.info(`🔌 ${msg}`, ...args),
    debug: (msg: string, ...args: any[]) => logger.debug(`🔌 ${msg}`, ...args),
    trace: (msg: string, ...args: any[]) => logger.trace(`🔌 ${msg}`, ...args),
  },
  session: {
    info: (msg: string, ...args: any[]) => logger.info(`🕒 ${msg}`, ...args),
    debug: (msg: string, ...args: any[]) => logger.debug(`🕒 ${msg}`, ...args),
    trace: (msg: string, ...args: any[]) => logger.trace(`🕒 ${msg}`, ...args),
  },
  storage: {
    debug: (msg: string, ...args: any[]) => logger.debug(`🔑 ${msg}`, ...args),
    trace: (msg: string, ...args: any[]) => logger.trace(`🔑 ${msg}`, ...args),
  },
  api: {
    info: (msg: string, ...args: any[]) => logger.info(`📡 ${msg}`, ...args),
    debug: (msg: string, ...args: any[]) => logger.debug(`📡 ${msg}`, ...args),
    trace: (msg: string, ...args: any[]) => logger.trace(`📡 ${msg}`, ...args),
  },
  permission: {
    info: (msg: string, ...args: any[]) => logger.info(`✅ ${msg}`, ...args),
    debug: (msg: string, ...args: any[]) => logger.debug(`✅ ${msg}`, ...args),
  },
};

export default logger;
