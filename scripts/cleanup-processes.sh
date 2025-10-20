#!/bin/bash

# Enhanced process cleanup script for Romero Tech Solutions
# This script aggressively cleans up stale Node.js and npm processes
# Run from project root directory

echo "🧹 Enhanced Process Cleanup Starting..."
echo "=============================================="

# Function to kill processes and show detailed info
enhanced_kill() {
    local pattern=$1
    local service_name=$2

    echo ""
    echo "🔍 Finding $service_name processes..."

    # Find matching processes
    local pids=$(ps aux | grep "$pattern" | grep -v grep | awk '{print $2}')

    if [ ! -z "$pids" ]; then
        echo "📋 Found $service_name processes:"
        ps aux | grep "$pattern" | grep -v grep | while read line; do
            echo "  $line"
        done

        echo "🗡️  Killing $service_name processes..."
        echo "$pids" | xargs kill -9 2>/dev/null || true

        # Wait and verify
        sleep 1
        local remaining=$(ps aux | grep "$pattern" | grep -v grep | awk '{print $2}')
        if [ -z "$remaining" ]; then
            echo "✅ Successfully killed all $service_name processes"
        else
            echo "⚠️  Some $service_name processes may still be running:"
            echo "$remaining"
        fi
    else
        echo "✅ No $service_name processes found"
    fi
}

# Function to kill by port with detailed info
enhanced_kill_port() {
    local port=$1
    local service_name=$2

    echo ""
    echo "🔍 Checking port $port ($service_name)..."

    local pids=$(lsof -ti:$port 2>/dev/null)

    if [ ! -z "$pids" ]; then
        echo "📋 Processes using port $port:"
        lsof -i:$port 2>/dev/null || true

        echo "🗡️  Killing processes on port $port..."
        echo "$pids" | xargs kill -9 2>/dev/null || true

        # Wait and verify
        sleep 1
        local remaining=$(lsof -ti:$port 2>/dev/null)
        if [ -z "$remaining" ]; then
            echo "✅ Port $port is now free"
        else
            echo "⚠️  Port $port may still be in use by PID: $remaining"
        fi
    else
        echo "✅ Port $port is free"
    fi
}

# Step 1: Show current process status
echo ""
echo "📊 Current Node.js/npm process count: $(ps aux | grep -E '(node|npm)' | grep -v grep | wc -l)"
echo ""

# Step 2: Kill by port (most important)
echo "🎯 Step 1: Killing processes by port..."
echo "=============================================="
enhanced_kill_port 5173 "Frontend (Vite)"
enhanced_kill_port 5174 "Frontend (Vite alt)"
enhanced_kill_port 3001 "Backend (Express)"
enhanced_kill_port 3000 "Backend (Express alt)"
enhanced_kill_port 8000 "Backend (Alternative)"

# Step 3: Kill by process pattern (more aggressive)
echo ""
echo "🎯 Step 2: Killing processes by pattern..."
echo "=============================================="
enhanced_kill "npm run dev" "NPM dev servers"
enhanced_kill "nodemon server.js" "Nodemon servers"
enhanced_kill "nodemon.*server" "All Nodemon servers"
enhanced_kill "vite.*serve" "Vite servers"
enhanced_kill "webpack.*serve" "Webpack servers"

# Step 4: Kill orphaned nodemon processes
echo ""
echo "🎯 Step 3: Cleaning up orphaned processes..."
echo "=============================================="
enhanced_kill "nodemon" "All Nodemon processes"
enhanced_kill "node.*server.js" "Direct Node servers"

# Step 5: Final cleanup - kill any remaining npm processes in project directories
echo ""
echo "🎯 Step 4: Final cleanup of project-related processes..."
echo "=============================================="
enhanced_kill "RomeroTechSolutions.*node" "Project Node processes"
enhanced_kill "Downloads.*project.*node" "Project Node processes (by path)"

# Step 6: Wait for cleanup
echo ""
echo "⏳ Step 5: Waiting for cleanup to complete..."
echo "=============================================="
sleep 2

# Step 7: Verification
echo ""
echo "🔍 Step 6: Final verification..."
echo "=============================================="

# Check process count
final_count=$(ps aux | grep -E '(node|npm)' | grep -v grep | wc -l)
echo "📊 Remaining Node.js/npm processes: $final_count"

if [ "$final_count" -gt 5 ]; then
    echo "⚠️  Warning: Still many Node processes running. Listing remaining:"
    echo ""
    ps aux | grep -E '(node|npm)' | grep -v grep | head -10
    echo ""
    echo "💡 You may want to review these processes manually"
else
    echo "✅ Process count looks reasonable"
fi

# Check critical ports
echo ""
echo "🔍 Port status:"
for port in 3001 5173; do
    if lsof -ti:$port >/dev/null 2>&1; then
        echo "⚠️  Port $port: STILL IN USE"
        lsof -i:$port 2>/dev/null | head -5
    else
        echo "✅ Port $port: FREE"
    fi
done

echo ""
echo "✅ Enhanced cleanup completed!"
echo "🚀 Ports should now be available for clean service restart"