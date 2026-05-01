#!/usr/bin/env node

/**
 * Romero Tech Solutions - System-Wide Backup
 * 
 * This script performs a comprehensive backup of all projects running on fedora.local.
 * It captures:
 * 1. PostgreSQL databases (via podman exec postgres-box pg_dump)
 * 2. SQLite databases (direct file copy)
 * 3. User-uploaded files (PDFs, icons, etc.)
 * 4. Project source code (excluding node_modules)
 * 
 * The script runs on the local Mac and coordinates the backup via SSH.
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

// --- Configuration ---
const REMOTE_HOST = 'fedora.local';
const REMOTE_USER = 'louis';
const BACKUP_ROOT_LOCAL = path.join(os.homedir(), 'WebSite', 'Backups');

// Database Container Config
const PG_CONTAINER = 'postgres-box';

const PROJECTS = [
  {
    name: 'romero-tech-solutions',
    remotePath: '/home/louis/romero-tech-solutions',
    dbType: 'postgres',
    dbName: 'romerotechsolutions',
    dbUser: 'romero_app',
    dbPass: 'xVRCCJYI66LC0u8UMuhHqjbzNFq8mWIG',
    uploadPaths: ['backend/uploads']
  },
  {
    name: 'worship-setlist',
    remotePath: '/home/louis/worship-setlist',
    dbType: 'sqlite',
    dbFile: 'data/database.sqlite',
    uploadPaths: ['data/pdfs']
  },
  {
    name: 'funder-finder',
    remotePath: '/home/louis/funder-finder',
    dbType: 'sqlite',
    dbFile: 'backend/data/database.sqlite',
    uploadPaths: ['backend/uploads']
  },
  {
    name: 'tampa-re-investor',
    remotePath: '/home/louis/tampa-re-investor',
    dbType: 'sqlite',
    dbFile: 'backend/data/database.sqlite',
    uploadPaths: ['backend/uploads']
  },
  {
    name: 'ZenithGrid',
    remotePath: '/home/louis/ZenithGrid',
    dbType: 'postgres',
    dbName: 'zenithgrid',
    dbUser: 'zenithgrid_app',
    dbPass: 'cwPPJBsETiMkWntXP-EqEFBPZU28qU0MxJVzjH3TaUk',
    uploadPaths: ['backend/uploads']
  }
];

// --- Helpers ---

async function runRemote(command) {
  const sshCmd = `ssh ${REMOTE_HOST} "${command.replace(/"/g, '\\"')}"`;
  return execAsync(sshCmd);
}

function parseArgs(args) {
  const options = { message: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--message' || args[i] === '-m') {
      options.message = args[i + 1];
      i++;
    }
  }
  return options;
}

// --- Main Process ---

async function systemWideBackup() {
  const options = parseArgs(process.argv.slice(2));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFolder = `system_backup_${timestamp}`;
  const localDest = path.join(BACKUP_ROOT_LOCAL, backupFolder);
  const remoteTemp = `/home/${REMOTE_USER}/tmp/${backupFolder}`; // Use home tmp to avoid root perms

  console.log('🚀 Starting System-Wide Backup for fedora.local');
  console.log('================================================');
  if (options.message) console.log(`💬 Note: ${options.message}\n`);

  try {
    // 1. Prepare directories
    console.log(`📁 Creating local backup directory: ${localDest}`);
    fs.mkdirSync(localDest, { recursive: true });

    console.log(`📁 Creating remote temporary directory: ${remoteTemp}`);
    await runRemote(`mkdir -p ${remoteTemp}`);

    const manifest = {
      timestamp: new Date().toISOString(),
      host: REMOTE_HOST,
      message: options.message,
      projects: []
    };

    // 2. Process each project
    for (const project of PROJECTS) {
      console.log(`\n📦 Processing project: ${project.name}`);
      console.log('------------------------------------------------');

      const projectBackupDir = `${remoteTemp}/${project.name}`;
      await runRemote(`mkdir -p ${projectBackupDir}`);

      // A. Database Backup
      if (project.dbType === 'postgres') {
        console.log(`   🗄️  Dumping Postgres DB: ${project.dbName}`);
        // We dump to /tmp inside the container then move it to the remote backup dir
        const containerTmp = `/tmp/${project.name}_db.sql`;
        await runRemote(`podman exec -e PGPASSWORD=${project.dbPass} ${PG_CONTAINER} pg_dump -h localhost -U ${project.dbUser} -d ${project.dbName} -f ${containerTmp}`);
        // Move from container to the project backup directory on the host
        // Note: podman cp is the way if it's a plain container
        await runRemote(`podman cp ${PG_CONTAINER}:${containerTmp} ${projectBackupDir}/database.sql`);
        // Clean up container tmp
        await runRemote(`podman exec ${PG_CONTAINER} rm ${containerTmp}`);
      } else if (project.dbType === 'sqlite') {
        console.log(`   🗄️  Copying SQLite DB: ${project.dbFile}`);
        await runRemote(`if [ -f "${project.remotePath}/${project.dbFile}" ]; then cp ${project.remotePath}/${project.dbFile} ${projectBackupDir}/database.sqlite; fi`);
      }

      // B. Uploads / Critical Files
      for (const uploadPath of project.uploadPaths) {
        console.log(`   📂 Capturing uploads: ${uploadPath}`);
        const destName = uploadPath.replace(/\//g, '_');
        await runRemote(`if [ -d "${project.remotePath}/${uploadPath}" ]; then cp -r ${project.remotePath}/${uploadPath} ${projectBackupDir}/${destName}; fi`);
      }

      // C. Source Code (Minimal)
      console.log(`   📜 Packaging source (excluding node_modules)...`);
      const tarName = `source.tar.gz`;
      await runRemote(`tar -czf ${projectBackupDir}/${tarName} -C ${path.dirname(project.remotePath)} --exclude=node_modules --exclude=.git --exclude=dist --exclude=build ${path.basename(project.remotePath)}`);

      manifest.projects.push({
        name: project.name,
        dbType: project.dbType,
        dbName: project.dbName || project.dbFile,
        uploads: project.uploadPaths
      });
    }

    // 3. Finalize Manifest
    console.log('\n📋 Creating backup manifest...');
    const manifestPath = path.join(localDest, 'backup_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // 4. Pull everything to local Mac
    console.log(`\n🚚 Transferring backup bundle to local Mac...`);
    // Zip it up on the remote first to save transfer time
    const remoteBundle = `${remoteTemp}.tar.gz`;
    await runRemote(`tar -czf ${remoteBundle} -C ${path.dirname(remoteTemp)} ${path.basename(remoteTemp)}`);
    
    // Scp the zip
    await execAsync(`scp ${REMOTE_HOST}:${remoteBundle} ${localDest}/bundle.tar.gz`);
    
    // Extract local
    console.log(`   📦 Extracting bundle on Mac...`);
    await execAsync(`tar -xzf ${localDest}/bundle.tar.gz -C ${localDest} --strip-components=1`);
    await execAsync(`rm ${localDest}/bundle.tar.gz`);

    // 5. Cleanup Remote
    console.log(`🧹 Cleaning up remote temporary files...`);
    await runRemote(`rm -rf ${remoteTemp} ${remoteBundle}`);

    console.log('\n================================================');
    console.log('✅ SYSTEM-WIDE BACKUP COMPLETE');
    console.log(`📍 Location: ${localDest}`);
    console.log('================================================');

  } catch (error) {
    console.error('\n❌ Backup failed!');
    console.error(error);
    process.exit(1);
  }
}

systemWideBackup();
