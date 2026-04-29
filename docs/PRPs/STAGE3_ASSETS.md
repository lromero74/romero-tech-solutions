# PRP: Stage 3 — Asset & Inventory Deepening

**Created:** 2026-04-29
**Status:** In progress (this session: 3.7 + 3.5 + 3.2; 3.1, 3.3, 3.4, 3.6 deferred)
**Parent:** `docs/PRPs/RMM_GAP_CLOSURE_MASTER.md`
**Estimated effort:** ~1 day actual for the 3 subset; ~2 weeks for the full 7

---

## Context & Goal

Move RTS from "what's running on this device right now" to a **fleet asset register**: certificates that will expire, scheduled tasks that look suspicious, peripherals that came and went, browser extensions worth auditing, license keys that need renewal, warranty windows that are closing. Every mature MSP charges for this; it's table-stakes for asset management.

### Who benefits
- **Operators / employees** — certificate-expiry warnings before outages, audit trails for compliance reviews
- **Sales** — auditing + asset tracking is the third premium-tier story (after action layer + compliance pack)

---

## Sub-feature scope

| Sub | Theme | Approach | Status |
|---|---|---|---|
| 3.7 | Certificate inventory + expiry | New agent collector; cert expiry boundary alerts | ✅ This session |
| 3.5 | Scheduled tasks audit | New agent collector; flag SYSTEM-running + recently-modified | ✅ This session |
| 3.2 | Peripheral inventory (USB + monitors) | New agent collector | ✅ This session |
| 3.6 | User logon history + idle | New agent collector (security log on Win, last on POSIX) | Next session |
| 3.3 | Browser extension inventory | Per-user file-walk for Chrome/Edge/Firefox | Next session |
| 3.4 | License-key inventory | Office OSPP, Win OEM key, Adobe registry | Next session |
| 3.1 | Warranty lookup integration | **Backend-only**; Dell/Lenovo/HP/Apple APIs (some need partner keys) | Next session |

This session focuses on the three that:
1. Need only host-local data (no external API keys to procure)
2. Have actionable severity rules (not pure asset-listing)
3. Match the agent-side cross-OS pattern proven in Stages 1+2

---

## Architecture

These are all **point-in-time health checks** in the Stage 1 mold — same `agent_check_results` table, same orchestrator, same UI tab. No new schema, no new tables, no new routes. Just 3 new check_types added to the existing pipeline:

| check_type | Tier (per-feature) | Severity rules |
|---|---|---|
| `certificate_expiry` | n/a (pricing is per-device) | < 7d → critical, < 30d → warning, else info |
| `scheduled_tasks` | n/a | warning if any task is recently-created AND running as SYSTEM/root with non-standard binary |
| `peripherals` | n/a | always info (asset-tracking only) |

**Note:** the per-feature freetier split was removed in v1.104.1. All check_types are available on every device that successfully authed.

### Cross-OS commands

**3.7 Certificate expiry:**
- macOS: `security find-certificate -a -p` + parse PEM with `openssl x509 -enddate`
- Linux: walk `/etc/ssl/certs/`, `/etc/letsencrypt/live/*/fullchain.pem`, `/etc/pki/tls/certs/`
- Windows: `Get-ChildItem Cert:\LocalMachine\My` exports DER, parse expiry

**3.5 Scheduled tasks:**
- macOS: `launchctl list` + plist enumeration in `/Library/Launch{Daemons,Agents}` and `~/Library/LaunchAgents`
- Linux: `/etc/cron.{hourly,daily,weekly,monthly,d}`, user crontabs via `for u in /etc/passwd; do crontab -u $u -l; done` (need root), `systemctl list-timers --all`
- Windows: `Get-ScheduledTask` with state + action info

**3.2 Peripherals:**
- macOS: `system_profiler SPUSBDataType -json` + `SPDisplaysDataType -json` (already used in gpu_status — extract just monitors)
- Linux: `lsusb -v` (best-effort; needs root for full info), parse EDID from `/sys/class/drm/*/edid`
- Windows: `Get-PnpDevice -PresentOnly` + `Get-CimInstance Win32_DesktopMonitor`

### File / package layout (per design-quality memory)

Each collector is its own package:
```
internal/
├── certinventory/
│   ├── certinventory.go
│   └── certinventory_test.go
├── scheduledtasks/
│   ├── scheduledtasks.go
│   └── scheduledtasks_test.go
└── peripherals/
    ├── peripherals.go
    └── peripherals_test.go
```

`internal/healthchecks/healthchecks.go` registers them in `defaultCollectors()`. Same payload-adapter pattern as Stage 1+2.

### Tests

Per the TDD memory: pure parsers tested first with realistic OS-output fixtures. Severity boundary tables. CheckType stability sentinels. Mac/Linux/Windows variants for each parser.

### File size

`internal/healthchecks/healthchecks.go` is currently ~570 lines after Stage 2.4-2.6. Adding 3 more collector entries + 3 payload adapters will push it to ~750. Still well under the 1200 cap. If we keep extending Stage 3 in a future session (3.1/3.3/3.4/3.6), the file will likely cross 900-1000 — at which point we should split the registry from the orchestrator.

`HealthChecksTab.tsx` is at ~480 lines. Adding 3 PayloadView cases will push it to ~600. Same story — fine for now, plan the split when crossing 900.

---

## Implementation Blueprint

### Step 1 — Agent collectors (Go)

For each of the three: pure parser + cross-OS dispatcher + `Severity()` + `Passed()`. Mirror Stage 2.4 (battery) — that's the cleanest precedent.

### Step 2 — Orchestrator + payload adapters

Add to `defaultCollectors()` registry. Add 3 `xPayload(r *Result) map[string]interface{}` adapter functions. Tests pin both the registry membership (sentinel) and the JSON shape.

### Step 3 — Backend valid set

`VALID_CHECK_TYPES` in `agents.js` gets 3 new strings. That's it — no migrations, no new routes.

### Step 4 — Frontend

3 new switch cases in `HealthChecksTab.tsx` PayloadView. Each renders the meaningful fields (not raw JSON). Tests pin the basic rendering.

### Step 5 — Versions + release

- Agent v1.27.0 → v1.28.0 (3 new packages)
- Frontend/backend v1.104.1 → v1.105.0 (new feature set)
- Standard release.sh build + sign + deploy

---

## Validation Gates

```bash
# Agent
cd /Users/louis/New/01_Projects/rts-monitoring-agent
go vet ./...
gofmt -l .
go test ./internal/certinventory/... ./internal/scheduledtasks/... ./internal/peripherals/...
go test ./internal/healthchecks/...
for target in darwin/arm64 linux/amd64 linux/arm64 windows/amd64; do
  GOOS=${target%/*} GOARCH=${target#*/} go build -o /dev/null ./cmd/rts-agent/
done

# Backend / frontend
cd /Users/louis/New/01_Projects/RomeroTechSolutions
cd backend && npm test
cd .. && npx tsc --noEmit && npx jest
```

---

## Rollback

Per-collector enable: set the package's `Check()` to return immediately. Frontend renderer falls back to JSON-dump if a check_type is unknown. Backend rejects unknown check_types with 400 — but only if the agent reports something not in `VALID_CHECK_TYPES`.

If a single collector starts spamming bad data:
1. Comment out its entry in `defaultCollectors()`
2. Bump agent + ship
3. Old reports stay in `agent_check_results` until overwritten

---

## Versioning

Both repos bumped together:
- Agent: `internal/version/version.go` → 1.28.0
- RTS: `package.json` + `public/version.json` + `useVersionCheck.ts` → 1.105.0

---

## Quality Score

**8/10** for the 3-feature subset shipping this session. The deferred 4 are well-scoped but not started; warranty (3.1) needs vendor API key procurement and is best treated as its own session.
