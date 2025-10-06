import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import secretsManager from '../utils/secrets.js';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load RDS CA certificate bundle for SSL validation
const rdsCaCert = fs.readFileSync(path.join(__dirname, '../certs/rds-ca-bundle.pem'));

// Database configuration factory
const createDbConfig = async () => {
  const useSecretsManager = process.env.USE_SECRETS_MANAGER === 'true';

  if (useSecretsManager && process.env.DB_SECRET_NAME) {
    console.log('🔐 Using AWS Secrets Manager for database credentials');
    try {
      const credentials = await secretsManager.getDatabaseCredentials(process.env.DB_SECRET_NAME);

      return {
        host: credentials.host,
        port: parseInt(credentials.port || '5432'),
        database: credentials.database,
        user: credentials.user,
        password: credentials.password,
        client_encoding: 'UTF8', // Explicitly set UTF-8 encoding
        ssl: process.env.DB_SSL === 'true' ? {
          ca: rdsCaCert,
          rejectUnauthorized: true // Validate RDS SSL certificate
        } : false,
        max: 25, // Maximum number of connections in the pool (increased from 20)
        min: 2, // Minimum number of connections to maintain
        idleTimeoutMillis: 600000, // Close idle connections after 10 minutes (increased from 5)
        connectionTimeoutMillis: 30000, // Return an error after 30 seconds if connection could not be established (reduced from 60)
        query_timeout: 60000, // Query timeout 1 minute (reduced from 2 minutes)
        acquireTimeoutMillis: 60000, // Wait time for getting connection from pool
        keepAlive: true, // Enable TCP keep-alive
        keepAliveInitialDelayMillis: 10000, // Initial delay for keep-alive
      };
    } catch (error) {
      console.error('❌ Failed to get credentials from Secrets Manager, falling back to environment variables');
      console.error('Error:', error.message);
    }
  }

  console.log('📝 Using environment variables for database credentials');
  return {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    client_encoding: 'UTF8', // Explicitly set UTF-8 encoding
    ssl: process.env.DB_SSL === 'true' ? {
      ca: rdsCaCert,
      rejectUnauthorized: true // Validate RDS SSL certificate
    } : false,
    max: 25, // Maximum number of connections in the pool (increased from 20)
    min: 2, // Minimum number of connections to maintain
    idleTimeoutMillis: 600000, // Close idle connections after 10 minutes (increased from 5)
    connectionTimeoutMillis: 30000, // Return an error after 30 seconds if connection could not be established (reduced from 60)
    query_timeout: 60000, // Query timeout 1 minute (reduced from 2 minutes)
    acquireTimeoutMillis: 60000, // Wait time for getting connection from pool
    keepAlive: true, // Enable TCP keep-alive
    keepAliveInitialDelayMillis: 10000, // Initial delay for keep-alive
  };
};

// Create connection pool (will be initialized on first use)
let pool = null;

const getPool = async () => {
  if (!pool) {
    const dbConfig = await createDbConfig();
    pool = new Pool(dbConfig);

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('❌ Unexpected database pool error:', err);
      // Reset pool to force reconnection with fresh credentials
      pool = null;
    });
  }
  return pool;
};

export { getPool };

// Test database connection
export const testConnection = async () => {
  try {
    const poolInstance = await getPool();
    const client = await poolInstance.connect();
    const result = await client.query('SELECT NOW() as current_time');
    client.release();
    console.log('✅ Database connected successfully');
    console.log(`Current time: ${result.rows[0].current_time}`);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

// Helper function to execute queries
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const poolInstance = await getPool();
    const result = await poolInstance.query(text, params);
    const duration = Date.now() - start;
    console.log(`Executed query in ${duration}ms:`, text);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    // If it's a connection error, reset the pool to force fresh credentials on next attempt
    if (error.code === 'ECONNREFUSED' || error.code === '28P01' || error.message.includes('password')) {
      console.log('🔄 Resetting database pool due to connection error');
      pool = null;
    }
    throw error;
  }
};

// Helper function to execute transactions
export const transaction = async (callback) => {
  const poolInstance = await getPool();
  const client = await poolInstance.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Graceful shutdown
export const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database pool closed');
  }
};

// Handle process termination
process.on('SIGINT', closePool);
process.on('SIGTERM', closePool);

export default { getPool, query, transaction, testConnection, closePool };