# PRP: RTS Monitoring Agent — RMM Feature Gap Closure (Master Plan)

**Created:** 2026-04-28
**Owner:** Louis Romero
**Status:** Draft — Stage 1 ready for execution; later stages refined upon entry
**Related docs:**
- `docs/RMM_FEATURE_GAP_ANALYSIS.md` (2025-10-17) — original feature-vs-competitor matrix
- `docs/MSP_AGENT_PLAN.md` — original DB schema sketch for `agent_devices`
- `docs/HANDOFF_TO_RTS_AGENT.md` — agent ↔ API contract
- `/Users/louis/New/01_Projects/rts-monitoring-agent/CLAUDE.md` — agent codebase rules

---

## Context & Goal

Close the feature gap between the RTS monitoring agent and commercial RMMs (Datto, NinjaOne, Atera, ConnectWise Automate, Kaseya, N-able, Action1) so that RTS becomes a viable single-vendor MSP platform. Cross-OS parity is mandatory across macOS Intel, macOS Apple Silicon, Linux x86_64, Linux arm64, and Windows.

### Who benefits
- **MSPs / employees** — gain real RMM workflows (patch approval, scripting, deployment, compliance reports)
- **Client business owners (`/clogin`)** — gain visibility into device health and a transparency report endpoint
- **Sales** — get a feature parity story for prospect calls

### Scope
- **In:** 8 stages of agent collectors + central API/UI + alerting, ordered easiest → hardest
- **Out (this PRP):** Mobile-device-management market (iOS MDM, Android Enterprise) — mentioned in §8.4 but not specified
- **Out (this PRP):** Migration from existing trial-agent dashboard to a unified device dashboard — separate effort

### Success criteria
1. Each stage ships independently (no later stage blocks earlier stages from prod)
2. Every new collector has table-driven Go tests for OS dispatch + parser correctness
3. Every new admin endpoint enforces both `requirePermission('<key>')` and `business_id` tenant filter
4. UI works at 375px viewport for any view exposed in the `/clogin` flow
5. Free-tier limits are extended for each new collector before that collector ships
6. New permission keys follow the `<verb>.<resource>.enable` convention with `view.`, `manage.`, `execute.` verbs

---

## Stage Roadmap (easiest → hardest)

| Stage | Theme | Effort | Risk | Independent? | Status |
|---|---|---|---|---|---|
| 1 | Tiny collectors (8 health checks) | 1–2 wk per check, ~6 wk total | Low | Yes | ✅ **Shipped 2026-04-29** (RTS v1.102.0 + agent v1.26.2) |
| 2 | Trend/forecast/anomaly | 3–4 wk | Medium (data volume) | Yes | 🟡 **Code-complete for 2.1+2.2+2.3+2.7** in v1.103.0; awaiting deploy. 2.4–2.6 deferred (need new agent collectors) |
| 3 | Asset & inventory deepening | 2–3 wk | Low–Medium | Yes |
| 4 | Action layer (patch/deploy/scripts) | 4–6 wk | High (write actions, reboot policies) | Stage 4.1 needs Stage 1.1 |
| 5 | Security & compliance | 3–4 wk | High (recovery-key escrow = legal/insurance liability) | Yes |
| 6 | Backup integrations | 3–4 wk | Low | Yes |
| 7 | Compliance pack (CIS/HIPAA/PCI/CMMC) | 4–5 wk | Medium (template curation) | Needs Stage 1, 5 |
| 8 | Network & infra side-channels | Ongoing | Low | Yes |

**Critical path for "real RMM" status:** Stage 1 → Stage 4.1 (patch actions). Everything else parallel.

---

## Cross-Cutting Architectural Standards

These apply to every stage. Calling them out once here so individual stage PRPs don't repeat themselves.

### 1. Generic check-result storage

Avoid table sprawl across 30+ collectors. Use ONE storage strategy per data shape:

- **Latest-state snapshots (Stage 1, 3, 5):** `agent_check_results` table — one row per (agent, check_type), upserted on each report. Query latest by `(agent_device_id, check_type)`.
- **Time-series telemetry (Stage 2 trends):** dedicated narrow tables (`agent_disk_history`, `agent_metric_baselines`) with native rollup (raw 30d → hourly 90d → daily 2y). Postgres-native, no TimescaleDB dep.
- **Audit trails (Stage 4 actions, Stage 5 escrow access):** append-only `agent_action_audit` with cryptographic chaining (each row carries `prev_hash`).

Schema sketch for `agent_check_results`:

```sql
-- backend/migrations/20260428_agent_check_results.sql
CREATE TABLE agent_check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  check_type VARCHAR(64) NOT NULL,           -- 'reboot_pending','time_drift','top_processes',...
  severity VARCHAR(16) NOT NULL DEFAULT 'info', -- 'info','warning','critical'
  passed BOOLEAN NOT NULL DEFAULT true,
  payload JSONB NOT NULL,                    -- shape varies per check_type, validated by collector schema
  collected_at TIMESTAMPTZ NOT NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_device_id, check_type)
);
CREATE INDEX agent_check_results_business_idx ON agent_check_results(business_id, check_type);
CREATE INDEX agent_check_results_severity_idx ON agent_check_results(severity) WHERE severity != 'info';
```

`business_id` is denormalized off `agent_devices` so tenant-isolation queries don't need a join. Already the pattern used by `agent_metrics`.

### 2. RBAC permission key naming

Single convention: `<verb>.<resource>.enable`.

| Verb | Use case |
|---|---|
| `view.` | Read-only access (most Stage 1–3 keys) |
| `manage.` | Configure / approve / schedule (Stage 4 patch policies, Stage 5 baselines) |
| `execute.` | Trigger an action that runs on the agent (kill process, run script, deploy patch) |
| `access.` | Sensitive read with audit trail (recovery-key escrow retrieval — Stage 5) |

Backend enforcement (per-route):
```javascript
import { requirePermission } from '../middleware/permissionMiddleware.js';
router.get('/:agent_id/health-checks',
  authMiddleware,
  requirePermission('view.agent_health_checks.enable'),
  async (req, res) => { /* ... business_id filter ... */ });
```

Frontend gating (per-component):
```typescript
const { checkPermission } = usePermission();
if (!checkPermission('view.agent_health_checks.enable')) return null;
```

Executive role gets all permissions implicitly via `getUserPermissions()`, BUT `_checkPermissionInDatabase()` does NOT have that shortcut — every fine-grained backend check goes through the `role_permissions` table. Always grant new keys to executive **and** to whichever functional roles need them, explicitly.

### 3. WebSocket push of new check results

When a new `agent_check_results` row lands, emit `agent:check-result` to `business_${business_id}` and `agent_${agent_device_id}` rooms. The admin UI subscribes via `AdminDataContext.tsx`. Pattern already exists for metrics — copy it.

### 4. Alert wiring

Hook into `backend/services/alertEscalationService.js`. Each new collector defines its own thresholds in `alert_config` (or its own `alert_rules` row) and calls `alertEscalationService.processCheckResult(checkResult)` after upsert. Severity → channel mapping (info/warning/critical → push/email/SMS) lives in the existing escalation service — don't reimplement.

### 5. Data retention policy

| Data class | Default retention | Per-business override? |
|---|---|---|
| Latest-state checks (`agent_check_results`) | Indefinite (1 row per check; old payloads overwritten) | n/a |
| Audit trails (`agent_action_audit`) | 7 years | No (regulatory) |
| Raw time-series (Stage 2) | 30 days | Yes |
| Hourly rollups (Stage 2) | 90 days | Yes |
| Daily rollups (Stage 2) | 2 years | Yes |

Retention runs as a nightly cron in `backend/services/agentMonitoringService.js` (extend existing service; don't add another cron daemon).

### 6. Privacy / transparency endpoint

Client business owners can call `GET /api/client/agents/:agent_id/transparency-report` to see:
- All `check_type` values reported in the last 30 days
- A redacted sample payload per check_type (no PII fields, no script output)
- Last 10 admin actions taken on this device (from `agent_action_audit`)

Required for trust + GDPR/CCPA defensibility. Roll out in Stage 1 alongside the first batch of checks.

### 7. Free-tier gating

`internal/freetier/trial.go` gates collectors on the agent. Each new collector checks `freetier.IsAllowed("check_<name>")` and short-circuits if not. The backend enforces a parallel check on the `subscriptions` table (a paid tier doesn't trust an old agent reporting paid checks). Keep the matching list in `backend/services/freetierGate.js` (new file) and `internal/freetier/checks.go` (new file). Update both in lockstep when shipping a new collector.

### 8. Cross-OS specifics & gotchas

- **Windows arm64**: WMI/CIM queries work; some PowerShell modules behave differently. Test on a real arm64 box.
- **macOS sandboxing**: anything reading `/Library/Logs/DiagnosticReports/` needs `Full Disk Access` granted to the agent binary. Surface a UI prompt if denied; don't silently fail.
- **Linux distros**: cmdline tools differ wildly (`ss` vs `netstat`, `dnf` vs `apt` vs `pacman`, `chronyc` vs `timedatectl`). Always probe in this order: 1. existence of binary, 2. capability flag from `--version`, 3. parse output. Fall back gracefully.
- **systemd vs init.d vs launchd**: collector dispatch table by `runtime.GOOS` then by detected init system within Linux.

---

## Stage 1 — Tiny Collectors (Health Checks)

**Status:** Execution-ready PRP at `docs/PRPs/STAGE1_HEALTH_CHECKS.md`. Read that file before implementing.

**Summary:**
- 8 collectors: pending-reboot, time-drift, crashdumps, top-processes (+kill action), listening-ports, update-history, domain-status, mapped-drives
- 1 generic table: `agent_check_results`
- 9 permission keys
- 1 admin UI tab: "Health Checks" on `AgentDetails`
- 1 transparency endpoint for clients
- Estimated 6 weeks total

---

## Stage 2 — Trend / Forecast / Anomaly

**Goal:** Move from "is it broken right now?" to "is it about to break?"

### Collectors (agent side, all Go)
| ID | Module | Notes |
|---|---|---|
| 2.1 | `internal/disks` (extend) | Already collects partition usage; add a daily snapshot ping so the backend has 30-day history |
| 2.2 | `internal/metrics` (extend) | Push cpu/mem/disk/net at higher resolution (60s default) so backend can compute baselines |
| 2.3 | `internal/disks` (extend) | Push full SMART attribute dump daily, not just "healthy/failing" |
| 2.4 | `internal/sensors` (extend battery) | Extract battery-only struct; report cycle count + design-vs-full capacity |
| 2.5 | `internal/gpu` (NEW) | NVIDIA via `nvidia-smi`, AMD via `rocm-smi`, macOS via `powermetrics --samplers gpu_power`, Win via `Win32_VideoController` + nvidia-smi if present |
| 2.6 | `internal/powerpolicy` (NEW) | Win: `powercfg /getactivescheme`. mac: `pmset -g`. Linux: `systemctl status sleep.target` + `tlp-stat` if installed |
| 2.7 | `internal/connectivity` (extend) | Daily WAN-IP via existing outbound check; diff vs prior |

### Backend additions
- New tables: `agent_disk_history`, `agent_metric_baselines`, `agent_smart_history`, `agent_battery_history`, `agent_gpu_history`, `agent_wan_ip_history`
- Nightly job in `agentMonitoringService.js` computes per-device baselines (rolling 7-day mean + stddev per metric)
- Forecasting: linear regression over last 30 days of disk usage per partition. Postgres `regr_slope()` and `regr_intercept()` aggregate functions — no Python/numpy needed
- Alert types added to `alert_config`:
  - `disk.forecast.full_within_14d` → critical
  - `metric.anomaly.over_2sigma_15min` → warning
  - `smart.degrading_attribute` → critical
  - `battery.health_below_80` → warning
  - `wan_ip.changed` → info

### UI surfaces
- New chart components on `AgentDetails`: `DiskForecastChart`, `BaselineDeviationChart`, `SmartHistoryTable`
- New "Trends" tab next to Stage 1's "Health Checks"

### Permission keys
- `view.agent_trends.enable`
- `manage.agent_baselines.enable` (override thresholds per device or per business)

### Risks
- Data volume. 1 metric/min × 6 metrics × 100 devices × 30 days = ~26M rows. Mitigate with aggressive rollup: keep raw 7d (not 30d), hourly 30d, daily 2y. Index on `(agent_device_id, metric, sampled_at DESC)`.

---

## Stage 3 — Asset & Inventory Deepening

### Collectors
| ID | Module | Notes |
|---|---|---|
| 3.1 | Backend-side enricher (NOT agent) | Pull S/N from existing hardware inventory; query Dell/Lenovo/HP/Apple warranty APIs server-side. Cache results for 7 days. |
| 3.2 | `internal/peripherals` (NEW) | USB devices via `Get-PnpDevice` / `lsusb` / `system_profiler SPUSBDataType -json`. Monitor EDID via `Get-WmiObject WmiMonitorID` / `/sys/class/drm/*/edid` / `system_profiler SPDisplaysDataType -json` |
| 3.3 | `internal/browserext` (NEW) | Chrome/Edge `Preferences` JSON, Firefox `extensions.json`, Safari extensions plist. PER-USER scan (need to enumerate user home dirs on Linux/Win, `/Users/*` on macOS) |
| 3.4 | `internal/licenses` (NEW) | Win: Office `OSPP.VBS /dstatus`, Adobe registry, OEM key via `wmic path SoftwareLicensingService get OA3xOriginalProductKey`. macOS/Linux: best-effort (Office for Mac plist) |
| 3.5 | `internal/scheduledtasks` (NEW) | Win: `Get-ScheduledTask`. Linux: enumerate `/etc/cron.*`, user crontabs, systemd timers. macOS: `launchctl list` + plist enum. Flag: disabled-but-recently-modified, running-as-SYSTEM/root, undefined-user-account |
| 3.6 | `internal/sessionhistory` (NEW) | Win: `Get-WinEvent` Security 4624/4634 (last 7 days). Linux: `last -F`. macOS: `last -F`. Idle time: Win `LASTINPUTINFO`, Linux `xprintidle` (X11 only — Wayland/headless skip), macOS `ioreg -c IOHIDSystem` |
| 3.7 | `internal/certificates` (NEW) | Win: `Get-ChildItem Cert:\LocalMachine\My`. Linux: scan `/etc/ssl`, `/etc/letsencrypt/live`, `/etc/pki`. macOS: `security find-identity -v` + `security find-certificate -a -p` |

### Backend additions
- Tables: `agent_warranty`, `agent_peripherals`, `agent_browser_extensions`, `agent_licenses`, `agent_scheduled_tasks`, `agent_session_history`, `agent_certificates`
- Nightly warranty refresh job
- Alert: cert expiring within 30/14/7 days; warranty expiring within 90/30/7 days

### Permission keys
- `view.agent_assets.enable` (single key for all Stage 3 reads — they're all "asset inventory")
- `manage.warranty_overrides.enable` (manually set warranty for assets the API can't resolve)

### External deps
- Dell Warranty API (TechDirect — requires partner API key)
- HP Warranty Check (no public API — scrape carefully or use 3rd-party warranty-check service)
- Lenovo Warranty (public, free)
- Apple Coverage (public via `https://checkcoverage.apple.com` — handle their HTML, no API)

If any vendor API isn't accessible, store `warranty_status='lookup_unavailable'` and prompt admin to enter manually. Don't fail silently.

---

## Stage 4 — Action Layer (the big one)

**Pre-req:** Stage 1.1 (pending-reboot detection) ships first.

### 4.1 Patch management actions

The single biggest "is this a real RMM" gate. Three subsystems:

#### 4.1a Approval workflow
- Tables: `patch_policies`, `patch_approvals`, `patch_deployments`, `maintenance_windows`
- Detected patches (already collected by `internal/patches/`) → approval queue
- Per-business approval RBAC: `manage.patch_approvals.enable` (per-business filter via `req.user.business_id` for clients; full access for executives)

#### 4.1b Maintenance windows
- Per-business and per-device-group
- Stored in Pacific wall-clock per the project DST rule (see CLAUDE.md). Use `timezoneService.getBusinessDayAndTime(utcInstant)` for lookup.
- Window types: scheduled (recurring weekly), one-shot (specific date)
- Reboot policies: `force_reboot`, `defer_to_user_max_4h`, `prompt_user_with_countdown`

#### 4.1c Deployment + rollback
- Agent receives a `patch.install` command via existing `internal/commands/` framework
- Status pipeline: `pending` → `approved` → `scheduled` → `installing` → `installed`/`failed` → `reboot-pending` → `complete`
- Rollback: where OS supports it (Windows `wusa /uninstall`, Linux package manager rollback for atomic distros only — Fedora Silverblue, openSUSE MicroOS). macOS: no rollback; install warnings + opt-in only.

### 4.2 Software deployment actions
- New `software_catalog` table — admins curate
- Push command via existing commands framework: `software.install <catalog_id>`
- Per-device install history in `agent_software_installs`

### 4.3 Scripting / automation library
- `agent_scripts` table — versioned scripts in DB (PowerShell, Bash, Python)
- Parameter prompts via JSON Schema in `agent_scripts.parameters_schema`
- Triggers: on-demand (current commands flow), on-schedule (new cron-like row), on-event (e.g., "run if disk < 10%" — uses Stage 1 listening-ports diff or Stage 2 anomaly)
- Output capture in existing `agent_command_results.output` (already exists)
- Permission keys: `manage.scripts.enable`, `execute.scripts.enable`
- Security: scripts must be PGP-signed by an executive before they can be `execute.scripts.enable`'d. Store signature in `agent_scripts.signature_pgp`. Agent verifies before running.

### 4.4 Wake-on-LAN
- Server-side knows agent's MAC + last-known-LAN
- Send WoL magic packet *via another agent on the same LAN as relay* (not directly from the central server — usually behind NAT)
- New command: `wol.send <target_mac>` to a relay agent

### 4.5 Remote registry / config viewer (read-only first)
- Win: registry tree browser via existing remote command framework
- Linux: `/etc` browser
- macOS: defaults read browser
- Read-only this stage; write in a future stage with stricter audit

### Risk
HIGH. This is where mistakes brick customer machines. Required guard rails:
1. Every action in this stage logs to `agent_action_audit` (append-only, hash-chained)
2. Every action requires explicit per-action confirmation in UI (typed device hostname for force-reboot, scripts, mass-deploy)
3. Beta-flag the entire stage for the first month — limit to internal devices only, then expand
4. Patch deployment to >10 devices requires a second-employee approval

---

## Stage 5 — Security & Compliance

### 5.1 AV/EDR threat history pull-through
- Defender: `Get-MpThreatDetection`, `Get-MpComputerStatus`, `Get-MpPreference`
- Pluggable readers (one Go interface, per-vendor implementations) for Bitdefender / SentinelOne / Webroot
- Surface: threats found, quarantined, cleaned in last 30 days
- Permission key: `view.agent_av_threats.enable`

### 5.2 Group Policy / config drift detection
- Baseline + diff for: hosts file, sudoers, `/etc/passwd`, `/etc/ssh/sshd_config`, firewall rules, registry baseline keys
- Baselines stored hashed (SHA-256 of normalized content) — no need to store full file content unless a diff alert fires
- On diff: agent uploads full content, alert fires, admin reviews + acknowledges (`acknowledge.config_drift.enable`) or remediates

### 5.3 FileVault / Bitlocker / LUKS recovery-key escrow ⚠️
**This is a sensitive, regulatory-touching feature.** Requires legal + insurance review before implementation.

- Capture key on enrollment + on rotation (the agent watches the OS key-rotation event)
- Store **doubly encrypted at rest**:
  1. Envelope-encrypted by AWS KMS (or testbot-local Vault if KMS not available)
  2. Wrapped by a per-business master key the *business owner* holds — central server cannot decrypt without business owner's MFA challenge
- Audit log every access, EVERY view, EVERY export
- Step-up MFA required to retrieve (separate hardware token recommended)
- Permission key: `access.recovery_keys.enable` — grant manually, never default to any role
- Tables: `agent_recovery_keys` (encrypted), `agent_recovery_key_access_log` (append-only)
- Integration: extend existing trusted-device flow to gate access

⚠️ **Hold this section until legal sign-off.** The feature is high-value but creating a key-escrow service makes you a regulated data custodian.

### 5.4 TPM / Secure Boot / Bitlocker compliance status
- Already partial in `internal/security/`; promote to first-class. Surface as a compliance pack item in Stage 7.

### 5.5 DNS / Wi-Fi / VPN profile audit
- Rogue DNS detection: compare resolved DNS server with expected (per business config)
- Wi-Fi profile audit: list configured SSIDs and WPA versions, flag open networks
- VPN client inventory: detect installed clients (OpenVPN, WireGuard, Cisco AnyConnect, NordLayer, etc.)

### Permission keys (Stage 5)
- `view.agent_av_threats.enable`
- `view.agent_config_drift.enable`
- `acknowledge.config_drift.enable`
- `access.recovery_keys.enable` ⚠️
- `view.agent_dns_audit.enable`

---

## Stage 6 — Backup Integrations

### Collectors (read-only across the board)
- 6.1 macOS: `tmutil status`, `tmutil latestbackup`
- 6.2 Windows: `wbadmin get versions`, `Get-WBSummary`
- 6.3 3rd-party: Veeam Agent / Acronis / Macrium event logs (skip cleanly when not installed)
- 6.4 Linux: parse restic / borg / rsnapshot logs (configurable log paths)
- 6.5 UPS: NUT `upsc` / Win APC PowerChute service status + event log

### Backend additions
- Single `agent_backup_status` table — last_run, success/fail, bytes_backed_up, source name (TM/Veeam/etc.)
- Alert: backup hasn't run in N days (default 2 for daily, 8 for weekly)

### Permission key
- `view.agent_backups.enable`

---

## Stage 7 — Compliance Pack

### 7.1 CIS Level 1 baseline checks per OS
- Win 10/11, Win Server 2019/2022, Ubuntu 22.04/24.04, RHEL 8/9, macOS 14+
- ~150 checks per OS (CIS L1 standard)
- Each check is a small shell/PowerShell snippet that returns pass/fail + evidence
- Stored in `compliance_checks` (definition) and `compliance_results` (per-device runs)

### 7.2 Aggregate compliance score per device
- (passing checks / applicable checks) × 100
- Weighted: critical checks count 3x, high 2x, medium 1x

### 7.3 Templates for HIPAA / PCI / CMMC quick-checks
- Curated subsets of the CIS pack mapped to specific control IDs
- Per-business pack assignment (`business_compliance_packs`)

### 7.4 Compliance report PDF export
- Use `pdfkit` (already a dep, or add it) — generate per-device or per-business
- Watermark with business name + report date

### 7.5 Trend over time per business
- Daily compliance score snapshot per device
- Aggregate to business-level trend

### Permission keys
- `view.compliance_results.enable`
- `manage.compliance_packs.enable` (assign packs to businesses)
- `export.compliance_reports.enable`

---

## Stage 8 — Network / Infra Side-channels (Ongoing)

Smaller items, ship as bandwidth allows:

- 8.1 Network bandwidth per process (Win: perfcounters; Linux: nethogs/ss; mac: nettop)
- 8.2 Printer / print-queue health
- 8.3 DNS-over-HTTPS / DoT detection per machine
- 8.4 Mobile device support (separate effort — different security model, separate enrollment flow)

---

## Implementation Blueprint Summary

For each stage:

1. **Read this master + the stage's execution-ready PRP** (Stage 1 has one already; later stages get one when entering)
2. **Bump three version files together** per CLAUDE.md (`package.json`, `public/version.json`, `src/hooks/useVersionCheck.ts`)
3. **Bump agent version** in `internal/version/version.go::Version` per agent CLAUDE.md
4. **Build all installer flavors** together (per agent CLAUDE.md cross-OS rule)
5. **Migration filename**: `backend/migrations/YYYYMMDD_<descriptive_name>.sql` — sequential by date
6. **Permission grants**: insert into `permissions` first, then `role_permissions` for executive + functional roles
7. **WebSocket events**: emit on the existing rooms (`business_<id>`, `agent_<id>`) — frontend already subscribes
8. **Test:** table-driven Go tests for collectors; manual smoke test on one of each OS for the agent; for backend, `npx tsc --noEmit` + per-file `node --check`; for UI, exercise at 375px on the `/clogin` flow if exposed there

---

## Validation Gates (apply per-stage)

```bash
# Frontend
npx tsc --noEmit                                    # type check
npm run lint                                        # eslint
# Manual: log in as employee, exercise the new health-checks tab on AgentDetails;
# log in as client at /clogin, verify transparency report renders

# Backend
node --check backend/routes/agents.js               # syntax
node --check backend/services/agentMonitoringService.js
# Manual: curl /api/agents/:id/health-checks with valid + invalid bearer tokens
# Manual: confirm cross-tenant access is BLOCKED (use a different business's agent_id)

# Agent (Go)
cd /Users/louis/New/01_Projects/rts-monitoring-agent
go vet ./...                                        # must pass clean
gofmt -l .                                          # must be empty
go test ./internal/...                              # all collectors

# Cross-OS smoke
./scripts/build-all.sh                              # build mac/linux/win installers
# Install on one box per OS, verify the new collector appears in central UI
```

---

## Rollback Plan

### Stage 1
Per-collector enable flag in `internal/freetier/checks.go` — flip to false to disable agent-side. Backend route returns empty if `agent_check_results` row missing. Drop the migration only if absolutely needed — prefer disabling vs. dropping.

### Stage 2
Time-series tables can be truncated (history regenerates). Baselines disabled by setting `manage.agent_baselines.enable=false` for all roles → frontend hides the chart, backend job skips computation.

### Stage 4 (high-risk)
Every action is reversible-or-recorded:
- Patch deploy: rollback via package manager where supported; otherwise audit-trail only
- Script execution: cannot be rolled back, but signed-script requirement gates execution
- Wake-on-LAN: trivially reversible (machine wakes → can be put back to sleep)

### General
For prod hotfix, roll forward with a new commit. Never revert a tagged release; ship `v.X.Y.Z+1` instead.

---

## Versioning

Per CLAUDE.md:
- `package.json` → `"version"`
- `public/version.json` → `"version"`
- `src/hooks/useVersionCheck.ts` → `CURRENT_VERSION`

Bump together on every user-facing commit. Pure docs (this PRP) don't need a version bump.

Agent: `internal/version/version.go::Version` bumps on every rebuild.

---

## Quality Score

**Confidence for one-pass implementation of the master plan: 7/10.**

- ✅ Architecture decisions (generic check-results table, RBAC convention, alert wiring) are concrete
- ✅ Existing precedents (agent route patterns, alertEscalationService) are referenced
- ✅ Cross-OS specifics for each Stage 1 collector are pre-researched
- ⚠️ Stage 4 patch deployment will need a dedicated PRP before implementation (effort + risk)
- ⚠️ Stage 5.3 (recovery-key escrow) needs legal review before code
- ⚠️ Stage 7 CIS check curation is genuinely time-consuming — likely a separate dedicated effort

**Confidence for Stage 1 (separate PRP): 9/10** — see `STAGE1_HEALTH_CHECKS.md`.
