#!/bin/bash

# Script to update VAPID keys in production
# Run this script after SSHing to production server

echo "📱 Updating Production VAPID Keys for Push Notifications"
echo "=========================================================="

# VAPID keys (generated with: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY="BFC_fY801d4N8P58IPlWxWQQIeaxPqFwKLxk2JRo4dBRuuNncHKXLZ5IYO5__XgzEeOmR8XeeRMw5UyVbdFt9Vo"
VAPID_PRIVATE_KEY="8zFrMeVFuMhKcxJQd_p_jia1wZuMkCkMM5pCr-7QnYM"
VAPID_SUBJECT="mailto:info@romerotechsolutions.com"

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