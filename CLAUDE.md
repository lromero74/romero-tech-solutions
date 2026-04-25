# CLAUDE.md — Romero Tech Solutions Development Guide

This file is the authoritative source of truth for working on RTS. Read it fully before making changes. **Review this file before each new task.**

## Development Philosophy

- **No stubs.** If you can't implement it now, don't fake it with a placeholder — say so explicitly.
- **No assumptions.** Never guess at table names, column names, function signatures, or whether a tool/utility exists. Check first. Assumptions cause silent breakage downstream.
- **No silent feature drops.** Refactoring and lint cleanups must NEVER remove functionality. Always `git diff` before staging. A previous incident: ESLint cleanup accidentally removed the "Add Business → Service Location → Client" workflow. Be paranoid about this.
- **RBAC over role checks.** Permissions are configurable; role checks are not. (Section below.)
- **Mobile responsive.** The `/clogin` flow and its dashboard MUST work at 375px viewport. Never break that.
- **Verify schema before query code.** Before writing or modifying any DB query, check the actual schema with `scripts/table --sql "\d <table>"`. Column names drift; assumptions don't.

## Critical Rules

1. **Request permission before committing or pushing.** Once granted, proceed via `/shipit`. Release flow is GitHub origin → testbot `git pull` — never rsync individual files to prod.
2. **Bump three version files together.** Every user-facing commit:
   - `package.json` `"version"`
   - `public/version.json` `"version"`
   - `src/hooks/useVersionCheck.ts` `CURRENT_VERSION`
   Pure `.gitignore` / docs changes are exempt.
3. **Tag format**: `vX.Y.Z` (three-part semver). Never `v1.8` or `v1.8.0-beta` — git sorts alphanumerically and `v1.14.0` would come before `v1.2.0`.
4. **Never commit secrets.** No keys, no live tokens, no `.env` contents in git-tracked files.
5. **Never silently drop code.** Always `git diff` before staging.
6. **Always check `git diff`** to verify you didn't break dependent behavior before commit.

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| Backend | Node.js 20+ + Express 5 (ES modules — `.js` with `import`/`export`) |
| Database | PostgreSQL 15 (local on testbot, post-2026-04-24 cutover; was AWS RDS) |
| WebSocket | socket.io |
| Auth | JWT bearer tokens + RBAC + AWS Cognito (some flows) |
| Payments | Stripe (live mode) |
| Email | AWS SES (transactional via SMTP) |
| SMS | Twilio |
| Push | VAPID web push |
| Hosting | testbot (single EC2, Amazon Linux 2023) |
| SSL | Let's Encrypt via certbot |

## Project Structure

```
backend/
├── server.js                # Express app, middleware chain, route mounting
├── config/
│   └── database.js          # Pg pool init, secrets-manager fallback (off in testbot)
├── middleware/
│   ├── authMiddleware.js    # JWT validation → req.session.userId
│   ├── permissionMiddleware.js  # requirePermission('<key>') factory
│   ├── security.js          # adminIPWhitelist (currently disabled), securityHeaders
│   └── ...                  # rate limiters, CSRF helpers, sanitization
├── services/
│   ├── permissionService.js # RBAC: user → role → permission resolution
│   ├── emailService.js      # SES SMTP (transactional)
│   ├── workflowEmailService.js  # Workflow-specific notifications (uses same SES)
│   ├── alertEscalationService.js
│   ├── websocketService.js
│   └── ...
├── routes/
│   ├── auth.js              # login/signup/MFA/refresh/magic-link (most pre-auth)
│   ├── public.js            # public read-only endpoints
│   ├── admin.js             # mounts admin/* sub-routers, gates with auth + permission
│   ├── admin/*.js           # employees, businesses, services, system settings, etc.
│   ├── client/*.js          # client-side endpoints (dashboard, scheduler, files, payments)
│   ├── security.js          # /api/security — fail2ban jail UI + security stats
│   ├── agents.js            # RTS monitoring agent endpoints
│   └── ...
├── utils/
│   ├── timezoneUtils.js     # Pacific wall-clock conversion (DST-correct)
│   ├── securityMonitoring.js  # Security event logger + fail2ban [BAN] hand-off
│   └── ...
├── migrations/              # Sequential SQL migrations (NNN_name.sql)
└── certs/                   # SSL CA bundles

src/
├── App.tsx                  # Top-level router (currentPage state, page selector)
├── main.tsx                 # ReactDOM root + ErrorBoundary
├── components/
│   ├── admin/
│   │   ├── shared/AdminViewRouter.tsx  # Big switch over admin views
│   │   ├── AdminBusinesses.tsx, AdminEmployees.tsx, ...
│   │   └── ...
│   ├── client/              # /clogin dashboard components
│   └── shared/              # Cross-flow components
├── contexts/
│   ├── EnhancedAuthContext.tsx  # Auth state for both employees and clients
│   ├── PermissionContext.tsx    # Permission cache, WebSocket-driven updates
│   ├── AdminDataContext.tsx     # Admin data fetch + WebSocket-driven updates
│   ├── ThemeContext.tsx         # Light/dark theme + themeClasses helpers
│   └── ...
├── hooks/
│   ├── usePermission.ts     # checkPermission() based on PermissionContext
│   ├── useVersionCheck.ts   # Cache-bust + reload toast on version change
│   └── admin/               # Per-section filter/handler hooks
├── services/
│   ├── apiService.ts        # Fetch wrapper: CSRF token, credentials:include, auth header
│   ├── authService.ts
│   ├── agentService.ts
│   └── ...
├── utils/
│   └── routing.ts           # path → AppPage and back
└── types/
```

```
service.sh                   # Lifecycle script (start/stop/restart --prod/build/status/logs)
.claude/                     # Slash commands + agents (this file's siblings)
```

**Dependency direction:**
- Backend: services standalone → routes depend on services + middleware → middleware standalone. Never the reverse.
- Frontend: contexts standalone → hooks consume contexts → components consume both. Never the reverse.

## Role-Based Access Control (RBAC)

**Never hardcode role checks. Always use the permission system.**

```typescript
// ❌ WRONG
if (authUser.role === 'technician') { ... }

// ✅ CORRECT
const { checkPermission } = usePermission();
const canViewSoftDeleted = checkPermission('view.soft_deleted_businesses.enable');
{canViewSoftDeleted && <ShowSoftDeletedToggle />}
```

**Backend equivalent:**
```javascript
import { requirePermission } from '../middleware/permissionMiddleware.js';
router.post('/businesses', requirePermission('add.businesses.enable'), async (req, res) => { ... });
```

**Naming convention** for permission keys: `<verb>.<resource>.enable`
- `verb`: `view`, `add`, `modify`, `delete`, `manage`, `access`
- `resource`: snake_case noun describing the feature

**Granting permissions** to roles is done via SQL into `role_permissions`. The permission must exist in `permissions` first. Executive role gets all permissions implicitly via the `getUserPermissions()` shortcut, but `_checkPermissionInDatabase()` does NOT have that shortcut — every fine-grained backend check goes through the `role_permissions` table. So you still need to grant the permission to the executive role explicitly for the backend to allow it.

## Multi-Tenant Model

Confusingly named, but precise:

- **`employees` table**: staff. Not tied to a business. Access governed by their role's permissions.
- **`users` table**: clients. Each row has a `business_id`. Login via `/clogin`.
- **Businesses own**: `service_requests`, `service_locations`, `client_files`, `invoices`, scheduled-task contexts, `client_alert_subscriptions`, etc.

Any client-facing endpoint that returns or modifies business-owned data MUST filter by `req.user.business_id`. Any endpoint accepting a resource ID (for write/delete) MUST verify the resource belongs to the requester's business. (See `/whitebox` audit checklist.)

## DST / Timezone Rule (post-2026-04-24)

Service-hour rate tiers are stored as **Pacific wall-clock**: `day_of_week`, `time_start`, `time_end` mean Pacific local literally, not UTC. UTC math happens once, at lookup, via `timezoneService.getBusinessDayAndTime(utcInstant)`.

**Anti-patterns** (will resurface the DST drift bug):
- `new Date(date).getDay()` — uses server-local TZ
- `pacificDate.setHours(h, 0, 0, 0).getUTCHours()` — uses browser-local TZ
- Comparing tier `time_start` against a string built from arbitrary Date methods

**The right pattern**:
```javascript
import { timezoneService } from '../utils/timezoneUtils.js';
const { dayOfWeek, timeString } = timezoneService.getBusinessDayAndTime(serviceRequestUtcInstant);
// then query tiers WHERE day_of_week = $1 AND time_start <= $2 AND time_end > $2
```

## Service Management (testbot)

Always use `./service.sh` from the project root. Never call `systemctl` directly.

```bash
./service.sh status                  # Mode, port-collision check, dist/ size + mtime
./service.sh start
./service.sh stop
./service.sh restart --prod          # Reinstall deps + rebuild dist + restart backend (full deploy)
./service.sh restart --prod --force  # Bypass foreign-port-holder check
./service.sh build                   # Reinstall deps + rebuild dist (no backend restart — for frontend-only changes)
./service.sh logs                    # Recent backend logs
```

**Sister-project port map** (avoid collisions): 3001=RTS, 3002=funder-finder, 3003=worship-setlist, 3004=tampa-re-investor, 8100=ZenithGrid.

## Local Dev (mac)

The legacy local-dev path (`./restart-services.sh`) still exists but is no longer the production deploy path. Use it for laptop development; testbot is the production environment.

```bash
npm run dev                          # Vite frontend (HMR)
cd backend && node server.js         # Backend, requires backend/.env locally
```

For DB access, you can `ssh -L 5432:localhost:5432 testbot` to tunnel to testbot's Postgres if you want to read prod data — but **never write from local**.

## Database & Migrations

- **Production DB** (testbot only): `romerotechsolutions` owned by `romero_app` (loopback only, password in testbot's `backend/.env`).
- **Migrations**: `backend/migrations/NNN_name.sql`. Sequential numbering. Always include a comment block at the top explaining the change + companion code references.
- **Always back up before destructive migrations**:
  ```bash
  ssh testbot 'PGPASSWORD=... pg_dump -h localhost -U romero_app romerotechsolutions > ~/rts-pre-migrate-$(date +%s).sql'
  ```
- **Schema verification before any query code**: `scripts/table --sql "\d <table>"`.

## Auth & Security

### Authentication
- JWT bearer tokens (`Authorization: Bearer <token>` header)
- Session validation in `authMiddleware.js`
- MFA: TOTP via `otplib`, trusted-device tokens (90-day skip)
- Magic-link login flow: `/agent-magic-login`, `/trial-magic-login`
- Cognito integration for some flows (server-side; check `aws-config.ts` for which)

### Authorization
- RBAC: `permissions` → `role_permissions` → `roles` → `employee_roles` → `employees`
- One role per employee in practice
- Frontend: `usePermission()` hook
- Backend: `requirePermission('<key>')` middleware

### CSRF
- Library: `csrf-csrf` (double-submit pattern)
- Cookie: `__Host-csrf` in production, `csrf-token` in dev
- `SameSite=Lax` (NOT Strict — Strict broke cross-subdomain XHR; the v1.101.99 fix)
- Header: `x-csrf-token`
- Identifier: `${req.ip}-${user-agent}` — stable per browser. (NOT the cookie value itself; that was the v1.101.101 bug.)

### Intrusion / Rate-Limiting Layers
1. App-level rate limiters in middleware (per-IP, per-endpoint)
2. App writes `[BAN] <ip> reason=<event>` to `/var/log/romerotechsolutions/intrusion.log` on threshold trips
3. fail2ban jails read that log:
   - `romerotechsolutions-intrusion-soft` (1h ban, behavior issues)
   - `romerotechsolutions-intrusion-hard` (2y ban, adversarial events)
4. Shared OS-wide jails: `nginx-exploit` (2y), `nginx-bad-request` (10min), `sshd` (2y, 1-strike — server is key-only)

Admin UI: `Security & Permissions → Intrusion Jails`.

## Versioning & Release

`/shipit` is the release command. Reference `.claude/commands/shipit.md`.

The flow:
1. Pre-flight: `git status`, `git diff --stat`, `npx tsc --noEmit`
2. Bump three version files
3. Commit
4. Tag `vX.Y.Z`
5. Push origin main + tag
6. `ssh testbot 'cd ~/romero-tech-solutions && git pull --ff-only origin main && ./service.sh restart --prod'`
7. Verify: `curl https://romerotechsolutions.com/version.json`, `./service.sh status`

## Testing Posture

**Honest disclosure**: automated test coverage is sparse. Most stability comes from manual smoke-testing the affected flows. Adding tests is welcome (especially for permission resolution, DST conversion, Stripe webhook signature verification) but **don't pretend coverage exists where it doesn't**.

For DST-sensitive code, write tests using fixed UTC instants spanning DST boundaries:
```javascript
new Date('2026-02-08T08:30:00Z')  // 12:30 AM Sunday PST (winter)
new Date('2026-07-12T07:30:00Z')  // 12:30 AM Sunday PDT (summer)
// Both should yield {dayOfWeek: 0, timeString: '00:30:00'}
```

## Infrastructure Quick Reference

| Item | Value |
|------|-------|
| Production host | testbot (EC2 Amazon Linux 2023, single instance) |
| Domain | romerotechsolutions.com (Route 53 zone `Z00658051P4RTWHYNBEOI`) |
| Frontend URL | https://romerotechsolutions.com (apex + `www.`) |
| API URL | https://api.romerotechsolutions.com |
| Backend port | 3001 |
| systemd unit | `romero-tech-solutions-backend.service` |
| nginx config | `/etc/nginx/conf.d/romerotechsolutions.conf` |
| SSL | Let's Encrypt, auto-renewed by `certbot-renew.timer` |
| DB host | localhost (loopback) on testbot |
| DB name / role | `romerotechsolutions` / `romero_app` |
| Email | AWS SES (`email-smtp.us-east-1.amazonaws.com:587`), `no-reply@romerotechsolutions.com` |
| AWS CLI creds | `~/.aws/` on mac |

The detailed testbot stack reference (out-of-tree configs, fail2ban filters, sudoers entries) lives in the user's memory file at `~/.claude/projects/-Users-louis/memory/reference_testbot_romerotechsolutions_stack.md`. Keep it in sync.

## Workflow Commands

User-invoked slash commands in `.claude/commands/`:

| Command | When to use |
|---------|-------------|
| `/primer` | Start of a new conversation — load full project context |
| `/generate-prp <feature>` | Before building a non-trivial feature — research and plan first |
| `/execute-prp <name>` | Implement a feature from its PRP document |
| `/whitebox <area>` | Audit a specific area for security, perf, code quality |
| `/code-quality <focus>` | Multi-agent code-quality sweep (general / security / testing / architecture / dead-code / dst) |
| `/spaghetti-check [scope] [--fix]` | File size + dependency direction + complexity audit |
| `/shipit` | Full release: bump versions, commit, tag, push, deploy |

**Proactively-called agents** (in `.claude/agents/`):
- `validation-gates` — type-check + syntax-check + size/dep-direction sanity, after implementations
- `test-auditor` — verify new code has tests; write missing tests with proper mocks
- `regression-check` — diff for deleted code / changed contracts / version mismatch / DST patterns, before /shipit
- `multiuser-security` — auth + tenant-isolation audit after auth/route/query changes
- `code-hygiene` — dead code / hardcoded values / docs / error handling / DST anti-patterns

**When Claude should suggest a PRP**: task touches 3+ files, new tables/migrations, or multiple valid approaches. Suggest `/generate-prp` before diving in.

**When Claude should suggest a whitebox**: after a significant feature ships, especially auth, billing, scheduler, multi-tenant data paths.

## URLs & Login Paths

- Production app: https://romerotechsolutions.com
- Employee login: https://romerotechsolutions.com/employee  (singular — `/employees` falls through to 'home' in `src/utils/routing.ts`)
- Client login: https://romerotechsolutions.com/clogin

## Database Quick Access

```bash
# Run SQL via the helper script
./scripts/table --sql "SELECT count(*) FROM employees;"

# Inspect schema
./scripts/table --sql "\d employees"
```

## Translation Keys

Strings on the client dashboard are stored as translation keys in the database (`t_translations`, `t_translation_keys`, `t_languages`). When you add UI text on the `/clogin` flow, use a translation key — don't hardcode the English string.

If translation updates aren't showing, the user can clear their browser cache:
```javascript
// In browser console (F12)
localStorage.removeItem('translations_es')
localStorage.removeItem('translations_en')
location.reload()
```

## Form Validators (caveat)

Some form validators may be shared between the employee flow (`/employee`) and the client flow (`/clogin`) and their respective modals. **Always check before assuming a change to a validator only affects one flow** — you may break the other.

## Common Browser-State Resets (when debugging)

```javascript
// Full reset
localStorage.clear(); location.reload();

// Just auth keys
localStorage.removeItem('client_authUser');
localStorage.removeItem('client_sessionToken');
location.reload();
```

## RTS Monitoring Agent

Codebase: `/Users/louis/New/01_Projects/rts-monitoring-agent` (Go, separate repo). When updating the agent:
- Build installers for ALL supported systems together
- The user experience must be similar across all OS versions
- Bump the agent version on each rebuild

## Continuity Journal

`.claude-musings.md` is intentionally tracked but constantly modified — Claude's cross-session journal. Don't treat the `M` status as dirt to clean up.

## Key Documents

| Document | Purpose |
|---|---|
| `CLAUDE.md` | This file — start here |
| `.claude-musings.md` | Continuity journal across sessions |
| `service.sh` | Production lifecycle script |
| `.claude/commands/*.md` | Slash commands |
| `.claude/agents/*.md` | Proactively-called agents |
| `backend/migrations/` | All schema migrations (sequential) |
| `~/.claude/projects/-Users-louis/memory/reference_testbot_romerotechsolutions_stack.md` | Out-of-tree testbot config (fail2ban filters, sudoers, jail.local stanzas) |
