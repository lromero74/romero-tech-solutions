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
 *   - Input flows: noVNC sends RFB PointerEvent / KeyEvent over the
 *     wire, the agent's VNC server reads them and dispatches to the
 *     screencast-live helper's portalInputForwarder, which translates
 *     to xdg-desktop-portal RemoteDesktop Notify*Motion / NotifyKeyboardKeysym.
 *     End result: the operator's mouse and keyboard reach the host.
 *   - On unmount, RFB.disconnect() is called to terminate the
 *     WebSocket cleanly. If disconnect happens to fail (already
 *     closed, etc.) we swallow the error.
 */
export interface WaylandRemoteControlClientHandle {
  /** Imperatively disconnect. Useful for parent's "End session" button. */
  disconnect(): void;
  /**
   * Synthesize an RFB KeyEvent. keysym is an X11 keysym; code is
   * a DOM KeyboardEvent.code-style string (used by noVNC for some
   * client-side bookkeeping but not on the wire). down=true sends
   * a press; pass down=false (or leave undefined and call twice)
   * for a press+release pair.
   */
  sendKey(keysym: number, code: string, down?: boolean): void;
  /**
   * Send the platform's "secure attention sequence" — Ctrl+Alt+Del
   * on Windows, Ctrl+Alt+Backspace on X11, etc. noVNC handles the
   * key-sequence ordering internally.
   */
  sendCtrlAltDel(): void;
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
      sendKey(keysym: number, code: string, down?: boolean) {
        if (!rfbRef.current) return;
        try {
          if (down === undefined) {
            // press + release pair (most common for "send a key")
            rfbRef.current.sendKey(keysym, code, true);
            rfbRef.current.sendKey(keysym, code, false);
          } else {
            rfbRef.current.sendKey(keysym, code, down);
          }
        } catch {
          // Disconnected mid-call; ignore.
        }
      },
      sendCtrlAltDel() {
        if (!rfbRef.current) return;
        try {
          rfbRef.current.sendCtrlAltDel();
        } catch {
          // Disconnected mid-call; ignore.
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
    // Input enabled — RFB PointerEvent / KeyEvent flow through to
    // the agent's VNC server, which forwards them to xdg-desktop-portal
    // RemoteDesktop on the host.
    rfb.viewOnly = false;
    rfb.scaleViewport = true;
    rfbRef.current = rfb;

    const handleConnect = () => {
      setState('connected');
      // Two CSS tweaks at connect time:
      //  1. Show the operator's local OS cursor (as a crosshair)
      //     over the canvas so they can see exactly where they're
      //     aiming. noVNC's default is `cursor: none` because the
      //     server typically draws its own cursor via the cursor
      //     pseudo-encoding — but we keep the local cursor visible
      //     too, which makes targeting feel direct on remote
      //     sessions where the server-side cursor lags slightly
      //     behind input.
      //  2. Constrain the canvas to the container — even with
      //     scaleViewport=true noVNC sometimes lets the canvas
      //     element grow to its native framebuffer size (1920×1080)
      //     and the bottom of the remote desktop ends up clipped
      //     below the modal body. max-width/height + object-fit:
      //     contain pins it inside the body and preserves aspect
      //     ratio.
      const canvas = containerRef.current?.querySelector('canvas');
      if (canvas) {
        canvas.style.cursor = 'crosshair';
        canvas.style.maxWidth = '100%';
        canvas.style.maxHeight = '100%';
        canvas.style.objectFit = 'contain';
      }
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
