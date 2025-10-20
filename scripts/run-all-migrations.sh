#!/bin/bash

# =============================================
# Run All Database Migrations
# =============================================
# This script runs all migration files in order
# to set up a fresh database from scratch
# =============================================

set -e  # Exit on error

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${CYAN}Running All Database Migrations${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Change to backend directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../backend"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}Error: backend/.env file not found!${NC}"
    echo "Please run scripts/setup.sh first or create the .env file manually."
    exit 1
fi

# Get list of all migration files in numerical order
MIGRATIONS=($(ls -1 migrations/*.sql 2>/dev/null | sort))

if [ ${#MIGRATIONS[@]} -eq 0 ]; then
    echo -e "${YELLOW}No migration files found in backend/migrations/${NC}"
    exit 0
fi

echo -e "${CYAN}Found ${#MIGRATIONS[@]} migration files${NC}"
echo ""

# Run each migration
SUCCESS_COUNT=0
FAIL_COUNT=0

for migration in "${MIGRATIONS[@]}"; do
    migration_name=$(basename "$migration")
    echo -e "${BLUE}Running migration: ${migration_name}${NC}"

    if node run-migration.js "$migration" 2>&1; then
        echo -e "${GREEN}✓ ${migration_name} completed${NC}"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo -e "${RED}✗ ${migration_name} failed${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))

        # Ask if user wants to continue
        read -p "Continue with remaining migrations? (y/N): " response
        case "$response" in
            [yY][eE][sS]|[yY])
                echo "Continuing..."
                ;;
            *)
                echo "Migration process aborted."
                exit 1
                ;;
        esac
    fi
    echo ""
done

# Summary
echo -e "${BLUE}================================================${NC}"
echo -e "${CYAN}Migration Summary${NC}"
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}Successful: ${SUCCESS_COUNT}${NC}"
if [ $FAIL_COUNT -gt 0 ]; then
    echo -e "${RED}Failed: ${FAIL_COUNT}${NC}"
fi
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ All migrations completed successfully!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠ Some migrations failed. Please review the errors above.${NC}"
    exit 1
fi
