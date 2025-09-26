import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { testConnection } from './config/database.js';

// Import routes
import clientRegistrationRoutes from './routes/clientRegistration.js';
import uploadRoutes from './routes/uploads.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import locationRoutes from './routes/locations.js';
import publicRoutes from './routes/public.js';

// Import session service for cleanup
import { sessionService } from './services/sessionService.js';

// Import WebSocket service
import { websocketService } from './services/websocketService.js';

// Load environment variables with priority: .env.local > .env
dotenv.config({ path: '.env.local' }); // Higher priority - local development with production DB
dotenv.config(); // Lower priority - default configuration

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server for Socket.IO integration
const httpServer = createServer(app);

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
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

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes); // Public routes without authentication
app.use('/api/locations', locationRoutes);
app.use('/api/clients', clientRegistrationRoutes);
app.use('/api/uploads', uploadRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);

  // Handle specific error types
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: error.details
    });
  }

  if (error.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized access'
    });
  }

  // Default error response
  const statusCode = error.statusCode || error.status || 500;
  const message = error.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    timestamp: new Date().toISOString()
  });
});

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
    // Test database connection
    console.log('🔍 Testing database connection...');
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.warn('⚠️  Database connection failed, but starting server anyway...');
    }

    // Initialize WebSocket service
    websocketService.initialize(httpServer);

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