import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import secretsManager from '../utils/secrets.js';

dotenv.config();

const execAsync = promisify(exec);

async function backupDatabase() {
  try {
    // Create backup directory if it doesn't exist
    const backupDir = path.join(process.cwd(), '..', 'database_backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Generate timestamp for backup filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup_${timestamp}.sql`;
    const backupFilePath = path.join(backupDir, backupFileName);

    console.log('🔄 Starting database backup...');
    console.log(`📂 Backup directory: ${backupDir}`);
    console.log(`📄 Backup file: ${backupFileName}`);

    // Get database credentials using AWS Secrets Manager (same as application)
    let dbCredentials;
    const useSecretsManager = process.env.USE_SECRETS_MANAGER === 'true';

    if (useSecretsManager && process.env.DB_SECRET_NAME) {
      console.log('🔐 Using AWS Secrets Manager for database credentials');
      dbCredentials = await secretsManager.getDatabaseCredentials(process.env.DB_SECRET_NAME);
    } else {
      console.log('📝 Using environment variables for database credentials');
      dbCredentials = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
      };
    }

    // Build pg_dump command with connection parameters
    const pgDumpCmd = [
      '/opt/homebrew/opt/postgresql@16/bin/pg_dump',
      `--host=${dbCredentials.host}`,
      `--port=${dbCredentials.port}`,
      `--username=${dbCredentials.user}`,
      `--dbname=${dbCredentials.database}`,
      '--verbose',
      '--clean',
      '--if-exists',
      '--create',
      '--format=plain',
      '--no-password',
      `--file=${backupFilePath}`
    ].join(' ');

    console.log('🏃 Running pg_dump command...');
    console.log(`Command: ${pgDumpCmd.replace(dbCredentials.password, '***')}`);

    // Set PGPASSWORD environment variable for authentication
    const env = { ...process.env, PGPASSWORD: dbCredentials.password };

    // Execute the backup command
    const { stdout, stderr } = await execAsync(pgDumpCmd, { env });

    if (stderr && !stderr.includes('NOTICE:')) {
      console.log('⚠️  pg_dump stderr output:', stderr);
    }

    // Check if backup file was created and has content
    if (fs.existsSync(backupFilePath)) {
      const stats = fs.statSync(backupFilePath);
      if (stats.size > 0) {
        console.log('✅ Database backup completed successfully!');
        console.log(`📊 Backup file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`📁 Backup saved to: ${backupFilePath}`);

        // List all backups in the directory
        const backupFiles = fs.readdirSync(backupDir)
          .filter(file => file.startsWith('backup_') && file.endsWith('.sql'))
          .sort()
          .reverse();

        console.log('\n📋 Available backups:');
        backupFiles.forEach((file, index) => {
          const filePath = path.join(backupDir, file);
          const fileStats = fs.statSync(filePath);
          const fileSize = (fileStats.size / 1024 / 1024).toFixed(2);
          console.log(`   ${index + 1}. ${file} (${fileSize} MB) - ${fileStats.mtime.toLocaleString()}`);
        });

        console.log('\n🔧 To restore this backup, run:');
        console.log(`   node scripts/restore_database.js ${backupFileName}`);

      } else {
        console.log('❌ Backup file was created but is empty!');
        console.log('   This might indicate a connection or permission issue.');
      }
    } else {
      console.log('❌ Backup file was not created!');
      console.log('   Check your database connection and pg_dump installation.');
    }

  } catch (error) {
    console.error('❌ Error during database backup:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Ensure pg_dump is installed and in your PATH');
    console.error('2. Verify database connection parameters in .env');
    console.error('3. Check that the database user has sufficient privileges');
    console.error('4. Ensure the database is accessible from this machine');

    if (error.message.includes('command not found')) {
      console.error('\n🔧 Install PostgreSQL client tools:');
      console.error('   macOS: brew install postgresql');
      console.error('   Ubuntu: sudo apt-get install postgresql-client');
      console.error('   Windows: Download from https://www.postgresql.org/download/');
    }
  }
}

backupDatabase();