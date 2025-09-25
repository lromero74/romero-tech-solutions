#!/bin/bash

# Script to kill all frontend and backend services and restart one of each
# This script should be run from the project root directory

echo "🚀 Service Restart Script Starting..."
echo "=============================================="

# Function to kill processes on specific ports
kill_port() {
    local port=$1
    local service_name=$2

    echo "🔍 Checking for processes on port $port ($service_name)..."

    # Find and kill processes on the specified port
    pids=$(lsof -ti:$port 2>/dev/null)

    if [ ! -z "$pids" ]; then
        echo "🗡️  Killing $service_name processes on port $port..."
        echo "$pids" | xargs kill -9 2>/dev/null
        echo "✅ Killed processes: $pids"
    else
        echo "ℹ️  No processes found on port $port"
    fi
}

# Function to kill processes by name pattern
kill_by_pattern() {
    local pattern=$1
    local service_name=$2

    echo "🔍 Checking for $service_name processes ($pattern)..."

    # Find processes matching the pattern
    pids=$(ps aux | grep "$pattern" | grep -v grep | awk '{print $2}')

    if [ ! -z "$pids" ]; then
        echo "🗡️  Killing $service_name processes..."
        echo "$pids" | xargs kill -9 2>/dev/null
        echo "✅ Killed $service_name processes: $pids"
    else
        echo "ℹ️  No $service_name processes found"
    fi
}

# Step 1: Enhanced process cleanup
echo ""
echo "📋 Step 1: Enhanced process cleanup..."
echo "=============================================="

# Use the enhanced cleanup script if available
if [ -f "./cleanup-processes.sh" ]; then
    echo "🧹 Running enhanced cleanup script..."
    ./cleanup-processes.sh
else
    echo "📋 Running basic cleanup (enhanced script not found)..."
    # Kill common frontend development ports (React, Vite, etc.)
    kill_port 5173 "Frontend (Vite default)"

    # Kill common backend development ports
    kill_port 3001 "Backend (Express default)"
    kill_port 3000 "Backend (Express default)"
    kill_port 8000 "Backend (Alternative)"

    # Kill Node.js processes that might be running npm/dev servers
    kill_by_pattern "npm run dev" "NPM Dev Servers"
    kill_by_pattern "vite" "Vite Servers"
    kill_by_pattern "webpack" "Webpack Servers"
    kill_by_pattern "nodemon" "Nodemon Servers"
fi

# Step 2: Wait for cleanup
echo ""
echo "⏳ Step 2: Waiting for cleanup..."
echo "=============================================="
echo "Waiting 3 seconds for processes to terminate..."
sleep 3

# Step 3: Verify ports are free
echo ""
echo "🔍 Step 3: Verifying ports are free..."
echo "=============================================="
if lsof -ti:3001 >/dev/null 2>&1; then
    echo "⚠️  Warning: Port 3001 still in use"
else
    echo "✅ Port 3001 is free"
fi

if lsof -ti:5173 >/dev/null 2>&1; then
    echo "⚠️  Warning: Port 5173 still in use"
else
    echo "✅ Port 5173 is free"
fi

# Step 4: Start Backend Service
echo ""
echo "🔄 Step 4: Starting Backend Service..."
echo "=============================================="
echo "Starting backend on port 3001..."

# Check if backend directory exists
if [ ! -d "backend" ]; then
    echo "❌ Error: backend directory not found!"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Start backend in background with nohup
cd backend
echo "📂 Changed to backend directory: $(pwd)"
echo "🚀 Starting backend server with nohup..."
nohup npm run dev > ../nohup_backend.out 2>&1 &
backend_pid=$!
echo "✅ Backend started with nohup (PID: $backend_pid)"
echo "📋 Backend logs: nohup_backend.out"
cd ..

# Wait a moment for backend to start
echo "⏳ Waiting 3 seconds for backend to initialize..."
sleep 3

# Step 5: Start Frontend Service
echo ""
echo "🔄 Step 5: Starting Frontend Service..."
echo "=============================================="
echo "Starting frontend on port 5173..."

# Check if we're in the right directory (should have package.json)
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found in current directory!"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo "📂 Starting frontend from: $(pwd)"
echo "🚀 Starting frontend server with nohup..."
nohup npm run dev > nohup_frontend.out 2>&1 &
frontend_pid=$!
echo "✅ Frontend started with nohup (PID: $frontend_pid)"
echo "📋 Frontend logs: nohup_frontend.out"

# Step 6: Verification and Summary
echo ""
echo "🔍 Step 6: Verification..."
echo "=============================================="
sleep 3

echo "Checking if services are running..."

# Check backend
if kill -0 $backend_pid 2>/dev/null; then
    echo "✅ Backend is running (PID: $backend_pid)"
else
    echo "❌ Backend failed to start or crashed"
fi

# Check frontend
if kill -0 $frontend_pid 2>/dev/null; then
    echo "✅ Frontend is running (PID: $frontend_pid)"
else
    echo "❌ Frontend failed to start or crashed"
fi

# Check ports
echo ""
echo "Port status:"
if lsof -ti:3001 >/dev/null 2>&1; then
    echo "✅ Backend port 3001: ACTIVE"
else
    echo "❌ Backend port 3001: NOT ACTIVE"
fi

if lsof -ti:5173 >/dev/null 2>&1; then
    echo "✅ Frontend port 5173: ACTIVE"
else
    echo "❌ Frontend port 5173: NOT ACTIVE"
fi

# Final Summary
echo ""
echo "📊 Summary:"
echo "=============================================="
echo "Backend PID: $backend_pid (nohup enabled)"
echo "Frontend PID: $frontend_pid (nohup enabled)"
echo ""
echo "Log files:"
echo "  Backend:  nohup_backend.out"
echo "  Frontend: nohup_frontend.out"
echo ""
echo "To stop services manually:"
echo "  Backend:  kill $backend_pid"
echo "  Frontend: kill $frontend_pid"
echo ""
echo "URLs:"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:3001"
echo ""
echo "✅ Script completed successfully!"
echo "🌟 Services are now running with nohup - they will persist after session ends!"
