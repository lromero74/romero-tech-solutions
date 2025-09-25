# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT: Maintaining This Document
**Claude Code should actively maintain and update this CLAUDE.md file as you discover new operational knowledge while working in the codebase.** Add insights about:
- Service management procedures and troubleshooting steps
- Database connection issues and solutions
- Environment-specific configurations discovered
- Testing procedures and frameworks identified
- Common debugging workflows
- Performance optimization discoveries
- Security considerations found during development
- Any operational "gotchas" or special requirements

## MANDATORY SESSION STARTUP PROCEDURE

**CRITICAL: At the start of EVERY new session, Claude Code MUST perform these checks in order:**

**⚠️ WORKING DIRECTORY CHECK:** Always confirm you're in project root first using `pwd`. Expected: `/Users/louis/Downloads/RomeroTechSolutions_Zips/project`

1. **Check Public IP**: `curl -s https://ipinfo.io/ip` (for database whitelist monitoring)
2. **Test Database Connection**: `scripts/table --list` (verify RDS connectivity)
3. **Test SMTP Credentials**: `cd backend && node test-smtp.js` (verify SES email functionality)
4. **Check Frontend Service**: `lsof -ti:5173` (should show process IDs)
5. **Check Backend Service**: `lsof -ti:3001` (should show process IDs)
6. **Start Missing Services**: If backend not running, use `cd backend && npm run dev` in background
7. **Provide Status Summary**: Report IP, database health, SMTP status, and service status
8. **Announce Custom User Commands**: List ALL available custom user commands from the Custom User Commands section

This prevents session startup issues and ensures all systems are operational before beginning work.

## 🗂️ DIRECTORY NAVIGATION & CONTEXT MANAGEMENT

**CRITICAL: Always be aware of your current working directory to prevent command failures.**

### Project Structure & Navigation Rules
```
/Users/louis/Downloads/RomeroTechSolutions_Zips/project/    # PROJECT ROOT
├── backend/                                               # Backend Node.js app
│   ├── server.js, package.json, .env                    # Backend files
│   ├── scripts/, routes/, services/, utils/             # Backend directories
│   └── print-table.js, test-smtp.js                    # Database/email scripts
├── src/                                                  # Frontend React app
├── scripts/table                                        # Bash wrapper for DB commands
├── restart-services.sh, cleanup-processes.sh           # Service management scripts
├── backup-all.js, backup-all.sh                        # Backup scripts
└── CLAUDE.md, package.json, .env                       # Project root files
```

### Directory Context Rules
**🎯 BEFORE running ANY command, always check your current directory context:**

1. **Project Root Commands** (run from `/Users/louis/Downloads/RomeroTechSolutions_Zips/project/`):
   - `scripts/table --list` (database testing via wrapper)
   - `./restart-services.sh` (service management)
   - `./backup-all.js` or `./backup-all.sh` (comprehensive backups)
   - `npm run dev` (frontend development server)
   - `npm run lint` (frontend linting)

2. **Backend Directory Commands** (run from `backend/` subdirectory):
   - `cd backend && node print-table.js --list` (direct database script)
   - `cd backend && node test-smtp.js` (SMTP credential testing)
   - `cd backend && npm run dev` (backend development server)
   - `cd backend && npm run migrate` (database migrations)

### Script Location Memory
**Database Scripts:**
- **Wrapper**: `scripts/table` (project root) → auto-navigates to backend
- **Direct**: `backend/print-table.js` (requires manual cd to backend/)

**Service Management:**
- **All scripts**: Located in project root, run from project root
- `./restart-services.sh`, `./cleanup-processes.sh`

**Backup Scripts:**
- **All scripts**: Located in project root, MUST run from project root
- `./backup-all.sh`, `node backup-all.js`

## Project Overview

Romero Tech Solutions - An enterprise-class MSP (Managed Service Provider) interface for clients, technicians, and admins. The application supports multiple user roles with different permission levels and provides features for managing service requests, scheduling, communication, and invoicing.

## Technology Stack

**Frontend (React + TypeScript + Vite)**
- React 18 with TypeScript
- Vite for build tooling and development server
- Tailwind CSS for styling
- AWS Amplify for authentication
- Context API for state management
- Lucide React for icons

**Backend (Node.js + Express)**
- Express.js server (ES modules)
- PostgreSQL database with AWS RDS support
- JWT authentication with AWS Cognito integration
- Multiple authentication strategies (Cognito, session-based)

## Development Commands

**Local Development (from project root):**
- `npm run dev` - Start development server (localhost:5173 → localhost:3001 → romerotechsolutions_dev database)
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

**Backend (from backend/ directory):**
- `npm run dev` - Start backend development server on port 3001
- `npm start` - Start production server
- `npm run migrate` - Run database migrations

**Process Management:**
- `./restart-services.sh` - Forcefully restart both frontend and backend services
- `./cleanup-processes.sh` - Enhanced process cleanup script for stale processes

## Architecture & Structure

### Authentication System
The app uses a multi-layered authentication approach:
- **EnhancedAuthContext** (src/contexts/EnhancedAuthContext.tsx) - Primary auth provider with role-based access
- **AWS Cognito** integration for user management
- **Session-based authentication** with JWT tokens
- **Role-based routing** supporting Admin, Technician, Client, and Sales roles

### User Roles & Permissions
1. **Clients** - Can only see their own tasks, messages, service requests, invoices
2. **Technicians** - Can see assigned service requests and schedules, can self-assign unassigned requests
3. **Admins** - Full access to all clients, service requests, invoices, technician schedules
4. **Sales** - Can manage businesses, client contacts, invoices (create but not delete)

### Database Connection (Amazon RDS PostgreSQL)
- **Host**: Remote AWS RDS PostgreSQL instance (NOT local)
- **Production Database**: `romerotechsolutions` (34.228.181.68:5432)
- **Development Database**: `romerotechsolutions_dev` (same host, isolated data for safe local testing)
- **Configuration**: `backend/config/database.js` with dual credential support (AWS Secrets Manager OR .env)
- **Security Features**: Parameterized queries for SQL injection prevention, connection pooling (25 max, 2 min)
- **Error Handling**: Pool auto-recovery on connection failures (`ENETUNREACH`, `ETIMEDOUT`, `Query read timeout`)

## Development Notes

### Authentication Requirements
- Internal users (Admin/Technician/Sales) require `@romerotechsolutions.com` email addresses
- Different login endpoints: `/admin`, `/technician`, `/sales`
- Client authentication uses separate flow
- Admin login requires MFA (Multi-Factor Authentication) via email codes

### Session Management System
- **SessionManager** (src/utils/sessionManager.ts) - Handles client-side session timeouts and warnings
- **System Settings** stored in database (`system_settings` table) for configurable timeout values
- **Default Values**: 15min timeout, 2min warning (fallback when database unavailable)
- **Background Polling**: AdminDataContext polls employee status every 30 seconds

### Environment Configuration
- Frontend: Uses `.env` for AWS configuration
- Backend: Uses `.env` for database connection and JWT secrets
- Production deployment: EC2 backend + Amplify frontend + RDS database

### Code Conventions
- TypeScript strict mode enabled
- ESLint configuration in place
- Context-based state management pattern
- Modular component architecture with role-based rendering
- **ALWAYS run `npm run lint` after editing code files and fix any linting problems before completing tasks**

## UI Component Library & Design System

### Core Design Principles
- **Glassmorphism effects**: `bg-white/10 backdrop-blur-sm` for modern translucent cards
- **Custom particle backgrounds**: Interactive click-to-generate particle effects
- **Comprehensive dark mode**: All components support light/dark themes via ThemeContext
- **Consistent animations**: fadeIn, pulse-slow, bounce-subtle (defined in src/index.css)
- **No external UI library**: All components are custom-built for maximum design control

### Scrollable Table Pattern (AdminClients, AdminServiceLocations, AdminEmployees)
**Critical Pattern for Pixel-Perfect Table UI:**

1. **Table Layout**: Use `table-auto` for auto-sizing columns based on content
2. **Sticky Header**: `sticky top-0` positioning
3. **Fade Gradient Positioning**: ALWAYS use `headerHeight - 1px` for top fade gradient
4. **No Border Conflicts**: Remove `border-b` from filter rows to prevent gaps

```tsx
// Correct fade gradient positioning - remember this pattern!
<div
  className="absolute left-0 right-0 h-6 bg-gradient-to-b from-white/90 to-transparent pointer-events-none z-20"
  style={{ top: `${headerHeight - 1}px` }}  // -1px is critical!
/>
```

### When Creating New Components:
1. **Always check** existing components in src/components/ for patterns
2. **Use ThemeContext** themeClasses utility for consistent styling
3. **Include dark mode support** in all visual elements
4. **Follow ESC key handling** patterns for modals/dialogs
5. **Use existing animation classes** from src/index.css

## 🚀 PRODUCTION DEPLOYMENT

### Production URLs & Endpoints
**Frontend URLs:**
- **Public Site**: `https://www.romerotechsolutions.com/`
- **Admin Login**: `https://www.romerotechsolutions.com/admin`
- **Technician Login**: `https://www.romerotechsolutions.com/technician`
- **Sales Login**: `https://www.romerotechsolutions.com/sales`
- **Hidden Client Login**: `https://www.romerotechsolutions.com/clogin`
- **Coming Soon Page**: `https://www.romerotechsolutions.com/login`

**Backend Endpoints:**
- **API Base URL**: `https://api.romerotechsolutions.com/api` (HTTPS via nginx)
- **WebSocket URL**: `https://api.romerotechsolutions.com` (HTTPS via nginx)
- **Health Check**: `https://api.romerotechsolutions.com/health`
- **Database Health**: `https://api.romerotechsolutions.com/health/db`

### Production Infrastructure
**Frontend Deployment (AWS Amplify):**
- **Repository**: GitHub `lromero74/romero-tech-solutions` (main branch)
- **CI/CD**: AWS Amplify auto-deploy (triggers on git push to main)
- **App ID**: `d9ln0cda9os0r`
- **Domain Flow**: `romerotechsolutions.com` → `www.romerotechsolutions.com`

**Backend Deployment (AWS EC2):**
- **Production Host**: `ssh botmanager` (44.211.124.33)
- **Deployment Path**: `~/romero-tech-solutions-repo/backend/` on EC2 instance
- **Service**: Background service managed by systemd (`romero-backend`)
- **SSL**: nginx reverse proxy with Let's Encrypt certificates

**Database (AWS RDS PostgreSQL):**
- **Connection**: `34.228.181.68:5432/romerotechsolutions`
- **Security Group**: `sg-033c0c1f0983cb799` with IP whitelist access

### Deployment Process
**Frontend Changes:**
```bash
git add [files]
git commit -m "Detailed commit message"
git push origin main
# Amplify auto-deploys in ~2-3 minutes
```

**Backend Changes:**
```bash
ssh botmanager
cd ~/romero-tech-solutions-repo/backend
git pull origin main
npm install
sudo systemctl restart romero-backend
sudo systemctl status romero-backend
```

### Environment Variables
**Production Frontend (Amplify):**
```env
VITE_API_BASE_URL = https://api.romerotechsolutions.com/api
VITE_AWS_OAUTH_DOMAIN = romerotechsolutions.com
VITE_AWS_REGION = us-east-1
VITE_AWS_USER_POOL_CLIENT_ID = 3t01ui8s31kmfo69vjbj4hnsea
VITE_AWS_USER_POOL_CLIENT_SECRET = [REGENERATE_IN_AWS_CONSOLE]
VITE_AWS_USER_POOL_ID = us-east-1_YCT3O4xRZ
```

**Production Backend (EC2):**
```env
NODE_ENV=production
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,https://romerotechsolutions.com,https://www.romerotechsolutions.com,https://*.amplifyapp.com
DB_HOST=34.228.181.68
DB_PORT=5432
DB_NAME=romerotechsolutions
DB_USER=[from AWS Secrets Manager]
DB_PASSWORD=[from AWS Secrets Manager]
JWT_SECRET=[production secret]
```

### Troubleshooting Production Issues
```bash
# Test API connectivity
curl -s "https://api.romerotechsolutions.com/api/auth/check-admin"

# Check all production services
ssh botmanager "sudo systemctl status romero-backend nginx"

# Monitor backend service logs
ssh botmanager "sudo journalctl -u romero-backend -f"

# Check database connectivity
ssh botmanager "cd ~/romero-tech-solutions-repo/backend && node print-table.js --list"

# Restart services if needed
ssh botmanager "sudo systemctl restart romero-backend nginx"
```

### Database Connection Configuration
**Key Learning**: Database credentials are stored in `backend/.env`, NOT project root `.env`
- **Working credentials**: `backend/.env` (actual RDS connection: `34.228.181.68:5432/romerotechsolutions`)
- **Placeholder credentials**: Project root `.env` (dummy values)
- **Scripts that work correctly**: `scripts/table` (runs from backend directory automatically)
- **Production backend path**: `~/romero-tech-solutions-repo/backend/` (NOT `~/RTS_backend/`)

### Backup Scripts
**Database Backup:**
- `backend/scripts/backup_database.js` - Creates PostgreSQL dump with pg_dump
- **Usage**: `cd backend && node scripts/backup_database.js`

**Full System Backup:**
- `backup-all.js` or `backup-all.sh` - Complete backup solution (project root)
- **CRITICAL**: Must run from PROJECT ROOT directory
- **Usage**: `./backup-all.sh` or `node backup-all.js` (from project root)
- **Function**: Creates timestamped backup folder in `~/WebSite/Backups/`

## 🚨 CRITICAL REMINDER FOR CLAUDE CODE 🚨
**NEVER FORGET: When user says "BackThisUp", you MUST use --message flag with detailed multiline summary**
- ❌ WRONG: `./backup-all.sh` (no message documentation)
- ✅ CORRECT: `node backup-all.js --message "Comprehensive summary of all changes since last backup"`
- This is a DOCUMENTED REQUIREMENT - follow it strictly
- Always include detailed technical implementation summary in the message

## Custom User Commands

**BackThisUp** - Create comprehensive backup with detailed multiline message documenting all changes
**ListBackups** - Display all available backups with details and restore commands
**MakeABusiness** - Create test company with 10 service locations and 5 clients each (50 total clients)

## Key Admin Components
- `src/pages/AdminDashboard.tsx` - Main admin dashboard entry point
- `src/components/admin/` - Complete admin component library
- `AdminEmployees.tsx`, `AdminClients.tsx`, `AdminBusinesses.tsx` - Core management components
- `AdminModalManager.tsx` - Centralized modal state management

## Critical Infrastructure Notes
1. **Database Access**: Requires IP whitelisting in RDS security groups
2. **SSL Termination**: Frontend (Amplify CloudFront), Backend (nginx Let's Encrypt)
3. **Session Storage**: In-memory sessions - lost on backend restart
4. **SSL Certificate Renewal**: Let's Encrypt auto-renewal via certbot
5. **WebSocket URL Construction**: Frontend constructs from API base URL, requires explicit handling

## AWS SDK Migration Status
**✅ Completed Migration to AWS SDK v3:**
- Updated all services to use `@aws-sdk/client-*` v3 packages
- Removed `aws-sdk` v2 package from dependencies
- Email functionality works via SMTP transport
- All AWS SDK warnings resolved

## Current Production Status
- **Frontend**: `https://www.romerotechsolutions.com` ✅ Fully operational
- **Backend API**: `https://api.romerotechsolutions.com/api` ✅ HTTPS with SSL
- **WebSocket**: `https://api.romerotechsolutions.com` ✅ HTTPS enabled
- **Database**: RDS PostgreSQL ✅ Connected and healthy
- **SSL Certificates**: Let's Encrypt ✅ Valid and auto-renewing
- **SPA Routing**: Amplify redirect rules ✅ Working correctly

**All production systems operational with proper HTTPS security.**