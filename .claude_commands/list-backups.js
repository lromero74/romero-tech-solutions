#!/usr/bin/env node

/**
 * Custom Claude Code slash command: /list-backups
 *
 * Lists all available backups from ~/WebSite/Backups/ directory
 * Shows backup details, sizes, dates, and restore instructions
 *
 * Usage: /list-backups [options]
 * Options:
 *   --detailed, -d    Show detailed information including file contents
 *   --recent, -r N    Show only the N most recent backups (default: all)
 *   --size, -s        Sort by total backup size
 *   --help, -h        Show help information
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the project root (one level up from .claude_commands)
const projectRoot = path.resolve(__dirname, '..');

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString();
}

function parseBackupTimestamp(folderName) {
  // Extract timestamp from folder name like "backup_2025-09-25T07-57-42-129Z"
  const match = folderName.match(/backup_(.+)/);
  if (match) {
    // Convert from backup format to ISO format
    // Input:  2025-09-25T07-57-42-129Z
    // Output: 2025-09-25T07:57:42.129Z
    const timestamp = match[1];
    return timestamp.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, 'T$1:$2:$3.$4Z');
  }
  return null;
}

function getBackupSize(backupPath) {
  let totalSize = 0;
  try {
    const files = fs.readdirSync(backupPath);
    for (const file of files) {
      const filePath = path.join(backupPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        totalSize += stats.size;
      }
    }
  } catch (error) {
    // Ignore errors, return 0
  }
  return totalSize;
}

function getBackupContents(backupPath) {
  const contents = {
    files: [],
    manifest: null,
    totalSize: 0
  };

  try {
    const files = fs.readdirSync(backupPath);

    for (const file of files) {
      const filePath = path.join(backupPath, file);
      const stats = fs.statSync(filePath);

      if (stats.isFile()) {
        const fileInfo = {
          name: file,
          size: stats.size,
          sizeFormatted: formatBytes(stats.size),
          created: stats.birthtime,
          type: 'unknown'
        };

        // Determine file type
        if (file.endsWith('.sql')) {
          fileInfo.type = 'database';
        } else if (file.endsWith('.tar.gz')) {
          fileInfo.type = 'project';
        } else if (file === 'backup_manifest.json') {
          fileInfo.type = 'manifest';
          // Try to read manifest
          try {
            contents.manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          } catch (e) {
            // Ignore manifest read errors
          }
        }

        contents.files.push(fileInfo);
        contents.totalSize += stats.size;
      }
    }
  } catch (error) {
    // Return empty contents on error
  }

  return contents;
}

async function listBackups(options = {}) {
  try {
    console.log('📋 Claude Code Custom Command: /list-backups');
    console.log('================================================');

    const homeDir = os.homedir();
    const backupsDir = path.join(homeDir, 'WebSite', 'Backups');

    if (!fs.existsSync(backupsDir)) {
      console.log('❌ No backups directory found!');
      console.log(`   Expected location: ${backupsDir}`);
      console.log('   Run /backup first to create your first backup.');
      return;
    }

    // Get all backup folders
    const allEntries = fs.readdirSync(backupsDir);
    let backupFolders = allEntries.filter(entry => {
      const fullPath = path.join(backupsDir, entry);
      return fs.statSync(fullPath).isDirectory() && entry.startsWith('backup_');
    });

    if (backupFolders.length === 0) {
      console.log('📭 No backups found in directory.');
      console.log(`   Directory: ${backupsDir}`);
      console.log('   Run /backup to create your first backup.');
      return;
    }

    console.log(`📁 Backup directory: ${backupsDir}`);
    console.log(`🔢 Total backups found: ${backupFolders.length}\n`);

    // Parse timestamps and sort by date (newest first)
    const backupsWithData = backupFolders.map(folder => {
      const backupPath = path.join(backupsDir, folder);
      const contents = getBackupContents(backupPath);
      const timestamp = parseBackupTimestamp(folder);

      return {
        folder,
        path: backupPath,
        timestamp,
        date: timestamp ? new Date(timestamp) : new Date(0),
        contents,
        totalSize: contents.totalSize
      };
    });

    // Sort by date (newest first) or size if requested
    if (options.size) {
      backupsWithData.sort((a, b) => b.totalSize - a.totalSize);
      console.log('📊 Sorted by: Total backup size (largest first)');
    } else {
      backupsWithData.sort((a, b) => b.date - a.date);
      console.log('📅 Sorted by: Date (newest first)');
    }

    // Limit to recent backups if requested
    let backupsToShow = backupsWithData;
    if (options.recent && options.recent > 0) {
      backupsToShow = backupsWithData.slice(0, options.recent);
      console.log(`🔍 Showing: ${options.recent} most recent backups`);
    }

    console.log('');

    // Display each backup
    backupsToShow.forEach((backup, index) => {
      const { folder, contents, totalSize, date, timestamp } = backup;

      console.log(`${index + 1}. 📦 ${folder}`);
      console.log(`   📅 Created: ${formatDate(timestamp || date)}`);
      console.log(`   💾 Total size: ${formatBytes(totalSize)}`);
      console.log(`   📁 Location: ${backup.path}`);

      // Show message in basic view if available
      if (contents.manifest?.message) {
        const message = contents.manifest.message.replace(/\\n/g, '\n   💬 ');
        console.log(`   💬 Description: ${message}`);
      }

      if (options.detailed) {
        console.log('   📄 Contents:');

        // Group files by type
        const dbFiles = contents.files.filter(f => f.type === 'database');
        const projectFiles = contents.files.filter(f => f.type === 'project');
        const manifestFiles = contents.files.filter(f => f.type === 'manifest');
        const otherFiles = contents.files.filter(f => f.type === 'unknown');

        if (dbFiles.length > 0) {
          console.log('      🗄️  Database:');
          dbFiles.forEach(file => {
            console.log(`         • ${file.name} (${file.sizeFormatted})`);
          });
        }

        if (projectFiles.length > 0) {
          console.log('      📦 Project:');
          projectFiles.forEach(file => {
            console.log(`         • ${file.name} (${file.sizeFormatted})`);
          });
        }

        if (manifestFiles.length > 0) {
          console.log('      📋 Manifest:');
          manifestFiles.forEach(file => {
            console.log(`         • ${file.name} (${file.sizeFormatted})`);
          });
        }

        if (otherFiles.length > 0) {
          console.log('      📄 Other:');
          otherFiles.forEach(file => {
            console.log(`         • ${file.name} (${file.sizeFormatted})`);
          });
        }

        // Show manifest info if available
        if (contents.manifest) {
          console.log('   ℹ️  Backup info:');
          if (contents.manifest.message) {
            console.log(`      💬 Description: ${contents.manifest.message.replace(/\\n/g, '\n                     ')}`);
          }
          if (contents.manifest.projectName) {
            console.log(`      Project: ${contents.manifest.projectName}`);
          }
          if (contents.manifest.system?.hostname) {
            console.log(`      Host: ${contents.manifest.system.hostname}`);
          }
          if (contents.manifest.database?.name) {
            console.log(`      Database: ${contents.manifest.database.name}`);
          }
        }
      }

      // Show restore commands
      const dbFile = contents.files.find(f => f.type === 'database');
      const projectFile = contents.files.find(f => f.type === 'project');

      if (dbFile || projectFile) {
        console.log('   🔧 Restore commands:');
        if (dbFile) {
          console.log(`      Database: cd backend && node scripts/restore_database.js ${dbFile.name}`);
        }
        if (projectFile) {
          console.log(`      Project:  tar -xzf "${path.join(backup.path, projectFile.name)}" -C /target/location/`);
        }
      }

      console.log(''); // Empty line between backups
    });

    // Summary stats
    const totalBackupSize = backupsWithData.reduce((sum, b) => sum + b.totalSize, 0);
    console.log('📊 Summary:');
    console.log(`   Total backups: ${backupFolders.length}`);
    console.log(`   Total storage used: ${formatBytes(totalBackupSize)}`);

    if (backupsWithData.length > 0) {
      console.log(`   Oldest backup: ${formatDate(backupsWithData[backupsWithData.length - 1].date)}`);
      console.log(`   Newest backup: ${formatDate(backupsWithData[0].date)}`);
    }

  } catch (error) {
    console.error('❌ Error listing backups:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs(args) {
  const options = {
    detailed: false,
    recent: null,
    size: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--detailed':
      case '-d':
        options.detailed = true;
        break;
      case '--recent':
      case '-r':
        const nextArg = args[i + 1];
        if (nextArg && !isNaN(parseInt(nextArg))) {
          options.recent = parseInt(nextArg);
          i++; // Skip the number argument
        } else {
          console.error('❌ --recent requires a number');
          process.exit(1);
        }
        break;
      case '--size':
      case '-s':
        options.size = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`❌ Unknown option: ${arg}`);
          process.exit(1);
        }
        break;
    }
  }

  return options;
}

// Show help
function showHelp() {
  console.log('📋 Claude Code Custom Command: /list-backups');
  console.log('===============================================');
  console.log('');
  console.log('Lists all available backups from ~/WebSite/Backups/');
  console.log('');
  console.log('Usage:');
  console.log('  /list-backups [options]');
  console.log('  node .claude_commands/list-backups.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --detailed, -d        Show detailed information including file contents');
  console.log('  --recent N, -r N      Show only the N most recent backups');
  console.log('  --size, -s            Sort by total backup size (largest first)');
  console.log('  --help, -h            Show this help information');
  console.log('');
  console.log('Examples:');
  console.log('  /list-backups                 # List all backups');
  console.log('  /list-backups -d              # Show detailed information');
  console.log('  /list-backups -r 5            # Show 5 most recent backups');
  console.log('  /list-backups -d -s           # Detailed view, sorted by size');
  console.log('');
}

// Main execution
const args = process.argv.slice(2);
const options = parseArgs(args);

if (options.help) {
  showHelp();
} else {
  listBackups(options);
}