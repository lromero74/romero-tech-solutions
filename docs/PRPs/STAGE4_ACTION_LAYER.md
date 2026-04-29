# PRP: Stage 4 — Action Layer (Patch Deploy + Scripts + Software + WoL + Config Viewer)

**Created:** 2026-04-29
**Status:** Design-only (no code) — review before execution
**Parent:** `docs/PRPs/RMM_GAP_CLOSURE_MASTER.md`
**Estimated effort:** 4–6 weeks. By far the biggest stage. Phase the rollout.
**Quality score (design):** 7/10 — covers the surface area; specific OS-by-OS rollback semantics will need validation in flight.

> ⚠️ **Risk callout.** Stage 4 is the single highest-blast-radius effort in the gap-closure plan. Mistakes brick customer machines. Every milestone in this PRP includes guard-rails (beta flag, audit trail, typed confirmation, second-employee approval at scale). Don't relax them under deadline pressure.

---

## Context & Goal

Move RTS from "we monitor, you fix" to **"we monitor and we fix."** Patch deployment is the single biggest "is this a real RMM?" gate vs. NinjaOne / Datto / Atera / Action1. Every premium MSP tier in those tools is gated on the action layer.

Five sub-features, decreasing in priority:

| # | Theme | Why ship it |
|---|---|---|
| 4.1 | **Patch deployment** (THE big one) | Approval queue + maintenance windows + reboot policies + rollback. Without this, RTS is "monitoring only" forever. |
| 4.2 | **Software deployment** | Push winget / brew / apt / dnf installs from a curated catalog. Sister feature to 4.1. |
| 4.3 | **Scripting / automation library** | Versioned, PGP-signed scripts (PowerShell / Bash / Python). Trigger on-demand, on schedule, or on event. |
| 4.4 | **Wake-on-LAN** | Send WoL packet via another agent on the same LAN as relay. Smallest piece. |
| 4.5 | **Remote registry / config viewer** | Read-only this stage; write capability earns its own audit-heavy follow-up. |

Critical path: 4.1 first. 4.2 + 4.3 share most of the action infrastructure with 4.1 so they fall out cheap once 4.1 is in. 4.4 + 4.5 are smaller side quests.

### Who benefits
- **Operators** — close tickets without remoting in. Maintenance windows mean no more 2am "did we really push that?" fires.
- **Sales** — premium-tier story finally backed by software. "Real RMM" gate cleared.
- **Clients** — patches happen on schedule with their team's approval workflow respected. Less downtime.

### Mobile responsive
The patch-approval UI MUST work at 375px on `/clogin` since clients are the approvers in the per-business RBAC variant. Test the approval modal on iPhone SE viewport before ship.

---

## Architecture

### High-level flow (4.1 patch deployment, end-to-end)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. Detection (already exists — Stage 1's update_history_failures sees    │
│    failed patches; agent's existing patches package detects pending)     │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. Approval queue — admin/manager sees "23 patches pending across 7      │
│    devices" and either Approve / Defer / Reject per (device, patch)      │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. Schedule — approved patches get assigned to a maintenance window      │
│    (per-business + per-device-group). Windows stored in Pacific          │
│    wall-clock per the DST rule from CLAUDE.md.                           │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. Deployment — at window start, server creates patch.install agent      │
│    commands via the EXISTING /agents/:id/commands flow. Status pipeline: │
│    pending → approved → scheduled → installing → installed/failed →      │
│    reboot-pending → complete                                             │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 5. Reboot — per the configured reboot_policy:                            │
│      force_reboot           — agent reboots immediately                  │
│      defer_to_user_max_4h   — UI prompt; auto-reboot at deadline         │
│      prompt_user_with       — UI prompt; user picks "now" / "later"      │
│        countdown                                                          │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ 6. Verify + audit — post-reboot heartbeat reports the new patch state.   │
│    Every state transition writes to agent_action_audit (append-only,     │
│    hash-chained). Failures surface in the existing alert pipeline.       │
└──────────────────────────────────────────────────────────────────────────┘
```

### New tables

```sql
-- Approval-workflow queue: one row per (device, patch) pending operator decision.
CREATE TABLE patch_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  -- Patch identity from existing internal/patches/ output:
  patch_name VARCHAR(255) NOT NULL,
  patch_version VARCHAR(100),
  package_manager VARCHAR(50) NOT NULL,  -- 'apt' | 'dnf' | 'pacman' | 'softwareupdate' | 'wuauserv' | 'brew' | 'winget'
  is_security_patch BOOLEAN DEFAULT false,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Approval state:
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'deferred', 'rejected', 'expired')),
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  approval_notes TEXT,
  -- Once approved, points at the scheduled deployment row:
  patch_deployment_id UUID,
  CONSTRAINT patch_approvals_unique UNIQUE (agent_device_id, patch_name, package_manager)
);
CREATE INDEX idx_patch_approvals_pending
  ON patch_approvals(business_id, status)
  WHERE status = 'pending';

-- Per-business maintenance windows. Pacific wall-clock per the DST rule.
CREATE TABLE maintenance_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  -- Recurrence: weekly | monthly | one-shot
  recurrence VARCHAR(20) NOT NULL,
  -- For weekly: bitmask of weekdays (Sunday=0) packed into 7 bits, e.g. 0b0011111 = M-F.
  -- For monthly: day-of-month integer.
  day_spec INTEGER,
  start_local_time TIME NOT NULL,    -- "02:00:00" Pacific
  end_local_time TIME NOT NULL,      -- "06:00:00" Pacific
  -- For one-shot windows only:
  one_shot_date DATE,
  -- Scope: optionally limit to specific device group.
  device_group_id UUID,
  enabled BOOLEAN DEFAULT true,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Scheduled patch deployments. Server materializes one row per
-- (window-start, agent, patch) when a window is approaching.
CREATE TABLE patch_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patch_approval_id UUID NOT NULL REFERENCES patch_approvals(id) ON DELETE CASCADE,
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,   -- absolute UTC; computed from MW window
  reboot_policy VARCHAR(32) NOT NULL DEFAULT 'prompt'
    CHECK (reboot_policy IN ('force', 'defer_4h', 'prompt', 'no_reboot')),
  -- Status pipeline (must match the diagram):
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','installing','installed','failed','reboot_pending','complete','aborted')),
  -- Cross-references:
  agent_command_id UUID,                -- → existing agent_commands table when dispatched
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_message TEXT,
  rollback_supported BOOLEAN DEFAULT false  -- per-OS at execution time
);
CREATE INDEX idx_patch_deployments_active
  ON patch_deployments(scheduled_for)
  WHERE status NOT IN ('complete','aborted','failed');

-- Per-business default reboot/approval policies.
CREATE TABLE patch_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  -- Auto-approve security patches without operator click? Fast-track
  -- security-only patches in a managed-services tier.
  auto_approve_security BOOLEAN DEFAULT false,
  -- Default reboot policy when not overridden per-deployment:
  default_reboot_policy VARCHAR(32) DEFAULT 'prompt',
  -- Maximum patches per maintenance window per device. Prevents one
  -- catastrophically-failing patch from blocking the next 50.
  max_patches_per_window INT DEFAULT 10,
  -- Required approver count for >10-device deploys (defense in depth):
  large_deploy_approver_count INT DEFAULT 2
);

-- Curated software catalog (4.2). Admins add entries; per-tier RBAC
-- gates who can install what.
CREATE TABLE software_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  vendor VARCHAR(120),
  -- Per-OS package identifier. Fields are mutually optional; some
  -- tools only have a Windows winget id, others only a brew formula.
  winget_id VARCHAR(255),
  brew_formula VARCHAR(120),
  apt_package VARCHAR(120),
  dnf_package VARCHAR(120),
  pacman_package VARCHAR(120),
  -- Optional: a JSON schema for required configuration parameters.
  parameters_schema JSONB,
  added_by UUID REFERENCES employees(id),
  added_at TIMESTAMPTZ DEFAULT now()
);

-- Per-device install history of catalog items.
CREATE TABLE agent_software_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  software_catalog_id UUID REFERENCES software_catalog(id),
  installed_version VARCHAR(120),
  installed_at TIMESTAMPTZ DEFAULT now(),
  agent_command_id UUID,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  result_message TEXT
);

-- Versioned scripting library (4.3). Scripts MUST be PGP-signed by an
-- executive before they can be marked execute-eligible.
CREATE TABLE agent_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  description TEXT,
  language VARCHAR(20) NOT NULL CHECK (language IN ('powershell','bash','python')),
  os_compat VARCHAR(50)[] NOT NULL,    -- {'windows','darwin','linux'}
  -- Versioning: each save is a new row, with parent_id → previous version.
  parent_id UUID REFERENCES agent_scripts(id),
  version INT NOT NULL DEFAULT 1,
  -- Script body + signature.
  body TEXT NOT NULL,
  signature_pgp TEXT,                 -- detached PGP sig over body
  signed_by UUID REFERENCES employees(id),
  signed_at TIMESTAMPTZ,
  -- Parameters declared by the script (JSON Schema). Client renders
  -- form inputs from this when triggering manually.
  parameters_schema JSONB,
  -- Triggers — multiple per script:
  trigger_on_demand BOOLEAN DEFAULT true,
  trigger_schedule_cron VARCHAR(120),  -- e.g., "0 3 * * *"
  trigger_event VARCHAR(120),          -- e.g., "disk_percent_above_90_15min"
  is_active BOOLEAN DEFAULT false,
  created_by UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Append-only, hash-chained audit trail for ALL Stage 4 actions.
-- Each row carries the SHA-256 hash of the previous row's content,
-- making the chain tamper-evident.
CREATE TABLE agent_action_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prev_hash CHAR(64),                  -- hex SHA-256
  row_hash CHAR(64) NOT NULL,
  -- What happened:
  action_type VARCHAR(64) NOT NULL,    -- 'patch.approve','patch.install','patch.reboot','script.execute','wol.send','software.install', etc.
  actor_employee_id UUID REFERENCES employees(id),
  actor_business_id UUID REFERENCES businesses(id),
  agent_device_id UUID REFERENCES agent_devices(id),
  -- Free-form payload of the action's specifics. Hashed into row_hash.
  payload JSONB NOT NULL,
  -- IP + user-agent of the caller (audit context).
  source_ip INET,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_action_audit_chain
  ON agent_action_audit(occurred_at DESC, id);
```

### State machines (in detail)

**Patch approval:**
```
pending → approved (operator click)
        → deferred (operator click; sticks for N days)
        → rejected (operator click; dropped from queue)
pending → expired (system; after 90 days no decision)
```

**Patch deployment:**
```
scheduled → installing (agent command dispatched)
          → aborted (system; window passed without dispatch)
installing → installed (agent reports success)
           → failed (agent reports error; error message in result_message)
installed → reboot_pending (when patch requires_reboot=true)
          → complete (when patch doesn't require reboot)
reboot_pending → complete (next heartbeat shows new boot time)
               → failed (15min timeout on reboot)
```

**Script execution:**
```
queued → dispatched → running → succeeded
                              → failed (non-zero exit)
                              → cancelled (operator click)
                              → timeout (default 5min, configurable)
```

### Reboot policies (4.1c)

Three modes:

| Mode | UX |
|---|---|
| `force` | Agent reboots immediately on patch.install completion. Confined to maintenance windows + opt-in policies. |
| `defer_4h` | Agent shows a tray popup: "Reboot required for security patches. Defer up to 4 hours." Auto-reboot at the deadline. |
| `prompt` | Tray popup: "Reboot now / Reboot later". User picks. No auto-reboot. (Default for non-managed clients.) |
| `no_reboot` | Status sits at `reboot_pending` until the user manually reboots — recorded but not enforced. |

Per-business `patch_policies.default_reboot_policy` is the default; per-deployment can override.

### Rollback semantics (per-OS)

| OS | Rollback path | Notes |
|---|---|---|
| Windows | `wusa /uninstall /kb:<KB>` for KB updates that support uninstall | Some KBs are flagged "permanent" — unrollable |
| Linux apt | `apt-get install <pkg>=<previous_version>` | Requires prev version known; pin to detected version pre-patch |
| Linux dnf | `dnf history undo <transaction_id>` | DNF is the cleanest — full transaction rollback |
| Linux pacman | `paccache -d` + manual reinstall — no native rollback | Out of scope; warning only |
| macOS | None reliably — Apple doesn't expose an uninstaller for OS updates | Audit-trail only; no rollback button |
| Atomic distros | Fedora Silverblue: `rpm-ostree rollback` | First-class |

`patch_deployments.rollback_supported` is set per-OS at execution time. UI shows a "Rollback" button only when true.

### Wake-on-LAN (4.4)

The server can't WoL directly because most clients sit behind NAT. Instead, server picks a **relay agent** — an already-online agent on the same LAN as the target — and sends it a `wol.send <mac_address>` command via the existing commands flow. Relay agent constructs and broadcasts the magic packet on its LAN.

How "same LAN" is determined: agents already report `ip_address` on registration + heartbeat. Server computes a /24 grouping per business (configurable). Targets in the same /24 as an online agent become wake-able.

### Remote registry / config viewer (4.5)

Read-only this stage. Server-side code accepts a registry path / file path and dispatches a read command to the agent. Agent returns the value. Frontend renders a tree view.

| OS | Path types |
|---|---|
| Windows | Registry: `HKLM\Software\...` etc. |
| Linux | `/etc/<file>` |
| macOS | `defaults read <domain>` for any domain |

Write capability gets its own follow-up PRP (way more dangerous).

---

## RBAC (very granular — Stage 4 needs them)

| Permission key | Scope |
|---|---|
| `view.patch_queue.enable` | See pending patches |
| `manage.patch_approvals.enable` | Approve/defer/reject patches |
| `manage.patch_policies.enable` | Configure auto-approve, reboot defaults, max-per-window |
| `manage.maintenance_windows.enable` | Create/edit/delete maintenance windows |
| `execute.patch_deploy.enable` | Trigger an out-of-window emergency patch (single device) |
| `execute.patch_deploy_bulk.enable` | Trigger bulk deploys (>10 devices) — second-employee approval gate |
| `execute.patch_rollback.enable` | Trigger a rollback (where supported) |
| `view.software_catalog.enable` | Browse the catalog |
| `manage.software_catalog.enable` | Add/edit catalog entries |
| `execute.software_install.enable` | Trigger a software install on a device |
| `view.scripts_library.enable` | Browse the scripts library |
| `manage.scripts.enable` | Author/edit scripts (executive-only by default) |
| `sign.scripts.enable` | PGP-sign a script (executive-only — separate from `manage`) |
| `execute.scripts.enable` | Run a signed script on-demand against a device |
| `execute.wol.enable` | Send Wake-on-LAN |
| `view.config_viewer.enable` | Read registry/config values from agents |

Default grants (suggested):
- **Executive**: ALL Stage 4 permissions
- **Admin**: All EXCEPT `manage.scripts.enable`, `sign.scripts.enable`, `execute.patch_deploy_bulk.enable` (a single admin shouldn't trigger 100-device deploys alone)
- **Manager**: `view.*`, `manage.patch_approvals.enable`, `manage.maintenance_windows.enable`, `execute.patch_deploy.enable` (single device only), `execute.software_install.enable`, `execute.scripts.enable`
- **Technician**: `view.*` + `execute.patch_deploy.enable` (single device) + `execute.scripts.enable`
- **Sales**: `view.patch_queue.enable`, `view.software_catalog.enable`, `view.scripts_library.enable` (account conversations)

---

## Safety guardrails

These are NOT optional. The Stage 4 PRP shouldn't be considered execution-ready without each.

1. **Beta flag for the entire stage.** A single env var (`STAGE_4_ENABLED=false`) gates all action-layer routes. First month: internal devices only. Second month: opt-in beta clients. Then GA.

2. **Append-only, hash-chained audit trail.** Every state transition writes to `agent_action_audit` with `prev_hash` linking to the prior row. Tampering is detectable. Audit log retention: **7 years minimum** (regulatory — patches affect compliance scope).

3. **Per-action explicit confirmation.** UI requires:
   - Type the device hostname for any force-reboot
   - Type the device hostname for an emergency-out-of-window patch deploy
   - Type the device hostname AND the script name for a manual script execution

4. **Two-employee approval for bulk operations.** Patch deploy to >10 devices requires:
   - First employee: `execute.patch_deploy.enable` + click "Request bulk deploy"
   - Second employee: `execute.patch_deploy_bulk.enable` + click "Approve bulk deploy"
   - Audit trail records both employee IDs.

5. **PGP-signed scripts only.** A script in `agent_scripts` table can't be `execute.scripts.enable`'d unless `signature_pgp` is set + `signed_by` is an executive. Agent verifies the signature before running. PGP keys are separate from RBAC; signing keys live in a hardware token, not in the database.

6. **Maintenance window enforcement.** Patch deployments outside their assigned window get aborted. Emergency override exists (`execute.patch_deploy.enable`) but every emergency override writes a critical-severity audit row + emails all `manage.patch_approvals` holders.

7. **Reboot deferral has a max.** Even `defer_4h` rebooots after 4 hours. The "no reboot" mode just leaves the patch in `reboot_pending` — it doesn't suppress the alert.

8. **Rollback button only when supported.** Disabled-state UI element with tooltip "rollback unavailable on this OS for this patch type" rather than a generic "may fail."

---

## Implementation sequence (the actual phasing)

### Milestone 1 — Schema + audit infrastructure (week 1)
- All 7 new tables migrated
- `agent_action_audit` write helper service (`backend/services/actionAuditService.js`) with hash-chain logic
- 16 RBAC permission keys seeded
- `STAGE_4_ENABLED` env var added; routes 404 when off
- Tests for the audit hash chain (tamper detection)

### Milestone 2 — Patch approval queue UI (week 2)
- `agent_metrics.os_patches_data` already feeds detection; backend nightly job populates `patch_approvals` from it
- Frontend `PatchQueueView` — list pending patches grouped by business → device → patch
- Approve / defer / reject buttons with required hostname-typed confirmation for "approve all"
- Permission gates wired up

### Milestone 3 — Maintenance windows (week 2-3)
- `MaintenanceWindowsView` — CRUD UI for per-business windows
- Pacific-wall-clock storage (use existing `timezoneService`)
- Server-side cron-style scheduler that materializes `patch_deployments` rows when windows approach
- Tests across DST boundaries (per the existing project DST rule)

### Milestone 4 — Deployment execution (week 3-4)
- Server creates `patch.install` agent commands at scheduled time via existing `/agents/:id/commands`
- Agent: extend `internal/commands/` to handle `patch.install`. Per-OS dispatcher invokes the right package manager.
- Status reporting back through existing `/commands/:id/result` endpoint
- Reboot-policy logic + tray-popup UI on agent side
- Audit-trail entries at every state transition

### Milestone 5 — Rollback + emergency override (week 4)
- Per-OS rollback executor (Windows wusa, dnf history undo, etc.)
- Emergency out-of-window patch UI with full hostname + reason confirmation
- Bulk-deploy second-employee approval flow

### Milestone 6 — Software deployment (week 5)
- `software_catalog` CRUD UI
- `SoftwareInstallView` per-device + per-business
- Reuses the same agent command dispatch + audit-trail infrastructure

### Milestone 7 — Scripting library (week 5-6)
- `ScriptsLibraryView` with versioning + parameter editor
- PGP signature workflow
- Script execution via existing commands flow
- On-event triggers (Stage 1 health checks → script auto-execute via `agent_anomaly_state`)

### Milestone 8 — WoL + config viewer (week 6)
- WoL relay logic (server picks online agent in same /24)
- `ConfigViewerView` — read-only registry / file / `defaults` browser

---

## Validation gates per-milestone

```bash
# Each milestone:
cd backend && npm test          # backend unit + route shape tests
node --check routes/agents.js   # syntax
npx tsc --noEmit                # frontend type check
npx jest                        # frontend Jest suite

# Manual smoke (per-milestone, on testbot canary device):
# - Trigger the relevant action
# - Verify audit-trail row written with correct hash chain
# - Verify state machine transitions in the right order
# - For destructive actions (patch.install, reboot): use a VM snapshot to revert

# DST sanity (Milestone 3+):
# - Set test maintenance window for 2:30 AM Pacific
# - Verify it fires correctly across PST→PDT transition (March)
# - Verify it fires correctly across PDT→PST transition (November)

# Audit-chain tamper detection (Milestone 1):
# - Manually UPDATE one row's payload in agent_action_audit
# - Verify the chain-validator service detects the broken hash
```

---

## Data retention

| Table | Retention | Why |
|---|---|---|
| `agent_action_audit` | 7 years (regulatory) | HIPAA / PCI / SOC 2 audit trails |
| `patch_approvals` | 90 days post-decision | Operational; expired approvals dropped |
| `patch_deployments` | 2 years | Audit + trend analysis |
| `maintenance_windows` | indefinite | Configuration |
| `software_catalog` | indefinite | Configuration |
| `agent_software_installs` | 2 years | Audit |
| `agent_scripts` | indefinite (versioned) | Configuration; old versions archived |

Daily cleanup job runs at 04:00 UTC (after the trends job's 03:00 slot).

---

## Rollback plan (emergency feature-flag-off)

1. Set `STAGE_4_ENABLED=false` in `backend/.env` on testbot.
2. Restart backend. All Stage 4 routes return 404.
3. Existing in-flight `patch_deployments` rows get manually moved to `aborted` via SQL.
4. UI's permission checks naturally hide all Stage 4 components.
5. Audit-trail rows persist for compliance.

For cleaner rollback (drop tables), keep the migrations rollback-able with `DROP TABLE` statements documented in each migration's down section.

---

## Versioning

This is a multi-week effort across many commits. Each milestone bumps a feature version (1.108.0, 1.109.0, ...) and the agent only bumps when its commands handler changes (Milestone 4 onward).

Tag each milestone with `vX.Y.Z` AND a brief changelog entry in `CHANGELOG.md` (which doesn't exist yet — adding it is part of Milestone 1).

---

## Open questions for next session

1. **Authoritative time source for maintenance windows.** Pacific wall-clock is the existing project convention, but multi-tenant MSPs may have clients in other zones. Per-business override field, or stick with a single source-of-truth zone?

2. **PGP signing key custody.** Hardware token is the right answer, but who holds it? Single executive on a Yubikey is the simple option; m-of-n threshold signatures are the secure option.

3. **Beta-flag granularity.** All-Stage-4 vs per-feature. Per-feature gives finer control (e.g., enable patch approval but not bulk deploy). Slightly more code.

4. **Script trigger-on-event source.** Stage 1's `agent_anomaly_state` table can fire scripts on sustained anomaly. But the trigger DSL needs to be flexible enough to not require a code change for each new trigger pattern.

5. **Agent side: how long does a `patch.install` command take to run?** SCM defaults timeout at 5 minutes. Some Windows cumulative updates take 45+. Need a "long-running command" framework on the agent — probably bumping the existing commands timeout for `patch.install` specifically.

---

## Quality Score

**7/10 for the design.**

- ✅ Sub-features scoped, cross-OS coverage planned
- ✅ Database schema concrete enough to build from
- ✅ State machines explicit
- ✅ Safety guardrails enumerated and rationalized
- ✅ RBAC granularity matches the action surface
- ✅ Phasing realistic (4-6 weeks)
- ⚠️ OS-by-OS rollback semantics need flight-test validation; the PRP enumerates them but real-world per-KB Windows rollback behavior varies widely
- ⚠️ Agent command timeout for long patches is flagged as an open question rather than solved
- ⚠️ PGP signing key custody is left to the next session (a real operational question, not a code question)

This PRP is sufficient to start Milestone 1 (schema + audit infrastructure). Milestones 2-8 deserve their own micro-PRPs as we approach them — the design will firm up against reality.
