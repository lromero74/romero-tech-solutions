#!/bin/bash

# =============================================
# Fresh Database Installation Script
# =============================================
# This script creates a complete database from scratch
# with all schema and essential system data, but NO
# production-specific data (businesses, users, etc.)
#
# What this script INCLUDES:
#   ✅ Complete database schema (all tables, indexes, constraints)
#   ✅ Translation system with English and Spanish translations
#   ✅ Service types and descriptions
#   ✅ Role definitions and permissions
#   ✅ Rate categories and pricing tiers
#   ✅ RMM automation scripts, policies, and software packages
#   ✅ Email and notification templates
#   ✅ System configuration and settings
#
# What this script EXCLUDES:
#   ❌ Businesses and service locations
#   ❌ Users/clients and their data
#   ❌ Employees and their assignments
#   ❌ Service requests and invoices
#   ❌ Monitoring agents and metrics
#   ❌ Client files and folders
#   ❌ Any production-specific data
#
# Perfect for:
#   • New installations
#   • Development environments
#   • Testing environments
#   • Developers cloning the repository
# =============================================

set -e  # Exit on error

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${MAGENTA}============================================${NC}"
echo -e "${CYAN}🚀 Fresh Database Installation${NC}"
echo -e "${MAGENTA}============================================${NC}"
echo ""
echo -e "${YELLOW}⚠️  WARNING: This will create a clean database${NC}"
echo -e "${YELLOW}   with schema and system data only.${NC}"
echo ""
echo -e "${CYAN}What will be installed:${NC}"
echo -e "  ${GREEN}✅${NC} Complete database schema"
echo -e "  ${GREEN}✅${NC} Translation system (English + Spanish)"
echo -e "  ${GREEN}✅${NC} Service types and descriptions"
echo -e "  ${GREEN}✅${NC} Roles and permissions"
echo -e "  ${GREEN}✅${NC} Rate categories and pricing tiers"
echo -e "  ${GREEN}✅${NC} RMM automation defaults"
echo -e "  ${GREEN}✅${NC} Email/notification templates"
echo ""
echo -e "${CYAN}What will NOT be installed:${NC}"
echo -e "  ${RED}❌${NC} Businesses or service locations"
echo -e "  ${RED}❌${NC} Users, clients, or employees"
echo -e "  ${RED}❌${NC} Service requests or invoices"
echo -e "  ${RED}❌${NC} Any production-specific data"
echo ""
echo -e "${MAGENTA}============================================${NC}"
echo ""

# Confirmation prompt
read -p "$(echo -e ${YELLOW}Continue with fresh installation? [y/N]:${NC} )" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Installation cancelled.${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Starting installation...${NC}"
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

echo -e "${CYAN}Found ${#MIGRATIONS[@]} migration files to run${NC}"
echo ""

# Run each migration
SUCCESS_COUNT=0
FAIL_COUNT=0
START_TIME=$(date +%s)

for migration in "${MIGRATIONS[@]}"; do
    migration_name=$(basename "$migration")
    echo -e "${BLUE}[$(($SUCCESS_COUNT + $FAIL_COUNT + 1))/${#MIGRATIONS[@]}] Running: ${migration_name}${NC}"

    if node run-migration.js "$migration" 2>&1 | grep -v "^$"; then
        echo -e "${GREEN}  ✓ Completed${NC}"
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        echo -e "${RED}  ✗ Failed${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))

        # Ask if user wants to continue
        echo ""
        read -p "$(echo -e ${YELLOW}Continue with remaining migrations? [y/N]:${NC} )" -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo ""
            echo -e "${RED}Installation aborted.${NC}"
            exit 1
        fi
        echo ""
    fi
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Summary
echo ""
echo -e "${MAGENTA}============================================${NC}"
echo -e "${CYAN}Installation Summary${NC}"
echo -e "${MAGENTA}============================================${NC}"
echo -e "${GREEN}✓ Successful: ${SUCCESS_COUNT}${NC}"
if [ $FAIL_COUNT -gt 0 ]; then
    echo -e "${RED}✗ Failed: ${FAIL_COUNT}${NC}"
fi
echo -e "${BLUE}⏱  Duration: ${DURATION} seconds${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}🎉 Fresh database installation completed successfully!${NC}"
    echo ""
    echo -e "${CYAN}Next steps:${NC}"
    echo -e "  1. ${BLUE}Create your first employee account${NC}"
    echo -e "  2. ${BLUE}Configure business settings${NC}"
    echo -e "  3. ${BLUE}Set up service locations${NC}"
    echo -e "  4. ${BLUE}Customize rate categories (if needed)${NC}"
    echo ""
    echo -e "${YELLOW}💡 Tip: Use the admin dashboard to complete initial setup${NC}"
    echo ""
    exit 0
else
    echo -e "${YELLOW}⚠  Installation completed with ${FAIL_COUNT} error(s).${NC}"
    echo -e "${YELLOW}   Please review the errors above.${NC}"
    echo ""
    exit 1
fi
