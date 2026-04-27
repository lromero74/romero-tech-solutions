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
  /**
   * Optional H.264 video stream WS URL. When set AND the browser
   * has WebCodecs (`window.VideoDecoder`), this component opens
   * the video tunnel in parallel with the RFB tunnel and overlays
   * decoded frames on top of the noVNC canvas. RFB still handles
   * input dispatch (PointerEvent / KeyEvent).
   *
   * If absent or WebCodecs unavailable, the component degrades
   * gracefully to noVNC-only display (the v1.19 path).
   */
  videoUrl?: string;
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
  const { url, videoUrl, onConnect, onDisconnect, onSecurityFailure, className } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<ConnectionState>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [videoActive, setVideoActive] = useState(false);

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

  // H.264 video stream (v1.20+). Opened in parallel with the RFB
  // tunnel when videoUrl is provided AND the browser has the
  // WebCodecs VideoDecoder API. RFB stays the input transport;
  // this just paints frames on top.
  useEffect(() => {
    if (!videoUrl) {
      console.log('[wayland-h264] videoUrl not provided — using RFB display path');
      return;
    }
    // Capability gate: WebCodecs is Chrome/Edge stable, Safari TP,
    // Firefox 130+. On older browsers we silently skip and let
    // noVNC drive the display.
    if (typeof window === 'undefined' || typeof (window as unknown as { VideoDecoder?: unknown }).VideoDecoder === 'undefined') {
      console.warn('[wayland-h264] window.VideoDecoder unavailable — falling back to RFB display');
      return;
    }
    console.log('[wayland-h264] opening video WS:', videoUrl);

    const VideoDecoderCtor = (window as unknown as {
      VideoDecoder: new (init: { output: (frame: unknown) => void; error: (e: Error) => void }) => unknown;
      EncodedVideoChunk: new (init: { type: 'key' | 'delta'; timestamp: number; data: BufferSource }) => unknown;
    }).VideoDecoder;
    const EncodedVideoChunkCtor = (window as unknown as {
      EncodedVideoChunk: new (init: { type: 'key' | 'delta'; timestamp: number; data: BufferSource }) => unknown;
    }).EncodedVideoChunk;

    const canvas = videoCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Buffer for incoming Annex-B byte-stream (NALUs may span WS
    // messages). Walk for start codes (0x000001 or 0x00000001).
    let pending = new Uint8Array(0);
    let firstFrameSeen = false;
    let saw_key = false; // gate: don't decode anything until first IDR

    const decoder = new VideoDecoderCtor({
      output: (frame: unknown) => {
        const f = frame as VideoFrame & { close: () => void };
        // Resize canvas to match frame natural dims (typically
        // 1280x720) so drawImage scales correctly when the
        // canvas's CSS dims differ.
        if (canvas.width !== f.codedWidth || canvas.height !== f.codedHeight) {
          canvas.width = f.codedWidth;
          canvas.height = f.codedHeight;
        }
        // ImageBitmap-style draw — drawImage handles VideoFrame
        // since Chrome 94 / Firefox 130.
        try {
          ctx.drawImage(f as unknown as CanvasImageSource, 0, 0, canvas.width, canvas.height);
        } finally {
          f.close();
        }
        if (!firstFrameSeen) {
          firstFrameSeen = true;
          setVideoActive(true);
          console.log('[wayland-h264] first frame decoded —', f.codedWidth, 'x', f.codedHeight);
        }
      },
      error: (e: Error) => {
        console.error('[wayland-h264] VideoDecoder error:', e);
        setVideoActive(false);
      },
    }) as unknown as {
      configure: (cfg: { codec: string; optimizeForLatency?: boolean }) => void;
      decode: (chunk: unknown) => void;
      close: () => void;
      state: string;
    };

    // Annex-B mode: omit "description" from configure(); decoder
    // extracts SPS/PPS from the in-band NALU stream.
    decoder.configure({
      codec: 'avc1.42E01E', // baseline 3.0 — matches gst x264enc profile=baseline output
      optimizeForLatency: true,
    });

    const ws = new WebSocket(videoUrl);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (ev: MessageEvent) => {
      const data = new Uint8Array(ev.data as ArrayBuffer);
      // Append to pending buffer.
      const merged = new Uint8Array(pending.length + data.length);
      merged.set(pending, 0);
      merged.set(data, pending.length);
      pending = merged;

      // Walk forward, emitting complete NALUs (start code → next
      // start code).
      while (true) {
        const i = findStartCode(pending, 0);
        if (i < 0) break;
        const j = findStartCode(pending, i + 3);
        if (j < 0) break; // last NALU not yet complete
        const nalu = pending.subarray(i, j);
        emitNALU(nalu);
        pending = pending.subarray(j);
      }
    };
    ws.onerror = (e) => {
      console.error('[wayland-h264] WS error:', e);
      setVideoActive(false);
    };
    ws.onclose = () => {
      setVideoActive(false);
    };

    function findStartCode(buf: Uint8Array, offset: number): number {
      for (let k = offset; k + 2 < buf.length; k++) {
        if (buf[k] === 0 && buf[k + 1] === 0) {
          if (buf[k + 2] === 1) return k;
          if (k + 3 < buf.length && buf[k + 2] === 0 && buf[k + 3] === 1) return k;
        }
      }
      return -1;
    }

    function emitNALU(nalu: Uint8Array) {
      // Skip past start code to read NALU header byte (first 5
      // bits of byte 0 of the NALU body = NAL unit type).
      const startCodeLen = nalu[2] === 1 ? 3 : 4;
      if (nalu.length <= startCodeLen) return;
      const naluType = nalu[startCodeLen] & 0x1f;
      const isKey = naluType === 5; // IDR slice
      // Don't decode delta slices before we've seen our first IDR;
      // the decoder will error and require keyframe-resync.
      if (!isKey && !saw_key) return;
      if (isKey) saw_key = true;

      // SPS (7), PPS (8), AUD (9), SEI (6) are config/markers,
      // not standalone decodable frames. WebCodecs annex-B mode
      // wants them passed through as part of the bitstream — we
      // pass each as a chunk and the decoder's own demux finds
      // the actual coded slices. Mark non-slice NALUs as 'delta'
      // so the decoder doesn't expect them to produce a frame.
      try {
        const chunk = new EncodedVideoChunkCtor({
          type: isKey ? 'key' : 'delta',
          timestamp: performance.now() * 1000, // microseconds
          data: nalu,
        });
        if (decoder.state === 'configured') {
          decoder.decode(chunk);
        }
      } catch (e) {
        console.error('[wayland-h264] decode error:', e);
      }
    }

    return () => {
      try { ws.close(); } catch { /* ignore */ }
      try { decoder.close(); } catch { /* ignore */ }
    };
  }, [videoUrl]);

  // When the H.264 video stream is healthy, hide the noVNC canvas
  // so the operator sees the smooth video feed rather than the
  // RFB-tile-based one painting underneath it. Mouse + keyboard
  // still flow through RFB. We don't unmount the noVNC canvas —
  // we just CSS-hide it so the input event listeners stay alive
  // and an H.264 fall-off (network glitch / decode error) lets us
  // smoothly switch back without re-handshaking.
  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          background: 'rgb(40, 40, 40)',
          // Visibility, not display:none — the canvas needs to keep
          // its layout box so noVNC's pointer events still fire.
          visibility: videoActive ? 'hidden' : 'visible',
        }}
      />
      {videoActive && (
        <canvas
          ref={videoCanvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            // Pointer events go through to the RFB canvas
            // underneath. We're a pure display layer.
            pointerEvents: 'none',
            cursor: 'crosshair',
            background: 'rgb(20, 20, 20)',
          }}
        />
      )}
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
