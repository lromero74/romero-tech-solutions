#!/bin/bash

# Script to switch between Stripe test and live keys
# Usage: ./switch-stripe-env.sh [test|live|status]

BACKEND_ENV_FILE="backend/.env"
FRONTEND_ENV_FILE=".env.local"
KEYS_FILE=".plan/keys.txt"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check current mode
check_current_mode() {
    if grep -q "^STRIPE_SECRET_KEY=sk_live_" "$BACKEND_ENV_FILE"; then
        echo "live"
    elif grep -q "^STRIPE_SECRET_KEY=sk_test_" "$BACKEND_ENV_FILE"; then
        echo "test"
    else
        echo "unknown"
    fi
}

# Function to display current status
show_status() {
    local current_mode=$(check_current_mode)
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Stripe Environment Status${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if [ "$current_mode" == "live" ]; then
        echo -e "Current Mode: ${RED}LIVE${NC} 🔴"
        echo -e "Secret Key:   sk_live_...${RED}(PRODUCTION)${NC}"
    elif [ "$current_mode" == "test" ]; then
        echo -e "Current Mode: ${GREEN}TEST${NC} 🧪"
        echo -e "Secret Key:   sk_test_...${GREEN}(SANDBOX)${NC}"
    else
        echo -e "Current Mode: ${YELLOW}UNKNOWN${NC} ⚠️"
    fi

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Function to switch to test mode
switch_to_test() {
    echo -e "${YELLOW}Switching to TEST mode...${NC}"

    # Read test keys from .plan/keys.txt
    TEST_SECRET=$(grep "^STRIPE_SECRET_KEY=sk_test_" "$KEYS_FILE" | cut -d'=' -f2)
    TEST_PUBLISHABLE=$(grep "^STRIPE_PUBLISHABLE_KEY=pk_test_" "$KEYS_FILE" | cut -d'=' -f2)

    if [ -z "$TEST_SECRET" ] || [ -z "$TEST_PUBLISHABLE" ]; then
        echo -e "${RED}Error: Could not find test keys in $KEYS_FILE${NC}"
        exit 1
    fi

    # Create backups
    cp "$BACKEND_ENV_FILE" "$BACKEND_ENV_FILE.backup"
    [ -f "$FRONTEND_ENV_FILE" ] && cp "$FRONTEND_ENV_FILE" "$FRONTEND_ENV_FILE.backup"

    # Update backend .env
    sed -i '' \
        -e '/^# Stripe Configuration (Test Mode)/,/^STRIPE_WEBHOOK_SECRET=/ {
            /^#STRIPE_SECRET_KEY=sk_test_/c\
STRIPE_SECRET_KEY='"$TEST_SECRET"'
            /^#STRIPE_PUBLISHABLE_KEY=pk_test_/c\
STRIPE_PUBLISHABLE_KEY='"$TEST_PUBLISHABLE"'
        }' \
        -e '/^# STRIPE KEYS/,/^STRIPE_WEBHOOK_SECRET=/ {
            /^STRIPE_PUBLISHABLE_KEY=pk_live_/ s/^/#/
            /^STRIPE_SECRET_KEY=sk_live_/ s/^/#/
            /^STRIPE_WEBHOOK_SECRET=/ s/^/#/
        }' "$BACKEND_ENV_FILE"

    # Update frontend .env.local
    if [ -f "$FRONTEND_ENV_FILE" ]; then
        sed -i '' "s|^VITE_STRIPE_PUBLISHABLE_KEY=.*|VITE_STRIPE_PUBLISHABLE_KEY=$TEST_PUBLISHABLE|" "$FRONTEND_ENV_FILE"
        echo -e "${GREEN}✓ Updated frontend publishable key${NC}"
    else
        echo "VITE_STRIPE_PUBLISHABLE_KEY=$TEST_PUBLISHABLE" > "$FRONTEND_ENV_FILE"
        echo -e "${GREEN}✓ Created frontend .env.local with test key${NC}"
    fi

    echo -e "${GREEN}✓ Switched to TEST mode${NC}"
    echo -e "${YELLOW}⚠️  Remember to restart BOTH backend and frontend servers for changes to take effect!${NC}"
}

# Function to switch to live mode
switch_to_live() {
    echo -e "${RED}Switching to LIVE mode...${NC}"

    # Read live keys from .plan/keys.txt
    LIVE_SECRET=$(grep "^STRIPE_SECRET_KEY=sk_live_" "$KEYS_FILE" | cut -d'=' -f2)
    LIVE_PUBLISHABLE=$(grep "^STRIPE_PUBLISHABLE_KEY=pk_live_" "$KEYS_FILE" | cut -d'=' -f2)
    WEBHOOK_SECRET=$(grep "^STRIPE_WEBHOOK_SECRET=" "$KEYS_FILE" | cut -d'=' -f2)

    if [ -z "$LIVE_SECRET" ] || [ -z "$LIVE_PUBLISHABLE" ] || [ -z "$WEBHOOK_SECRET" ]; then
        echo -e "${RED}Error: Could not find live keys in $KEYS_FILE${NC}"
        exit 1
    fi

    # Create backups
    cp "$BACKEND_ENV_FILE" "$BACKEND_ENV_FILE.backup"
    [ -f "$FRONTEND_ENV_FILE" ] && cp "$FRONTEND_ENV_FILE" "$FRONTEND_ENV_FILE.backup"

    # Update backend .env
    sed -i '' \
        -e '/^# Stripe Configuration (Test Mode)/,/^STRIPE_WEBHOOK_SECRET=/ {
            /^STRIPE_SECRET_KEY=sk_test_/ s/^/#/
            /^STRIPE_PUBLISHABLE_KEY=pk_test_/ s/^/#/
        }' \
        -e '/^# STRIPE KEYS/,/^#\?STRIPE_WEBHOOK_SECRET=/ {
            /^#STRIPE_PUBLISHABLE_KEY=pk_live_/c\
STRIPE_PUBLISHABLE_KEY='"$LIVE_PUBLISHABLE"'
            /^#STRIPE_SECRET_KEY=sk_live_/c\
STRIPE_SECRET_KEY='"$LIVE_SECRET"'
            /^#STRIPE_WEBHOOK_SECRET=/c\
STRIPE_WEBHOOK_SECRET='"$WEBHOOK_SECRET"'
        }' "$BACKEND_ENV_FILE"

    # Update frontend .env.local
    if [ -f "$FRONTEND_ENV_FILE" ]; then
        sed -i '' "s|^VITE_STRIPE_PUBLISHABLE_KEY=.*|VITE_STRIPE_PUBLISHABLE_KEY=$LIVE_PUBLISHABLE|" "$FRONTEND_ENV_FILE"
        echo -e "${RED}✓ Updated frontend publishable key to LIVE${NC}"
    else
        echo "VITE_STRIPE_PUBLISHABLE_KEY=$LIVE_PUBLISHABLE" > "$FRONTEND_ENV_FILE"
        echo -e "${RED}✓ Created frontend .env.local with LIVE key${NC}"
    fi

    echo -e "${RED}✓ Switched to LIVE mode${NC}"
    echo -e "${RED}⚠️  YOU ARE NOW IN PRODUCTION MODE - REAL CHARGES WILL BE MADE!${NC}"
    echo -e "${YELLOW}⚠️  Remember to restart BOTH backend and frontend servers for changes to take effect!${NC}"
}

# Main script logic
case "$1" in
    test)
        current_mode=$(check_current_mode)
        if [ "$current_mode" == "test" ]; then
            echo -e "${YELLOW}Already in TEST mode${NC}"
            show_status
            exit 0
        fi
        switch_to_test
        echo ""
        show_status
        ;;
    live)
        current_mode=$(check_current_mode)
        if [ "$current_mode" == "live" ]; then
            echo -e "${YELLOW}Already in LIVE mode${NC}"
            show_status
            exit 0
        fi
        echo -e "${RED}⚠️  WARNING: You are about to switch to LIVE mode!${NC}"
        echo -e "${RED}⚠️  Real credit cards will be charged!${NC}"
        read -p "Are you sure? (type 'yes' to confirm): " confirm
        if [ "$confirm" != "yes" ]; then
            echo -e "${YELLOW}Operation cancelled${NC}"
            exit 0
        fi
        switch_to_live
        echo ""
        show_status
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 [test|live|status]"
        echo ""
        echo "Commands:"
        echo "  test    - Switch to Stripe test/sandbox mode"
        echo "  live    - Switch to Stripe live/production mode (requires confirmation)"
        echo "  status  - Show current Stripe environment status"
        echo ""
        show_status
        exit 1
        ;;
esac
