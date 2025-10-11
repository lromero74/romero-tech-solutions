#!/bin/bash

# Setup Agent Binary Storage
# This script sets up the directory structure for storing agent binaries on the EC2 instance

set -e  # Exit on error

echo "🚀 Setting up agent binary storage directory..."

# Determine environment
if [ "$1" == "production" ]; then
  BINARIES_DIR="/home/ec2-user/agent-binaries"
  echo "📦 Production mode: $BINARIES_DIR"
else
  BINARIES_DIR="/tmp/agent-binaries"
  echo "🧪 Development mode: $BINARIES_DIR"
fi

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p "$BINARIES_DIR"/{windows,macos,linux}

# Create initial version directories (1.0.0)
for platform in windows macos linux; do
  mkdir -p "$BINARIES_DIR/$platform/1.0.0"
  echo "✅ Created $BINARIES_DIR/$platform/1.0.0"
done

# Set proper permissions
if [ "$1" == "production" ]; then
  echo "🔐 Setting permissions (production)..."
  chmod 755 "$BINARIES_DIR"
  chmod 755 "$BINARIES_DIR"/{windows,macos,linux}
  find "$BINARIES_DIR" -type d -exec chmod 755 {} \;
  find "$BINARIES_DIR" -type f -exec chmod 644 {} \;
fi

echo ""
echo "✅ Agent binary storage setup complete!"
echo ""
echo "📋 Directory structure:"
ls -laR "$BINARIES_DIR"
echo ""
echo "📌 Next steps:"
echo "  1. Place compiled agent binaries in the appropriate directories:"
echo "     - Windows: $BINARIES_DIR/windows/<version>/rts-agent-amd64.exe"
echo "     - macOS:   $BINARIES_DIR/macos/<version>/rts-agent-{amd64,arm64}.dmg"
echo "     - Linux:   $BINARIES_DIR/linux/<version>/rts-agent-amd64.deb"
echo ""
echo "  2. Test download endpoints:"
echo "     - GET /api/agent/download/windows?version=1.0.0&arch=amd64"
echo "     - GET /api/agent/download/macos?arch=arm64"
echo "     - GET /api/agent/download/linux"
echo ""
echo "  3. List available versions:"
echo "     - GET /api/agent/versions/windows"
echo "     - GET /api/agent/versions/macos"
echo "     - GET /api/agent/versions/linux"
echo ""
