// Minimal TypeScript declaration for the @novnc/novnc package.
// noVNC 1.6 ships with no .d.ts files; this file declares only
// the RFB class surface that WaylandRemoteControlClient uses.
//
// If you need to call additional RFB methods or properties, add
// them here. The full API is documented at:
//   node_modules/@novnc/novnc/docs/API.md

declare module '@novnc/novnc/lib/rfb' {
  interface RFBOptions {
    /**
     * Shared session flag passed to the server's ClientInit. Defaults
     * to true. We always pass true for v1.19 because the agent
     * doesn't multiplex sessions.
     */
    shared?: boolean;
    /**
     * Initial credentials. For v1.19 alpha the server uses Security
     * type None and ignores credentials, but the noVNC RFB constructor
     * accepts the option regardless.
     */
    credentials?: {
      username?: string;
      password?: string;
      target?: string;
    };
    /**
     * Set to a non-empty string to enable repeater protocol mode
     * (UltraVNC's repeater forwarding). Not used by our path.
     */
    repeaterID?: string;
    /**
     * WebSocket sub-protocols to request during the upgrade
     * handshake. MeshCentral's relay-tunnel WebSocket layer may
     * require specific values; default is fine for direct
     * websockify dev.
     */
    wsProtocols?: string[];
  }

  /**
   * Detail payload for the 'disconnect' event.
   */
  interface DisconnectEvent extends Event {
    detail: { clean: boolean };
  }

  /**
   * Detail payload for the 'securityfailure' event.
   */
  interface SecurityFailureEvent extends Event {
    detail: { status: number; reason: string };
  }

  /**
   * Detail payload for the 'desktopname' event.
   */
  interface DesktopNameEvent extends Event {
    detail: { name: string };
  }

  /**
   * Detail payload for the 'serververification' event (TLS
   * cert verification — fires only when our server uses VeNCrypt
   * security, which v1.19 alpha does not).
   */
  interface ServerVerificationEvent extends Event {
    detail: { type: string; publickey: Uint8Array };
  }

  export default class RFB extends EventTarget {
    /**
     * Constructs a new RFB connection.
     *
     * @param target  DOM element that will host the canvas. Created
     *                children are managed entirely by noVNC; do not
     *                manipulate them directly.
     * @param url     URL to a websockify-compatible WebSocket
     *                endpoint. Either ws:// or wss://.
     * @param options Optional connection parameters.
     */
    constructor(
      target: HTMLElement,
      url: string,
      options?: RFBOptions,
    );

    /**
     * Boolean. Set to true to suppress all client-side input (mouse
     * + keyboard). v1.19 always uses viewOnly because input is
     * forwarded out-of-band via the portal RemoteDesktop interface.
     */
    viewOnly: boolean;

    /**
     * Boolean. Scale the remote session to fit the container.
     */
    scaleViewport: boolean;

    /**
     * Boolean. Resize the remote session to match the container.
     * Has no effect against our server (which advertises a fixed
     * size at ServerInit time).
     */
    resizeSession: boolean;

    /**
     * Disconnect from the server. Idempotent.
     */
    disconnect(): void;

    /**
     * Move keyboard focus to the remote session.
     */
    focus(): void;

    /**
     * Remove keyboard focus from the remote session.
     */
    blur(): void;

    /**
     * Approves a pending server-identity verification (used only
     * with VeNCrypt security types, not our path).
     */
    approveServer(): void;
  }
}
