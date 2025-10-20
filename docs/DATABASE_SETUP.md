# Database Setup Guide

## Fresh Installation

This project includes a clean database setup that contains **only schema and essential system data** - no production-specific information.

### What's Included in a Fresh Install

#### ✅ Schema (Tables, Indexes, Constraints)
- Complete database structure
- All tables with proper relationships
- Indexes for optimal performance
- Foreign key constraints
- Database functions and triggers

#### ✅ Translation System
- English and Spanish language support
- Translation keys for client and admin interfaces
- Complete translations for all UI elements
- Service type translations
- Status and priority translations

#### ✅ Service Types & Descriptions
- Backup Solutions
- Data Recovery
- Email Configuration
- Hardware Repair
- Network Troubleshooting
- Printer Installation
- Security Assessment
- Software Installation
- System Maintenance
- Wi-Fi Setup
- Other

#### ✅ Role Definitions & Permissions
- Admin role with full permissions
- Manager role with operational permissions
- Technician role with limited permissions
- Permission-based access control system

#### ✅ Rate Categories & Pricing Tiers
- Standard hourly rate categories
- Graduated pricing with tier multipliers
- Configurable base rates
- First-hour discount for new clients

#### ✅ RMM (Remote Monitoring & Management) Defaults
- **Automation Scripts**: System updates, disk cleanup, health checks, service management
- **Automation Policies**: Scheduled maintenance, update policies
- **Software Packages**: Common software (Chrome, Firefox, 7-Zip, VLC, etc.)
- **Maintenance Windows**: Pre-configured maintenance schedules

#### ✅ System Configuration
- Email templates
- Notification templates
- Alert configurations
- System settings and preferences

### What's NOT Included

#### ❌ Production Data
- No businesses or service locations
- No users, clients, or employees
- No service requests or invoices
- No monitoring agents or metrics
- No client files or folders
- No tickets or time entries
- No actual business data

### Installation Methods

#### Method 1: Fresh Install Script (Recommended)

The `fresh-install-db.sh` script provides an interactive installation with progress tracking:

```bash
cd scripts
./fresh-install-db.sh
```

**Features:**
- Interactive confirmation prompts
- Progress tracking with visual feedback
- Error handling with option to continue
- Installation summary with timing
- Clear documentation of what's being installed

#### Method 2: Run All Migrations

The `run-all-migrations.sh` script runs all migrations sequentially:

```bash
cd scripts
./run-all-migrations.sh
```

**Use this when:**
- You prefer a simpler, non-interactive installation
- You're running in a CI/CD pipeline
- You want to update an existing database with new migrations

#### Method 3: Setup Script

The `setup.sh` script provides complete environment setup including database initialization:

```bash
cd scripts
./setup.sh
```

**This script will:**
1. Install dependencies (Node.js, PostgreSQL, etc.)
2. Configure environment variables
3. Set up AWS credentials
4. Initialize the database using migrations
5. Start the development servers

### Post-Installation Steps

After running the fresh install, you'll need to:

1. **Create Your First Employee Account**
   - Use the admin registration endpoint
   - This will be your primary admin user

2. **Configure Business Settings**
   - Add your business information
   - Set up service locations
   - Configure operating hours

3. **Customize Rate Categories** (Optional)
   - Adjust hourly rates for your market
   - Configure pricing tiers if needed

4. **Set Up Monitoring** (Optional)
   - Deploy RTS monitoring agents
   - Configure alert thresholds
   - Set up notification preferences

5. **Invite Team Members**
   - Create employee accounts for your team
   - Assign appropriate roles and permissions
   - Configure access levels

### Database Migration System

#### Migration Files

All migrations are located in `backend/migrations/` and are run in alphabetical order:

- **004-006**: Service request and file storage system
- **007**: Translation system foundation
- **008-011**: Rate tiers and pricing system
- **015-020**: Scheduler, ratings, and testimonials
- **033-047**: RMM features (monitoring, automation, policies)
- **2025xxxx**: Recent enhancements and fixes

#### Creating New Migrations

When adding new features:

1. Create a new migration file in `backend/migrations/`
2. Use a descriptive filename (e.g., `048_add_feature_name.sql`)
3. Include rollback instructions in comments
4. Test the migration on a clean database
5. Document what data it adds (if any)

#### Migration Best Practices

- ✅ Use `ON CONFLICT DO NOTHING` for seed data to make migrations idempotent
- ✅ Include descriptive comments at the top of each migration
- ✅ Keep migrations focused on a single feature or change
- ✅ Never modify existing migrations after they've been run in production
- ✅ Create new migrations to fix or modify previous migrations

### Verification

#### Check Database Is Clean

You can verify the database contains only seed data (no production data):

```bash
cd scripts
./verify-clean-db.sh
```

This script will check for:
- Zero businesses
- Zero users/clients
- Zero employees
- Zero service requests
- Zero monitoring agents

If any production data is found, the script will report it.

#### Check Migration Status

To see which migrations have been run:

```bash
cd backend
npm run migration:status
```

### Troubleshooting

#### "backend/.env file not found"

Run the setup script first:
```bash
cd scripts
./setup.sh
```

#### "Cannot connect to database"

1. Verify PostgreSQL is running
2. Check your `.env` file for correct database credentials
3. Ensure AWS Secrets Manager is configured (if using)
4. Test connection: `psql -h hostname -U username -d database`

#### "Migration failed"

1. Check the error message for details
2. Verify the database user has sufficient permissions
3. Ensure previous migrations completed successfully
4. Check for naming conflicts (tables, indexes, etc.)
5. Review the migration SQL for syntax errors

#### "Duplicate key violations"

This usually means:
- A migration was run twice
- Manual data was inserted that conflicts with seed data
- Solution: Use `ON CONFLICT DO NOTHING` in migrations

### Database Backup & Restore

#### Backup

Use the provided backup script:
```bash
cd scripts
./backup-all.sh --message "Before major change"
```

Backups are stored in `~/WebSite/Backups/` with:
- Database SQL dump
- Project files tarball
- Backup manifest with metadata

#### Restore

To restore a database backup:
```bash
cd backend
node scripts/restore_database.js backup_YYYY-MM-DD.sql
```

### For New Developers

When cloning this repository:

1. **Clone the repository**
   ```bash
   git clone https://github.com/lromero74/romero-tech-solutions.git
   cd romero-tech-solutions
   ```

2. **Run the setup script**
   ```bash
   cd scripts
   ./setup.sh
   ```

   This will guide you through:
   - Installing dependencies
   - Configuring environment variables
   - Setting up AWS credentials
   - Initializing the database

3. **Create your admin account**
   - Start the development server
   - Register your first employee account
   - Log in to the admin dashboard

4. **Start developing**
   - All system data is already in place
   - No need to manually configure translations, service types, etc.
   - Focus on building features, not setup

### Schema Documentation

For detailed schema documentation, see:
- `docs/SCHEMA.md` - Complete database schema reference
- `backend/migrations/` - Migration files with inline comments
- Database comments - Many tables/columns have PostgreSQL comments

### Support

If you encounter issues:
1. Check this documentation
2. Review error messages carefully
3. Verify your environment configuration
4. Check the troubleshooting section above
5. Create an issue in the GitHub repository
