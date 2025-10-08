#!/bin/bash

# =============================================
# Generate Database Setup Script
# =============================================
# This script exports the current database schema
# to database_setup.sql for new deployments
# =============================================

set -e  # Exit on error

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_FILE="$PROJECT_ROOT/database_setup.sql"
BACKUP_FILE="$PROJECT_ROOT/database_setup.sql.backup.$(date +%Y%m%d_%H%M%S)"

echo "================================================"
echo "Database Setup Script Generator"
echo "================================================"

# Backup existing file if it exists
if [ -f "$OUTPUT_FILE" ]; then
    echo "💾 Backing up existing database_setup.sql..."
    cp "$OUTPUT_FILE" "$BACKUP_FILE"
    echo "   Backup saved to: $BACKUP_FILE"
fi

echo "📥 Generating database schema dump..."
echo ""
echo "⚠️  IMPORTANT: This script will prompt for database connection details."
echo "   The database credentials will be fetched from AWS Secrets Manager."
echo ""

# Use the existing table script's database connection logic
# We'll need to get connection info programmatically
cd "$PROJECT_ROOT/backend"

# Get database connection info using Node.js
DB_CONFIG=$(node -e "
import { createDbConfig } from './config/database.js';
const config = await createDbConfig();
console.log(JSON.stringify({
  host: config.host,
  port: config.port,
  database: config.database,
  user: config.user,
  password: config.password
}));
" 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "❌ Failed to get database configuration"
    echo "   Make sure backend/.env or AWS Secrets Manager is configured"
    exit 1
fi

DB_HOST=$(echo "$DB_CONFIG" | jq -r '.host')
DB_PORT=$(echo "$DB_CONFIG" | jq -r '.port')
DB_NAME=$(echo "$DB_CONFIG" | jq -r '.database')
DB_USER=$(echo "$DB_CONFIG" | jq -r '.user')
DB_PASSWORD=$(echo "$DB_CONFIG" | jq -r '.password')

echo "✅ Database credentials retrieved"
echo "📊 Database: $DB_NAME on $DB_HOST:$DB_PORT"

# Set PostgreSQL password for pg_dump
export PGPASSWORD="$DB_PASSWORD"

# Generate schema dump
echo "📥 Dumping database schema..."

pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --no-owner \
    --no-acl \
    --schema-only \
    --clean \
    --if-exists \
    > "$OUTPUT_FILE.schema.temp" 2>/dev/null

if [ $? -ne 0 ]; then
    echo "❌ pg_dump failed. Make sure pg_dump is installed and accessible."
    unset PGPASSWORD
    exit 1
fi

# Create header
cat > "$OUTPUT_FILE" << 'EOF'
-- =============================================
-- Romero Tech Solutions - Database Setup Script
-- =============================================
--
-- This file contains the complete database schema and reference data
-- for the Romero Tech Solutions MSP application.
--
-- Generated using automated export from production database
EOF

# Add generation date
echo "-- Date: $(date '+%B %d, %Y at %H:%M %Z')" >> "$OUTPUT_FILE"
echo "-- Source Database: $DB_NAME ($DB_HOST:$DB_PORT)" >> "$OUTPUT_FILE"

cat >> "$OUTPUT_FILE" << 'EOF'
--
-- USAGE INSTRUCTIONS:
-- 1. Create a new PostgreSQL database
--    createdb your_database_name
--
-- 2. Run this script
--    psql -d your_database_name -f database_setup.sql
--
-- IMPORTANT NOTES:
-- - This script includes all table structures, constraints, indexes, and views
-- - Reference data is included for essential lookup tables (roles, permissions, etc.)
-- - Foreign key relationships are included for referential integrity
-- - No production user data is included for security
-- - Audit log tables are created but not populated
-- - You will need to create an initial admin user after setup
--
-- REQUIREMENTS:
-- - PostgreSQL 12+ (tested with PostgreSQL 16)
-- - Database superuser or owner privileges
-- - Minimum 1GB available disk space
--
-- =============================================

EOF

# Append the schema dump
cat "$OUTPUT_FILE.schema.temp" >> "$OUTPUT_FILE"
rm "$OUTPUT_FILE.schema.temp"

# Add reference data export for critical tables
echo "" >> "$OUTPUT_FILE"
echo "-- =============================================" >> "$OUTPUT_FILE"
echo "-- REFERENCE DATA INSERTS" >> "$OUTPUT_FILE"
echo "-- Essential lookup tables and configuration" >> "$OUTPUT_FILE"
echo "-- =============================================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Tables to export (order matters due to foreign keys)
REFERENCE_TABLES=(
    # Core system tables
    "system_settings"
    "password_complexity_requirements"
    "company_settings"

    # User/Employee configuration
    "employee_working_statuses"
    "employee_employment_statuses"
    "employee_job_titles"
    "employee_pronouns"

    # Roles and Permissions (RBAC)
    "roles"
    "permissions"
    "role_permissions"

    # Service configuration
    "service_types"
    "service_request_statuses"
    "priority_levels"
    "urgency_levels"
    "service_request_closure_reasons"
    "hourly_rate_categories"

    # Location configuration
    "location_types"

    # File management
    "t_file_categories"
    "t_global_quota_defaults"

    # Translation system
    "t_languages"
    "t_translation_namespaces"

    # Geographic data (states only, not full zipcode table)
    "t_states"
)

echo "📋 Exporting reference data for ${#REFERENCE_TABLES[@]} tables..."

for table in "${REFERENCE_TABLES[@]}"; do
    echo "   - Exporting $table..."
    echo "-- Data for table: $table" >> "$OUTPUT_FILE"

    pg_dump \
        --host="$DB_HOST" \
        --port="$DB_PORT" \
        --username="$DB_USER" \
        --dbname="$DB_NAME" \
        --no-owner \
        --no-acl \
        --data-only \
        --table="$table" \
        --column-inserts \
        >> "$OUTPUT_FILE" 2>/dev/null && echo "     ✓" || echo "     ⚠️  (empty or error)"

    echo "" >> "$OUTPUT_FILE"
done

unset PGPASSWORD

# Get file size
FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
LINE_COUNT=$(wc -l < "$OUTPUT_FILE")

echo ""
echo "✅ Database setup script generated successfully!"
echo "📄 Output file: $OUTPUT_FILE"
echo "📏 File size: $FILE_SIZE ($LINE_COUNT lines)"
echo ""
echo "To use this script on a new database:"
echo "  1. Create database: createdb your_database_name"
echo "  2. Run script: psql -d your_database_name -f database_setup.sql"
echo "  3. Create initial admin user (see documentation)"
echo ""
echo "================================================"
