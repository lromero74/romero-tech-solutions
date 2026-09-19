# Deferred Work Proposals

These items were found during the 2026-09 audit sweeps and deliberately **not**
implemented: each needs a product decision from Louis or a coordinated release
before work starts. They are not defects — every one fails honestly today (no
fake success, no broken UX, no security hole).

**Agents: read this file at the start of each session and ask Louis whether
any item should be implemented.** Do not start one unasked.

## 1. Stripe payment integration (+ trial upgrade path)

- **Status quo:** trial users clicking Upgrade get an honest "coming soon —
  contact support" message; `POST /api/.../upgrade` returns upgrade details
  with `message: 'Upgrade details calculated. Payment integration pending.'`
  Frontend: `src/components/client/TrialDevicesManager.tsx`.
  Backend: `backend/routes/subscription.js` (`TODO: Integrate with payment
  processor (Stripe, etc.)`).
- **Needed to implement:** live Stripe account + keys, pricing/product
  decisions, a checkout flow, and a client-facing billing/upgrade page (none
  exists today — there is nowhere to link the button yet).
- **Decision needed:** Stripe account + price list + approve the checkout UX.

## 2. Admin detail modals (scripts, policies, packages, schedules, deployments)

- **Status quo:** `PolicyAutomationDashboard` / `SoftwareDeploymentDashboard`
  accept `onView*Details` callback props, but nothing invokes them, and no
  detail buttons are rendered. `AdminViewRouter.tsx` passes console.log
  stubs. Zero user impact today.
- **Needed to implement:** decide what each detail view shows, add the
  trigger buttons in the dashboards, build the modal(s) (one shared details
  drawer may cover all five).
- **Decision needed:** scope/content of each detail view.

## 3. On-demand inventory scan (`refresh_inventory` agent command)

- **Status quo:** `POST /api/admin/assets/scan/:agent_id` honestly answers
  `501 SCAN_NOT_SUPPORTED` — the Go agent (`rts-monitoring-agent`) has no
  on-demand scan command; inventory uploads on its own 24h ticker
  (`internal/inventory/service.go: collectAndSend`).
- **Needed to implement:** export a refresh entry point in the agent,
  add a `refresh_inventory` case to its command dispatch
  (`internal/commands/commands.go`), bump the agent version, rebuild
  installers for ALL supported systems together, roll out fleet-wide, then
  switch the backend endpoint from 501 to queueing that command.
- **Decision needed:** schedule a coordinated agent release train (per the
  agent repo rules: all installers together, version bump every rebuild).
  Verify on-device before shipping — do not land untested.

## 4. Client push notifications + client live-update feed

- **Status quo:** employees get real browser push via `push_subscriptions`
  (`backend/services/alertPush.js`). Client push is still a logged skip
  (`_sendClientNotifications` PWA TODO) and client websocket delivery is
  unimplemented (`websocketService.sendToClient` doesn't exist — no client
  socket tracking). Email/SMS to clients work.
- **Needed to implement:** client device-subscription UI + storage, client
  socket tracking in the websocket service, per-client payload format.
- **Decision needed:** priority vs. employee channels that already work.

## 5. MeshCentral relay URL for remote control

- **Status quo:** `POST /agents/:agent_id/wayland/start`
  (`backend/routes/remoteControl.js`) returns `relay_url: null` with a
  documented fallback (dev-mode SSH tunnel); the whole feature is
  feature-flagged (503 `FEATURE_DISABLED` when off).
  `TODO(v1.19-rc)`: mint a real `wss` URL via `meshcentralService`.
- **Needed to implement:** MeshCentral cooperation to mint per-session relay
  URLs bound to (agent node id, localhost VNC port), dashboard noVNC wiring.
- **Decision needed:** MeshCentral-side design + priority.

## Resolved during the audit (for context, not action)

- Unmounted mock stubs deleted (`EmergencyAlerts`, `ClientRegistration`,
  frontend `emailService`) — pinned gone by
  `src/__tests__/noMockStubs.test.ts`.
- Policy execute / assign-`run_immediately` queue real `run_script`
  commands (`backend/routes/admin/policyExecution.js`).
- `canAccessScope` always-true stub → real `validateSubscriptionScope`.
- First-admin bootstrap (`POST /auth/bootstrap-admin`); dead Cognito admin
  flow removed.
