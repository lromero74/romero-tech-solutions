# MSP Agent Platform Architecture Plan

## CURRENT RTS DATABASE SCHEMA ANALYSIS

### Existing Schema Overview
Based on live database inspection, your RTS platform has:

**Core Customer Hierarchy:**
- `businesses` - Your MSP clients (each client business)
  - id (uuid) - PRIMARY KEY
  - business_name
  - is_active, soft_delete
  - rate_category_id → hourly_rate_categories
  - is_individual (flag for individual vs. business clients)

- `service_locations` - Physical sites per business
  - id (uuid) - PRIMARY KEY
  - business_id (uuid) → businesses.id
  - location_name, address_label
  - street_address_1, street_address_2, city, state, zip_code
  - contact_person, contact_phone, contact_email
  - is_headquarters, is_active, soft_delete
  - location_type (links to location_types table)

- `users` - Portal users (your clients' staff)
  - id (uuid) - PRIMARY KEY
  - business_id (uuid) → businesses.id
  - email, username, role
  - is_primary_contact
  - authentication fields (password_hash, mfa_enabled, etc.)

**Service Management Tables:**
- `service_requests` - Ticket/work order system
- `service_request_assignments` - Technician assignments
- `service_types` - Types of services you offer
- `invoices` - Billing records

**Total Tables:** 96 tables in production database

---

## INTEGRATION STRATEGY: AGENT ↔ RTS SYSTEM

### Key Decision: **REUSE Existing RTS Database and Schema**

**Why this approach:**
1. ✅ **No data duplication** - Agents link directly to existing businesses and service_locations
2. ✅ **Unified customer view** - Single source of truth for client data
3. ✅ **Leverage existing auth** - Use current user/role system
4. ✅ **Integrated billing** - Agent monitoring can auto-generate service_requests and invoices
5. ✅ **Simpler architecture** - One database, one backend API (extend existing)

### Database Schema Extensions (Add to Existing RTS Database)

```sql
-- =============================================
-- MSP AGENT SYSTEM TABLES
-- Migration: 021_msp_agent_system.sql
-- =============================================

-- Agent Devices (links to existing businesses and service_locations)
CREATE TABLE agent_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Links to existing RTS schema
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    service_location_id UUID REFERENCES service_locations(id) ON DELETE SET NULL,

    -- Agent identity and registration
    agent_token VARCHAR(255) UNIQUE NOT NULL,  -- Unique agent identifier
    device_name VARCHAR(255) NOT NULL,          -- Computer/server name
    device_type VARCHAR(50) NOT NULL,           -- 'desktop', 'server', 'laptop', 'vm'

    -- System information
    os_type VARCHAR(50) NOT NULL,               -- 'windows', 'linux', 'macos'
    os_version VARCHAR(100),
    os_architecture VARCHAR(20),                -- 'x64', 'arm64', etc.
    hostname VARCHAR(255),

    -- Agent software version
    agent_version VARCHAR(50) NOT NULL,
    agent_last_updated TIMESTAMP WITH TIME ZONE,

    -- Connection status
    status VARCHAR(50) DEFAULT 'offline',       -- 'online', 'offline', 'error', 'disabled'
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    last_metrics_received TIMESTAMP WITH TIME ZONE,

    -- Device metadata
    cpu_model VARCHAR(255),
    total_memory_gb NUMERIC(10,2),
    total_disk_gb NUMERIC(10,2),
    ip_address INET,
    mac_address VARCHAR(17),

    -- Management flags
    monitoring_enabled BOOLEAN DEFAULT true,
    alerts_enabled BOOLEAN DEFAULT true,
    auto_remediation_enabled BOOLEAN DEFAULT false,

    -- Standard audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    soft_delete BOOLEAN DEFAULT false,

    CONSTRAINT unique_active_agent_token UNIQUE (agent_token)
);

CREATE INDEX idx_agent_devices_business ON agent_devices(business_id) WHERE soft_delete = false;
CREATE INDEX idx_agent_devices_location ON agent_devices(service_location_id) WHERE soft_delete = false;
CREATE INDEX idx_agent_devices_status ON agent_devices(status, last_heartbeat);

-- Agent Metrics (time-series data)
CREATE TABLE agent_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,

    -- Timestamp
    collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- System metrics
    cpu_percent NUMERIC(5,2),
    memory_used_gb NUMERIC(10,2),
    memory_percent NUMERIC(5,2),
    disk_used_gb NUMERIC(10,2),
    disk_percent NUMERIC(5,2),

    -- Load and uptime
    load_average_1m NUMERIC(10,2),
    load_average_5m NUMERIC(10,2),
    load_average_15m NUMERIC(10,2),
    uptime_seconds BIGINT,

    -- Network
    network_rx_bytes BIGINT,
    network_tx_bytes BIGINT,

    -- Storage as JSONB for flexibility
    raw_metrics JSONB,  -- Full metric payload

    CONSTRAINT valid_percentages CHECK (
        cpu_percent >= 0 AND cpu_percent <= 100 AND
        memory_percent >= 0 AND memory_percent <= 100 AND
        disk_percent >= 0 AND disk_percent <= 100
    )
);

-- Optimize for time-series queries
CREATE INDEX idx_agent_metrics_device_time ON agent_metrics(agent_device_id, collected_at DESC);
CREATE INDEX idx_agent_metrics_collected_at ON agent_metrics(collected_at DESC);

-- Optional: Convert to TimescaleDB hypertable for better time-series performance
-- SELECT create_hypertable('agent_metrics', 'collected_at', chunk_time_interval => INTERVAL '1 day');

-- Agent Alerts (monitoring rules and history)
CREATE TABLE agent_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Alert definition
    alert_name VARCHAR(255) NOT NULL,
    alert_type VARCHAR(100) NOT NULL,  -- 'cpu_high', 'disk_full', 'service_down', etc.
    severity VARCHAR(50) NOT NULL,     -- 'info', 'warning', 'critical'

    -- Scope (business-wide or specific device)
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    agent_device_id UUID REFERENCES agent_devices(id) ON DELETE CASCADE,  -- NULL = applies to all devices

    -- Alert conditions (JSONB for flexibility)
    conditions JSONB NOT NULL,  -- e.g., {"metric": "cpu_percent", "operator": ">", "threshold": 90, "duration_minutes": 10}

    -- Notification settings
    notification_enabled BOOLEAN DEFAULT true,
    notification_channels JSONB,  -- ["email", "sms", "webhook"]
    notification_recipients JSONB,  -- User IDs or email addresses

    -- Alert status
    is_active BOOLEAN DEFAULT true,
    last_triggered TIMESTAMP WITH TIME ZONE,
    trigger_count INTEGER DEFAULT 0,

    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    soft_delete BOOLEAN DEFAULT false
);

CREATE INDEX idx_agent_alerts_business ON agent_alerts(business_id) WHERE is_active = true;
CREATE INDEX idx_agent_alerts_device ON agent_alerts(agent_device_id) WHERE is_active = true;

-- Agent Alert History (fired alerts)
CREATE TABLE agent_alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    agent_alert_id UUID NOT NULL REFERENCES agent_alerts(id) ON DELETE CASCADE,
    agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,

    -- Alert details
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    severity VARCHAR(50) NOT NULL,

    -- Alert data
    alert_message TEXT NOT NULL,
    metric_value NUMERIC(10,2),
    threshold_value NUMERIC(10,2),

    -- Actions taken
    notification_sent BOOLEAN DEFAULT false,
    notification_sent_at TIMESTAMP WITH TIME ZONE,
    service_request_created UUID REFERENCES service_requests(id),  -- Auto-create ticket

    -- Resolution
    status VARCHAR(50) DEFAULT 'active',  -- 'active', 'acknowledged', 'resolved', 'auto_resolved'
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT
);

CREATE INDEX idx_alert_history_device_time ON agent_alert_history(agent_device_id, triggered_at DESC);
CREATE INDEX idx_alert_history_status ON agent_alert_history(status) WHERE status = 'active';

-- Agent Commands (remote command execution)
CREATE TABLE agent_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,

    -- Command details
    command_type VARCHAR(100) NOT NULL,  -- 'restart_service', 'run_script', 'update_agent', etc.
    command_params JSONB,  -- {"service_name": "nginx", "action": "restart"}

    -- Execution tracking
    status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'sent', 'executing', 'completed', 'failed', 'timeout'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    timeout_seconds INTEGER DEFAULT 300,

    -- Results
    exit_code INTEGER,
    stdout TEXT,
    stderr TEXT,
    error_message TEXT,

    -- Security and audit
    requested_by UUID NOT NULL REFERENCES users(id),
    approval_required BOOLEAN DEFAULT false,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_agent_commands_device_status ON agent_commands(agent_device_id, status, created_at DESC);
CREATE INDEX idx_agent_commands_pending ON agent_commands(status) WHERE status IN ('pending', 'sent');

-- Agent Software Inventory
CREATE TABLE agent_software_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,

    -- Software details
    software_name VARCHAR(255) NOT NULL,
    software_version VARCHAR(100),
    vendor VARCHAR(255),
    install_date DATE,

    -- Categorization
    software_type VARCHAR(100),  -- 'application', 'system', 'driver', 'update'
    is_security_software BOOLEAN DEFAULT false,

    -- Status
    is_active BOOLEAN DEFAULT true,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Version tracking
    is_latest_version BOOLEAN,
    latest_available_version VARCHAR(100),
    is_eol BOOLEAN DEFAULT false,  -- End of life
    eol_date DATE
);

CREATE INDEX idx_software_inventory_device ON agent_software_inventory(agent_device_id, is_active);
CREATE INDEX idx_software_inventory_eol ON agent_software_inventory(is_eol) WHERE is_eol = true;

-- Agent Services Monitor
CREATE TABLE agent_monitored_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,

    -- Service details
    service_name VARCHAR(255) NOT NULL,
    service_display_name VARCHAR(255),
    service_type VARCHAR(100),  -- 'systemd', 'windows_service', 'launchd', etc.

    -- Status
    status VARCHAR(50),  -- 'running', 'stopped', 'starting', 'error'
    pid INTEGER,

    -- Monitoring config
    should_be_running BOOLEAN DEFAULT true,
    auto_restart BOOLEAN DEFAULT false,

    -- Tracking
    last_checked TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_state_change TIMESTAMP WITH TIME ZONE,
    restart_count INTEGER DEFAULT 0,

    UNIQUE(agent_device_id, service_name)
);

CREATE INDEX idx_monitored_services_device ON agent_monitored_services(agent_device_id);

```

### API Integration Architecture

**Extend Existing RTS Backend API** (No new EC2 instance needed initially!)

```
Current: api.romerotechsolutions.com/api
         ├── /auth/*          (existing)
         ├── /businesses/*    (existing)
         ├── /service-requests/* (existing)
         └── ... (existing endpoints)

Add New Agent Endpoints:
         ├── /agents/register              POST   - Agent registration
         ├── /agents/:id/heartbeat         POST   - Health check-in
         ├── /agents/:id/metrics           POST   - Metric upload
         ├── /agents/:id/commands          GET    - Fetch pending commands
         ├── /agents/:id/commands/:cmd_id  POST   - Command result
         ├── /agents                       GET    - List agents (admin/customer view)
         ├── /agents/:id                   GET    - Agent details
         ├── /agents/:id/alerts            GET    - Get device alerts
         └── /agents/:id/history           GET    - Metric history
```

### Frontend Integration Options

**Option 1: Extend Existing RTS Portal** (Recommended for MVP)
Add new "Agent Monitoring" section to current RTS frontend:
- https://romerotechsolutions.com/dashboard/agents
- https://romerotechsolutions.com/dashboard/agents/:id
- Leverages existing auth, business context, and UI components

**Option 2: Separate Agent Portal** (Future scaling)
- https://agents.romerotechsolutions.com (new Amplify app)
- Separate codebase but shares auth with main RTS system
- Better for white-labeling or reselling platform

---

## REVISED ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│          EXISTING RTS INFRASTRUCTURE (REUSE)                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  FRONTEND (AWS Amplify)                                     │
│  ├── romerotechsolutions.com (existing portal)             │
│  └── NEW: /dashboard/agents/* (add agent views)            │
│                                                             │
│  BACKEND (EC2: BotManager)                                  │
│  ├── api.romerotechsolutions.com/api (existing API)        │
│  ├── NEW: /api/agents/* (add agent endpoints)              │
│  └── NEW: WebSocket server for real-time agent comms       │
│                                                             │
│  DATABASE (Aurora PostgreSQL Serverless)                    │
│  └── romerotechsolutions (existing database)               │
│      ├── businesses (REUSE - your MSP clients)             │
│      ├── service_locations (REUSE - client sites)          │
│      ├── users (REUSE - authentication)                    │
│      ├── service_requests (REUSE - auto-create tickets)    │
│      ├── invoices (REUSE - billing integration)            │
│      └── NEW: agent_* tables (add 7 new tables above)      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                           ▲
                           │ HTTPS + WebSocket
                           │
┌──────────────────────────┴──────────────────────────────────┐
│                   MSP AGENT SOFTWARE                        │
│              (Go binary on customer systems)                │
├─────────────────────────────────────────────────────────────┤
│  • Monitors CPU, RAM, Disk, Services                        │
│  • Sends metrics every 5 minutes                            │
│  • Receives remote commands via WebSocket                   │
│  • Links to business_id + service_location_id               │
└─────────────────────────────────────────────────────────────┘
```

---

## AGENT-TO-CUSTOMER LINKAGE STRATEGY

### Registration Flow

1. **Admin creates registration token in RTS portal:**
   ```javascript
   // In RTS frontend: /dashboard/agents/new
   POST /api/agents/registration-tokens
   {
     "business_id": "uuid-of-client-business",
     "service_location_id": "uuid-of-site",  // optional
     "device_name": "Office Server 1",
     "expires_in_hours": 24
   }

   Response:
   {
     "token": "AGT-xxxx-xxxx-xxxx",
     "install_command": "curl -L https://install.romerotechsolutions.com/agent.sh | sudo bash -s AGT-xxxx-xxxx-xxxx"
   }
   ```

2. **Customer installs agent using token:**
   ```bash
   # Windows
   msiexec /i RomeroTechAgent.msi TOKEN=AGT-xxxx-xxxx-xxxx /quiet

   # Linux/macOS
   curl -L https://install.romerotechsolutions.com/agent.sh | sudo bash -s AGT-xxxx-xxxx-xxxx
   ```

3. **Agent registers on first boot:**
   ```javascript
   POST /api/agents/register
   {
     "token": "AGT-xxxx-xxxx-xxxx",
     "hostname": "OFFICE-SERVER-01",
     "os_type": "windows",
     "os_version": "Windows Server 2022",
     "os_architecture": "x64",
     "ip_address": "192.168.1.100",
     "mac_address": "00:1A:2B:3C:4D:5E",
     "cpu_model": "Intel Xeon E5-2680",
     "total_memory_gb": 32,
     "total_disk_gb": 512
   }

   Response:
   {
     "agent_id": "uuid-of-agent-device",
     "agent_token": "permanent-auth-token-jwt",
     "business_id": "uuid-of-business",
     "service_location_id": "uuid-of-location",
     "api_url": "https://api.romerotechsolutions.com/api",
     "websocket_url": "wss://api.romerotechsolutions.com/ws",
     "heartbeat_interval_seconds": 300,
     "metrics_interval_seconds": 300
   }
   ```

4. **Agent is now linked to:**
   - ✅ Specific business (customer)
   - ✅ Specific service_location (site)
   - ✅ Visible in RTS portal under that customer

### Customer Portal Views

**Business Owner View:**
```
romerotechsolutions.com/dashboard/agents
├── Shows only THEIR agents (filtered by business_id)
├── Grouped by service_location
└── Real-time status for each device
```

**MSP Admin View (You):**
```
romerotechsolutions.com/admin/agents
├── Shows ALL agents across ALL businesses
├── Filterable by business, location, status
└── Bulk management capabilities
```

### Auto-Integration with Service Requests

**Alert → Ticket Workflow:**
```javascript
// When alert fires, auto-create service request
INSERT INTO service_requests (
  business_id,              -- From agent_devices.business_id
  service_location_id,      -- From agent_devices.service_location_id
  title,
  description,
  priority_level_id,        -- Based on alert severity
  urgency_level_id,
  status_id,
  source                    -- 'automated_agent_alert'
) VALUES (...);

// Link alert to ticket
UPDATE agent_alert_history
SET service_request_created = (new service_request id)
WHERE id = (alert history id);
```

**Benefits:**
1. ✅ Agent alerts create tickets automatically
2. ✅ Tickets appear in existing service request dashboard
3. ✅ Your technicians can see agent alerts in their normal workflow
4. ✅ Time tracking works the same (links to service_request_time_entries)
5. ✅ Billing works the same (creates invoices from time entries)

---

## IMPLEMENTATION PHASES (REVISED)

### Phase 1: Database Schema (Week 1)
- [ ] Create migration `021_msp_agent_system.sql`
- [ ] Add 7 new tables to existing RTS database
- [ ] Test foreign key relationships to businesses and service_locations
- [ ] Create indexes for performance

### Phase 2: Backend API Extensions (Week 2-3)
- [ ] Add agent routes to existing Node.js backend
- [ ] Implement agent registration endpoint
- [ ] Implement heartbeat and metrics endpoints
- [ ] Add WebSocket server for real-time agent communication
- [ ] Add agent management endpoints for portal

### Phase 3: Go Agent Development (Week 4-5)
- [ ] Build cross-platform Go agent
- [ ] Implement system metric collectors (CPU, RAM, disk, services)
- [ ] Build secure API client with offline buffering
- [ ] Create installers (MSI, DEB, RPG, PKG)
- [ ] Build agent update mechanism

### Phase 4: Frontend Integration (Week 6-7)
- [ ] Add "Agents" section to existing RTS portal
- [ ] Build agent list view (filtered by business_id for customers)
- [ ] Build agent detail page with real-time metrics
- [ ] Build alert configuration UI
- [ ] Build command execution UI (restart services, run scripts)

### Phase 5: Testing & Launch (Week 8)
- [ ] Deploy agents on your own test systems
- [ ] Monitor metrics collection and WebSocket stability
- [ ] Test alert → service request workflow
- [ ] Beta test with 1-2 friendly customers
- [ ] Document installation process

---

## COST ANALYSIS (REVISED - MUCH CHEAPER!)

### Infrastructure Costs (Using Existing RTS Resources)

**No New Costs:**
- ❌ No new EC2 instance needed (reuse BotManager)
- ❌ No new database needed (reuse Aurora cluster)
- ❌ No new Amplify app needed initially (extend existing)
- ❌ No new domain/SSL needed (reuse api.romerotechsolutions.com)

**Potential New Costs:**
- **S3 Storage** (agent logs): ~$1-5/month
- **Data Transfer** (agent metrics): ~$5-10/month (100 agents x 5KB/5min)
- **Aurora ACU increase**: ~$10-20/month (as metric data grows)

**Total Additional Costs: ~$15-35/month** (vs. original estimate of $25-30/month for separate infrastructure)

### Revenue Model (Unchanged)
- Charge $5-15/device/month
- 10 devices = $50-150/month (profitable immediately)
- 50 devices = $250-750/month
- 100 devices = $500-1500/month

---

## API ENDPOINT DETAILS

### Agent Registration & Authentication

**POST** `/api/agents/registration-tokens`
```javascript
// Admin/MSP creates token for new agent installation
Request (requires admin auth):
{
  "business_id": "uuid",
  "service_location_id": "uuid",  // optional
  "device_name": "Office Server 1",
  "expires_in_hours": 24
}

Response:
{
  "token": "AGT-a1b2c3d4-e5f6-7890",
  "expires_at": "2025-10-10T10:00:00Z",
  "install_command_windows": "msiexec /i ...",
  "install_command_linux": "curl -L ..."
}
```

**POST** `/api/agents/register`
```javascript
// Agent uses one-time token to register
Request:
{
  "token": "AGT-a1b2c3d4-e5f6-7890",
  "hostname": "OFFICE-SERVER-01",
  "os_type": "windows",
  "os_version": "Windows Server 2022",
  "system_info": { /* ... */ }
}

Response:
{
  "agent_id": "uuid",
  "agent_token": "JWT-permanent-auth-token",
  "business_id": "uuid",
  "service_location_id": "uuid",
  "config": {
    "heartbeat_interval_seconds": 300,
    "metrics_interval_seconds": 300,
    "websocket_url": "wss://api.romerotechsolutions.com/ws"
  }
}
```

### Agent Operations

**POST** `/api/agents/:agent_id/heartbeat`
```javascript
// Every 5 minutes, agent sends heartbeat
Request (requires agent JWT):
{
  "timestamp": "2025-10-09T10:30:00Z",
  "status": "online",
  "agent_version": "1.0.0"
}

Response:
{
  "config_updated": false,  // If true, agent should fetch new config
  "pending_commands": 2      // Number of pending commands
}
```

**POST** `/api/agents/:agent_id/metrics`
```javascript
// Agent uploads metrics (can batch multiple intervals)
Request (requires agent JWT):
{
  "metrics": [
    {
      "collected_at": "2025-10-09T10:30:00Z",
      "cpu_percent": 45.2,
      "memory_used_gb": 8.5,
      "memory_percent": 53.1,
      "disk_used_gb": 450.0,
      "disk_percent": 87.9,
      "load_average": [1.5, 1.3, 1.2],
      "uptime_seconds": 345600,
      "services": [
        {"name": "nginx", "status": "running", "pid": 1234},
        {"name": "postgresql", "status": "running", "pid": 5678}
      ]
    }
  ]
}

Response:
{
  "received": 1,
  "alerts_triggered": ["disk_space_critical"]
}
```

**GET** `/api/agents/:agent_id/commands`
```javascript
// Agent polls for pending commands
Response:
{
  "commands": [
    {
      "command_id": "uuid",
      "command_type": "restart_service",
      "params": {"service_name": "nginx"},
      "timeout_seconds": 300
    }
  ]
}
```

**POST** `/api/agents/:agent_id/commands/:command_id/result`
```javascript
// Agent reports command execution result
Request:
{
  "status": "completed",
  "exit_code": 0,
  "stdout": "Service nginx restarted successfully",
  "stderr": "",
  "started_at": "2025-10-09T10:31:00Z",
  "completed_at": "2025-10-09T10:31:05Z"
}
```

### Portal/Admin Endpoints

**GET** `/api/agents`
```javascript
// List all agents (filtered by business_id for customers)
Query params:
  ?business_id=uuid       (required for customer users)
  ?status=online,offline
  ?service_location_id=uuid

Response:
{
  "agents": [
    {
      "id": "uuid",
      "device_name": "Office Server 1",
      "business": {
        "id": "uuid",
        "business_name": "Acme Corp"
      },
      "service_location": {
        "id": "uuid",
        "location_name": "Main Office"
      },
      "status": "online",
      "last_heartbeat": "2025-10-09T10:30:00Z",
      "os_type": "windows",
      "cpu_percent": 45.2,
      "memory_percent": 53.1,
      "disk_percent": 87.9
    }
  ]
}
```

**GET** `/api/agents/:agent_id`
```javascript
// Get detailed agent info
Response:
{
  "id": "uuid",
  "business_id": "uuid",
  "service_location_id": "uuid",
  "device_name": "Office Server 1",
  "os_type": "windows",
  "os_version": "Windows Server 2022",
  "agent_version": "1.0.0",
  "status": "online",
  "last_heartbeat": "2025-10-09T10:30:00Z",
  "current_metrics": {
    "cpu_percent": 45.2,
    "memory_used_gb": 8.5,
    "disk_used_gb": 450.0,
    /* ... */
  },
  "active_alerts": 2,
  "monitored_services": [
    {"name": "nginx", "status": "running"},
    {"name": "postgresql", "status": "running"}
  ]
}
```

**GET** `/api/agents/:agent_id/metrics/history`
```javascript
// Get historical metrics for charting
Query params:
  ?start=2025-10-08T00:00:00Z
  &end=2025-10-09T23:59:59Z
  &metric=cpu_percent,memory_percent,disk_percent
  &interval=5m  // aggregation interval

Response:
{
  "metrics": [
    {
      "timestamp": "2025-10-09T10:30:00Z",
      "cpu_percent": 45.2,
      "memory_percent": 53.1,
      "disk_percent": 87.9
    }
  ]
}
```

---

## WEBSOCKET PROTOCOL

### Connection
```javascript
// Agent establishes WebSocket connection
ws://api.romerotechsolutions.com/ws?token=<agent-jwt-token>

// Server validates JWT and associates connection with agent_device_id
```

### Message Types

**Server → Agent: Command**
```json
{
  "type": "command",
  "command_id": "uuid",
  "command_type": "restart_service",
  "params": {
    "service_name": "nginx"
  },
  "timeout_seconds": 300
}
```

**Agent → Server: Event**
```json
{
  "type": "event",
  "event_type": "service_crashed",
  "timestamp": "2025-10-09T10:35:00Z",
  "data": {
    "service_name": "nginx",
    "pid": 1234,
    "exit_code": 139
  }
}
```

**Agent → Server: Command Result**
```json
{
  "type": "command_result",
  "command_id": "uuid",
  "status": "completed",
  "exit_code": 0,
  "stdout": "Service nginx restarted",
  "completed_at": "2025-10-09T10:36:00Z"
}
```

---

## GO AGENT STRUCTURE

```go
// main.go
package main

import (
    "rts-agent/config"
    "rts-agent/collectors"
    "rts-agent/api"
    "rts-agent/websocket"
)

func main() {
    // Load config from local storage
    cfg := config.Load()

    // Initialize API client
    apiClient := api.NewClient(cfg)

    // Initialize WebSocket connection
    wsClient := websocket.NewClient(cfg)

    // Start metric collectors
    go collectors.StartCPUMonitor(apiClient)
    go collectors.StartMemoryMonitor(apiClient)
    go collectors.StartDiskMonitor(apiClient)
    go collectors.StartServiceMonitor(apiClient)

    // Start heartbeat
    go api.StartHeartbeat(apiClient)

    // Start WebSocket listener for commands
    wsClient.Listen()
}
```

---

## NEXT STEPS

1. **Review and approve this plan**
2. **Create database migration** (021_msp_agent_system.sql)
3. **Extend backend API** (add agent routes to existing Node.js server)
4. **Build Go agent** (cross-platform binary)
5. **Extend RTS frontend** (add agent dashboard views)
6. **Test with your own devices**
7. **Deploy to first customer**

This revised architecture is **simpler, cheaper, and more tightly integrated** with your existing RTS system!
