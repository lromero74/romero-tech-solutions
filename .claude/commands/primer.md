Prime context for working on Romero Tech Solutions.

Read the following files to build a complete understanding of the project:

1. **CLAUDE.md** — Development rules, conventions, infra reference (the bible)
2. **backend/server.js** — Express app setup, middleware chain, route mounting
3. **backend/config/database.js** — Pg pool init, secrets-manager fallback path
4. **backend/routes/auth.js** — Authentication (login, MFA, magic link, refresh)
5. **backend/routes/admin.js** — Admin route mounting + auth/permission gates
6. **backend/services/permissionService.js** — RBAC: user → role → permission resolution
7. **backend/middleware/permissionMiddleware.js** — `requirePermission()` factory
8. **backend/utils/securityMonitoring.js** — Security event logging + fail2ban hand-off
9. **backend/utils/timezoneUtils.js** — Pacific wall-clock conversion (DST-correct rate tier lookup)
10. **src/App.tsx** — React app structure, routing, auth gating, currentPage state
11. **src/contexts/EnhancedAuthContext.tsx** — Auth state for employees + clients (separate flows)
12. **src/contexts/PermissionContext.tsx** — Frontend permission cache + WebSocket updates
13. **src/services/apiService.ts** — Fetch wrapper with CSRF, credentials:include, auth headers
14. **package.json** — Frontend deps + scripts; `backend/package.json` separately

Then check current state:
```bash
git status
git log --oneline -10
```

And on the production host (testbot) if relevant:
```bash
ssh testbot './romero-tech-solutions/service.sh status'
```

Explain back to me:
- Current state (uncommitted changes, recent commits, version)
- Backend stack: Node Express + Postgres 15 (local on testbot, was RDS pre-cutover)
- Frontend stack: React + TypeScript + Vite, served by nginx from `dist/`
- Auth model: JWT session tokens (Bearer header) + RBAC via `requirePermission()` + Cognito for some flows
- Multi-user model: businesses own service_requests/invoices/locations; clients (in `users` table) belong to businesses; employees are separate
- Anything inconsistent (stale env, broken tests, dirty worktree)
