# Wayland Remote Control client (v1.19 scaffold)

`src/components/admin/WaylandRemoteControlClient.tsx` is the
React component that renders a noVNC RFB session. Used by the
AgentDashboard's Remote Control modal when the target host is on
Wayland Linux — those hosts use the agent's pure-Go VNC server
(internal/screencast/ in rts-monitoring-agent v1.19+) instead of
MeshCentral's KVM helper.

## Status

**v1.19 scaffold.** The component exists and is type-clean; it is
NOT yet wired into AgentDashboard. The dashboard's Remote Control
modal still routes Wayland hosts to the "limitation" preflight
modal (added in v1.18.6).

Wiring will land when:
1. The agent's Day 4 work (input forwarding via portal RemoteDesktop)
   is done.
2. The backend route that opens a MeshCentral relay tunnel into
   the agent's VNC server is built.
3. Both paths have been smoke-tested against at least one real
   Wayland host (Fedora 43 GNOME or Kubuntu 24.10 KDE).

## API

```tsx
import WaylandRemoteControlClient, {
  WaylandRemoteControlClientHandle,
} from './WaylandRemoteControlClient';

const ref = useRef<WaylandRemoteControlClientHandle>(null);

<WaylandRemoteControlClient
  ref={ref}
  url="wss://api.romerotechsolutions.com/relay/<session-id>"
  onConnect={() => console.log('connected')}
  onDisconnect={(clean) => console.log('disconnected', clean)}
  onSecurityFailure={(status, reason) => console.error(status, reason)}
/>

// Force disconnect imperatively:
ref.current?.disconnect();
```

The component is always view-only — input forwarding goes through
the agent's portal RemoteDesktop interface separately. We
intentionally never want noVNC to send PointerEvent / KeyEvent
because the agent's VNC server explicitly drops them.

## Local development verification

The browser → agent path goes through three layers in production:

```
browser (noVNC) ─── wss ───→ MeshCentral ─── TCP ───→ agent's VNC server
```

For local dev we replace MeshCentral with `websockify`:

```
browser (noVNC) ─── ws ───→ websockify ─── TCP ───→ Go VNC server
```

### Setup

1. Run the agent's `cmd/vnc-test-server` binary (in
   rts-monitoring-agent v1.19+) with a synthetic frame source. It
   listens on a random localhost port; print the chosen port and
   note it.

2. Install `websockify` locally:
   - macOS: `brew install novnc/novnc/websockify`
   - Fedora/Ubuntu: `pip install websockify`

3. Start the bridge: `websockify 6080 127.0.0.1:<vnc-port>`
   - Listens on `ws://localhost:6080`
   - Forwards to the Go server's TCP port

4. Run the dashboard's vite dev server: `npm run dev`

5. Open `http://localhost:5173/dev/wayland-remote-control` in a
   browser and pass `?url=ws://localhost:6080` as the query string.
   The dev page (TBD: `src/pages/dev/WaylandRemoteControlTest.tsx`)
   will render the component pointed at the bridge.

## Production wiring (post-v1.19 release)

The dashboard's Remote Control modal will need a new code path:

```ts
if (agent.os_type === 'linux' && agent.display_server === 'wayland') {
  // v1.19+ path: open relay tunnel into agent's Go VNC server,
  // render with WaylandRemoteControlClient
  const tunnelUrl = await agentService.requestWaylandRemoteControl(agent.id);
  setRemoteControl({
    show: true,
    waylandTunnelUrl: tunnelUrl,
    deviceName: agent.device_name,
  });
} else {
  // Today's path: MeshCentral KVM iframe (X11 / macOS / Windows)
  // ... existing requestRemoteControl call
}
```

The backend `agentService.requestWaylandRemoteControl` route is
the v1.19 backend work that hasn't started yet — it asks
MeshCentral to open a relay tunnel from the server's TCP socket
to the agent's localhost VNC port, returns the resulting wss URL.

## Threat model

- The component opens a single WebSocket to whatever URL is passed
  in. The caller is responsible for authenticated URL provisioning.
- viewOnly is hard-coded true. If a future maintainer flips this
  to false in the React source, the agent's VNC server still
  drops input messages — but the dashboard would silently send
  them and the user would see "my keystrokes don't work". Keep
  viewOnly=true here unless you've rebuilt the input path.
- On unmount, `RFB.disconnect()` is called. Failures (already
  closed, network gone) are swallowed.
- The component does no credential management. Security: None
  is the only RFB security type the agent server speaks. Auth
  happens at the WebSocket / relay layer above.

## Related code

- `src/components/admin/WaylandRemoteControlClient.tsx` — this component
- `src/types/novnc.d.ts` — minimal type declarations for @novnc/novnc
- rts-monitoring-agent `internal/screencast/vnc_server.go` — the server
- rts-monitoring-agent `internal/screencast/rfb.go` — protocol encoder
- rts-monitoring-agent `.plan/2026.04.26.03-wayland-native-remote-control-PRP.md` — full plan
