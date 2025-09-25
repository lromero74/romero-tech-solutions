# Service Restart Script

## Overview

The `restart-services.sh` script is designed to forcefully kill all existing frontend and backend development services and then restart one clean instance of each.

## Features

- 🗡️ **Force Kill**: Terminates all existing development servers on common ports
- 🔍 **Port Detection**: Automatically detects and kills services on ports 3000, 3001, 5173, 8080, etc.
- 🧹 **Process Cleanup**: Kills npm dev servers, vite, webpack, and nodemon processes
- 🚀 **Clean Restart**: Starts fresh frontend and backend services
- ✅ **Verification**: Checks that services started successfully
- 📊 **Status Report**: Provides detailed output and summary

## Usage

### From Project Root Directory

```bash
# Make script executable (one time only)
chmod +x restart-services.sh

# Run the script
./restart-services.sh
```

### What the Script Does

1. **Kill Phase**
   - Terminates processes on common development ports (3000, 3001, 5173, 8080, etc.)
   - Kills npm dev servers, vite, webpack, and nodemon processes
   - Waits for cleanup

2. **Restart Phase**
   - Starts backend service from `./backend` directory on port 3001
   - Starts frontend service from project root on port 3000
   - Verifies both services are running

3. **Verification Phase**
   - Checks process status
   - Confirms ports are active
   - Provides summary and next steps

## Expected Output

The script provides detailed, color-coded output:

```
🚀 Service Restart Script Starting...
==============================================
🔍 Checking for processes on port 3000 (Frontend)...
🗡️  Killing Frontend processes on port 3000...
✅ Killed processes: 1234 5678
...
✅ Backend is running (PID: 9876)
✅ Frontend is running (PID: 5432)
🌟 Services should now be running!
```

## Post-Script

After successful execution:

- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:3001

To manually stop services later:
```bash
kill <backend_pid>
kill <frontend_pid>
```

## Troubleshooting

### Permission Denied
```bash
chmod +x restart-services.sh
```

### Services Won't Start
- Check that `package.json` exists in project root
- Check that `backend/` directory exists
- Verify npm dependencies are installed:
  ```bash
  npm install
  cd backend && npm install
  ```

### Ports Still in Use
- Wait 30 seconds and try again
- Manually kill stubborn processes:
  ```bash
  sudo lsof -ti:3000 | xargs kill -9
  sudo lsof -ti:3001 | xargs kill -9
  ```

## Requirements

- **Operating System**: macOS/Linux (uses `lsof`, `ps`, `kill`)
- **Node.js**: Installed and configured
- **NPM**: Available in PATH
- **Project Structure**:
  - Frontend `package.json` in project root
  - Backend in `./backend/` subdirectory

## Safety Notes

- ⚠️ This script uses `kill -9` which forcefully terminates processes
- 🔒 Only affects development servers on common ports
- 📁 Must be run from the project root directory
- 🚫 Does not affect system services or other applications

## Integration

You can add this script to your package.json scripts:

```json
{
  "scripts": {
    "restart": "./restart-services.sh"
  }
}
```

Then run with: `npm run restart`