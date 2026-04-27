import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import RFB from '@novnc/novnc/lib/rfb';

/**
 * Wraps the noVNC RFB client in a React component. Used by the
 * AgentDashboard's Remote Control modal when the target host is on
 * Wayland Linux — those hosts can't be served by MeshCentral's
 * KVM helper, so we route through the agent's PipeWire+RFB bridge
 * (see internal/screencast/ in rts-monitoring-agent v1.19+).
 *
 * Status: v1.19 scaffold. Not yet wired into AgentDashboard. The
 * standalone component is testable in isolation against a Go RFB
 * server bridged through websockify (see
 * docs/wayland-remote-control-client.md for setup).
 *
 * Threat model:
 *   - This component only opens a WebSocket to the supplied url.
 *     Caller is responsible for providing an authenticated wss URL
 *     (in production, that's MeshCentral's relay tunnel; in dev,
 *     it's a localhost websockify endpoint).
 *   - viewOnly is hard-coded true. Input forwarding goes through
 *     the agent's portal RemoteDesktop interface separately. We
 *     never want noVNC to send PointerEvent / KeyEvent over RFB
 *     because the agent's VNC server explicitly drops those.
 *   - On unmount, RFB.disconnect() is called to terminate the
 *     WebSocket cleanly. If disconnect happens to fail (already
 *     closed, etc.) we swallow the error.
 */
export interface WaylandRemoteControlClientHandle {
  /** Imperatively disconnect. Useful for parent's "End session" button. */
  disconnect(): void;
}

export interface WaylandRemoteControlClientProps {
  /**
   * WebSocket URL pointing at a websockify-compatible bridge that
   * speaks RFB over TCP behind it. Production form is
   * `wss://api.romerotechsolutions.com/relay/...?session=<uuid>`;
   * dev form is `ws://localhost:6080`.
   */
  url: string;
  /** Fires after the RFB handshake completes and pixels start flowing. */
  onConnect?: () => void;
  /**
   * Fires on any disconnect — both clean (server closed) and
   * unclean (network drop). The clean flag distinguishes; UI
   * usually wants to render different copy for "ended normally"
   * vs "lost connection".
   */
  onDisconnect?: (clean: boolean) => void;
  /**
   * Fires on protocol-level security failure (e.g. server told us
   * to use a security type we don't support). Shouldn't happen
   * against our own server (which uses Security: None) but
   * surfaces would-be-cryptic errors clearly.
   */
  onSecurityFailure?: (status: number, reason: string) => void;
  /**
   * Optional class name for the host div. The canvas itself is
   * positioned by noVNC; you typically want the host to be
   * full-bleed inside its parent.
   */
  className?: string;
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

const WaylandRemoteControlClient = forwardRef<
  WaylandRemoteControlClientHandle,
  WaylandRemoteControlClientProps
>(function WaylandRemoteControlClient(props, ref) {
  const { url, onConnect, onDisconnect, onSecurityFailure, className } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const [state, setState] = useState<ConnectionState>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      disconnect() {
        if (rfbRef.current) {
          try {
            rfbRef.current.disconnect();
          } catch {
            // Already disconnected; ignore.
          }
        }
      },
    }),
    [],
  );

  // Pin callbacks in refs so the connection effect can be keyed
  // on `url` alone. If we depended on the callbacks directly, every
  // parent re-render that creates new arrow-function identities
  // (which is what AgentDashboard does for onDisconnect, and which
  // happens on every agent metrics WS broadcast — i.e. every few
  // seconds) would re-run the effect, calling rfb.disconnect() and
  // trying to reopen the WS with an already-consumed one-shot ticket.
  // That manifested as "PAIRED" then 1006 close ~13s later.
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onSecurityFailureRef = useRef(onSecurityFailure);
  useEffect(() => {
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onSecurityFailureRef.current = onSecurityFailure;
  }, [onConnect, onDisconnect, onSecurityFailure]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    setState('connecting');
    setErrorMessage(null);

    let rfb: RFB;
    try {
      rfb = new RFB(containerRef.current, url, {
        // Shared mode: don't kick existing viewers. The agent's
        // VNC server doesn't multiplex anyway, but the client
        // still has to declare a value.
        shared: true,
      });
    } catch (e) {
      // Constructor errors usually mean the URL was malformed or
      // the WebSocket couldn't even open. Surface in UI.
      setState('error');
      setErrorMessage(e instanceof Error ? e.message : String(e));
      return;
    }
    // Always view-only — input goes via portal RemoteDesktop, not RFB.
    rfb.viewOnly = true;
    rfb.scaleViewport = true;
    rfbRef.current = rfb;

    const handleConnect = () => {
      setState('connected');
      onConnectRef.current?.();
    };
    const handleDisconnect = (ev: Event) => {
      const clean = (ev as { detail?: { clean?: boolean } }).detail?.clean ?? false;
      setState('disconnected');
      onDisconnectRef.current?.(clean);
    };
    const handleSecurityFailure = (ev: Event) => {
      const detail = (ev as { detail?: { status?: number; reason?: string } }).detail ?? {};
      setState('error');
      setErrorMessage(detail.reason ?? 'security failure');
      onSecurityFailureRef.current?.(detail.status ?? -1, detail.reason ?? '');
    };

    rfb.addEventListener('connect', handleConnect);
    rfb.addEventListener('disconnect', handleDisconnect);
    rfb.addEventListener('securityfailure', handleSecurityFailure);

    // Diagnostic: log every other RFB event so we can see how far
    // the protocol gets when the modal is stuck at "Connecting…".
    // (Cheap to keep — these events only fire during/after a
    // successful handshake, never in tight loops.)
    const diagEvents = ['credentialsrequired', 'desktopname', 'capabilities', 'bell', 'clipboard'];
    const diagHandler = (ev: Event) => {
      console.log('[wayland-novnc]', ev.type, (ev as { detail?: unknown }).detail ?? '');
    };
    diagEvents.forEach(name => rfb.addEventListener(name, diagHandler));

    return () => {
      rfb.removeEventListener('connect', handleConnect);
      rfb.removeEventListener('disconnect', handleDisconnect);
      rfb.removeEventListener('securityfailure', handleSecurityFailure);
      try {
        rfb.disconnect();
      } catch {
        // already disconnected
      }
      rfbRef.current = null;
    };
    // url is the only thing that should retrigger a reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', background: 'rgb(40, 40, 40)' }}
      />
      {state !== 'connected' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 14,
            backgroundColor: state === 'error' ? 'rgba(120,30,30,0.85)' : 'rgba(40,40,40,0.7)',
            pointerEvents: 'none',
          }}
        >
          {state === 'connecting' && 'Connecting…'}
          {state === 'disconnected' && 'Disconnected'}
          {state === 'error' && (errorMessage ?? 'Connection error')}
        </div>
      )}
    </div>
  );
});

export default WaylandRemoteControlClient;
