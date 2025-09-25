import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

async function restoreDatabase(backupFileName) {
  try {
    if (!backupFileName) {
      console.log('❌ Please provide a backup filename');
      console.log('Usage: node scripts/restore_database.js <backup_filename>');

      // List available backups
      const backupDir = path.join(process.cwd(), '..', 'database_backups');
      if (fs.existsSync(backupDir)) {
        const backupFiles = fs.readdirSync(backupDir)
          .filter(file => file.startsWith('backup_') && file.endsWith('.sql'))
          .sort()
          .reverse();

        if (backupFiles.length > 0) {
          console.log('\n📋 Available backups:');
          backupFiles.forEach((file, index) => {
            const filePath = path.join(backupDir, file);
            const fileStats = fs.statSync(filePath);
            const fileSize = (fileStats.size / 1024 / 1024).toFixed(2);
            console.log(`   ${index + 1}. ${file} (${fileSize} MB) - ${fileStats.mtime.toLocaleString()}`);
          });
        } else {
          console.log('\n📋 No backup files found. Run backup_database.js first.');
        }
      }
      return;
    }

    const backupDir = path.join(process.cwd(), '..', 'database_backups');
    const backupFilePath = path.join(backupDir, backupFileName);

    // Check if backup file exists
    if (!fs.existsSync(backupFilePath)) {
      console.log(`❌ Backup file not found: ${backupFilePath}`);
      return;
    }

    const stats = fs.statSync(backupFilePath);
    console.log('🔄 Starting database restore...');
    console.log(`📄 Backup file: ${backupFileName}`);
    console.log(`📊 Backup file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`🕒 Backup created: ${stats.mtime.toLocaleString()}`);

    // Warning about destructive operation
    console.log('\n⚠️  WARNING: This will completely replace your current database!');
    console.log('   All current data will be lost and replaced with the backup data.');

    // In a real scenario, you might want to prompt for confirmation
    // For now, we'll add a small delay to let the user cancel if needed
    console.log('\n⏳ Starting restore in 5 seconds... (Press Ctrl+C to cancel)');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Build psql command to restore the backup
    const psqlCmd = [
      '/opt/homebrew/opt/postgresql@16/bin/psql',
      `--host=${process.env.DB_HOST}`,
      `--port=${process.env.DB_PORT}`,
      `--username=${process.env.DB_USER}`,
      `--dbname=postgres`, // Connect to postgres database first
      '--no-password',
      '--quiet',
      `--file=${backupFilePath}`
    ].join(' ');

    console.log('🏃 Running psql restore command...');

    // Set PGPASSWORD environment variable for authentication
    const env = { ...process.env, PGPASSWORD: process.env.DB_PASSWORD };

    // Execute the restore command
    const { stdout, stderr } = await execAsync(psqlCmd, { env });

    if (stderr && !stderr.includes('NOTICE:') && !stderr.includes('already exists')) {
      console.log('⚠️  psql stderr output:', stderr);
    }

    console.log('✅ Database restore completed successfully!');
    console.log(`📁 Restored from: ${backupFilePath}`);
    console.log('\n🔧 Next steps:');
    console.log('1. Restart your application server if it\'s running');
    console.log('2. Verify that all data has been restored correctly');
    console.log('3. Check that all application features are working');

  } catch (error) {
    console.error('❌ Error during database restore:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Ensure psql is installed and in your PATH');
    console.error('2. Verify database connection parameters in .env');
    console.error('3. Check that the database user has sufficient privileges');
    console.error('4. Ensure the target database server is accessible');
    console.error('5. Verify the backup file is not corrupted');

    if (error.message.includes('command not found')) {
      console.error('\n🔧 Install PostgreSQL client tools:');
      console.error('   macOS: brew install postgresql');
      console.error('   Ubuntu: sudo apt-get install postgresql-client');
      console.error('   Windows: Download from https://www.postgresql.org/download/');
    }
  }
}

// Get backup filename from command line arguments
const backupFileName = process.argv[2];
restoreDatabase(backupFileName);