# Scripts Directory

This directory contains utility scripts for setting up, managing, and maintaining the Romero Tech Solutions application.

## Database Setup Scripts

### 🚀 `fresh-install-db.sh` (Recommended for new installations)

**Purpose**: Creates a complete database from scratch with all schema and essential system data, but NO production-specific information.

**What it includes:**
- ✅ Complete database schema
- ✅ Translation system (English + Spanish)
- ✅ Service types and descriptions
- ✅ Roles and permissions
- ✅ Rate categories and pricing tiers
- ✅ RMM automation defaults
- ✅ System configuration

**What it excludes:**
- ❌ Businesses and service locations
- ❌ Users, clients, and employees
- ❌ Service requests and invoices
- ❌ Monitoring agents and metrics
- ❌ Any production data

**When to use:**
- Setting up a new development environment
- Creating a test database
- Another developer is cloning the repository
- Resetting your local database to a clean state

**Usage:**
```bash
./fresh-install-db.sh
```

**Features:**
- Interactive confirmation prompts
- Progress tracking with visual feedback
- Error handling with option to continue
- Installation summary with timing information

---

### 📋 `run-all-migrations.sh`

**Purpose**: Runs all migration files in sequential order without the interactive prompts.

**When to use:**
- Automated/CI/CD environments
- Updating an existing database with new migrations
- When you prefer a simpler, non-interactive installation

**Usage:**
```bash
./run-all-migrations.sh
```

**Note**: This script is called by both `fresh-install-db.sh` and `setup.sh`.

---

### 🔍 `verify-clean-db.sh`

**Purpose**: Verifies that the database contains only seed data and no production-specific information.

**What it checks:**
- **Production Data** (should be 0): businesses, users, employees, service requests, invoices, monitoring agents
- **Seed Data** (should exist): translation keys, service types, roles, rate categories

**When to use:**
- After running a fresh install
- Before sharing a database dump
- To verify test/development environments are clean

**Usage:**
```bash
./verify-clean-db.sh
```

**Exit codes:**
- `0`: Database is clean (only seed data)
- `1`: Database contains production data or missing seed data

---

## Environment Setup Scripts

### ⚙️ `setup.sh`

**Purpose**: Complete interactive setup for new installations, including dependency installation, environment configuration, and database initialization.

**What it does:**
1. Checks for required dependencies (Node.js, PostgreSQL, etc.)
2. Installs missing dependencies
3. Configures environment variables (.env files)
4. Sets up AWS credentials (optional)
5. Initializes the database using migrations
6. Offers to start development servers

**When to use:**
- First time setting up the project
- Setting up a new development machine
- Complete environment reset

**Usage:**
```bash
./setup.sh
```

---

## Backup & Restore Scripts

### 💾 `backup-all.sh`

**Purpose**: Creates comprehensive backups of both the database and project files.

**What it backs up:**
- Database SQL dump (with all data)
- Project files tarball (excluding node_modules, .git, etc.)
- Backup manifest with metadata

**Backup location:** `~/WebSite/Backups/backup_YYYY-MM-DDTHH-MM-SS/`

**Usage:**
```bash
./backup-all.sh
```

**With description:**
```bash
./backup-all.sh --message "Before major refactoring"
```

**Note**: Backups include a manifest file with:
- Timestamp and description
- File sizes and checksums
- Database connection info
- System information

---

## Database Utility Scripts

### 🗄️ `table`

**Purpose**: Quick command-line tool for running SQL queries against the database.

**Usage:**
```bash
# Run a SQL query
./table --sql "SELECT * FROM businesses LIMIT 5"

# Run a SQL file
./table --file query.sql

# Export query results to CSV
./table --sql "SELECT * FROM users" --output users.csv
```

**Note**: This tool automatically uses your backend/.env configuration and supports AWS Secrets Manager.

---

## Service Management Scripts

### 🔄 `restart-services.sh`

**Purpose**: Restarts both frontend and backend development servers.

**What it does:**
1. Stops any running Node.js processes
2. Kills processes on ports 5173 (frontend) and 3001 (backend)
3. Starts the backend server (with nohup)
4. Starts the frontend server (with nohup)
5. Monitors server startup

**Usage:**
```bash
./restart-services.sh
```

**Note**: This script runs necessary environment setup and configuration before starting services.

---

## Common Workflows

### New Developer Setup

```bash
# 1. Clone repository
git clone https://github.com/lromero74/romero-tech-solutions.git
cd romero-tech-solutions

# 2. Run setup (installs deps, configures env, initializes DB)
cd scripts
./setup.sh

# 3. Verify database is clean
./verify-clean-db.sh

# 4. Start development
./restart-services.sh
```

### Reset Local Development Database

```bash
# 1. Backup current data (if needed)
cd scripts
./backup-all.sh --message "Before reset"

# 2. Drop and recreate database
psql -U postgres -c "DROP DATABASE IF EXISTS romerotechsolutions_dev;"
psql -U postgres -c "CREATE DATABASE romerotechsolutions_dev;"

# 3. Run fresh install
./fresh-install-db.sh

# 4. Verify clean install
./verify-clean-db.sh
```

### Before Sharing Database

```bash
# 1. Verify no production data
cd scripts
./verify-clean-db.sh

# 2. If clean, create backup
./backup-all.sh --message "Clean database for distribution"

# 3. Share the database backup file
# Location: ~/WebSite/Backups/backup_[timestamp]/database_[timestamp].sql
```

### Applying New Migrations

```bash
# 1. Backup current database
cd scripts
./backup-all.sh --message "Before applying new migrations"

# 2. Pull latest code with migrations
git pull origin main

# 3. Run new migrations
./run-all-migrations.sh

# 4. Restart services to pick up changes
./restart-services.sh
```

---

## Troubleshooting

### "backend/.env file not found"

Run the setup script first:
```bash
./setup.sh
```

### "Cannot connect to database"

1. Verify PostgreSQL is running: `pg_isready`
2. Check your `.env` file for correct credentials
3. Test connection: `psql -h localhost -U your_user -d your_database`

### "Migration failed"

1. Check the error message in the output
2. Verify database user has sufficient permissions
3. Check if previous migrations completed successfully
4. Review the migration SQL file for syntax errors

### "Script not executable"

Make the script executable:
```bash
chmod +x script-name.sh
```

---

## Best Practices

1. **Always backup before major changes**: Use `backup-all.sh` before applying migrations, making schema changes, or performing data operations

2. **Verify clean databases**: Use `verify-clean-db.sh` before sharing database dumps or committing database changes

3. **Use fresh-install-db.sh for new setups**: This ensures consistent, clean installations across all development environments

4. **Document migrations**: When creating new migrations, include descriptive comments and use `ON CONFLICT DO NOTHING` for seed data

5. **Test migrations on clean database**: Before committing a new migration, test it on a fresh database using `fresh-install-db.sh`

---

## See Also

- [Database Setup Guide](../docs/DATABASE_SETUP.md) - Detailed documentation about database setup and migrations
- [Project README](../README.md) - Main project documentation
- [Backend README](../backend/README.md) - Backend-specific documentation
