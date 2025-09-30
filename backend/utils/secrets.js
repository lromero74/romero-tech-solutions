import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

class SecretsManager {
  constructor() {
    this.client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-1',
      requestHandler: {
        requestTimeout: 10000, // 10 second timeout
      },
    });
    this.cache = new Map();
    this.cacheExpiry = new Map();
    this.cacheTTL = 300000; // 5 minutes in milliseconds
  }

  async getSecret(secretName) {
    // Check cache first
    const now = Date.now();
    if (this.cache.has(secretName) && this.cacheExpiry.get(secretName) > now) {
      console.log(`🔐 Using cached secret: ${secretName}`);
      return this.cache.get(secretName);
    }

    try {
      console.log(`🔐 Fetching secret from AWS: ${secretName}`);

      const command = new GetSecretValueCommand({
        SecretId: secretName
      });

      // Add timeout wrapper
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Secrets Manager request timed out after 10 seconds')), 10000);
      });

      const response = await Promise.race([
        this.client.send(command),
        timeoutPromise
      ]);

      if (!response.SecretString) {
        throw new Error('Secret string is empty');
      }

      const secret = JSON.parse(response.SecretString);

      // Cache the secret
      this.cache.set(secretName, secret);
      this.cacheExpiry.set(secretName, now + this.cacheTTL);

      console.log(`✅ Successfully retrieved secret: ${secretName}`);
      return secret;
    } catch (error) {
      console.error(`❌ Error retrieving secret ${secretName}:`, error.message);
      throw error;
    }
  }

  async getDatabaseCredentials(secretName) {
    const secret = await this.getSecret(secretName);

    // Map AWS RDS secret format to our database config format
    return {
      host: secret.host || process.env.DB_HOST,
      port: secret.port || process.env.DB_PORT || 5432,
      database: secret.dbname || process.env.DB_NAME,
      user: secret.username || process.env.DB_USER,
      password: secret.password
    };
  }

  clearCache() {
    this.cache.clear();
    this.cacheExpiry.clear();
    console.log('🗑️ Secrets cache cleared');
  }
}

export default new SecretsManager();