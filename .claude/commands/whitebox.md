Perform a whitebox audit of: $ARGUMENTS

## Audit Scope & Assumptions

### Architecture Context
- **Multi-user environment**: JWT bearer tokens (Authorization header), session validation, CSRF double-submit on unsafe methods
- **RBAC**: permissions → roles → employees (single role per employee). Frontend uses `usePermission()` hook; backend uses `requirePermission('<key>')` middleware
- **Multi-tenant**: businesses own service_requests/invoices/locations; clients (in `users` table) belong to a business; employees are not tied to a business
- **Security model**: app-level rate limiters → fail2ban via `[BAN]` lines in `/var/log/romerotechsolutions/intrusion.log` → iptables; nginx-level exploit/bad-request jails on top
- **Infrastructure** (post-2026-04-24 cutover): testbot serves both frontend (nginx → `dist/`) and backend (Node → :3001); local Postgres 15 (`romerotechsolutions` DB owned by `romero_app`); Let's Encrypt SSL
- **External services**: Stripe (payments + webhook at `/api/client/payments/webhook`), Twilio (SMS), SES (transactional email), Cognito (some auth flows), VAPID (push)
- **Stack**: Node Express 5 (ES modules) + Postgres 15 backend, React 19 + Vite + Tailwind v4 frontend, socket.io WebSocket

### What to Audit

1. **Security**: auth enforcement on every endpoint, CSRF on unsafe methods, input sanitization (sanitizeInputMiddleware), SQL injection (parameterized queries via pg), XSS in user-rendered fields, secrets in responses, privilege escalation via permission key bypass.

2. **Multi-tenant correctness**: queries that touch `service_requests`, `invoices`, `users` (clients), `service_locations`, `client_files` MUST filter by `business_id` for clients OR by employee's role-based access. Trace each per-user query and verify the filter exists.

3. **DST / timezone correctness**: Service-hour rates are Pacific wall-clock (post-2026-04-24 fix). Any code that computes "what rate applies at time X" must convert UTC → Pacific via `timezoneService.getBusinessDayAndTime()` before matching tier rows. Naive `new Date(date).getDay()` or `getHours()` is a bug.

4. **Performance — server**: N+1 queries in service-request listings, missing indexes on common WHERE clauses, oversized response payloads (especially file metadata, scheduler grids).

5. **Performance — client**: useEffect cleanup (WebSocket connections, timers), unnecessary re-renders in AdminDataContext consumers, bundle size from forgotten lucide-react imports.

6. **Responsiveness**: every component on `/clogin` and its dashboard must work at 375px. Test horizontal scroll, button reachability, modal scrolling.

7. **Code quality**: dead code, stale comments referencing Amplify/RDS/`botmanager` (we're off those), hardcoded strings that should be translation keys, error handling around external API calls.

### Rules

- **Don't assume — verify.** Read actual code. Run actual queries via `scripts/table --sql ...` to check assumptions about data.
- **Clean up dead code**: stale Amplify/RDS references, unused imports, unreachable code, commented-out blocks.
- **Modularize as you go**: any file >1200 lines, split it.
- **No regressions**: existing flows (employee login, client scheduler, invoice rendering, payments, alerts) must still work.
- **Mobile responsive**: every UI change validated at 375px viewport.

### Output Format

| ID | Severity | Type | Location | Issue | Fix |
|----|----------|------|----------|-------|-----|

Severity: Critical / High / Medium / Low
Type: Security / Multi-tenant / DST / Performance / Responsiveness / Code Quality

Then propose an implementation plan grouped into phases.
After presenting findings, **wait for user approval** before implementing.
