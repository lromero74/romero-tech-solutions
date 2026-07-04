# PRP: Migrate RTS Production off fedora.local → AWS Lightsail

**Status:** RTS CORE MIGRATED & LIVE (2026-07-04). MeshCentral pending.
**Date:** 2026-07-04
**Author:** drafted with Claude
**Scope note:** covers **RTS backend + Postgres AND MeshCentral** (remote
desktop). Decided to split the wave: RTS core cut over first; MeshCentral
follows next session (safe because RTS↔Mesh is loosely coupled via
`MESHCENTRAL_URL` — Lightsail RTS drives fedora's MeshCentral over the
internet meanwhile, so remote desktop never goes down).

---

## Execution Status (2026-07-04)

**✅ RTS core is live on Lightsail.**
- Instance: `rts` (`micro_3_0`, us-east-1, static IP **54.208.154.115**,
  SSH alias `rts-ls`, key `~/.ssh/lightsail/rts_us-east-1.pem`).
- Applied: 2 GB swap; Postgres 16 tuned (96 MB buffers, 30 conns,
  loopback); Node 22; nginx serving `dist/` static + proxying `api.` →
  :3001; self-signed origin cert (CF Full).
- **Frontend build lesson (now proven):** the micro CANNOT build the Vite
  frontend in place (thrashed swap, timed out). Build on the dev machine /
  fedora and ship `dist/` — matches ZenithGrid's ship pattern. The eventual
  RTS ship script must build the artifact off-box.
- DB: single-DB `pg_dump` of `romerotechsolutions` → restored (owned by
  `romero_app`). NOT `pg_dumpall` (authentik/zenithgrid stayed on fedora).
- DNS cut over 4 records → proxied A at the IP: `api`, `www`, apex,
  `employee`. MX/TXT (email) untouched. `auth.` (Authentik) left on fedora.
- Verified live: public API log-confirmed on Lightsail; SPA on all 4 hosts;
  Cognito login reachable; **live RTS agents heartbeating/posting metrics
  (200)**; ZenithGrid licensing endpoints working; RAM ~490 MB used /
  ~420 MB available, swap idle.
- fedora `rts.service` + `rts-frontend.service` **stopped + disabled**
  (warm standby — data preserved, won't auto-resurrect a 2nd scheduler).

**⏳ Remaining (next session):**
1. MeshCentral migration (see the MeshCentral section) — still on fedora,
   RTS calls it cross-host meanwhile.
2. Verify a real Stripe webhook lands on Lightsail.
3. Optional: add `origin.romerotechsolutions.com` DNS-only A for SSH.
4. Write-delta: ~30 min of agent metrics landed on fedora between dump and
   cutover (small metrics-history gap, non-critical).
5. After a standby window: drop `romerotechsolutions` DB from fedora
   postgres-box (leave `authentik`), fully decommission fedora RTS.

**Rollback:** flip the 4 CF records back to the tunnel CNAME
(`de498114-…cfargotunnel.com`) + re-enable fedora `rts.service`.

---

## Context & Motivation

RTS production (backend + Postgres + MSP-agent monitoring) currently runs in
distrobox containers on **fedora.local** — Louis's home workstation, behind
T-Mobile CGNAT, reachable only via a Cloudflare tunnel. This was itself a
migration *from* AWS EC2 (`testbot`) on 2026-04-29. ZenithGrid was later
pulled *off* fedora onto a dedicated **AWS Lightsail** instance (2026-06-13)
and has run cleanly there since.

**Why move RTS too — concrete signals, not just tidiness:**

1. **Disk-level corruption on fedora.** A `pg_dump` of the RTS DB fails on
   `agent_metrics_corrupted` with `could not read block 16618 in file
   "base/16385/16640": Input/output error`. That's a *storage* read failure
   (btrfs), not app corruption — evidence the fedora disk is degrading under
   a DB it also shares with Steam/Brave/daily-driver load.
2. **Home-network fragility.** CGNAT + a single outbound Cloudflare tunnel +
   a workstation that reboots/sleeps. The distrobox+systemd "silent listener
   loss" failure mode is a known caveat already papered over with watchdogs.
3. **Consistency.** ZenithGrid already proved the Lightsail pattern. Running
   RTS the same way means one operational model, not two.

**Intended outcome:** RTS running natively on its own Lightsail instance
(no distrobox), Postgres local to that box, public ingress via
Cloudflare-proxied A-records → the static IP (mirroring ZenithGrid), fedora
RTS kept as a stopped warm-standby for ~30 days, then decommissioned.

**⚠️ fedora + postgres-box are NOT fully decommissioned by this migration.**
`postgres-box` on fedora hosts three databases: `romerotechsolutions` (RTS,
the thing we're moving), `zenithgrid` (ZenithGrid warm-standby, dormant),
and **`authentik`** — the SSO/identity provider for the **stream-box**
streaming app (`~/authentik` docker-compose + `~/STREAM-SETUP`, currently
stopped but intentional, not junk). So after RTS moves, postgres-box and
fedora stay alive for Authentik/stream-box. The RTS migration only removes
RTS's dependency on fedora — it does NOT let us retire the box or its
Postgres. Decommission scope here is *RTS's* fedora footprint only
(rts-box backend + frontend, mesh-box, and RTS's DB), not postgres-box
itself.

---

## Current-state facts (measured 2026-07-04)

| Thing | Value |
|---|---|
| RTS DB size | **~3.0 GB** (`agent_metrics` alone 1.7 GB / 136k rows) |
| Corrupt table | `agent_metrics_corrupted` (475 MB, 63k rows) — unreadable blocks |
| Agent devices | **23 total, only 3 active in last 24h** |
| Backend | `node server.js` on :3001, distrobox `rts-box`, systemd `--user` unit that `source`s `.env` then execs node |
| Frontend | **separate service** `rts-frontend.service` — static `dist/` via `npx serve` in `rts-box`. Migration must stand up both backend + frontend (or have the Lightsail nginx serve `dist/` directly, like ZenithGrid). |
| Corrupt table | **RESOLVED 2026-07-04** — view repointed to live `agent_metrics`, `agent_metrics_corrupted` dropped, full `pg_dump` now clean. Migration `20260704_fix_package_manager_view_drop_corrupt.sql`. |
| Postgres | in distrobox `postgres-box`, `USE_SECRETS_MANAGER=false`, local creds in `.env` |
| Public ingress | Cloudflare-proxied hostnames (`api.` / `www.` / apex `romerotechsolutions.com`, `mesh.`) → cloudflared tunnel → rts-box:3001 |
| AWS-managed glue (does NOT move) | Cognito pool `us-east-1_YCT3O4xRZ`, SES, Stripe (+ webhooks), any S3 uploads |
| Recently added on fedora | ZenithGrid licensing: 2 tables + 1 permission (migrated), `ZENITHGRID_LICENSE_SIGNING_PRIVATE_KEY` in `.env` |

**The single most de-risking fact:** agents and all public traffic reach RTS
via **Cloudflare-proxied hostnames**, never a raw IP. So the cutover is a
DNS repoint (tunnel → Lightsail static IP), exactly the ZenithGrid pattern —
agents keep the same `api.romerotechsolutions.com` and never know the origin
moved. This collapses the scary "re-point every agent" problem into "flip CF
DNS records," provided agents don't pin the origin TLS cert (see Risks).

---

## Prerequisite (do FIRST, independent of the migration)

**Resolve the corrupt table before any migration dump.** A clean `pg_dump`
is the backbone of the cutover and it currently can't complete. Options:

1. The live table is `agent_metrics` (1.7 GB, healthy). `agent_metrics_corrupted`
   is a quarantined old copy with **no incoming FKs**. Its only live
   dependency is the view `agent_package_manager_summary`, which is
   (apparently mistakenly) defined against the *corrupted* table instead of
   the live one — see `backend/migrations/036_add_package_manager_tracking.sql`.
2. Plan: **repoint the view to `agent_metrics`**, confirm the app's
   package-manager summary still renders, then **`DROP TABLE
   agent_metrics_corrupted`** — after which `pg_dump` succeeds cleanly.
3. If any rows in the corrupted table are genuinely needed (they appear not
   to be — it's a quarantine copy), extract what's readable first with a
   block-skipping `COPY`. Default assumption: drop it.

This also closes out the two loose ends already on the board (view repoint +
corrupt-table drop) — fold them in here as migration prerequisites.
**DONE 2026-07-04** — view repointed, corrupt table dropped, full `pg_dump`
verified clean. Migration `20260704_fix_package_manager_view_drop_corrupt.sql`.

---

## What moves vs. what stays (per-DATABASE, not per-box)

`postgres-box` hosts three databases. **We migrate the RTS database ONLY.**
Do NOT `pg_dumpall` the cluster — that would drag stream-box's Authentik and
the ZenithGrid standby along. Dump/restore the single `romerotechsolutions`
database (`pg_dump ... romerotechsolutions`, which is already how the
prereq dumps were taken — single-DB, not `pg_dumpall`).

| Data on fedora | Action | Where it lands |
|---|---|---|
| `romerotechsolutions` DB | **MOVE** | Lightsail local Postgres |
| MeshCentral `meshcentral-data/` (NeDB files) | **MOVE** | Lightsail (co-located) |
| RTS `.env` (incl. ZenithGrid license signing key) | **MOVE** | Lightsail `~/.../backend/.env` |
| `authentik` DB (stream-box SSO) | **STAYS** | fedora postgres-box — untouched |
| `zenithgrid` DB (warm-standby) | **STAYS** | fedora postgres-box — dormant |
| `~/authentik` compose + `~/STREAM-SETUP` + stream-box | **STAYS** | fedora |

So post-migration fedora still runs postgres-box (for Authentik + the
ZenithGrid standby); only RTS's tables leave it. Nothing stream-box needs is
touched.

---

## Target architecture (cost-optimized: everything on one `micro`)

```
public internet
   → Cloudflare DNS (proxied A → Lightsail static IP, SSL mode Full)
   → Cloudflare edge (universal cert)
   → nginx on Lightsail :443  (self-signed origin cert; ALSO serves the
        frontend dist/ statically — no separate `npx serve` process)
   → node server.js :3001     (RTS backend, native systemd unit)
   → MeshCentral :4434         (native, co-located; `mesh.` grey-cloud + LE)
   → local PostgreSQL 16 (127.0.0.1:5432, tuned small)
```

- **Instance: `micro_3_0` — 1 GB RAM / 2 vCPU / 40 GB / $7/mo, us-west-2 or
  us-east-1.** Deliberate cost choice (matches the saltavidas box). RTS's
  expected user count is low — lower than saltavidas. **This is TIGHT: RAM
  (1 GB) is the binding constraint**, so the micro-specific tuning below is
  mandatory, not optional. Rough light-load budget: Postgres ~150–250 MB +
  RTS Node ~150–250 MB + MeshCentral ~150–250 MB + nginx ~40 MB + Ubuntu
  ~130 MB ≈ 600–900 MB — fits at rest, near-zero slack for spikes.
  **Escape hatch:** if it can't hold, `snapshot → create a larger instance
  from it → repoint DNS`. Resizing UP is easy; only jump to `small_3_0`
  ($12/2 GB) if the micro genuinely can't cope. Starting on micro is a
  low-risk, low-cost experiment.
- **OS:** Ubuntu 24.04 (matches ZenithGrid, native Node + Postgres).

### Micro-specific tuning (MANDATORY on a 1 GB box)

1. **2 GB swapfile** — non-negotiable. Turns an OOM-kill into a brief
   slowdown. `fallocate -l 2G /swapfile; chmod 600; mkswap; swapon;` +
   `/etc/fstab` entry. Set `vm.swappiness=10` so it's a cushion, not a
   crutch.
2. **No separate frontend process.** fedora runs the RTS frontend as
   `rts-frontend.service` (`npx serve dist/` — a whole Node process). On
   Lightsail, **nginx serves `dist/` statically** — reclaims ~50–80 MB and
   one process. There is NO `rts-frontend` systemd unit on Lightsail.
3. **Tune Postgres down** (`postgresql.conf`): `shared_buffers = 96MB`,
   `effective_cache_size = 256MB`, `work_mem = 4MB`, `maintenance_work_mem
   = 64MB`, `max_connections = 30` (RTS uses a small pool). Prevents
   Postgres from assuming it owns the box.
4. **Agent-metrics retention is now load-bearing, not a follow-up.** On a
   40 GB disk with `agent_metrics` growing forever, add a prune/rollup job
   early (e.g. keep raw metrics 30–90 days, roll older into daily
   aggregates). Track disk with an alert.
5. **Basic memory/disk monitoring + alerting** from day one so pressure is
   visible before it becomes an OOM. MeshCentral during an active
   remote-desktop session is the main RAM/CPU wildcard — watch it after
   cutover.
- **DNS:** the RTS hostnames become Cloudflare-proxied A-records → the new
  static IP (SSL mode Full), replacing the tunnel CNAMEs. Add a DNS-only
  `origin.romerotechsolutions.com` A → the IP for SSH/origin pinning (the
  ZenithGrid `origin.bigtruckincrypto.com` pattern).
- **Secrets:** copy `.env` verbatim via `scp -3` (Mac as relay, never
  printed). Includes DB creds, Cognito, SES, Stripe, and the ZenithGrid
  license signing key. **The license signing key must come along** or be
  regenerated (which would also require re-updating ZenithGrid's embedded
  public key + a ZenithGrid patch release — prefer bringing it along intact).

---

## Migration steps (ordered)

1. **Prereq — DONE 2026-07-04:** repointed the `agent_package_manager_summary`
   view → `agent_metrics`; dropped `agent_metrics_corrupted`; full `pg_dump -Fc`
   confirmed clean. (`20260704_fix_package_manager_view_drop_corrupt.sql`.)
2. **Provision** the `micro_3_0` instance (static IP, Ubuntu 24.04). Install
   Node, PostgreSQL 16, nginx, MeshCentral. Harden (ufw, fail2ban, key-only
   SSH). **Immediately add the 2 GB swapfile + `vm.swappiness=10`** (micro
   tuning #1 — do this before anything else consumes RAM).
3. **Install RTS natively:** clone the repo, `npm ci`, `npm run build` the
   frontend, create a systemd *system* unit `rts.service` (`node server.js`
   :3001). **nginx serves `dist/` statically** (micro tuning #2 — NO
   `rts-frontend` process) and reverse-proxies `/api` → :3001, with a
   self-signed origin cert (`/etc/ssl/rts/`), CF SSL mode Full.
4. **Tune Postgres** (micro tuning #3) before restore: `shared_buffers=96MB`,
   `effective_cache_size=256MB`, `work_mem=4MB`, `max_connections=30`.
5. **DB restore:** `pg_dump -Fc` on fedora (single DB — `romerotechsolutions`
   ONLY, never `pg_dumpall`) → `pg_restore` on Lightsail's local Postgres.
   Create the `romero_app` role + DB matching `.env`. Verify row counts vs
   fedora (esp. `agent_metrics`, `agent_devices`, `users`,
   `zenithgrid_licenses`, `zenithgrid_license_activations`).
6. **MeshCentral:** install natively, copy `~/meshcentral/meshcentral-data/`
   (NeDB, ~32 MB) from fedora. Wire `mesh.romerotechsolutions.com` as
   **CF grey-cloud / DNS-only + real Let's Encrypt** on the box (NOT CF
   Full/self-signed — keeps MeshAgent cert validation clean; see Risks).
   **Test carrying over the existing mesh cert material first** — agents that
   pin the cert hash may reconnect without re-install.
7. **Copy secrets:** RTS `.env` via `scp -3`. Verify Cognito/SES/Stripe env
   vars present; verify the ZenithGrid license signing key line survived
   intact (`\n`-escaped single line — the exact thing that broke twice when
   hand-edited; copy the whole file, don't re-type it). Set
   `MESHCENTRAL_URL` to the new mesh endpoint.
8. **Smoke test with DNS still on fedora:** hit the Lightsail box directly by
   IP/origin hostname (bypassing CF) — `/api/health`, frontend loads, login
   via Cognito, an agent check-in POST, a Stripe webhook replay, a
   remote-control session start, a ZenithGrid `/activate` round-trip.
   **Watch RAM/swap under this load** — first real signal of whether the
   micro holds. Nothing public flips yet.
9. **Cutover:** lower CF DNS TTLs beforehand. Repoint each hostname's CF
   record from the tunnel CNAME → proxied A to the Lightsail IP (`mesh.` →
   grey-cloud DNS-only per step 6). Watch the 3 active agents + mesh agents
   reconnect; watch backend logs + memory.
10. **Verify post-cutover:** agent check-ins landing, frontend, login, Stripe
    webhook delivery (update the webhook URL in Stripe if it targets a raw
    origin rather than the CF hostname), SES sends, MeshCentral remote
    sessions, ZenithGrid licensing endpoints. **Monitor RAM/swap/disk for the
    first days** — this is where you learn if micro was the right call or if
    you resize up.
11. **Warm standby:** stop (don't delete) the fedora rts-box + mesh-box; leave
    postgres-box running (Authentik still needs it — do NOT stop postgres-box).
    Keep ~30 days as rollback. Document the cutover timestamp for the
    write-delta window.
12. **Decommission fedora RTS** after the standby window: stop/disable the RTS
    + mesh units, drop the `romerotechsolutions` DB from postgres-box (leave
    `authentik`), reclaim space, update CLAUDE.md infra notes.

---

## Risks & mitigations

- **⚠️ TOP RISK — RAM exhaustion on the micro (1 GB).** Postgres + RTS Node +
  MeshCentral + nginx share 1 GB. At rest it fits (~600–900 MB), but an active
  MeshCentral remote-desktop session (screen relay) + agent-ingestion + a
  Postgres query burst could spike past it. Mitigations: the mandatory 2 GB
  swap (cushions spikes), tuned Postgres (caps its appetite), nginx-static
  frontend (removes a whole Node process), memory alerting. **Acceptance
  test:** during step-8 smoke testing, drive a remote-control session +
  concurrent agent check-ins and watch `free -m` / swap usage. If it's
  swapping hard under light load, resize up to `small_3_0` ($12/2 GB) via
  snapshot before cutover rather than limping. This risk is the whole reason
  the micro is framed as an *experiment with an escape hatch*, not a
  commitment.
- **Agent TLS pinning.** If agents pin the *origin* cert (not just the CF
  edge cert), the CF Full-mode self-signed origin cert will fail validation —
  the exact "agent reconnect pain" the ZenithGrid/MeshCentral migration
  called out. **Verify before cutover** whether the RTS agent validates the
  full chain or trusts CF's edge. If it pins, agents need a re-trust/re-deploy
  (only 3 active, so manageable, but must be known first).
- **Stripe webhooks.** If the webhook endpoint is registered against a raw
  origin/tunnel URL rather than `https://...romerotechsolutions.com/...`,
  update it in the Stripe dashboard at cutover. Verify signature secret
  (`STRIPE_WEBHOOK_SECRET`) travels in `.env`.
- **Write-delta on rollback.** Any agent metrics / user actions that land on
  Lightsail post-cutover would be lost if we roll back to fedora. Mitigate:
  short cutover window, documented timestamp, `agent_metrics` re-sync plan if
  rollback is needed.
- **License signing key.** Single point that, if lost/mangled in transit,
  breaks ZenithGrid activation. Copy `.env` wholesale; verify the key line
  post-copy; do NOT hand-retype it.
- **DB size growth on a 40 GB disk.** `agent_metrics` grows continuously; on
  the micro's 40 GB (vs 80/160 on bigger tiers) this bites sooner. The
  retention/rollup policy is **in scope for this migration** (micro tuning
  #4), not a someday-follow-up — plus a disk-usage alert.
- **Cognito/SES region vs micro region.** Cognito + SES are `us-east-1`.
  saltavidas's micro is in `us-west-2`. Cross-region adds a little latency to
  Cognito/SES calls but nothing data-residency-breaking. Prefer **us-east-1**
  for the RTS micro to keep auth/email local; only pick us-west-2 if you want
  it beside saltavidas for management convenience.

## MeshCentral (remote desktop) — migrates in the same wave

RTS uses MeshCentral for technician remote-control sessions. The coupling is
**loose**: RTS calls it over HTTPS at a configurable `MESHCENTRAL_URL`
(currently `https://mesh.romerotechsolutions.com`) with token auth
(`MESHCENTRAL_TOKEN_NAME`/`_PASS`) — see `backend/services/meshcentralService.js`.
So RTS doesn't *require* mesh co-located, but leaving mesh on fedora would
keep remote-desktop tethered to the exact box we're escaping. Move it too.

**Facts:**
- Data is **NeDB files** (`~/meshcentral/meshcentral-data`), **~32 MB total**
  (`meshcentral.db` config/devices is only 177 KB; the bulk is prunable
  `-events.db` / `-stats.db`). Mechanically trivial to move — copy the dir.
- Runs on its own port (**4434**); public hostname `mesh.romerotechsolutions.com`.
- **Known landmine (already in the ops notes):** deployed **MeshAgents are
  pinned to testbot's Let's Encrypt CA chain** and won't validate CF's edge
  cert — moving mesh historically means agents need re-trust/re-install.

**Recommendation:** **co-locate MeshCentral on the same RTS Lightsail box**
(tiny footprint, own port), one cutover so the agent re-trust happens once.

**Cert strategy to investigate before cutover (could avoid the re-trust):**
1. MeshCentral's TLS cert/key material lives *inside* `meshcentral-data`. If
   carried over intact with the same `mesh.` hostname, agents that pin the
   server cert *hash* may reconnect without re-install — **test with one
   agent before assuming re-trust is needed.**
2. Unlike the rest of RTS (CF-proxied + self-signed origin), consider running
   **real Let's Encrypt on the Lightsail box for `mesh.` via CF DNS-only
   (grey cloud)** — mirrors how testbot did it and keeps MeshAgent cert
   validation clean. This is the one hostname where CF Full-mode self-signed
   origin is likely the *wrong* call.

**Add to the migration steps:** copy `meshcentral-data`, install MeshCentral
natively (or its container) on the Lightsail box, wire `mesh.` DNS +
cert per above, verify a remote-control session end-to-end from the RTS UI,
and reconnect/re-trust the mesh agents as needed.

## Explicitly out of scope

Moving Cognito/SES/Stripe (they stay), any RTS app refactor, CI/CD for RTS
deploys (ZenithGrid has a ship script; RTS could get one but that's a
follow-up). MeshCentral version upgrade (move as-is; upgrade separately).
(Agent-metrics retention is NO LONGER out of scope — the micro's 40 GB disk
makes it a migration deliverable; see micro tuning #4.)

## Verification (definition of done)

- Full `pg_dump` of RTS completes with no I/O errors (corrupt table gone).
- Lightsail RTS passes all step-6 smoke tests by direct IP before any DNS flip.
- Post-cutover: the 3 active agents check in successfully; login, Stripe
  webhooks, SES, and ZenithGrid `/activate` all verified live.
- fedora RTS stopped and retained as warm-standby; rollback path (CF DNS back
  to tunnel) documented and tested to be one DNS change.
