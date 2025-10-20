#!/bin/bash

# =============================================
# Verify Clean Database Script
# =============================================
# This script checks if the database contains
# only seed data (no production-specific data)
#
# Useful for:
#   • Verifying fresh installations
#   • Testing database setup
#   • Confirming no production data in dev/test
# =============================================

set -e  # Exit on error

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${CYAN}Database Cleanliness Verification${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Change to backend directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../backend"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}Error: backend/.env file not found!${NC}"
    exit 1
fi

# Function to run SQL query and get count
get_count() {
    local table=$1
    local query="SELECT COUNT(*) FROM $table;"
    local count=$(echo "$query" | node -e "
        const dotenv = require('dotenv');
        dotenv.config();
        const { Pool } = require('pg');
        const secretsManager = require('./utils/secrets.js');

        async function getCount() {
            let dbConfig;
            if (process.env.USE_SECRETS_MANAGER === 'true' && process.env.DB_SECRET_NAME) {
                dbConfig = await secretsManager.getDatabaseCredentials(process.env.DB_SECRET_NAME);
            } else {
                dbConfig = {
                    host: process.env.DB_HOST,
                    port: process.env.DB_PORT || 5432,
                    database: process.env.DB_NAME,
                    user: process.env.DB_USER,
                    password: process.env.DB_PASSWORD,
                };
            }

            const pool = new Pool(dbConfig);
            try {
                const result = await pool.query('$query');
                console.log(result.rows[0].count);
            } catch (err) {
                console.log('ERROR');
            } finally {
                await pool.end();
            }
        }

        getCount();
    ")
    echo "$count"
}

# Function to check table
check_table() {
    local table=$1
    local description=$2
    local count=$(get_count "$table")

    if [ "$count" == "ERROR" ]; then
        echo -e "${YELLOW}  ⚠️  ${description}: Unable to query${NC}"
        return 1
    elif [ "$count" -eq 0 ]; then
        echo -e "${GREEN}  ✓ ${description}: 0 records (clean)${NC}"
        return 0
    else
        echo -e "${RED}  ✗ ${description}: ${count} records (contains data)${NC}"
        return 1
    fi
}

echo -e "${CYAN}Checking for production data...${NC}"
echo ""

# Track status
ALL_CLEAN=0

# Check businesses
echo -e "${BLUE}Business Data:${NC}"
check_table "businesses" "Businesses" || ALL_CLEAN=1
check_table "service_locations" "Service Locations" || ALL_CLEAN=1
echo ""

# Check users
echo -e "${BLUE}User Data:${NC}"
check_table "users" "Users/Clients" || ALL_CLEAN=1
check_table "employees" "Employees" || ALL_CLEAN=1
echo ""

# Check service requests
echo -e "${BLUE}Service Request Data:${NC}"
check_table "service_requests" "Service Requests" || ALL_CLEAN=1
check_table "time_entries" "Time Entries" || ALL_CLEAN=1
echo ""

# Check financial data
echo -e "${BLUE}Financial Data:${NC}"
check_table "invoices" "Invoices" || ALL_CLEAN=1
check_table "payments" "Payments" || ALL_CLEAN=1
echo ""

# Check monitoring data
echo -e "${BLUE}Monitoring Data:${NC}"
check_table "agents" "Monitoring Agents" || ALL_CLEAN=1
check_table "agent_metrics" "Agent Metrics" || ALL_CLEAN=1
check_table "agent_system_info" "Agent System Info" || ALL_CLEAN=1
echo ""

# Check file storage
echo -e "${BLUE}File Storage:${NC}"
check_table "client_files" "Client Files" || ALL_CLEAN=1
check_table "client_folders" "Client Folders" || ALL_CLEAN=1
echo ""

# Check system data (should NOT be empty)
echo -e "${BLUE}System Data (should contain seed data):${NC}"
SEED_ERROR=0

TRANSLATION_KEYS=$(get_count "t_translation_keys")
if [ "$TRANSLATION_KEYS" -gt 0 ]; then
    echo -e "${GREEN}  ✓ Translation Keys: ${TRANSLATION_KEYS} records${NC}"
else
    echo -e "${RED}  ✗ Translation Keys: 0 records (missing seed data!)${NC}"
    SEED_ERROR=1
fi

SERVICE_TYPES=$(get_count "t_service_types")
if [ "$SERVICE_TYPES" -gt 0 ]; then
    echo -e "${GREEN}  ✓ Service Types: ${SERVICE_TYPES} records${NC}"
else
    echo -e "${RED}  ✗ Service Types: 0 records (missing seed data!)${NC}"
    SEED_ERROR=1
fi

ROLES=$(get_count "roles")
if [ "$ROLES" -gt 0 ]; then
    echo -e "${GREEN}  ✓ Roles: ${ROLES} records${NC}"
else
    echo -e "${YELLOW}  ⚠️  Roles: 0 records (might be missing seed data)${NC}"
fi

RATE_CATEGORIES=$(get_count "rate_categories")
if [ "$RATE_CATEGORIES" -gt 0 ]; then
    echo -e "${GREEN}  ✓ Rate Categories: ${RATE_CATEGORIES} records${NC}"
else
    echo -e "${YELLOW}  ⚠️  Rate Categories: 0 records (might be missing seed data)${NC}"
fi

echo ""
echo -e "${BLUE}============================================${NC}"

# Final verdict
if [ $ALL_CLEAN -eq 0 ] && [ $SEED_ERROR -eq 0 ]; then
    echo -e "${GREEN}✓ Database is CLEAN${NC}"
    echo -e "${GREEN}  Contains only schema and seed data${NC}"
    echo -e "${GREEN}  No production-specific data found${NC}"
    echo ""
    echo -e "${CYAN}This database is ready for:${NC}"
    echo -e "  • Development work"
    echo -e "  • Testing"
    echo -e "  • Distribution to other developers"
    echo ""
    exit 0
elif [ $ALL_CLEAN -ne 0 ] && [ $SEED_ERROR -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Database contains production data${NC}"
    echo -e "${YELLOW}   Not suitable for distribution or sharing${NC}"
    echo ""
    echo -e "${CYAN}To create a clean database:${NC}"
    echo -e "  1. Drop the existing database"
    echo -e "  2. Create a new empty database"
    echo -e "  3. Run: ./scripts/fresh-install-db.sh"
    echo ""
    exit 1
elif [ $SEED_ERROR -ne 0 ]; then
    echo -e "${RED}✗ Database is missing seed data${NC}"
    echo -e "${RED}  Run migrations to populate system data${NC}"
    echo ""
    echo -e "${CYAN}To fix:${NC}"
    echo -e "  Run: ./scripts/fresh-install-db.sh"
    echo ""
    exit 1
else
    echo -e "${RED}✗ Database verification failed${NC}"
    echo -e "${RED}  Please review the results above${NC}"
    echo ""
    exit 1
fi
