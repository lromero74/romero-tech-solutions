#!/bin/bash

# Script to update VAPID keys in production
# Run this script after SSHing to production server

echo "📱 Updating Production VAPID Keys for Push Notifications"
echo "=========================================================="

# Load VAPID keys from local .env file
# If keys are not in environment, try to load from backend/.env
if [ -z "$VAPID_PUBLIC_KEY" ] || [ -z "$VAPID_PRIVATE_KEY" ]; then
    if [ -f "backend/.env" ]; then
        echo "Loading VAPID keys from backend/.env file..."
        export $(grep -E "^VAPID_" backend/.env | xargs)
    else
        echo "❌ ERROR: VAPID keys not found in environment or backend/.env file"
        echo "Please set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT environment variables"
        echo "Or ensure backend/.env file exists with these variables"
        exit 1
    fi
fi

# Default subject if not set
VAPID_SUBJECT="${VAPID_SUBJECT:-mailto:info@romerotechsolutions.com}"

# Add VAPID keys to production .env file if not already present
echo ""
echo "Adding VAPID keys to backend/.env file..."

cd ~/romero-tech-solutions-repo/backend

# Check if VAPID keys already exist in .env
if grep -q "VAPID_PUBLIC_KEY" .env; then
    echo "⚠️  VAPID keys already exist in .env file"
    echo "To replace them, manually edit the .env file"
else
    # Add VAPID keys to .env
    echo "" >> .env
    echo "# Push Notification Configuration (VAPID Keys)" >> .env
    echo "VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY" >> .env
    echo "VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY" >> .env
    echo "VAPID_SUBJECT=$VAPID_SUBJECT" >> .env

    echo "✅ VAPID keys added to .env file"
fi

echo ""
echo "Restarting backend service..."
sudo systemctl restart romero-backend

echo ""
echo "✅ Production VAPID keys updated!"
echo ""
echo "Public Key: $VAPID_PUBLIC_KEY"
echo ""
echo "Test the endpoint:"
echo "curl -s https://api.romerotechsolutions.com/api/push/vapid-public-key | jq ."