#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import secretsManager from './backend/utils/secrets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend directory (where actual DB config is)
dotenv.config({ path: path.join(__dirname, 'backend', '.env') });

const execAsync = promisify(exec);

// Parse command line arguments
function parseArgs(args) {
  const options = {
    message: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--message' && args[i + 1]) {
      options.message = args[i + 1];
      i++; // Skip the message value
    }
  }

  return options;
}

async function createBackup(options = {}) {
  try {
    console.log('🚀 Starting comprehensive backup process...');
    console.log('============================================');

    // Show message if provided
    if (options.message) {
      console.log(`💬 Backup description: "${options.message}"`);
      console.log('');
    }

    // Generate timestamp for backup folder
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFolderName = `backup_${timestamp}`;

    // Create ~/WebSite/Backups directory structure
    const homeDir = os.homedir();
    const websiteBackupsDir = path.join(homeDir, 'WebSite', 'Backups');
    const timestampedBackupDir = path.join(websiteBackupsDir, backupFolderName);

    console.log(`📂 Creating backup directory structure...`);
    if (!fs.existsSync(websiteBackupsDir)) {
      fs.mkdirSync(websiteBackupsDir, { recursive: true });
      console.log(`   ✅ Created: ${websiteBackupsDir}`);
    } else {
      console.log(`   ℹ️  Directory exists: ${websiteBackupsDir}`);
    }

    fs.mkdirSync(timestampedBackupDir, { recursive: true });
    console.log(`   ✅ Created timestamped backup folder: ${timestampedBackupDir}`);

    // Step 1: Database Backup
    console.log('\n🗄️  Step 1: Backing up database...');
    console.log('====================================');

    const dbBackupFileName = `database_${timestamp}.sql`;
    const dbBackupPath = path.join(timestampedBackupDir, dbBackupFileName);

    try {
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
        `--file=${dbBackupPath}`
      ].join(' ');

      console.log('🏃 Running database backup...');
      console.log(`Command: ${pgDumpCmd.replace(dbCredentials.password, '***')}`);

      // Set PGPASSWORD environment variable for authentication
      const env = { ...process.env, PGPASSWORD: dbCredentials.password };

      const { stdout, stderr } = await execAsync(pgDumpCmd, { env });

      if (stderr && !stderr.includes('NOTICE:')) {
        console.log('⚠️  pg_dump stderr output:', stderr);
      }

      // Check if database backup was created successfully
      if (fs.existsSync(dbBackupPath)) {
        const dbStats = fs.statSync(dbBackupPath);
        if (dbStats.size > 0) {
          console.log('✅ Database backup completed successfully!');
          console.log(`📊 Database backup size: ${(dbStats.size / 1024 / 1024).toFixed(2)} MB`);
        } else {
          throw new Error('Database backup file is empty');
        }
      } else {
        throw new Error('Database backup file was not created');
      }
    } catch (dbError) {
      console.error('❌ Database backup failed:', dbError.message);
      console.log('⚠️  Continuing with project files backup...');
    }

    // Step 2: Project Files Backup
    console.log('\n📦 Step 2: Creating project files backup...');
    console.log('===========================================');

    const projectRoot = process.cwd();
    const projectName = path.basename(projectRoot);
    const projectBackupFileName = `project_${projectName}_${timestamp}.tar.gz`;
    const projectBackupPath = path.join(timestampedBackupDir, projectBackupFileName);

    // Create tarball excluding node_modules and other unnecessary files
    const tarCmd = [
      'tar',
      '-czf',
      `"${projectBackupPath}"`,
      '--exclude=node_modules',
      '--exclude=.git',
      '--exclude=dist',
      '--exclude=build',
      '--exclude=coverage',
      '--exclude=.vscode',
      '--exclude=.idea',
      '--exclude=*.log',
      '--exclude=.DS_Store',
      '--exclude=.env.local',
      '--exclude=.env.*.local',
      '--exclude=database_backups',
      '-C',
      path.dirname(projectRoot),
      path.basename(projectRoot)
    ].join(' ');

    console.log('🏃 Creating project tarball...');
    console.log(`Command: ${tarCmd}`);

    try {
      const { stdout, stderr } = await execAsync(tarCmd);

      if (stderr) {
        console.log('⚠️  tar stderr output:', stderr);
      }

      // Check if project backup was created successfully
      if (fs.existsSync(projectBackupPath)) {
        const projectStats = fs.statSync(projectBackupPath);
        if (projectStats.size > 0) {
          console.log('✅ Project files backup completed successfully!');
          console.log(`📊 Project backup size: ${(projectStats.size / 1024 / 1024).toFixed(2)} MB`);
        } else {
          throw new Error('Project backup file is empty');
        }
      } else {
        throw new Error('Project backup file was not created');
      }
    } catch (projectError) {
      console.error('❌ Project backup failed:', projectError.message);
      throw projectError;
    }

    // Step 3: Create backup manifest
    console.log('\n📋 Step 3: Creating backup manifest...');
    console.log('=====================================');

    const manifestPath = path.join(timestampedBackupDir, 'backup_manifest.json');
    const manifest = {
      timestamp: new Date().toISOString(),
      backupFolder: backupFolderName,
      projectName: projectName,
      projectPath: projectRoot,
      message: options.message || null,
      files: {},
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version
      },
      database: {
        host: process.env.DB_HOST || 'from-secrets-manager',
        port: process.env.DB_PORT || '5432',
        name: process.env.DB_NAME || 'from-secrets-manager',
        user: process.env.DB_USER || 'from-secrets-manager',
        secretsManager: process.env.USE_SECRETS_MANAGER === 'true'
      }
    };

    // Add file information to manifest
    try {
      const files = fs.readdirSync(timestampedBackupDir);
      for (const file of files) {
        if (file !== 'backup_manifest.json') {
          const filePath = path.join(timestampedBackupDir, file);
          const stats = fs.statSync(filePath);
          manifest.files[file] = {
            size: stats.size,
            sizeFormatted: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
            created: stats.birthtime.toISOString(),
            type: path.extname(file) === '.sql' ? 'database' : 'project'
          };
        }
      }
    } catch (manifestError) {
      console.log('⚠️  Could not create complete manifest:', manifestError.message);
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log('✅ Backup manifest created');

    // Final Summary
    console.log('\n🎉 Backup Process Complete!');
    console.log('============================');
    console.log(`📁 Backup location: ${timestampedBackupDir}`);
    console.log('\n📋 Backup contents:');

    const finalFiles = fs.readdirSync(timestampedBackupDir);
    finalFiles.forEach(file => {
      const filePath = path.join(timestampedBackupDir, file);
      const stats = fs.statSync(filePath);
      const sizeFormatted = file.includes('.tar.gz')
        ? `${(stats.size / 1024 / 1024).toFixed(2)} MB`
        : `${(stats.size / 1024).toFixed(2)} KB`;
      console.log(`   📄 ${file} (${sizeFormatted})`);
    });

    console.log('\n🔧 To restore:');
    console.log(`   Database: cd backend && node scripts/restore_database.js ${dbBackupFileName}`);
    console.log(`   Project:  tar -xzf "${projectBackupPath}" -C /desired/location/`);

    // List recent backups
    console.log('\n📚 Recent backups:');
    const allBackups = fs.readdirSync(websiteBackupsDir)
      .filter(dir => dir.startsWith('backup_'))
      .sort()
      .reverse()
      .slice(0, 5);

    allBackups.forEach((backup, index) => {
      const backupPath = path.join(websiteBackupsDir, backup);
      const backupStats = fs.statSync(backupPath);
      console.log(`   ${index + 1}. ${backup} - ${backupStats.mtime.toLocaleString()}`);
    });

  } catch (error) {
    console.error('\n❌ Backup process failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Ensure PostgreSQL client tools are installed (pg_dump)');
    console.error('2. Verify database connection parameters in .env file');
    console.error('3. Check that tar is available (should be on macOS/Linux)');
    console.error('4. Ensure sufficient disk space for backups');

    process.exit(1);
  }
}

// Parse command line arguments and run the backup
const args = process.argv.slice(2);
const options = parseArgs(args);
createBackup(options);