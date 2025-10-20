# Logging Guidelines

## Environment-Aware Logging

This project uses environment-aware logging utilities to reduce console spam in production while maintaining detailed debugging capabilities in development.

## Usage

### Frontend (TypeScript)

```typescript
import { logger, loggers } from './utils/logger';

// Basic logging
logger.error('Critical error occurred');      // Always logged
logger.warn('Warning message');               // Logged in dev & prod
logger.info('Important information');          // Logged in dev & prod
logger.debug('Debug information');             // Only in development
logger.trace('Verbose trace information');     // Only in development
logger.dev('Development-only message');        // Completely removed in production

// Category-specific logging (with emojis)
loggers.auth.info('User authenticated');                    // 🔐 User authenticated
loggers.websocket.debug('WebSocket connected');             // 🔌 WebSocket connected
loggers.session.trace('Session extended');                  // 🕒 Session extended
loggers.storage.debug('Reading from localStorage');         // 🔑 Reading from localStorage
loggers.api.debug('API request completed');                 // 📡 API request completed
loggers.permission.info('Loaded 63 permissions');           // ✅ Loaded 63 permissions
```

### Backend (JavaScript)

```javascript
import { logger, loggers } from './utils/logger.js';

// Basic logging
logger.error('Database connection failed');    // Always logged
logger.warn('Deprecated API used');            // Logged in dev & prod
logger.info('Server started');                 // Logged in dev & prod
logger.debug('Processing request');            // Only in development
logger.trace('Detailed trace info');           // Only in development
logger.dev('Dev-only message');                // Completely removed in production

// Category-specific logging (with emojis)
loggers.auth.info('User logged in');                       // 🔐 User logged in
loggers.websocket.debug('WebSocket message received');     // 🔌 WebSocket message received
loggers.database.error('Query failed');                    // ❌ Query failed
loggers.api.trace('Request headers:', headers);            // 📡 Request headers: ...
loggers.csrf.trace('CSRF token validated');                // 🔐 CSRF token validated
loggers.request.trace('INCOMING: GET /api/users');         // 🌐 INCOMING: GET /api/users
```

## Log Levels

| Level | When Logged | Use Case |
|-------|------------|----------|
| `ERROR` | Always | Critical errors, exceptions, failures |
| `WARN` | Dev & Prod | Warnings, potential issues, deprecated features |
| `INFO` | Dev & Prod | Important events, auth, navigation, data mutations |
| `DEBUG` | Dev only | Network requests, state changes, data flow |
| `TRACE` | Dev only | Very verbose debugging, emoji-heavy logs |
| `DEV` | Dev only | Development-only messages, completely removed in production |

## Current Configuration

- **Development**: All log levels enabled (TRACE)
- **Production**: ERROR, WARN, and INFO only

## Migration Guide

When updating existing code to use the logger:

### Replace console.log with appropriate level:

```typescript
// Before
console.log('🔐 User authenticated');
console.log('Processing request...');
console.error('Failed to connect');

// After
loggers.auth.info('User authenticated');          // Important info
logger.debug('Processing request...');            // Debug info
logger.error('Failed to connect');                // Errors
```

### Determine appropriate log level:

- **Authentication, authorization, critical state changes** → `info`
- **Network requests, data fetching, state updates** → `debug`
- **Verbose emoji logs, detailed traces** → `trace`
- **Development debugging** → `dev`

### Use category loggers when available:

```typescript
// Prefer this (includes emoji and category)
loggers.websocket.debug('Connected to server');

// Over this (generic)
logger.debug('🔌 Connected to server');
```

## Benefits

1. **Reduced production noise**: Only important messages in production logs
2. **Better debugging in development**: Full trace information available
3. **Performance**: Logger calls removed at build time in production
4. **Organization**: Category-specific loggers group related messages
5. **Consistency**: Standardized emoji and format across the codebase

## Performance Note

In production builds, trace and debug logs are completely optimized away by the bundler, resulting in zero performance overhead.
