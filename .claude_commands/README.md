# Custom Backup Commands

This directory contains custom Node.js scripts for backup management in the Romero Tech Solutions project.

**Important**: These are standalone scripts, not integrated Claude Code slash commands.

## Available Commands

### `backup.js`

**Description**: Creates a comprehensive backup of the entire project including database and source code.

**Usage**:
```bash
node .claude_commands/backup.js [options]
```

**Options**:
- `--message MESSAGE, -m MESSAGE` - Add a descriptive comment to the backup (like a git commit message)
- `--help, -h` - Show detailed help information and usage examples

**Examples**:
```bash
node .claude_commands/backup.js           # Create comprehensive backup
node .claude_commands/backup.js -m "Fixed authentication bugs"    # With description
node .claude_commands/backup.js --help    # Show detailed help
```

**What it does**:
1. Creates timestamped backup folder in `~/WebSite/Backups/backup_[timestamp]/`
2. Performs PostgreSQL database dump using `pg_dump`
3. Creates gzipped tarball of project files (excluding node_modules, .git, etc.)
4. Generates backup manifest with metadata and restore instructions
5. Lists recent backups for reference

**Requirements**:
- PostgreSQL client tools installed (`pg_dump`)
- Database connection configured in `.env` file
- Write permissions to `~/WebSite/Backups/` directory

**Output Files**:
- `database_[timestamp].sql` - Complete database dump
- `project_[name]_[timestamp].tar.gz` - Compressed project files
- `backup_manifest.json` - Backup metadata and restore instructions

**Restore Instructions**:
```bash
# Database restore:
cd backend && node scripts/restore_database.js database_[timestamp].sql

# Project restore:
tar -xzf project_[name]_[timestamp].tar.gz -C /target/directory/
```

### `list-backups.js`

**Description**: Lists all available backups from `~/WebSite/Backups/` with detailed information and restore instructions.

**Usage**:
```bash
node .claude_commands/list-backups.js [options]
```

**Options**:
- `--detailed, -d` - Show detailed information including file contents
- `--recent N, -r N` - Show only the N most recent backups
- `--size, -s` - Sort by total backup size (largest first)
- `--help, -h` - Show help information

**Examples**:
```bash
node .claude_commands/list-backups.js           # List all backups
node .claude_commands/list-backups.js -d        # Show detailed information
node .claude_commands/list-backups.js -r 5      # Show 5 most recent backups
node .claude_commands/list-backups.js -d -s     # Detailed view, sorted by size
```

**What it shows**:
- Backup timestamps and creation dates
- Total backup sizes and individual file sizes
- File contents (database dumps, project tarballs, manifests)
- Backup metadata from manifest files
- Ready-to-use restore commands
- Summary statistics (total backups, storage used, date range)

**No Requirements**: Read-only operation, works as long as backup directory exists

## Command Structure

Each command consists of:
- **Script file**: JavaScript/Node.js executable (e.g., `backup.js`)
- **Configuration**: Metadata in `config.json`
- **Documentation**: This README file

## Adding New Commands

1. Create new `.js` script file in this directory
2. Make it executable: `chmod +x command.js`
3. Add configuration entry to `config.json`
4. Update this README with usage instructions

## Notes

- All scripts run from the project root directory
- Scripts have access to project environment variables
- Use relative paths from project root in scripts
- Include proper error handling and user feedback