import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

class SecretsManager {
  constructor() {
    this.client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-1'
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

      const response = await this.client.send(command);

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

    return {
      host: secret.host,
      port: secret.port,
      database: secret.dbname,
      user: secret.username,
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