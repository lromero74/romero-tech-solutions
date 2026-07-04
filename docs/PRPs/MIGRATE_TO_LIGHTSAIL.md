# PRP: Migrate RTS Production off fedora.local → AWS Lightsail

**Status:** Draft / planning — nothing executed. Pressure-test before committing.
**Date:** 2026-07-04
**Author:** drafted with Claude
**Scope note:** covers **RTS backend + Postgres AND MeshCentral** (remote
desktop). RTS depends on MeshCentral for technician remote-control sessions;
they migrate together as one wave — see the MeshCentral section below.

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
kept as a stopped warm-standby for ~30 days, then decommissioned.

---

## Current-state facts (measured 2026-07-04)

| Thing | Value |
|---|---|
| RTS DB size | **~3.0 GB** (`agent_metrics` alone 1.7 GB / 136k rows) |
| Corrupt table | `agent_metrics_corrupted` (475 MB, 63k rows) — unreadable blocks |
| Agent devices | **23 total, only 3 active in last 24h** |
| Backend | `node server.js` on :3001, distrobox `rts-box`, systemd `--user` unit that `source`s `.env` then execs node |
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

---

## Target architecture (mirror ZenithGrid)

```
public internet
   → Cloudflare DNS (proxied A → Lightsail static IP, SSL mode Full)
   → Cloudflare edge (universal cert)
   → nginx on Lightsail :443 (self-signed origin cert)
   → node server.js :3001 (native systemd system unit, no distrobox)
   → local PostgreSQL (127.0.0.1:5432)
```

- **Instance:** Lightsail, size to the DB + agent load. ZenithGrid runs fine
  on 4 GB/2 vCPU/80 GB; RTS's 3 GB DB + agent ingestion likely wants the
  **8 GB/2 vCPU/160 GB** tier for headroom (agent metrics grow). Confirm
  against current fedora RAM/CPU usage before picking.
- **OS:** Ubuntu 24.04 (matches ZenithGrid, native Node + Postgres).
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

1. **Prereq:** repoint the `agent_package_manager_summary` view → `agent_metrics`;
   verify; drop `agent_metrics_corrupted`; confirm a full `pg_dump -Fc`
   succeeds.
2. **Provision** the Lightsail instance (static IP, Ubuntu 24.04). Install
   Node, PostgreSQL, nginx. Harden (ufw, fail2ban, no password SSH).
3. **Install RTS natively:** clone the repo, `npm ci`, build frontend, create
   a systemd *system* unit `rts.service` (uvicorn-equivalent: `node server.js`),
   nginx vhost with a self-signed origin cert (`/etc/ssl/rts/`), CF SSL mode
   Full.
4. **DB restore:** `pg_dump -Fc` on fedora → `pg_restore` on Lightsail's local
   Postgres. Create role/db matching `.env`. Verify row counts vs fedora
   (esp. `agent_metrics`, `agent_devices`, `users`, `zenithgrid_licenses`).
5. **Copy secrets:** `.env` via `scp -3`. Verify Cognito/SES/Stripe env vars
   present; verify the ZenithGrid license signing key line survived intact
   (it's a `\n`-escaped single line — the exact thing that broke twice when
   added by hand; copy the whole file, don't re-hand-edit it).
6. **Smoke test with DNS still on fedora:** hit the Lightsail box directly by
   IP/origin hostname (bypassing CF) — `/api/health`, a login via Cognito, an
   agent check-in POST, a Stripe webhook replay, a ZenithGrid `/activate`
   round-trip. Nothing public flips yet.
7. **Cutover:** lower CF DNS TTLs beforehand. Repoint each hostname's CF
   record from the tunnel CNAME → proxied A to the Lightsail IP. Watch the 3
   active agents reconnect; watch backend logs.
8. **Verify post-cutover:** agent check-ins landing, frontend loads, login,
   Stripe webhook delivery (update the webhook URL in Stripe if it targets a
   raw origin rather than the CF hostname), SES sends, ZenithGrid licensing
   endpoints.
9. **Warm standby:** stop (don't delete) the fedora rts-box + postgres-box.
   Keep ~30 days as rollback. Document the cutover timestamp for the
   write-delta window.
10. **Decommission fedora RTS** after the standby window: stop/disable units,
    reclaim space, update CLAUDE.md infra notes.

---

## Risks & mitigations

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
- **DB size growth.** `agent_metrics` grows continuously. Size the instance
  disk with headroom and consider a retention/rollup policy for old metrics
  as a follow-up (out of scope here, but flag it).
- **Cognito/SES region.** Both are `us-east-1`; put the Lightsail instance in
  `us-east-1` too (matches ZenithGrid) to keep latency/data-residency simple.

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

Agent-metrics retention/rollup policy, moving Cognito/SES/Stripe (they stay),
any RTS app refactor, CI/CD for RTS deploys (ZenithGrid has a ship script;
RTS could get one but that's a follow-up). MeshCentral version upgrade (move
as-is; upgrade separately).

## Verification (definition of done)

- Full `pg_dump` of RTS completes with no I/O errors (corrupt table gone).
- Lightsail RTS passes all step-6 smoke tests by direct IP before any DNS flip.
- Post-cutover: the 3 active agents check in successfully; login, Stripe
  webhooks, SES, and ZenithGrid `/activate` all verified live.
- fedora RTS stopped and retained as warm-standby; rollback path (CF DNS back
  to tunnel) documented and tested to be one DNS change.
