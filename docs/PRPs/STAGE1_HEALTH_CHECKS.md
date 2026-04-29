# PRP: Stage 1 — Tiny Health-Check Collectors

**Created:** 2026-04-28
**Status:** Execution-ready
**Parent:** `docs/PRPs/RMM_GAP_CLOSURE_MASTER.md`
**Estimated effort:** ~6 weeks total (8 collectors @ 1–2 wk each, can parallelize 2 at a time)
**Quality score:** 9/10

---

## Context & Goal

Add 8 small, high-value health-check collectors to the rts-agent and surface them in the admin UI as a new "Health Checks" tab. Each collector is independently shippable and tiny in scope — purposely chosen as the easiest stage to validate the cross-cutting architecture (generic `agent_check_results` table, permission convention, alert wiring, transparency endpoint) before scaling up to harder stages.

### Who benefits
- **Employees** — see device health at a glance ("3 machines pending reboot, 1 with new listening port")
- **Clients (`/clogin`)** — see same data for their own devices via transparency endpoint
- **Sales** — has demoable feature parity story for "do you have pending-reboot reporting?"

### Mobile responsive
The admin "Health Checks" tab is desktop-primary, but the client-side transparency view at `/clogin` MUST work at 375px. Test on iPhone SE viewport.

---

## The 8 Collectors

| ID | check_type | Default severity | Alert threshold |
|---|---|---|---|
| 1.1 | `reboot_pending` | `warning` | true → warning; >7 days pending → critical |
| 1.2 | `time_drift` | `info` | drift >60s → warning; >300s → critical |
| 1.3 | `crashdumps` | `info` | new dump in last 24h → warning |
| 1.4 | `top_processes` | `info` | always info; UI surfaces real-time |
| 1.5 | `listening_ports` | `info` | new listening port appeared → warning |
| 1.6 | `update_history_failures` | `warning` | any failure in last 7 days → warning |
| 1.7 | `domain_status` | `info` | unexpected domain leave → critical |
| 1.8 | `mapped_drives` | `info` | drive mapped but unreachable → warning |

---

## Implementation Blueprint

### Step 0 — Migration (single, runs first)

**File:** `backend/migrations/20260428_agent_check_results.sql`

```sql
-- =============================================================================
-- Stage 1: agent_check_results table — generic latest-state storage for
-- agent-reported health checks. One row per (agent_device_id, check_type),
-- upserted on each report. See docs/PRPs/RMM_GAP_CLOSURE_MASTER.md §1.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS agent_check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  check_type VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','warning','critical')),
  passed BOOLEAN NOT NULL DEFAULT true,
  payload JSONB NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_check_results_unique UNIQUE (agent_device_id, check_type)
);

CREATE INDEX IF NOT EXISTS agent_check_results_business_idx
  ON agent_check_results(business_id, check_type);

CREATE INDEX IF NOT EXISTS agent_check_results_severity_idx
  ON agent_check_results(severity)
  WHERE severity != 'info';

CREATE INDEX IF NOT EXISTS agent_check_results_reported_idx
  ON agent_check_results(reported_at DESC);

-- Optional: recent-history table for trend lines on the Health Checks tab.
-- Keeps last 30 days of changes (insert when payload differs from previous).
CREATE TABLE IF NOT EXISTS agent_check_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  check_type VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  passed BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_check_history_idx
  ON agent_check_history(agent_device_id, check_type, collected_at DESC);

-- =============================================================================
-- Stage 1 RBAC permission keys
-- =============================================================================

INSERT INTO permissions (key, description, created_at) VALUES
  ('view.agent_health_checks.enable',
    'View health-check results for agent devices', now()),
  ('view.agent_top_processes.enable',
    'View top-N processes per agent', now()),
  ('manage.processes.enable',
    'Kill processes on agent devices', now()),
  ('view.agent_listening_ports.enable',
    'View listening ports snapshot per agent', now()),
  ('view.agent_update_history.enable',
    'View OS-update install/failure history per agent', now()),
  ('view.agent_domain_status.enable',
    'View domain-join / hostname audit per agent', now()),
  ('view.agent_mapped_drives.enable',
    'View Windows mapped-drive audit per agent', now()),
  ('view.agent_time_drift.enable',
    'View NTP time-drift status per agent', now()),
  ('view.agent_transparency_report.enable',
    'Client-side: view transparency report for own-business devices', now())
ON CONFLICT (key) DO NOTHING;

-- Grant all Stage 1 view permissions to executive role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
  WHERE r.name = 'executive'
    AND p.key IN (
      'view.agent_health_checks.enable',
      'view.agent_top_processes.enable',
      'manage.processes.enable',
      'view.agent_listening_ports.enable',
      'view.agent_update_history.enable',
      'view.agent_domain_status.enable',
      'view.agent_mapped_drives.enable',
      'view.agent_time_drift.enable'
    )
ON CONFLICT DO NOTHING;

-- Grant view-only Stage 1 permissions to technician role (NOT manage.processes)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
  WHERE r.name = 'technician'
    AND p.key IN (
      'view.agent_health_checks.enable',
      'view.agent_top_processes.enable',
      'view.agent_listening_ports.enable',
      'view.agent_update_history.enable',
      'view.agent_domain_status.enable',
      'view.agent_mapped_drives.enable',
      'view.agent_time_drift.enable'
    )
ON CONFLICT DO NOTHING;

-- Client transparency permission goes to all client roles (handled in app code, not via roles)

COMMIT;

-- =============================================================================
-- Rollback
-- =============================================================================
-- BEGIN;
-- DELETE FROM role_permissions WHERE permission_id IN (
--   SELECT id FROM permissions WHERE key LIKE 'view.agent_%' OR key = 'manage.processes.enable'
-- );
-- DELETE FROM permissions WHERE key IN (
--   'view.agent_health_checks.enable','view.agent_top_processes.enable',
--   'manage.processes.enable','view.agent_listening_ports.enable',
--   'view.agent_update_history.enable','view.agent_domain_status.enable',
--   'view.agent_mapped_drives.enable','view.agent_time_drift.enable',
--   'view.agent_transparency_report.enable'
-- );
-- DROP TABLE IF EXISTS agent_check_history;
-- DROP TABLE IF EXISTS agent_check_results;
-- COMMIT;
```

---

### Step 1 — Agent collector module structure

Each of the 8 collectors lives in its own package under `internal/`:

```
internal/
├── rebootpending/
│   ├── rebootpending.go
│   └── rebootpending_test.go
├── timedrift/
│   ├── timedrift.go
│   └── timedrift_test.go
├── crashdumps/
│   ├── crashdumps.go
│   └── crashdumps_test.go
├── topprocesses/
│   ├── topprocesses.go
│   └── topprocesses_test.go
├── listeningports/
│   ├── listeningports.go
│   └── listeningports_test.go
├── updatehistory/
│   ├── updatehistory.go
│   └── updatehistory_test.go
├── domainstatus/
│   ├── domainstatus.go
│   └── domainstatus_test.go
└── mappeddrives/        # Windows-only collector (compiles on all platforms, returns "not applicable" elsewhere)
    ├── mappeddrives.go
    └── mappeddrives_test.go
```

**Common collector pattern** (follow the `internal/patches/patches.go` precedent):

```go
package <name>

import (
  "fmt"
  "runtime"
  "time"
)

type Result struct {
  CheckType  string                 `json:"check_type"`
  Severity   string                 `json:"severity"`   // "info","warning","critical"
  Passed     bool                   `json:"passed"`
  Payload    map[string]interface{} `json:"payload"`
  CollectedAt time.Time             `json:"collected_at"`
}

func Check() (*Result, error) {
  switch runtime.GOOS {
  case "darwin":  return checkMac()
  case "linux":   return checkLinux()
  case "windows": return checkWindows()
  default:        return nil, fmt.Errorf("unsupported OS: %s", runtime.GOOS)
  }
}
```

#### 1.1 `internal/rebootpending/`

**Win** (`checkWindows`):
- Probe registry keys (use `golang.org/x/sys/windows/registry`):
  - `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending` (key existence)
  - `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired`
  - `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager` → `PendingFileRenameOperations` (presence)
  - `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\PackagesPending`
- `pending = ANY of the above`
- Compute `pending_since` as the oldest registry-key timestamp via `RegQueryInfoKeyW` last-write-time

**Linux** (`checkLinux`):
- Stat `/var/run/reboot-required` (Debian/Ubuntu)
- Run `dnf needs-restarting -r` if dnf exists; exit code 1 = reboot needed (RHEL/Fedora)
- Pacman: check for `/etc/arch-release` and stat `/run/reboot-required` (less standard, may be absent)

**macOS** (`checkMac`):
- `softwareupdate --list` + parse for `restart` keyword in pending update entries (already partially in `internal/patches/patches.go` — extract the reboot signal)

**Payload shape:**
```json
{
  "pending": true,
  "reasons": ["windows_update", "pending_file_rename"],
  "pending_since": "2026-04-21T14:33:00Z"
}
```

**Severity rule:** `pending=true` AND `now - pending_since < 7d` → `warning`; `pending=true` AND `>= 7d` → `critical`; else `info`.

#### 1.2 `internal/timedrift/`

- Win: `w32tm /stripchart /computer:time.windows.com /samples:1 /dataonly` — parse offset
- Linux: `chronyc tracking | awk '/Last offset/ {print $4}'` if chronyc exists; else `timedatectl show -p NTPSynchronized` + `timedatectl show-timesync --all` for offset
- macOS: `sntp -sS time.apple.com` — parse offset

**Payload:** `{ "drift_seconds": 0.034, "ntp_server": "time.apple.com" }`

**Severity:** `|drift| > 300s` → critical; `> 60s` → warning; else info.

#### 1.3 `internal/crashdumps/`

- Win: enumerate `C:\Windows\Minidump\*.dmp` + LiveKernelReports — count + most-recent mtime
- macOS: enumerate `/Library/Logs/DiagnosticReports/*.panic` — needs Full Disk Access; if denied, payload includes `"access_denied": true` and severity stays `info` so we don't false-alarm
- Linux: `journalctl -k --since '30 days ago' --grep='Kernel panic'` + `last -x reboot | head -20` to count unexpected boots

**Payload:** `{ "count_30d": 2, "most_recent": "2026-04-25T03:14:00Z", "access_denied": false }`

**Severity:** any new dump in last 24h → warning; else info.

#### 1.4 `internal/topprocesses/`

- Win: `Get-Process | Sort -Property CPU -Descending | Select-Object -First 10 Name,Id,CPU,WS`
- Linux: `ps -eo pid,pcpu,pmem,comm --sort=-pcpu | head -11`
- macOS: same `ps` command

Collector emits Top-10 by CPU AND by RSS (so 20 entries total, deduplicated). Refresh interval matches the existing metrics tick (currently 60s — see `internal/metrics/metrics.go`).

**Remote `process.kill` action:** add to `internal/commands/` dispatch. Server sends `{"command":"process.kill","args":{"pid":1234}}`. Agent verifies the calling employee has `manage.processes.enable` (the backend already enforces — agent just executes). Use platform-native:
- Win: `taskkill /F /PID <pid>`
- Linux/mac: `kill -9 <pid>`

Audit-log every kill in `agent_action_audit` with PID, process name, employee, timestamp.

#### 1.5 `internal/listeningports/`

- Linux: `ss -tnlp` (modern) or `netstat -tnlp` fallback
- macOS: `lsof -iTCP -sTCP:LISTEN -P -n`
- Win: `Get-NetTCPConnection -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess` + map PID to process name via `Get-Process`

**Payload:**
```json
{
  "ports": [
    {"port": 22, "proto": "tcp", "process": "sshd", "pid": 1234, "address": "0.0.0.0"},
    ...
  ]
}
```

**Severity:** if `ports` differs from previous snapshot → warning (with `new_ports` field listing the additions); else info. Diff happens server-side on upsert by comparing payload to existing row.

#### 1.6 `internal/updatehistory/`

- Win: `Get-WinEvent -LogName Setup -MaxEvents 200` and parse for `KB` IDs + result; also `wmic qfe list brief /format:csv`
- Linux: parse last 7 days of `/var/log/dpkg.log` (lines with `error` or `failed`); `/var/log/dnf.log`
- macOS: parse `/var/log/install.log` for `softwareupdate` errors

**Payload:**
```json
{
  "successful_30d": 12,
  "failed_30d": 1,
  "failures": [{"package": "KB5034122", "when": "2026-04-12T18:30:00Z", "error": "0x800f0922"}]
}
```

**Severity:** any failure in last 7 days → warning; else info.

#### 1.7 `internal/domainstatus/`

- Win: PowerShell `(Get-CimInstance Win32_ComputerSystem).PartOfDomain` and `.Domain`
- macOS: `dsconfigad -show` (returns AD-joined info; non-zero exit = not bound)
- Linux: `realm list` (sssd-realmd) — empty output = not joined

**Payload:**
```json
{
  "is_joined": true,
  "domain": "client.local",
  "hostname": "ws01.client.local",
  "expected_hostname_pattern": null
}
```

**Severity:** `is_joined=false` for a device that previously was joined → critical (compare to previous snapshot); else info.

#### 1.8 `internal/mappeddrives/` (Windows-only)

- `Get-SmbMapping | Select-Object LocalPath,RemotePath,Status`
- For each unhealthy drive (Status != OK) and for each drive whose remote path doesn't resolve, mark as warning

**Payload:**
```json
{
  "mappings": [
    {"local": "Z:", "remote": "\\\\fileserver\\share", "status": "Disconnected"}
  ]
}
```

On macOS/Linux: collector returns `{"applicable": false}` so the central UI knows to render "n/a".

---

### Step 2 — Agent send-results pump

Extend `internal/lifecycle/` (the orchestrator) to call each collector on a schedule and POST to `/api/agents/:agent_id/check-result`:

```go
// internal/lifecycle/healthchecks.go (NEW)
package lifecycle

import (
  "context"
  "time"

  "github.com/lromero74/rts-monitoring-agent/internal/api"
  "github.com/lromero74/rts-monitoring-agent/internal/crashdumps"
  "github.com/lromero74/rts-monitoring-agent/internal/domainstatus"
  // ... import all 8 collector packages
)

type checkFn func() (*Result, error) // each package's Check()

var checks = map[string]checkFn{
  "reboot_pending":          rebootpending.Check,
  "time_drift":              timedrift.Check,
  "crashdumps":              crashdumps.Check,
  "top_processes":           topprocesses.Check,
  "listening_ports":         listeningports.Check,
  "update_history_failures": updatehistory.Check,
  "domain_status":           domainstatus.Check,
  "mapped_drives":           mappeddrives.Check,
}

func runHealthChecks(ctx context.Context, client *api.Client, interval time.Duration) {
  ticker := time.NewTicker(interval)
  defer ticker.Stop()
  for {
    select {
    case <-ctx.Done():
      return
    case <-ticker.C:
      for name, fn := range checks {
        // Each check has its own free-tier gate (see master PRP §7)
        if !freetier.IsAllowed("check_" + name) { continue }
        result, err := fn()
        if err != nil { /* log + continue */ continue }
        client.POST("/agents/" + agentID + "/check-result", result, true)
      }
    }
  }
}
```

Default interval: 5 minutes. Made configurable via `config.yaml` `health_checks.interval`.

---

### Step 3 — Backend route

**File:** `backend/routes/agents.js` (extend existing — already 4744 lines, keep additions tight)

```javascript
// Agent → backend: ingest a single check result
router.post('/:agent_id/check-result',
  authenticateAgent, requireAgentMatch,
  async (req, res) => {
    const { agent_id } = req.params;
    const { check_type, severity, passed, payload, collected_at } = req.body;

    if (!check_type || !payload) {
      return res.status(400).json({
        success: false, message: 'Missing check_type or payload', code: 'MISSING_FIELDS'
      });
    }

    // Look up agent's business_id (denormalized into the row for tenant-isolation queries)
    const { rows: agentRows } = await query(
      'SELECT business_id FROM agent_devices WHERE id = $1',
      [agent_id]
    );
    if (!agentRows[0]) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    const business_id = agentRows[0].business_id;

    // Compare to previous snapshot for diff-based alerting (e.g., new listening port)
    const { rows: prevRows } = await query(
      `SELECT payload FROM agent_check_results WHERE agent_device_id=$1 AND check_type=$2`,
      [agent_id, check_type]
    );
    const previous = prevRows[0]?.payload || null;

    // Upsert latest
    await query(`
      INSERT INTO agent_check_results
        (agent_device_id, business_id, check_type, severity, passed, payload, collected_at, reported_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7, now())
      ON CONFLICT (agent_device_id, check_type) DO UPDATE
        SET severity=EXCLUDED.severity,
            passed=EXCLUDED.passed,
            payload=EXCLUDED.payload,
            collected_at=EXCLUDED.collected_at,
            reported_at=now()
    `, [agent_id, business_id, check_type, severity || 'info', !!passed, payload, collected_at]);

    // Append to history if payload changed
    if (!previous || JSON.stringify(previous) !== JSON.stringify(payload)) {
      await query(`
        INSERT INTO agent_check_history
          (agent_device_id, business_id, check_type, severity, passed, payload, collected_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `, [agent_id, business_id, check_type, severity || 'info', !!passed, payload, collected_at]);
    }

    // Alert dispatch for critical/warning
    if (severity === 'critical' || severity === 'warning') {
      await alertEscalationService.processCheckResult({
        agent_device_id: agent_id,
        business_id,
        check_type,
        severity,
        payload,
        previous_payload: previous,
      });
    }

    // WebSocket broadcast
    websocketService.emitToBusiness(business_id, 'agent:check-result', {
      agent_device_id: agent_id, check_type, severity, payload
    });

    res.json({ success: true });
  }
);

// Employee/admin → backend: list latest check results for one agent
router.get('/:agent_id/health-checks',
  authMiddleware,
  requirePermission('view.agent_health_checks.enable'),
  async (req, res) => {
    const { agent_id } = req.params;
    // Tenant filter for non-employee callers (employees are not business-bound)
    const businessFilter = req.user.business_id
      ? 'AND business_id = $2' : '';
    const params = req.user.business_id ? [agent_id, req.user.business_id] : [agent_id];
    const { rows } = await query(`
      SELECT check_type, severity, passed, payload, collected_at, reported_at
        FROM agent_check_results
       WHERE agent_device_id = $1 ${businessFilter}
       ORDER BY check_type
    `, params);
    res.json({ success: true, data: rows });
  }
);

// Employee/admin → backend: history for one (agent, check_type)
router.get('/:agent_id/health-checks/:check_type/history',
  authMiddleware,
  requirePermission('view.agent_health_checks.enable'),
  async (req, res) => {
    const { agent_id, check_type } = req.params;
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const businessFilter = req.user.business_id
      ? 'AND business_id = $4' : '';
    const params = req.user.business_id
      ? [agent_id, check_type, days, req.user.business_id]
      : [agent_id, check_type, days];
    const { rows } = await query(`
      SELECT severity, passed, payload, collected_at
        FROM agent_check_history
       WHERE agent_device_id = $1 AND check_type = $2
         AND collected_at >= now() - ($3 || ' days')::interval ${businessFilter}
       ORDER BY collected_at DESC
       LIMIT 200
    `, params);
    res.json({ success: true, data: rows });
  }
);
```

**Client transparency endpoint** (`backend/routes/client/agents.js` — create file or extend existing client routes):

```javascript
router.get('/agents/:agent_id/transparency-report',
  authMiddleware,
  // No requirePermission — this is for the client's own data, gated by business_id only
  async (req, res) => {
    const { agent_id } = req.params;
    if (!req.user.business_id) {
      return res.status(403).json({ success: false, message: 'Client access only' });
    }
    // Verify the agent belongs to the caller's business
    const { rows: agentRows } = await query(
      'SELECT id FROM agent_devices WHERE id=$1 AND business_id=$2',
      [agent_id, req.user.business_id]
    );
    if (!agentRows[0]) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    const { rows: checkTypes } = await query(`
      SELECT DISTINCT check_type, severity, collected_at
        FROM agent_check_results
       WHERE agent_device_id=$1
       ORDER BY check_type
    `, [agent_id]);
    res.json({ success: true, data: { checks_collected: checkTypes } });
  }
);
```

---

### Step 4 — Alert escalation hookup

**File:** `backend/services/alertEscalationService.js` (extend)

Add a `processCheckResult({...})` method that:
1. Looks up alert preferences for the business (`alert_subscriptions` table — already exists)
2. For severity `critical`: send email + SMS + push (or whatever the business config dictates)
3. For severity `warning`: send push only by default
4. Dedupes against `alert_history` (don't fire twice for the same `(agent_device_id, check_type, severity)` within a 4h window)

Use existing `alert_history` and `alert_notification` tables — don't add new alert tables for Stage 1.

---

### Step 5 — Frontend "Health Checks" tab

**File:** `src/components/admin/agent-details/HealthChecksTab.tsx` (NEW)

```tsx
import { useEffect, useState } from 'react';
import { usePermission } from '../../../hooks/usePermission';
import { apiService } from '../../../services/apiService';
import { useTheme } from '../../../contexts/ThemeContext';

interface CheckResult {
  check_type: string;
  severity: 'info'|'warning'|'critical';
  passed: boolean;
  payload: Record<string, unknown>;
  collected_at: string;
}

export const HealthChecksTab: React.FC<{ agentId: string }> = ({ agentId }) => {
  const { checkPermission } = usePermission();
  const { themeClasses } = useTheme();
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!checkPermission('view.agent_health_checks.enable')) return;
    apiService.get(`/agents/${agentId}/health-checks`)
      .then(r => { setChecks(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [agentId, checkPermission]);

  if (!checkPermission('view.agent_health_checks.enable')) return null;
  if (loading) return <div className={themeClasses.text.secondary}>Loading…</div>;

  return (
    <div className="space-y-2">
      {checks.map(c => (
        <CheckRow key={c.check_type} check={c} />
      ))}
    </div>
  );
};

const CheckRow: React.FC<{ check: CheckResult }> = ({ check }) => {
  // Render one row per check type with severity badge + a "details" expander
  // showing the payload formatted by check_type (a small switch on check_type)
  // ...
};
```

WebSocket subscription: `AdminDataContext.tsx` already handles `agent:*` events — add `agent:check-result` to its handler, mutate the corresponding agent's `health_checks` cache slice. (Pattern is identical to existing metrics handling.)

**File:** `src/components/admin/AgentDetails.tsx` (modify) — add a new tab next to existing Metrics/Inventory tabs:

```tsx
import { HealthChecksTab } from './agent-details/HealthChecksTab';
// ...
<Tab name="Health Checks" key="health">
  <HealthChecksTab agentId={agent.id} />
</Tab>
```

---

### Step 6 — Free-tier gating

**Agent side** (`internal/freetier/checks.go` — NEW):
```go
package freetier

var Stage1Checks = map[string]bool{
  "check_reboot_pending":          true, // free
  "check_time_drift":              true, // free
  "check_crashdumps":              true, // free
  "check_top_processes":           false, // paid only
  "check_listening_ports":         false, // paid only
  "check_update_history_failures": true, // free
  "check_domain_status":           true, // free
  "check_mapped_drives":           false, // paid only (Win-only anyway)
}
```

**Backend side** (`backend/services/freetierGate.js` — NEW):
```javascript
const STAGE1_CHECKS_FREE = new Set([
  'reboot_pending','time_drift','crashdumps',
  'update_history_failures','domain_status'
]);
const STAGE1_CHECKS_PAID = new Set([
  'top_processes','listening_ports','mapped_drives'
]);

export function isCheckAllowedForBusiness(business_id, check_type) {
  // Look up subscription tier; STAGE1_CHECKS_FREE always allowed,
  // STAGE1_CHECKS_PAID only for non-trial tiers.
  // ...
}
```

Call this in the POST `/check-result` route; if not allowed, drop silently (don't 4xx — agent will retry forever and waste battery).

---

## Validation Gates

```bash
# Backend
cd /Users/louis/New/01_Projects/RomeroTechSolutions
node --check backend/routes/agents.js
node --check backend/services/alertEscalationService.js
node --check backend/services/freetierGate.js
npx tsc --noEmit
npm run lint

# Frontend manual
# 1. npm run dev → log in as employee → open AgentDetails for an online agent → Health Checks tab populated
# 2. Resize to 375px (iPhone SE) → tab still readable, no horizontal scroll
# 3. Log in as a client at /clogin → /api/client/agents/:id/transparency-report returns own-business agents only
# 4. Try to call /api/agents/:other_business_agent_id/health-checks as a client → 404 (tenant filter works)

# Agent
cd /Users/louis/New/01_Projects/rts-monitoring-agent
go vet ./...
gofmt -l .
go test ./internal/rebootpending/... ./internal/timedrift/... ./internal/crashdumps/... \
        ./internal/topprocesses/... ./internal/listeningports/... ./internal/updatehistory/... \
        ./internal/domainstatus/... ./internal/mappeddrives/...
./scripts/build-all.sh

# Cross-OS smoke (one of each)
# - macOS arm64: install signed pkg, observe 5 check_types arrive (mapped_drives = applicable:false)
# - Linux x86_64: install .deb, observe 7 check_types
# - Win 11: install MSI, observe all 8 check_types
# - Linux arm64 + macOS Intel: spot-check agent doesn't crash on startup

# Migration
ssh testbot "PGPASSWORD=... pg_dump -h localhost -U romero_app romerotechsolutions > ~/rts-pre-stage1-$(date +%s).sql"
ssh testbot "psql -h localhost -U romero_app -d romerotechsolutions -f /tmp/20260428_agent_check_results.sql"
ssh testbot "psql -h localhost -U romero_app -d romerotechsolutions -c \"\\d agent_check_results\""
```

---

## Rollback Plan

### If migration fails or causes side effects
```sql
BEGIN;
DROP TABLE IF EXISTS agent_check_history;
DROP TABLE IF EXISTS agent_check_results;
DELETE FROM role_permissions WHERE permission_id IN (
  SELECT id FROM permissions WHERE key LIKE 'view.agent_%' OR key = 'manage.processes.enable'
);
DELETE FROM permissions WHERE key IN (
  'view.agent_health_checks.enable','view.agent_top_processes.enable',
  'manage.processes.enable','view.agent_listening_ports.enable',
  'view.agent_update_history.enable','view.agent_domain_status.enable',
  'view.agent_mapped_drives.enable','view.agent_time_drift.enable',
  'view.agent_transparency_report.enable'
);
COMMIT;
```

### If a single collector misbehaves in prod
- Flip `Stage1Checks[<name>] = false` in `internal/freetier/checks.go`, rebuild agent, ship a hotfix version
- Backend keeps accepting reports of other check_types unaffected
- Existing `agent_check_results` rows stay; UI shows them as stale (last `reported_at` will age)

### If the alert-escalation hook spams everyone
- Set the dedupe window in `alertEscalationService.processCheckResult` to longer (e.g., 24h instead of 4h)
- Or temporarily early-return on `severity != 'critical'` while debugging

### Hotfix protocol
Per CLAUDE.md: roll forward with a new commit (`vX.Y.Z+1`), never revert a tagged release.

---

## Versioning

Per CLAUDE.md, every commit in this stage bumps:
- `package.json` `"version"`
- `public/version.json` `"version"`
- `src/hooks/useVersionCheck.ts` `CURRENT_VERSION`

Agent: `internal/version/version.go::Version` bumps per rebuild.

Tag pattern: `vX.Y.Z` (three-part semver). Per the project's existing scheme, you'll likely cross from `1.101.x` to `1.102.0` when Stage 1 ships.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `agent_check_results` table gets fat | Low | Low | One row per (agent, check_type) — bounded by # collectors × # devices. History table is bounded by `INSERT only-on-change` |
| WebSocket flood when 100+ agents report at startup | Medium | Medium | Stagger initial check runs across each agent's first 5 minutes (random initial delay 0–300s) |
| Listening-ports diff fires excessively (e.g., short-lived test daemons) | High | Medium | Server-side: require new port to be present in 2 consecutive snapshots before alerting |
| macOS panic-log read fails silently due to TCC | High on first install | Low | Surface "Full Disk Access required" in agent UI + backend admin tab; check_type still reports `access_denied:true` |
| process.kill misuse | Medium | High | `manage.processes.enable` not granted to technician role by default; audit log every kill |
| Time-drift collector hits external NTP servers from many agents | Medium | Low (privacy) | Configurable NTP target; default to `time.cloudflare.com` (privacy-preserving); randomized stagger so we don't DDoS our own NTP target |
| Free-tier gate skipped on agent but allowed on backend | Medium | Low | Match the lists in lockstep via shared test (CI fails if they diverge — add a small sync-checker test) |

---

## Quality Score

**9/10** — execution-ready.

- ✅ Migration is concrete, idempotent, and has a rollback
- ✅ All 8 collectors have OS-specific commands pre-researched
- ✅ Backend route shape mirrors existing agent route patterns (reviewed `agents.js`)
- ✅ Permission keys + role grants are SQL-ready
- ✅ Free-tier gating wired both sides
- ✅ Alert escalation reuses existing service (no duplicate alert tables)
- ✅ Validation gates are runnable as-is
- ⚠️ The exact UI styling of `CheckRow` per `check_type` is left for the implementer (intentional — it's small enough to not need a spec, but if you want pixel-perfect, draft mockups first)
- ⚠️ macOS Full Disk Access UX prompt is described but not designed (small follow-up)

The lone `1` point dropped is for the unspecified per-check_type UI rendering details.
