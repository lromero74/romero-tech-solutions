#!/bin/bash

# =============================================
# Romero Tech Solutions - Interactive Setup Script
# =============================================
# This script guides you through the initial setup
# of the MSP application, including:
# - Environment configuration
# - Database initialization
# - AWS service setup
# - Initial admin user creation
# =============================================

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "\n${BLUE}================================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${BLUE}================================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${CYAN}ℹ${NC} $1"
}

prompt_input() {
    local prompt="$1"
    local var_name="$2"
    local default_value="$3"
    local is_secret="$4"

    if [ -n "$default_value" ]; then
        prompt="$prompt [$default_value]"
    fi

    if [ "$is_secret" = "true" ]; then
        read -sp "$prompt: " value
        echo ""
    else
        read -p "$prompt: " value
    fi

    if [ -z "$value" ] && [ -n "$default_value" ]; then
        value="$default_value"
    fi

    eval "$var_name='$value'"
}

confirm_action() {
    local prompt="$1"
    local response
    read -p "$prompt (y/N): " response
    case "$response" in
        [yY][eE][sS]|[yY])
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 is not installed"
        return 1
    else
        print_success "$1 is installed"
        return 0
    fi
}

# Start setup
clear
print_header "Romero Tech Solutions - Interactive Setup"

echo "This script will guide you through setting up your MSP application."
echo "You can exit at any time by pressing Ctrl+C."
echo ""

if ! confirm_action "Ready to begin setup?"; then
    echo "Setup cancelled."
    exit 0
fi

# =============================================
# STEP 1: Prerequisites Check
# =============================================
print_header "Step 1: Checking Prerequisites"

PREREQUISITES_MET=true

echo "Checking for required software..."
check_command "node" || PREREQUISITES_MET=false
check_command "npm" || PREREQUISITES_MET=false
check_command "psql" || PREREQUISITES_MET=false
check_command "createdb" || PREREQUISITES_MET=false
check_command "git" || PREREQUISITES_MET=false

# Check Node version
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | cut -d'v' -f2)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
        print_success "Node.js version $NODE_VERSION (>= 18 required)"
    else
        print_error "Node.js version $NODE_VERSION is too old (>= 18 required)"
        PREREQUISITES_MET=false
    fi
fi

# Check PostgreSQL version
if command -v psql &> /dev/null; then
    PG_VERSION=$(psql --version | grep -oP '\d+' | head -1)
    if [ "$PG_VERSION" -ge 12 ]; then
        print_success "PostgreSQL version $PG_VERSION (>= 12 required)"
    else
        print_error "PostgreSQL version $PG_VERSION is too old (>= 12 required)"
        PREREQUISITES_MET=false
    fi
fi

if [ "$PREREQUISITES_MET" = false ]; then
    print_error "Some prerequisites are missing. Please install them and run this script again."
    echo ""
    echo "Installation guides:"
    echo "  Node.js: https://nodejs.org/"
    echo "  PostgreSQL: https://www.postgresql.org/download/"
    exit 1
fi

print_success "All prerequisites are met!"

# =============================================
# STEP 2: Environment Selection
# =============================================
print_header "Step 2: Environment Configuration"

echo "Select your deployment environment:"
echo "  1) Development (local database, localhost URLs)"
echo "  2) Production (AWS RDS, custom domain)"
echo ""

read -p "Enter choice (1 or 2): " ENV_CHOICE

case $ENV_CHOICE in
    1)
        ENVIRONMENT="development"
        print_info "Setting up for DEVELOPMENT environment"
        ;;
    2)
        ENVIRONMENT="production"
        print_info "Setting up for PRODUCTION environment"
        ;;
    *)
        print_error "Invalid choice. Exiting."
        exit 1
        ;;
esac

# =============================================
# STEP 3: Database Configuration
# =============================================
print_header "Step 3: Database Configuration"

if [ "$ENVIRONMENT" = "development" ]; then
    prompt_input "Database name" DB_NAME "romero_tech_dev"
    prompt_input "Database user" DB_USER "postgres"
    prompt_input "Database password" DB_PASSWORD "" "true"
    DB_HOST="localhost"
    DB_PORT="5432"
else
    prompt_input "Database host (RDS endpoint)" DB_HOST "your-rds-endpoint.rds.amazonaws.com"
    prompt_input "Database port" DB_PORT "5432"
    prompt_input "Database name" DB_NAME "romerotechsolutions"
    prompt_input "Database user" DB_USER "postgres"
    prompt_input "Database password" DB_PASSWORD "" "true"
fi

# Test database connection
print_info "Testing database connection..."
export PGPASSWORD="$DB_PASSWORD"

if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1" &> /dev/null; then
    print_success "Database connection successful!"
else
    print_warning "Could not connect to database. This is OK if the database doesn't exist yet."

    if confirm_action "Would you like to create the database now?"; then
        createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" && \
            print_success "Database '$DB_NAME' created!" || \
            print_error "Failed to create database. You may need to create it manually."
    fi
fi

unset PGPASSWORD

# =============================================
# STEP 4: JWT Configuration
# =============================================
print_header "Step 4: JWT Configuration"

echo "JWT tokens are used for secure authentication."
print_info "Generating secure random JWT secret..."

JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
print_success "JWT secret generated (64 bytes)"

prompt_input "JWT token expiration" JWT_EXPIRATION "24h"

# =============================================
# STEP 5: AWS Configuration
# =============================================
print_header "Step 5: AWS Configuration"

echo "AWS services are used for authentication, email, and storage."
echo ""

prompt_input "AWS Region" AWS_REGION "us-east-1"

# AWS Cognito
echo -e "\n${CYAN}AWS Cognito Configuration${NC}"
echo "Cognito is used for user authentication and user pool management."
echo ""

if confirm_action "Do you have AWS Cognito configured?"; then
    prompt_input "User Pool ID" AWS_USER_POOL_ID
    prompt_input "User Pool Client ID" AWS_USER_POOL_CLIENT_ID
    prompt_input "User Pool Client Secret" AWS_USER_POOL_CLIENT_SECRET "" "true"
    prompt_input "OAuth Domain" AWS_OAUTH_DOMAIN "yourdomain.com"
else
    print_warning "You'll need to set up AWS Cognito manually. See: https://console.aws.amazon.com/cognito/"
    AWS_USER_POOL_ID="your_user_pool_id"
    AWS_USER_POOL_CLIENT_ID="your_client_id"
    AWS_USER_POOL_CLIENT_SECRET="your_client_secret"
    AWS_OAUTH_DOMAIN="yourdomain.com"
fi

# AWS SES (Email)
echo -e "\n${CYAN}AWS SES Configuration${NC}"
echo "SES is used for sending transactional emails."
echo ""

if confirm_action "Do you have AWS SES configured?"; then
    prompt_input "SES Region" AWS_SES_REGION "$AWS_REGION"
    prompt_input "From Email Address" EMAIL_FROM "noreply@yourdomain.com"
else
    print_warning "You'll need to set up AWS SES manually. See: https://console.aws.amazon.com/ses/"
    AWS_SES_REGION="$AWS_REGION"
    EMAIL_FROM="noreply@yourdomain.com"
fi

# AWS Secrets Manager (Optional)
echo -e "\n${CYAN}AWS Secrets Manager (Optional)${NC}"
echo "Secrets Manager can store database credentials securely."
echo ""

if confirm_action "Use AWS Secrets Manager for database credentials?"; then
    USE_SECRETS_MANAGER="true"
    prompt_input "Secret Name/ARN" DB_SECRET_NAME
else
    USE_SECRETS_MANAGER="false"
    DB_SECRET_NAME=""
fi

# =============================================
# STEP 6: Domain Configuration
# =============================================
print_header "Step 6: Domain Configuration"

if [ "$ENVIRONMENT" = "production" ]; then
    prompt_input "Production domain (frontend)" DOMAIN_FRONTEND "romerotechsolutions.com"
    prompt_input "API domain (backend)" DOMAIN_API "api.romerotechsolutions.com"

    FRONTEND_URL="https://$DOMAIN_FRONTEND"
    API_URL="https://$DOMAIN_API/api"
else
    FRONTEND_URL="http://localhost:5173"
    API_URL="http://localhost:3001/api"
    DOMAIN_FRONTEND="localhost"
    DOMAIN_API="localhost"
fi

# CORS Origins
CORS_ORIGINS="$FRONTEND_URL"
if [ "$ENVIRONMENT" = "development" ]; then
    CORS_ORIGINS="http://localhost:5173,http://localhost:5174,$CORS_ORIGINS"
fi

# =============================================
# STEP 7: Payment Integration (Stripe)
# =============================================
print_header "Step 7: Payment Integration (Stripe)"

echo "Stripe is used for invoice payments and subscription management."
echo ""

if confirm_action "Do you have Stripe configured?"; then
    if [ "$ENVIRONMENT" = "production" ]; then
        print_warning "Make sure to use LIVE keys for production!"
        prompt_input "Stripe Live Secret Key" STRIPE_SECRET_KEY "sk_live_..." "true"
        prompt_input "Stripe Live Publishable Key" STRIPE_PUBLISHABLE_KEY "pk_live_..."
        prompt_input "Stripe Webhook Secret" STRIPE_WEBHOOK_SECRET "whsec_..." "true"
    else
        prompt_input "Stripe Test Secret Key" STRIPE_SECRET_KEY "sk_test_..." "true"
        prompt_input "Stripe Test Publishable Key" STRIPE_PUBLISHABLE_KEY "pk_test_..."
        prompt_input "Stripe Webhook Secret" STRIPE_WEBHOOK_SECRET "whsec_..." "true"
    fi
else
    print_warning "You'll need to set up Stripe manually. See: https://dashboard.stripe.com/"
    if [ "$ENVIRONMENT" = "production" ]; then
        STRIPE_SECRET_KEY="sk_live_your_stripe_key"
        STRIPE_PUBLISHABLE_KEY="pk_live_your_stripe_key"
    else
        STRIPE_SECRET_KEY="sk_test_your_stripe_key"
        STRIPE_PUBLISHABLE_KEY="pk_test_your_stripe_key"
    fi
    STRIPE_WEBHOOK_SECRET="whsec_your_webhook_secret"
fi

# =============================================
# STEP 8: SMS Integration (Twilio) - Optional
# =============================================
print_header "Step 8: SMS Integration (Twilio) - Optional"

echo "Twilio is used for SMS notifications (optional)."
echo ""

if confirm_action "Do you want to configure Twilio for SMS?"; then
    prompt_input "Twilio Account SID" TWILIO_ACCOUNT_SID
    prompt_input "Twilio Auth Token" TWILIO_AUTH_TOKEN "" "true"
    prompt_input "Twilio Phone Number" TWILIO_PHONE_NUMBER "+1234567890"
else
    TWILIO_ACCOUNT_SID=""
    TWILIO_AUTH_TOKEN=""
    TWILIO_PHONE_NUMBER=""
fi

# =============================================
# STEP 9: Push Notifications (VAPID) - Optional
# =============================================
print_header "Step 9: Push Notifications - Optional"

echo "Web Push notifications require VAPID keys."
echo ""

if confirm_action "Do you want to enable push notifications?"; then
    if confirm_action "Generate new VAPID keys automatically?"; then
        print_info "Generating VAPID keys..."

        # Generate VAPID keys using web-push (install if needed)
        if ! npm list -g web-push &> /dev/null; then
            print_info "Installing web-push globally..."
            npm install -g web-push
        fi

        VAPID_KEYS=$(npx web-push generate-vapid-keys --json)
        VAPID_PUBLIC_KEY=$(echo $VAPID_KEYS | jq -r '.publicKey')
        VAPID_PRIVATE_KEY=$(echo $VAPID_KEYS | jq -r '.privateKey')

        print_success "VAPID keys generated!"
    else
        prompt_input "VAPID Public Key" VAPID_PUBLIC_KEY
        prompt_input "VAPID Private Key" VAPID_PRIVATE_KEY "" "true"
    fi

    prompt_input "VAPID Subject (email)" VAPID_SUBJECT "mailto:admin@$DOMAIN_FRONTEND"
else
    VAPID_PUBLIC_KEY=""
    VAPID_PRIVATE_KEY=""
    VAPID_SUBJECT=""
fi

# =============================================
# STEP 10: Additional Configuration
# =============================================
print_header "Step 10: Additional Configuration"

prompt_input "Maximum file upload size (MB)" MAX_FILE_SIZE_MB "10"

if confirm_action "Enable ClamAV virus scanning?"; then
    ENABLE_VIRUS_SCANNING="true"
    print_warning "Make sure ClamAV is installed and running!"
else
    ENABLE_VIRUS_SCANNING="false"
fi

if [ "$ENVIRONMENT" = "production" ]; then
    prompt_input "Admin IP whitelist (comma-separated, or 'all')" ADMIN_IP_WHITELIST "all"
    ENABLE_RATE_LIMITING="true"
else
    ADMIN_IP_WHITELIST="127.0.0.1,::1"
    ENABLE_RATE_LIMITING="false"
fi

# =============================================
# STEP 11: Generate Configuration Files
# =============================================
print_header "Step 11: Generating Configuration Files"

# Backend .env
print_info "Creating backend/.env file..."

cat > backend/.env << EOF
# =============================================
# Romero Tech Solutions - Backend Configuration
# Generated: $(date)
# Environment: $ENVIRONMENT
# =============================================

# Server Configuration
PORT=3001
NODE_ENV=$ENVIRONMENT

# Database Configuration
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_SSL=$([ "$ENVIRONMENT" = "production" ] && echo "true" || echo "false")

# AWS Secrets Manager (Optional)
USE_SECRETS_MANAGER=$USE_SECRETS_MANAGER
DB_SECRET_NAME=$DB_SECRET_NAME

# JWT Configuration
JWT_SECRET=$JWT_SECRET
JWT_EXPIRATION=$JWT_EXPIRATION

# AWS Configuration
AWS_REGION=$AWS_REGION

# AWS Cognito
AWS_USER_POOL_ID=$AWS_USER_POOL_ID
AWS_USER_POOL_CLIENT_ID=$AWS_USER_POOL_CLIENT_ID
AWS_USER_POOL_CLIENT_SECRET=$AWS_USER_POOL_CLIENT_SECRET

# AWS SES (Email)
AWS_SES_REGION=$AWS_SES_REGION
EMAIL_FROM=$EMAIL_FROM

# CORS Configuration
CORS_ORIGINS=$CORS_ORIGINS

# Stripe
STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET

# Twilio (Optional)
TWILIO_ACCOUNT_SID=$TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN=$TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER=$TWILIO_PHONE_NUMBER

# Web Push Notifications
VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY
VAPID_SUBJECT=$VAPID_SUBJECT

# File Upload Configuration
MAX_FILE_SIZE_MB=$MAX_FILE_SIZE_MB
UPLOAD_DIR=./uploads
ENABLE_VIRUS_SCANNING=$ENABLE_VIRUS_SCANNING

# Security
ADMIN_IP_WHITELIST=$ADMIN_IP_WHITELIST
ENABLE_RATE_LIMITING=$ENABLE_RATE_LIMITING
EOF

print_success "Backend .env file created"

# Frontend .env
print_info "Creating frontend .env file..."

cat > .env << EOF
# =============================================
# Romero Tech Solutions - Frontend Configuration
# Generated: $(date)
# Environment: $ENVIRONMENT
# =============================================

# API Configuration
VITE_API_BASE_URL=$API_URL

# AWS Cognito
VITE_AWS_REGION=$AWS_REGION
VITE_AWS_USER_POOL_ID=$AWS_USER_POOL_ID
VITE_AWS_USER_POOL_CLIENT_ID=$AWS_USER_POOL_CLIENT_ID
VITE_AWS_USER_POOL_CLIENT_SECRET=$AWS_USER_POOL_CLIENT_SECRET
VITE_AWS_OAUTH_DOMAIN=$AWS_OAUTH_DOMAIN

# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=$STRIPE_PUBLISHABLE_KEY

# Feature Flags
VITE_DEMO_MODE=false
EOF

print_success "Frontend .env file created"

# =============================================
# STEP 12: Install Dependencies
# =============================================
print_header "Step 12: Installing Dependencies"

if confirm_action "Install Node.js dependencies now?"; then
    print_info "Installing frontend dependencies..."
    npm install

    print_info "Installing backend dependencies..."
    cd backend
    npm install
    cd ..

    print_success "Dependencies installed!"
else
    print_warning "Skipping dependency installation. Run 'npm install' in both root and backend directories later."
fi

# =============================================
# STEP 13: Database Initialization
# =============================================
print_header "Step 13: Database Initialization"

if confirm_action "Initialize database with schema now?"; then
    print_info "Running database setup script..."

    export PGPASSWORD="$DB_PASSWORD"

    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f database_setup.sql; then
        print_success "Database schema initialized!"
    else
        print_error "Database initialization failed. You may need to run it manually:"
        echo "  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f database_setup.sql"
    fi

    unset PGPASSWORD
else
    print_warning "Skipping database initialization. Run manually later:"
    echo "  psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f database_setup.sql"
fi

# =============================================
# STEP 14: Create Initial Admin User
# =============================================
print_header "Step 14: Create Initial Admin User"

echo "You'll need an initial admin user to access the system."
echo "This user will be created in the AWS Cognito User Pool."
echo ""

if confirm_action "Create initial admin user now?"; then
    prompt_input "Admin email" ADMIN_EMAIL "admin@$DOMAIN_FRONTEND"
    prompt_input "Admin password (min 8 chars)" ADMIN_PASSWORD "" "true"
    prompt_input "Admin first name" ADMIN_FIRST_NAME "Admin"
    prompt_input "Admin last name" ADMIN_LAST_NAME "User"

    print_info "Creating admin user in Cognito..."

    # Use AWS CLI to create user
    if command -v aws &> /dev/null; then
        aws cognito-idp admin-create-user \
            --region "$AWS_REGION" \
            --user-pool-id "$AWS_USER_POOL_ID" \
            --username "$ADMIN_EMAIL" \
            --user-attributes Name=email,Value="$ADMIN_EMAIL" Name=email_verified,Value=true \
            --temporary-password "$ADMIN_PASSWORD" \
            --message-action SUPPRESS \
            2>/dev/null && print_success "Admin user created in Cognito!" || print_warning "Could not create user in Cognito (AWS CLI may not be configured)"

        print_info "You'll also need to create a corresponding employee record in the database."
        print_warning "This requires manual SQL or using the application's user management interface."
    else
        print_warning "AWS CLI not found. Create the admin user manually in Cognito console."
    fi
else
    print_warning "Skipping admin user creation. Create manually in AWS Cognito."
fi

# =============================================
# STEP 15: Setup Complete!
# =============================================
print_header "Setup Complete!"

echo -e "${GREEN}✓ Configuration files generated${NC}"
echo -e "${GREEN}✓ Environment variables set${NC}"
if [ -f "backend/.env" ]; then
    echo -e "${GREEN}✓ Backend configured${NC}"
fi
if [ -f ".env" ]; then
    echo -e "${GREEN}✓ Frontend configured${NC}"
fi

echo ""
echo -e "${CYAN}Next Steps:${NC}"
echo ""

if [ "$ENVIRONMENT" = "development" ]; then
    echo "1. Start the backend:"
    echo "   cd backend && npm start"
    echo ""
    echo "2. Start the frontend (in another terminal):"
    echo "   npm run dev"
    echo ""
    echo "3. Access the application:"
    echo "   - Admin Portal: http://localhost:5173/employees"
    echo "   - Client Portal: http://localhost:5173/clogin"
else
    echo "1. Deploy backend to EC2:"
    echo "   - Copy backend files to EC2 instance"
    echo "   - Set up systemd service (see README.md)"
    echo "   - Configure Nginx reverse proxy"
    echo "   - Set up SSL with Let's Encrypt"
    echo ""
    echo "2. Deploy frontend to AWS Amplify:"
    echo "   - Connect your GitHub repository"
    echo "   - Configure environment variables in Amplify Console"
    echo "   - Set up custom domain"
    echo ""
    echo "3. Configure DNS:"
    echo "   - Point $DOMAIN_FRONTEND to Amplify"
    echo "   - Point $DOMAIN_API to EC2 instance"
fi

echo ""
echo -e "${YELLOW}Important Security Notes:${NC}"
echo "  - Keep your .env files secure and never commit them to git"
echo "  - Rotate your JWT secret regularly"
echo "  - Use strong passwords for all accounts"
echo "  - Enable MFA for AWS accounts"
echo "  - Review the security settings in backend/.env"

echo ""
echo -e "${CYAN}Need help?${NC}"
echo "  - Check README.md for detailed documentation"
echo "  - Review CLAUDE.md for project-specific notes"
echo "  - Open an issue on GitHub"

echo ""
print_success "Setup completed successfully!"
echo ""
