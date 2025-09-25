#!/usr/bin/env node

/**
 * Custom Claude Code slash command: /backup
 *
 * Performs comprehensive backup of the Romero Tech Solutions project:
 * - Database dump to ~/WebSite/Backups/[timestamp]/
 * - Project files tarball to same timestamped folder
 * - Backup manifest with restore instructions
 *
 * Usage: /backup
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

// Get the project root (one level up from .claude_commands)
const projectRoot = path.resolve(__dirname, '..');

// Parse command line arguments
function parseArgs(args) {
  const options = {
    help: false,
    message: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--message':
      case '-m':
        const nextArg = args[i + 1];
        if (nextArg && !nextArg.startsWith('-')) {
          options.message = nextArg;
          i++; // Skip the message argument
        } else {
          console.error('❌ --message requires a description');
          console.error('Use --help or -h for usage information.');
          process.exit(1);
        }
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`❌ Unknown option: ${arg}`);
          console.error('Use --help or -h for usage information.');
          process.exit(1);
        }
        break;
    }
  }

  return options;
}

// Show help
function showHelp() {
  console.log('🚀 Claude Code Custom Command: /backup');
  console.log('======================================');
  console.log('');
  console.log('Creates a comprehensive backup of the Romero Tech Solutions project');
  console.log('including database dump and project files.');
  console.log('');
  console.log('Usage:');
  console.log('  /backup [options]                      # (when supported by Claude Code)');
  console.log('  node .claude_commands/backup.js [options]  # Direct execution');
  console.log('  ./backup-all.sh                        # Alternative shell script');
  console.log('');
  console.log('Options:');
  console.log('  --message MESSAGE, -m MESSAGE    Add a descriptive comment to the backup');
  console.log('  --help, -h                       Show this help information');
  console.log('');
  console.log('What it does:');
  console.log('  1. Creates timestamped backup folder in ~/WebSite/Backups/');
  console.log('  2. Performs PostgreSQL database dump (requires valid .env config)');
  console.log('  3. Creates gzipped tarball of project files');
  console.log('  4. Generates backup manifest with metadata');
  console.log('  5. Provides restore instructions');
  console.log('');
  console.log('Backup Contents:');
  console.log('  📄 database_[timestamp].sql        # PostgreSQL dump');
  console.log('  📦 project_[name]_[timestamp].tar.gz   # Compressed project files');
  console.log('  📋 backup_manifest.json            # Backup metadata');
  console.log('');
  console.log('Requirements:');
  console.log('  • PostgreSQL client tools (pg_dump)');
  console.log('  • Valid database connection in .env file');
  console.log('  • Write access to ~/WebSite/Backups/ directory');
  console.log('');
  console.log('Examples:');
  console.log('  node .claude_commands/backup.js');
  console.log('    # Create backup with auto-generated description');
  console.log('');
  console.log('  node .claude_commands/backup.js -m "Fixed authentication bug"');
  console.log('    # Create backup with custom description');
  console.log('');
  console.log('  node .claude_commands/backup.js --message "Release v2.1.0:\\n- Added user roles\\n- Fixed session timeout\\n- Updated UI components"');
  console.log('    # Create backup with multi-line commit-style message');
  console.log('');
  console.log('  node .claude_commands/list-backups.js     # View all backups');
  console.log('  node .claude_commands/list-backups.js -d  # View with descriptions');
  console.log('');
}

async function runBackupCommand(options = {}) {
  try {
    console.log('🚀 Claude Code Custom Command: /backup');
    console.log('=====================================');
    console.log('Starting comprehensive Romero Tech Solutions backup...\n');

    // Change to project directory
    process.chdir(projectRoot);
    console.log(`📂 Working directory: ${projectRoot}`);

    // Run the backup script
    console.log('🏃 Executing backup-all.js...\n');

    const backupScriptPath = path.join(projectRoot, 'backup-all.js');

    if (!fs.existsSync(backupScriptPath)) {
      console.error('❌ Error: backup-all.js not found in project root');
      console.error('   Please ensure the backup script exists at:', backupScriptPath);
      process.exit(1);
    }

    // Execute the backup script with message parameter and stream output in real-time
    const messageArg = options.message ? `--message "${options.message.replace(/"/g, '\\"')}"` : '';
    const child = exec(`node "${backupScriptPath}" ${messageArg}`, { cwd: projectRoot });

    // Stream stdout and stderr in real-time
    if (child.stdout) {
      child.stdout.on('data', (data) => {
        process.stdout.write(data);
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        process.stderr.write(data);
      });
    }

    // Wait for the backup to complete
    const exitCode = await new Promise((resolve) => {
      child.on('close', resolve);
    });

    if (exitCode === 0) {
      console.log('\n✅ Claude Code /backup command completed successfully!');
      console.log('📁 Backup files are available in ~/WebSite/Backups/');
    } else {
      console.error('\n❌ Claude Code /backup command failed!');
      console.error('Please check the output above for details.');
      process.exit(exitCode);
    }

  } catch (error) {
    console.error('\n❌ Claude Code /backup command error:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments and execute
const args = process.argv.slice(2);
const options = parseArgs(args);

if (options.help) {
  showHelp();
} else {
  runBackupCommand(options);
}