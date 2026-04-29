# Stage 2 — Morning Deploy Checklist

**Date prepared:** 2026-04-29 overnight
**Status:** Code committed + pushed to `main`. **NOT YET DEPLOYED** to testbot. DB migrations ARE applied.

This document is a runbook for the morning. Work through it top-to-bottom; the verification steps tell you when each piece landed correctly.

---

## What's already done

- ✅ Code merged to `main` in commits `9a5aadf` (Stages 2.1+2.2+2.7+frontend) and `<Stage 2.3 commit>` (SMART trend + UI)
- ✅ `agent_disk_forecasts`, `agent_metric_baselines`, `agent_anomaly_state`, `agent_wan_ip_history`, `agent_smart_trends` tables created on testbot
- ✅ 5 new RBAC permissions seeded with role grants
- ✅ Backup taken: `~/rts-pre-stage2-20260429-064820.sql` (~870 MB) — keep until Stage 2 has run a full week without issue
- ✅ Frontend version bumped to `v1.103.0`

## What's left

1. Deploy backend + frontend
2. Verify nightly job populates the new tables
3. Eyeball Trends tab in the dashboard
4. Decide whether to also restart the canary agent (no agent code changed for Stage 2 — restart is unnecessary unless you want fresh metrics in the historical buffer)

---

## Step 1 — Deploy

```bash
ssh testbot "cd ~/romero-tech-solutions && git pull --ff-only origin main && ./service.sh restart --prod"
```

Expected output: `Backend restarted` + `Romero Tech Solutions restarted (frontend rebuilt + backend up)`.

## Step 2 — Verify version is live

```bash
curl -s https://romerotechsolutions.com/version.json
```

Expected: `"version": "1.103.0"`.

## Step 3 — Watch the nightly trends boot

The first trends run is delayed 5 minutes after backend boot. Tail the log:

```bash
ssh testbot "sudo journalctl -u romero-tech-solutions-backend --since '6 minutes ago' | grep -E 'Stage 2|trend|forecast|baseline|SMART'"
```

Expected (roughly 5 min after restart):
```
📈 Stage 2 nightly trends scheduled for ...
📈 Stage 2 nightly trends: starting...
📈   disk forecasts: N upserted (M candidates)
📈   metric baselines: N upserted across 6 metric types
📈   SMART trends: N upserted
```

If you see "candidates" but "0 upserted" for forecasts: that means agents have <24 metric samples in the last 30 days. The canary mac has 21k+ samples — it will produce a forecast.

If you see "0 upserted" for baselines: that means agents have <1000 samples per metric. Same — the canary will satisfy this.

If you see neither line within ~6 minutes of restart, something's wrong. Check `journalctl -u romero-tech-solutions-backend --since '10 minutes ago'` for stack traces.

## Step 4 — Verify rows landed in the DB

```bash
ssh testbot "PGPASSWORD=\$(grep ^DB_PASSWORD ~/romero-tech-solutions/backend/.env | cut -d= -f2) psql -h localhost -U romero_app -d romerotechsolutions -c \"SELECT 'forecasts' as table, count(*) FROM agent_disk_forecasts UNION ALL SELECT 'baselines', count(*) FROM agent_metric_baselines UNION ALL SELECT 'wan_ip', count(*) FROM agent_wan_ip_history UNION ALL SELECT 'smart', count(*) FROM agent_smart_trends;\""
```

Expected (with 1 canary agent reporting):
- `forecasts` ≥ 1
- `baselines` between 1 and 6 (one per metric type with sufficient samples)
- `wan_ip` ≥ 1 (recorded as soon as the agent next authenticates)
- `smart` ≥ 1

## Step 5 — Look at the canary's forecast

```bash
ssh testbot "PGPASSWORD=\$(grep ^DB_PASSWORD ~/romero-tech-solutions/backend/.env | cut -d= -f2) psql -h localhost -U romero_app -d romerotechsolutions -c \"SELECT current_used_gb, current_total_gb, current_percent, growth_gb_per_day, days_until_full, sample_count FROM agent_disk_forecasts;\""
```

Expected for the canary mac: a healthy disk with non-trivial growth (e.g., 0.1–2 GB/day from logs/Time Machine/Docker layers) and `days_until_full` in the hundreds (or null if growth is non-positive).

## Step 6 — Open the dashboard

1. Go to https://romerotechsolutions.com → log in as employee.
2. Navigate to your mac's Agent Details.
3. Click the **Trends** tab (next to Health).
4. Expected:
   - **Disk-space forecast** section with stat cards + chart
   - **SMART pre-fail trend** section (likely all zeros / 42°C max temp on a healthy mac)
   - **Performance baselines** table with 1–6 rows
   - **WAN IP changes** with at least the first sighting
5. Mobile sanity: Open Chrome DevTools → toggle 375px viewport → confirm the tab is readable.

## Step 7 — Confirm anomaly evaluation hooks fire on metrics POST

Watch the logs while the canary agent posts a metric (every 60s):

```bash
ssh testbot "sudo journalctl -u romero-tech-solutions-backend -f | grep -E 'anomaly|baseline'"
```

You should see no errors. Anomalies WILL NOT fire alerts for the canary because metrics are within 2σ on a healthy idle machine — that's expected.

## Step 8 — (optional) Force a fresh trends recomputation

If you don't want to wait until 03:00 UTC for the next run:

```bash
ssh testbot "cd ~/romero-tech-solutions/backend && node -e \"
import('./services/agentMonitoringService.js').then(async m => {
  const r = await m.computeNightlyTrends();
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
\""
```

## Step 9 — Touch the agent (NOT REQUIRED for Stage 2)

Stage 2 needed zero agent changes — the existing v1.26.2 agent already produces all the metrics the trend services consume. **Do not re-deploy the agent**.

(Stages 2.4 / 2.5 / 2.6 will need a v1.27.0 agent; that's a future session.)

---

## Things that could go wrong (and how to recognize them)

### "Stage 2 nightly trends scheduled for ..." line is missing
Means `startNightlyTrends()` didn't fire. Check `backend/server.js` actually got restarted:
```bash
ssh testbot "sudo systemctl status romero-tech-solutions-backend"
```

### Forecast `growth_gb_per_day` is wildly negative
Could be a backup/cleanup that just happened (real data shrinking) — fine, it'll level out next run. If it persists, the regression has too few samples; raise `MIN_SAMPLES_FOR_FORECAST` or check the canary's `agent_metrics.disk_used_gb` history.

### Trends tab shows "Loading…" forever
Open browser devtools → Network. Look for failed requests to `/api/agents/<id>/disk-forecast` etc. Most likely a permission issue — verify your role has `view.agent_trends.enable`:
```bash
ssh testbot "PGPASSWORD=... psql ... -c \"
  SELECT r.name, p.permission_key
  FROM roles r
  JOIN role_permissions rp ON rp.role_id = r.id
  JOIN permissions p ON p.id = rp.permission_id
  WHERE p.permission_key LIKE 'view.agent_trends.%' OR p.permission_key LIKE 'view.agent_disk_forecast.%';
\""
```

### Anomaly evaluation logs `agentInfo.rows` errors
Bug guard already pinned by tests, but if you see this in the logs the route handler regressed. Roll forward with a fix.

### `req.ip` records as ::1 or 127.0.0.1
Means Express isn't honoring `X-Forwarded-For` from nginx. Check `app.set('trust proxy', ...)` at the top of `server.js`. Test with:
```bash
ssh testbot "sudo journalctl -u romero-tech-solutions-backend --since '2 minutes ago' | grep wan-ip"
```
The recorded IP should be the public IP of your dev mac, not a localhost address.

---

## When you're satisfied

- Mark Stage 2 ✅ in the master PRP (already pre-marked code-complete; flip to "shipped" when verified)
- Optionally `/schedule` an agent in 1 week to check baseline computation has been running nightly without errors

---

## Stage 2.4 / 2.5 / 2.6 (next session)

These need a new Go agent collector each. Pattern is identical to Stage 1's `internal/<name>/` packages with table-driven cross-OS tests. Battery is the easiest (small surface area, mac/Linux/Win all have clean APIs); GPU is the hardest (3 vendors × 3 OSes); power-policy is medium.

Suggested sub-stage order:
1. **2.4 Battery** — small win, immediate dashboard value for laptop fleets
2. **2.6 Power-policy** — small audit, helps with compliance reporting
3. **2.5 GPU** — bigger lift, mostly relevant to CAD/render/dev workstations

Estimate: 2–3 days for all three combined, given Stage 1 + Stage 2 patterns.
