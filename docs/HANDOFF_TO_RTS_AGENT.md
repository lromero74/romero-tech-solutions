# MSP Agent System Development - Handoff Instructions for RTS Project Agent

## 🎯 Project Overview

We are extending the existing Romero Tech Solutions (RTS) platform to add **MSP Agent Monitoring** capabilities. This will allow RTS to monitor customer devices (servers, workstations) with automated metric collection, alerting, and remote management.

## 🔑 Key Context Corrections

**IMPORTANT - User/Employee Distinction:**
- `users` table = **Customer users** (client businesses' staff who use the RTS portal)
- `employees` table = **RTS internal staff** (your technicians, admins, etc.)

This distinction is critical for proper access control and audit logging.

## 🏗️ Architecture Strategy

**Decision: EXTEND existing RTS system, NOT create separate infrastructure**

### Why This Approach:
1. ✅ Reuse existing `businesses` and `service_locations` tables (no data duplication)
2. ✅ Integrate with existing `service_requests` system (alerts → tickets)
3. ✅ Leverage existing authentication and RBAC
4. ✅ Unified customer view (devices + tickets + billing in one place)
5. ✅ Lower infrastructure costs (~$15-35/month additional vs. $25-30 for separate system)

### What We're Adding:
- **7 new database tables** (agent_devices, agent_metrics, agent_alerts, etc.)
- **New API endpoints** under `/api/agents/*`
- **WebSocket server** for real-time agent communication
- **New frontend section** at `/dashboard/agents`
- **Go agent binary** (separate codebase, deployed to customer systems)

---

## 🚨 CRITICAL DEVELOPMENT REQUIREMENTS

### 1. Git Worktree for Isolated Development

**DO NOT develop directly in the main working tree!**

```bash
# Navigate to RTS repository
cd ~/Downloads/RomeroTechSolutions_Zips/project/

# Create a new worktree for agent development
git worktree add ../rts-agent-dev feature/msp-agent-system

# This creates a parallel working directory that:
# - Shares the same Git history
# - Has its own branch (feature/msp-agent-system)
# - Can be developed/tested without affecting production code
# - Keeps production deployments completely isolated
```

**Directory Structure After Worktree Creation:**
```
~/Downloads/RomeroTechSolutions_Zips/
├── project/                    # Main production worktree (UNTOUCHED during development)
│   ├── backend/               # Production backend (continuous deployment active)
│   ├── frontend/              # Production frontend
│   └── .git/                  # Shared Git repository
│
└── rts-agent-dev/             # NEW development worktree (isolated development)
    ├── backend/               # Backend with agent endpoints (development)
    ├── frontend/              # Frontend with agent dashboard (development)
    └── migrations/            # New migrations for agent tables
```

### 2. Database Safety Protocol

**NEVER touch production database during development!**

#### Create Development Database:
```bash
# SSH to production EC2 (BotManager)
ssh botmanager

# Connect to Aurora and create isolated dev database
# (Use existing Aurora cluster, but separate database)

# Option A: Create completely separate dev database
CREATE DATABASE romerotechsolutions_dev;
GRANT ALL PRIVILEGES ON DATABASE romerotechsolutions_dev TO postgres;

# Option B: Use existing dev database if it exists
# Check: SELECT datname FROM pg_database WHERE datname LIKE '%dev%';
```

#### Development Backend Configuration:
```bash
# In rts-agent-dev worktree, create separate .env.development
cd ~/Downloads/RomeroTechSolutions_Zips/rts-agent-dev/backend

# Create .env.development (DO NOT modify .env)
cat > .env.development << 'EOF'
# Development environment - Agent feature development
NODE_ENV=development
DB_HOST=database-1.cluster-c4n0ok80kvqh.us-east-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=romerotechsolutions_dev  # DEVELOPMENT DATABASE ONLY
DB_USER=postgres
# ... (copy other vars from .env, but ensure DB_NAME is dev)

# Use different port to avoid conflict with production backend
PORT=3002  # Production uses 3001

# Development API URL
API_BASE_URL=http://localhost:3002
EOF
```

### 3. Development Workflow

**Step-by-step safe development process:**

```bash
# 1. Switch to worktree
cd ~/Downloads/RomeroTechSolutions_Zips/rts-agent-dev

# 2. Install dependencies (if needed)
cd backend && npm install
cd ../frontend && npm install

# 3. Run migrations on DEV database only
cd ../backend
NODE_ENV=development npm run migrate
# Or manually: psql -h <host> -U postgres -d romerotechsolutions_dev < migrations/021_msp_agent_system.sql

# 4. Start development backend (port 3002, dev database)
cd backend
NODE_ENV=development npm run dev

# 5. Start development frontend (in separate terminal)
cd frontend
VITE_API_BASE_URL=http://localhost:3002/api npm run dev

# 6. Test agent features locally without touching production
```

### 4. Testing Checklist Before Merge

**DO NOT merge to main until all of these pass:**

- [ ] All agent API endpoints tested with Postman/curl
- [ ] Database migrations run successfully on dev database
- [ ] No breaking changes to existing API endpoints (run existing integration tests)
- [ ] Frontend compiles without errors (`npm run build`)
- [ ] Backend starts without errors
- [ ] No conflicts with existing routes
- [ ] Foreign key relationships to `businesses`, `service_locations`, `users` validated
- [ ] RBAC tested (customers see only their agents, admins see all)
- [ ] WebSocket server doesn't interfere with existing connections
- [ ] Git diff reviewed for accidental production changes

### 5. Deployment Strategy (Post-Development)

**When ready to deploy to production:**

```bash
# 1. Merge feature branch to main
cd ~/Downloads/RomeroTechSolutions_Zips/project
git checkout main
git merge feature/msp-agent-system

# 2. Run migrations on PRODUCTION database
ssh botmanager
cd ~/romero-tech-solutions-repo/backend
psql -h database-1.cluster-c4n0ok80kvqh.us-east-1.rds.amazonaws.com -U postgres -d romerotechsolutions < migrations/021_msp_agent_system.sql

# 3. Push to GitHub (triggers automatic deployment)
git push origin main

# 4. Monitor continuous deployment logs
ssh botmanager "~/manage-auto-deploy.sh logs"

# 5. Verify backend health
curl https://api.romerotechsolutions.com/api/health
curl https://api.romerotechsolutions.com/api/agents  # New endpoint

# 6. Check frontend build in Amplify console
# https://console.aws.amazon.com/amplify/
```

---

## 📋 Database Schema to Implement

See detailed schema in `.plan/MSPAgentPlan.txt` (lines 55-319)

**Summary of 7 new tables:**

1. **agent_devices** - Links devices to businesses/locations
   - Foreign keys: `business_id → businesses.id`, `service_location_id → service_locations.id`
   - Stores device info, OS, status, last heartbeat
   - `created_by UUID REFERENCES users(id)` ← **CORRECTION:** Should reference `employees(id)` since RTS staff creates registration tokens

2. **agent_metrics** - Time-series performance data
   - CPU, RAM, disk, network metrics collected every 5 minutes
   - Consider TimescaleDB hypertable for optimization

3. **agent_alerts** - Alert rules/definitions
   - Scoped to business or specific device
   - JSONB conditions for flexibility
   - `created_by UUID REFERENCES users(id)` ← **CORRECTION:** Should reference `employees(id)`

4. **agent_alert_history** - Fired alerts
   - Links to `service_requests` for auto-ticket creation
   - `acknowledged_by UUID REFERENCES users(id)` ← **CORRECTION:** Should reference `employees(id)` (technicians acknowledge)

5. **agent_commands** - Remote command execution
   - Tracks command lifecycle (pending → executing → completed)
   - `requested_by UUID REFERENCES users(id)` ← **CORRECTION:** Should reference `employees(id)`
   - `approved_by UUID REFERENCES users(id)` ← **CORRECTION:** Should reference `employees(id)`

6. **agent_software_inventory** - Installed software tracking
   - Detects EOL software, missing updates

7. **agent_monitored_services** - Service status monitoring
   - Tracks running services (nginx, postgresql, etc.)

### 🔧 Schema Corrections Needed

**Update all foreign key references:**
```sql
-- WRONG (current plan):
created_by UUID REFERENCES users(id)

-- CORRECT (for RTS staff actions):
created_by UUID REFERENCES employees(id)
```

**Affected columns:**
- `agent_devices.created_by` → employees (MSP staff registers agents)
- `agent_alerts.created_by` → employees (MSP staff creates alerts)
- `agent_alert_history.acknowledged_by` → employees (technicians acknowledge)
- `agent_commands.requested_by` → employees (MSP staff sends commands)
- `agent_commands.approved_by` → employees (MSP managers approve)

**Exception - Keep users reference:**
- Customer users should NOT create/manage agents directly
- All agent management is MSP-staff-initiated

---

## 🛣️ API Endpoints to Implement

See detailed API specs in `.plan/MSPAgentPlan.txt` (lines 578-790)

**Add to existing backend (~/romero-tech-solutions-repo/backend):**

### New Routes File: `routes/agents.js`

```javascript
// backend/routes/agents.js
const express = require('express');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');

// Agent registration (public, uses one-time token)
router.post('/register', agentController.register);

// Agent operations (requires agent JWT authentication)
router.post('/:agent_id/heartbeat', authenticateAgentToken, agentController.heartbeat);
router.post('/:agent_id/metrics', authenticateAgentToken, agentController.uploadMetrics);
router.get('/:agent_id/commands', authenticateAgentToken, agentController.getPendingCommands);
router.post('/:agent_id/commands/:command_id/result', authenticateAgentToken, agentController.submitCommandResult);

// Portal/Admin endpoints (requires employee authentication)
router.post('/registration-tokens', authenticateToken, requireRole('employee'), agentController.createRegistrationToken);
router.get('/', authenticateToken, agentController.listAgents);  // Filters by business_id for customer users
router.get('/:agent_id', authenticateToken, agentController.getAgentDetails);
router.get('/:agent_id/metrics/history', authenticateToken, agentController.getMetricHistory);
router.post('/:agent_id/commands', authenticateToken, requireRole('employee'), agentController.createCommand);

module.exports = router;
```

### Register Routes in `server.js`:
```javascript
// backend/server.js (or app.js)
const agentRoutes = require('./routes/agents');
app.use('/api/agents', agentRoutes);
```

### WebSocket Server Addition:
```javascript
// backend/services/agentWebSocketService.js
const { Server } = require('socket.io');

function initializeAgentWebSocket(httpServer) {
  const io = new Server(httpServer, {
    path: '/agent-ws',  // Different path from existing WebSocket
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || [],
      credentials: true
    }
  });

  io.use(authenticateAgentWebSocket);  // JWT verification middleware

  io.on('connection', (socket) => {
    console.log('Agent connected:', socket.agentId);

    // Handle agent events
    socket.on('event', handleAgentEvent);
    socket.on('command_result', handleCommandResult);

    socket.on('disconnect', () => {
      console.log('Agent disconnected:', socket.agentId);
    });
  });

  return io;
}

module.exports = { initializeAgentWebSocket };
```

**IMPORTANT:** Use different WebSocket path (`/agent-ws`) to avoid conflicts with existing WebSocket connections.

---

## 🎨 Frontend Integration

**Add new section to existing RTS frontend:**

### New Routes (in frontend router):
```javascript
// frontend/src/routes.jsx (or similar)
{
  path: '/dashboard/agents',
  element: <AgentDashboard />,
  meta: { requiresAuth: true }
},
{
  path: '/dashboard/agents/:agentId',
  element: <AgentDetails />,
  meta: { requiresAuth: true }
},
{
  path: '/admin/agents',
  element: <AdminAgentManagement />,
  meta: { requiresAuth: true, requiresRole: 'employee' }
}
```

### New Components to Create:
```
frontend/src/components/agents/
├── AgentDashboard.jsx       # List of agents (filtered by business_id for customers)
├── AgentDetails.jsx         # Single agent details + real-time metrics
├── AgentMetricsChart.jsx    # Time-series charts (CPU, RAM, disk)
├── AgentAlertConfig.jsx     # Configure alert rules
├── AgentCommandPanel.jsx    # Send remote commands
└── AgentRegistration.jsx    # Generate registration tokens (admin only)
```

### Navigation Menu Addition:
```javascript
// Add to existing navigation menu
{
  label: 'Monitoring',
  icon: 'activity',
  items: [
    { label: 'Devices', path: '/dashboard/agents', icon: 'monitor' },
    { label: 'Alerts', path: '/dashboard/agents/alerts', icon: 'bell' }
  ]
}
```

---

## 🔐 Authentication & Authorization

### Agent Authentication Flow:

1. **Registration Token Generation** (Employee-initiated):
   ```javascript
   POST /api/agents/registration-tokens
   Headers: { Authorization: Bearer <employee-jwt> }
   Body: { business_id, service_location_id, device_name }
   Response: { token: 'AGT-xxxx-xxxx-xxxx', expires_at: '...' }
   ```

2. **Agent Registration** (Agent uses one-time token):
   ```javascript
   POST /api/agents/register
   Body: { token: 'AGT-xxxx-xxxx-xxxx', hostname, os_type, ... }
   Response: { agent_id, agent_token: '<JWT>', business_id, ... }
   ```

3. **Agent Operations** (Use permanent JWT):
   ```javascript
   POST /api/agents/:id/heartbeat
   Headers: { Authorization: Bearer <agent-jwt> }
   ```

### RBAC Rules:

**Customer Users** (from `users` table):
- ✅ Can view agents for their business_id only
- ✅ Can view agent metrics and alerts
- ❌ Cannot create registration tokens
- ❌ Cannot send remote commands
- ❌ Cannot modify alert rules

**RTS Employees** (from `employees` table):
- ✅ Can view all agents across all businesses
- ✅ Can create registration tokens
- ✅ Can send remote commands
- ✅ Can configure alerts
- ✅ Can acknowledge/resolve alerts

**Implementation:**
```javascript
// backend/middleware/auth.js
async function listAgents(req, res) {
  const user = req.user;  // From JWT

  let query = 'SELECT * FROM agent_devices WHERE soft_delete = false';

  // If customer user, filter by their business_id
  if (user.business_id) {
    query += ' AND business_id = $1';
    const agents = await db.query(query, [user.business_id]);
    return res.json({ agents: agents.rows });
  }

  // If employee, show all agents
  if (user.employee_id) {
    const agents = await db.query(query);
    return res.json({ agents: agents.rows });
  }

  res.status(403).json({ error: 'Unauthorized' });
}
```

---

## 📦 Dependencies to Add

### Backend (package.json):
```bash
cd backend
npm install --save socket.io        # WebSocket for agent communication
npm install --save node-cron        # Scheduled tasks (alert evaluation)
npm install --save jsonwebtoken     # Already installed, but verify
```

### Frontend (package.json):
```bash
cd frontend
npm install --save socket.io-client  # WebSocket client for real-time updates
npm install --save recharts          # Metrics charting
npm install --save @tanstack/react-query  # May already be installed
```

---

## 🧪 Testing Strategy

### 1. Unit Tests (Backend)
```bash
cd backend
npm test -- routes/agents.test.js
npm test -- services/agentMetrics.test.js
```

### 2. Integration Tests
```bash
# Test agent registration flow
curl -X POST http://localhost:3002/api/agents/registration-tokens \
  -H "Authorization: Bearer <employee-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"business_id":"uuid","device_name":"Test Server"}'

# Test agent registration
curl -X POST http://localhost:3002/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{"token":"AGT-xxxx","hostname":"TEST-001","os_type":"linux"}'
```

### 3. Database Migration Test
```sql
-- Run on dev database
\c romerotechsolutions_dev
\i migrations/021_msp_agent_system.sql

-- Verify tables created
\dt agent*

-- Test foreign keys
INSERT INTO agent_devices (business_id, device_name, os_type, agent_version, agent_token)
SELECT id, 'Test Device', 'linux', '1.0.0', 'test-token-' || id
FROM businesses LIMIT 1;

-- Verify cascade delete works
SELECT * FROM agent_devices;
```

### 4. Production Smoke Tests (After Deployment)
```bash
# Health check
curl https://api.romerotechsolutions.com/api/health

# Verify new endpoints exist (should return 401/403, not 404)
curl https://api.romerotechsolutions.com/api/agents

# Check database connection
ssh botmanager "cd ~/romero-tech-solutions-repo/backend && node -e \"const db = require('./config/database'); db.query('SELECT COUNT(*) FROM agent_devices').then(r => console.log('Agent devices:', r.rows[0].count)).finally(() => process.exit())\""
```

---

## ⚠️ Critical Safety Reminders

### Before ANY code changes:
1. ✅ Verify you're in the worktree: `pwd` should show `rts-agent-dev`
2. ✅ Verify NODE_ENV=development
3. ✅ Verify backend is using port 3002 (not 3001)
4. ✅ Verify database is `romerotechsolutions_dev` (not `romerotechsolutions`)

### Before merging to main:
1. ✅ Run full test suite
2. ✅ Review git diff for accidental changes to production code
3. ✅ Ensure migrations are idempotent (can run multiple times safely)
4. ✅ Backup production database before running migrations
5. ✅ Test on staging/dev database first

### During development:
1. ❌ Never modify `.env` (production config)
2. ❌ Never run migrations on production database
3. ❌ Never push directly to main branch
4. ❌ Never modify existing API endpoints without backward compatibility
5. ❌ Never disable continuous deployment during development

---

## 📞 Coordination with Agent Development

**This RTS Agent (you) is responsible for:**
- Backend API development (Node.js)
- Frontend dashboard development (React)
- Database schema migrations
- Testing and deployment

**Separate Agent (in RomeroTechSolutionsAgents project) is responsible for:**
- Go agent binary development
- Cross-platform installers (MSI, DEB, RPM, PKG)
- Agent-side metric collection
- Agent-side command execution

**Coordination points:**
- API contract must match (see `.plan/MSPAgentPlan.txt` lines 578-843)
- WebSocket protocol must match (lines 794-843)
- Agent JWT format must be compatible

---

## 📝 Development Checklist

### Phase 1: Database Setup (Week 1)
- [ ] Create git worktree: `git worktree add ../rts-agent-dev feature/msp-agent-system`
- [ ] Create dev database: `romerotechsolutions_dev`
- [ ] Create migration file: `backend/migrations/021_msp_agent_system.sql`
- [ ] Update schema to use `employees` table instead of `users` for RTS staff actions
- [ ] Run migration on dev database
- [ ] Verify foreign keys work correctly

### Phase 2: Backend API (Week 2-3)
- [ ] Create `backend/routes/agents.js`
- [ ] Create `backend/controllers/agentController.js`
- [ ] Create `backend/services/agentMetricsService.js`
- [ ] Create `backend/services/agentWebSocketService.js`
- [ ] Implement agent authentication middleware
- [ ] Implement RBAC (customer vs. employee access)
- [ ] Write unit tests for agent endpoints
- [ ] Test locally on port 3002 with dev database

### Phase 3: Frontend (Week 4-5)
- [ ] Create agent dashboard components
- [ ] Implement real-time metric charts
- [ ] Add agent registration UI (employee only)
- [ ] Add alert configuration UI
- [ ] Add remote command UI
- [ ] Test with dev backend (localhost:3002)

### Phase 4: Testing (Week 6)
- [ ] End-to-end testing with mock agent
- [ ] Test alert → service_request integration
- [ ] Test RBAC (customer sees only their agents)
- [ ] Performance testing (simulate 100 agents sending metrics)
- [ ] Review all git changes for production safety

### Phase 5: Deployment (Week 7)
- [ ] Backup production database
- [ ] Merge feature branch to main
- [ ] Run migrations on production database
- [ ] Push to GitHub (triggers auto-deployment)
- [ ] Monitor deployment logs
- [ ] Smoke test production API
- [ ] Monitor for errors in first 24 hours

---

## 🆘 Emergency Rollback Plan

If something breaks in production:

```bash
# 1. Revert Git commit
cd ~/romero-tech-solutions-repo
git revert <commit-hash>
git push origin main

# 2. Continuous deployment will auto-deploy rollback

# 3. If database migration causes issues, manually rollback
ssh botmanager
# Run rollback migration or restore from backup

# 4. Monitor service recovery
ssh botmanager "sudo journalctl -u romero-backend -f"
curl https://api.romerotechsolutions.com/api/health
```

---

## 📚 Reference Documents

- Full architecture plan: `.plan/MSPAgentPlan.txt`
- Database schema: Lines 55-319
- API specifications: Lines 578-843
- WebSocket protocol: Lines 794-843

---

## ✅ Success Criteria

**Development Complete When:**
1. All 7 database tables created and tested
2. All agent API endpoints functional
3. WebSocket server operational
4. Frontend dashboard displays agent metrics
5. Customers can view their agents (filtered by business_id)
6. Employees can manage all agents
7. Alert → service_request integration working
8. Zero breaking changes to existing RTS functionality
9. All tests passing
10. Production deployment successful with no downtime

---

**Questions or Issues?**
- Coordinate with MSP agent development team (separate project)
- Review CLAUDE.md for production deployment protocols
- Test everything in worktree + dev database first
- Never compromise production stability

Good luck! 🚀
