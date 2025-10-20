#!/bin/bash

# Comprehensive Backup Script for Romero Tech Solutions
# Backs up database and project files to ~/WebSite/Backups

echo "🚀 Starting Romero Tech Solutions comprehensive backup..."
echo "======================================================="

# Change to project directory (where this script is located)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Run the Node.js backup script
node backup-all.js

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Backup completed successfully!"
    echo "📁 Backups are stored in ~/WebSite/Backups/"
else
    echo ""
    echo "❌ Backup failed! Check the output above for details."
    exit 1
fi