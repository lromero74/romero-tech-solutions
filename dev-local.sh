#!/bin/bash
# Local Development Startup Script
# Safely starts local development environment

echo "🚀 Starting LOCAL development environment..."
echo "⚠️  This will NOT affect production!"

# Copy local environment files
echo "📄 Setting up local environment..."
cp .env.local .env
cp backend/.env.local backend/.env

# Kill any existing processes
echo "🧹 Cleaning up existing processes..."
./cleanup-processes.sh 2>/dev/null || echo "No cleanup needed"

# Start backend in background
echo "🔧 Starting backend server..."
cd backend
npm run dev &
BACKEND_PID=$!
cd ..

# Wait for backend to start
echo "⏳ Waiting for backend to initialize..."
sleep 3

# Start frontend
echo "🌐 Starting frontend server..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ LOCAL DEVELOPMENT ENVIRONMENT STARTED"
echo "📍 Frontend: http://localhost:5173"
echo "📍 Backend:  http://localhost:3001"
echo "📍 Database: Development database (romerotechsolutions_dev)"
echo ""
echo "🛑 To stop: Ctrl+C or run ./cleanup-processes.sh"
echo "📋 Backend PID: $BACKEND_PID"
echo "📋 Frontend PID: $FRONTEND_PID"

# Wait for user to stop
wait