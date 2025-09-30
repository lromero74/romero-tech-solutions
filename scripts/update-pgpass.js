#!/usr/bin/env node

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Updates ~/.pgpass file with database credentials from AWS Secrets Manager
 * This allows pg_dump and other PostgreSQL client tools to authenticate automatically
 */

const SECRETS_MANAGER_CONFIG = {
  region: 'us-east-1',
  secretName: 'rds!db-4506c469-7cb8-4f84-99d4-89a63c893bd0'
};

const PGPASS_FORMAT = {
  host: '34.228.181.68',
  port: '5432',
  database: '*',  // * means all databases
  username: 'postgres'
};

async function getSecretsManagerCredentials() {
  try {
    console.log('🔐 Retrieving database credentials from AWS Secrets Manager...');

    const client = new SecretsManagerClient({ region: SECRETS_MANAGER_CONFIG.region });
    const command = new GetSecretValueCommand({ SecretId: SECRETS_MANAGER_CONFIG.secretName });

    const response = await client.send(command);
    const credentials = JSON.parse(response.SecretString);

    console.log(`✅ Retrieved credentials for user: ${credentials.username}`);
    return credentials;

  } catch (error) {
    console.error('❌ Failed to retrieve credentials from Secrets Manager:', error.message);
    throw error;
  }
}

async function updatePgPassFile(password) {
  const pgpassPath = path.join(os.homedir(), '.pgpass');

  try {
    // Format: hostname:port:database:username:password
    const pgpassEntry = `${PGPASS_FORMAT.host}:${PGPASS_FORMAT.port}:${PGPASS_FORMAT.database}:${PGPASS_FORMAT.username}:${password}`;

    let existingContent = '';
    if (fs.existsSync(pgpassPath)) {
      existingContent = fs.readFileSync(pgpassPath, 'utf8');
      console.log('📝 Found existing .pgpass file');
    }

    // Remove any existing entries for this host/user combination
    const lines = existingContent.split('\n');
    const filteredLines = lines.filter(line => {
      if (!line.trim()) return true; // Keep empty lines
      const parts = line.split(':');
      return !(parts[0] === PGPASS_FORMAT.host && parts[3] === PGPASS_FORMAT.username);
    });

    // Add our new entry
    filteredLines.push(pgpassEntry);

    // Write the updated file
    const newContent = filteredLines.join('\n');
    fs.writeFileSync(pgpassPath, newContent, { mode: 0o600 }); // 600 = rw-------

    console.log(`✅ Updated ${pgpassPath} with database credentials`);
    console.log(`🔒 File permissions set to 600 (owner read/write only)`);

    return pgpassPath;

  } catch (error) {
    console.error('❌ Failed to update .pgpass file:', error.message);
    throw error;
  }
}

async function testConnection() {
  console.log('\n🧪 Testing pg_dump connection...');

  const { spawn } = await import('child_process');

  return new Promise((resolve, reject) => {
    const pgDump = spawn('pg_dump', [
      '-h', PGPASS_FORMAT.host,
      '-p', PGPASS_FORMAT.port,
      '-U', PGPASS_FORMAT.username,
      '-d', 'romerotechsolutions',
      '--schema-only',
      '--no-comments',
      '--table=system_settings'  // Just test with one small table
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    let error = '';

    pgDump.stdout.on('data', (data) => {
      output += data.toString();
    });

    pgDump.stderr.on('data', (data) => {
      error += data.toString();
    });

    pgDump.on('close', (code) => {
      if (code === 0) {
        console.log('✅ pg_dump connection test successful!');
        console.log(`📊 Schema output sample: ${output.split('\n')[0]}...`);
        resolve(true);
      } else {
        console.error('❌ pg_dump connection test failed');
        console.error(`Error output: ${error}`);
        reject(new Error(`pg_dump exited with code ${code}`));
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      pgDump.kill();
      reject(new Error('pg_dump connection test timed out'));
    }, 10000);
  });
}

async function main() {
  try {
    console.log('🚀 Starting .pgpass update process...\n');

    // Get credentials from Secrets Manager
    const credentials = await getSecretsManagerCredentials();

    // Update .pgpass file
    const pgpassPath = await updatePgPassFile(credentials.password);

    // Test the connection
    await testConnection();

    console.log('\n🎉 Successfully updated .pgpass file!');
    console.log('\n📋 You can now use pg_dump without password prompts:');
    console.log(`   pg_dump -h ${PGPASS_FORMAT.host} -U ${PGPASS_FORMAT.username} -d romerotechsolutions > schema.sql`);
    console.log(`   pg_dump -h ${PGPASS_FORMAT.host} -U ${PGPASS_FORMAT.username} -d romerotechsolutions_dev > dev_schema.sql`);

  } catch (error) {
    console.error('\n💥 Process failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { updatePgPassFile, getSecretsManagerCredentials };