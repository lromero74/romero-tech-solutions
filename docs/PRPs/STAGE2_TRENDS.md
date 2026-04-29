# PRP: Stage 2 — Trend / Forecast / Anomaly

**Created:** 2026-04-29
**Status:** In progress (overnight execution)
**Parent:** `docs/PRPs/RMM_GAP_CLOSURE_MASTER.md`
**Estimated effort (revised):** 1–2 days actual, given Stage 1 patterns proven and the agent already captures the raw metrics

---

## Context & Goal

Move RTS monitoring from "is it broken right now?" to "is it about to break?" by deriving trends, forecasts, and per-device baselines from the metrics the agent already reports. Most of this is a backend-only effort — the agent doesn't need new collectors for 2.1, 2.2, 2.7. Stages 2.3–2.6 do need new agent code.

### Who benefits
- **Operators / employees** — get "disk full in 8 days" warnings instead of "disk 78% full" snapshots; get "CPU is 3σ above its 7-day mean" instead of "CPU is 92%"
- **Sales** — has a forecasting story, which is what mature RMMs charge premium tiers for

---

## Overnight Scope (this iteration)

| Sub | Theme | Approach | Status |
|---|---|---|---|
| 2.1 | Disk-space forecasting | Linear regression over 30-day `agent_metrics.disk_used_gb` history; alert if forecast < 14 days | ✅ Targeted |
| 2.2 | Performance baselines + 2σ anomaly | Rolling 7-day mean+stddev per (agent, metric); 15-min sustained alert | ✅ Targeted |
| 2.7 | WAN IP change detection | **Server-side** detection on every agent POST (no agent code) | ✅ Targeted |
| 2.3 | SMART pre-fail | Trend `agent_metrics.disk_reallocated_sectors_total` and friends | Stretch |
| 2.4 | Battery health trend | New agent collector | **Next session** |
| 2.5 | GPU monitoring | New agent collector (NVIDIA + AMD + macOS + Windows) | **Next session** |
| 2.6 | Power-policy audit | New agent collector | **Next session** |

The four "stretch / next" items all need new agent collectors with cross-OS implementations. Splitting them out lets us land the high-value backend-only forecast work first and ship.

---

## Architecture

### Storage strategy

Per the master PRP §1, time-series data uses **dedicated narrow tables**, not the generic `agent_check_results`. Schema for the three Stage 2 tables this PR adds:

```sql
-- 1) Disk forecasts: latest snapshot per device (one row per agent).
CREATE TABLE agent_disk_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  -- Latest forecast, computed nightly by agentMonitoringService.
  growth_gb_per_day NUMERIC(12, 4),  -- positive = growing; negative = shrinking
  days_until_full NUMERIC(10, 2),    -- null when growth is non-positive or capacity unknown
  forecast_full_at TIMESTAMPTZ,      -- now() + (days_until_full days), null when n/a
  current_used_gb NUMERIC(10, 2),
  current_total_gb NUMERIC(10, 2),
  current_percent NUMERIC(5, 2),
  sample_count INT NOT NULL,         -- number of metric samples used in regression
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_disk_forecasts_unique UNIQUE (agent_device_id)
);

-- 2) Per-metric rolling baselines (mean ± stddev). Updated nightly.
CREATE TABLE agent_metric_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  metric_type VARCHAR(50) NOT NULL,  -- 'cpu_percent', 'memory_percent', 'disk_percent', 'load_average_1m'
  mean NUMERIC(12, 4) NOT NULL,
  stddev NUMERIC(12, 4) NOT NULL,
  sample_count INT NOT NULL,
  window_days INT NOT NULL DEFAULT 7,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_metric_baselines_unique UNIQUE (agent_device_id, metric_type)
);

-- 3) WAN IP change history. Append-only on detected change.
CREATE TABLE agent_wan_ip_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_device_id UUID NOT NULL REFERENCES agent_devices(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  public_ip INET NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- previous_ip for "changed from X to Y" UI rendering. Null on first
  -- recorded sighting for an agent (no prior baseline).
  previous_ip INET
);
```

### Why this shape

- **Disk forecast = one row per agent** (`UNIQUE (agent_device_id)`) — UPSERT on each nightly run; old values overwritten. Simpler than a history table; "yesterday's forecast" is rarely actionable.
- **Baselines = one row per (agent, metric)** — same upsert pattern. Six metric types per device max.
- **WAN IP = append-only on change** — mostly empty for stationary devices; only inserts when source IP differs from the previous row.

### Computation

The nightly job lives in `backend/services/agentMonitoringService.js` (extending the existing service, not adding a new daemon). Runs at 03:00 UTC.

- **Disk forecast**: SQL aggregate using Postgres' built-in `regr_slope(y, x)` and `regr_intercept(y, x)` — no Python/NumPy. Run per-device against last 30 days of `agent_metrics`. Require ≥ 24 samples (skip otherwise — too little signal).
- **Baselines**: per-(device, metric) rolling 7-day `avg()` + `stddev()`. Same SQL aggregate path.
- **WAN IP**: not nightly — detected synchronously in agent-auth middleware on every authed POST. Cheap (one indexed lookup + occasional insert).

### Anomaly detection (real-time, not nightly)

Sustained 2σ anomaly detection runs on each metrics POST in `agents.js`:

1. For each metric in the incoming payload, look up the device's baseline.
2. If `|metric_value - mean| > 2 * stddev`:
   - Insert/update `agent_anomaly_state` with `anomaly_started_at = now()` (only on first occurrence).
   - If the existing row's `anomaly_started_at` is more than 15 minutes old, fire an alert.
3. If `|metric_value - mean| <= 2 * stddev`, clear the anomaly state.

This pushes anomaly tracking into a thin state table (`agent_anomaly_state`, single row per (agent, metric)) so we don't false-fire on transient spikes.

### Alert wiring

All three new alert types fire through the **existing** `alertEscalationService.processCheckResult`-equivalent flow. Reuses the seeded `'health_check'` `alert_configurations` row but switches the `alert_type` field on each `alert_history` insert:

| Trigger | alert_type | Severity |
|---|---|---|
| Disk forecast < 14 days at full | `disk_forecast` | `critical` |
| Disk forecast < 30 days at full | `disk_forecast` | `warning` |
| Sustained 2σ metric anomaly (>15min) | `metric_anomaly` | `warning` |
| WAN IP changed | `wan_ip_change` | `info` |

**Caveat**: existing `alert_subscribers.alert_types[]` defaults don't include any of these — same opt-in story as Stage 1's `'health_check'`. Ratified by Louis: no surprise spam from rollout, no real clients yet.

### Retention

Per master PRP §5:
- `agent_disk_forecasts` — overwritten nightly; effectively zero retention overhead
- `agent_metric_baselines` — same
- `agent_wan_ip_history` — keep 2 years (low volume, useful for trend reports)
- `agent_anomaly_state` — single row per (agent, metric), self-clearing

No new retention cron job needed for this PR.

### RBAC permission keys

| Key | Roles |
|---|---|
| `view.agent_trends.enable` | executive, admin, manager, technician |
| `view.agent_disk_forecast.enable` | executive, admin, manager, technician (subset of `view.agent_trends`) |
| `manage.agent_baselines.enable` | executive, admin (override thresholds per device) |

Sales gets `view.agent_trends.enable` for account conversations.

---

## Implementation Blueprint

### Step 0 — Backup + migration

```bash
ssh testbot "PGPASSWORD=... pg_dump ... > ~/rts-pre-stage2-$(date +%s).sql"
psql -f backend/migrations/20260429_stage2_trends_schema.sql
node backend/migrations/20260429_stage2_trends_permissions.js up
```

### Step 1 — Backend services

- `backend/services/diskForecastService.js` — pure forecast math (testable without DB) + DB-querying wrapper
- Extend `backend/services/agentMonitoringService.js` — register a `computeNightlyTrends()` method, schedule it for 03:00 UTC
- `backend/services/anomalyDetectionService.js` — pure anomaly-decision function + DB state wrapper

### Step 2 — Backend routes

Append to `backend/routes/agents.js`:
- `GET /:agent_id/disk-forecast` — latest forecast row + sparkline data (last 30 days of disk_used_gb samples)
- `GET /:agent_id/baselines` — all baseline rows for the agent
- `GET /:agent_id/wan-ip-history` — last 50 rows
- `POST /:agent_id/baselines/recompute` — manual trigger (executive/admin only)

WAN IP detection lives in `backend/middleware/agentAuthMiddleware.js` (or a new middleware run after `authenticateAgent`). Records `req.ip` against `agent_wan_ip_history`.

### Step 3 — Frontend

- `src/services/trendsService.ts` — typed API client
- `src/components/admin/agent-details/TrendsTab.tsx` — new tab next to Health
- `src/components/admin/agent-details/DiskForecastChart.tsx` — uses recharts (already a dep)
- `src/components/admin/agent-details/BaselineDeviationChart.tsx`

Tests for each — Jest component + service tests in same edit batch (TDD).

### Step 4 — Smoke test

- Trigger nightly job manually; confirm `agent_disk_forecasts` and `agent_metric_baselines` rows land for each agent
- Confirm WAN IP history row inserts (or doesn't, since the local agent's source IP shouldn't change)
- Verify Trends tab renders for the canary agent

---

## Validation Gates

```bash
# Backend
cd backend && npm test
node --check routes/agents.js
node --check services/agentMonitoringService.js
node --check services/diskForecastService.js
node --check services/anomalyDetectionService.js

# Frontend
npx tsc --noEmit
npx jest
npm run lint

# DB
ssh testbot 'psql -c "\\d agent_disk_forecasts" -c "\\d agent_metric_baselines" -c "\\d agent_wan_ip_history"'
```

---

## Rollback

- Migrations are additive. Drop the three new tables to revert: `DROP TABLE agent_disk_forecasts, agent_metric_baselines, agent_wan_ip_history, agent_anomaly_state CASCADE;`
- Permission rollback: `DELETE FROM permissions WHERE permission_key LIKE 'view.agent_trends.%' OR permission_key LIKE 'view.agent_disk_forecast.%' OR permission_key LIKE 'manage.agent_baselines.%';`
- Nightly job: setting `enabled=false` in code disables it; existing rows persist harmlessly.

---

## Versioning

- Frontend: bump to `v1.103.0` on commit (new feature)
- Agent: no bump needed — Stage 2.1, 2.2, 2.7 require zero agent changes

---

## Quality Score

**8/10** — execution-ready for the 3 in-scope sub-features. Stages 2.3–2.6 split into a follow-up PRP because their cross-OS surface area is comparable to Stage 1.
