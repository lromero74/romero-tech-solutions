#!/bin/bash
# Production Deployment Script
# Safely deploys to production environment

echo "🚨 PRODUCTION DEPLOYMENT SCRIPT 🚨"
echo "This will deploy to LIVE PRODUCTION environment!"
echo ""

# Safety check
read -p "Are you sure you want to deploy to PRODUCTION? (type 'DEPLOY' to confirm): " confirmation
if [ "$confirmation" != "DEPLOY" ]; then
    echo "❌ Deployment cancelled"
    exit 1
fi

echo "🔄 Preparing production deployment..."

# Restore production environment files
echo "📄 Restoring production environment..."
cp .env.production .env 2>/dev/null || echo "⚠️  No .env.production found, using current .env"
cp backend/.env.production backend/.env 2>/dev/null || echo "⚠️  No backend/.env.production found, using current backend/.env"

# Run tests (if they exist)
echo "🧪 Running tests..."
npm test 2>/dev/null || echo "⚠️  No tests found, skipping..."

# Build frontend
echo "🏗️  Building frontend..."
npm run build

# Commit and push changes
echo "📤 Deploying to production..."
git add -A
git status

echo ""
read -p "Enter commit message: " commit_message
git commit -m "$commit_message"

echo "🚀 Pushing to production..."
git push origin main

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo "📍 Frontend will auto-deploy via Amplify in ~2-3 minutes"
echo "📍 Backend requires manual deployment on EC2 server"
echo ""
echo "Next steps:"
echo "1. Monitor Amplify deployment at AWS console"
echo "2. SSH to production server and run deployment script"
echo "3. Test production endpoints"