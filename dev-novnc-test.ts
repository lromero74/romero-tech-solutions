// Dev-only entry point — verifies the WaylandRemoteControlClient
// component talks to the agent's Go VNC server through the
// vnc-ws-bridge correctly. Not part of any production bundle;
// vite serves it directly during development.
//
// Companion to dev-novnc-test.html. Open at:
//   http://localhost:5173/dev-novnc-test.html
//
// Reads ?url= query param if present, otherwise defaults to
//   ws://localhost:6080
// which is what cmd/vnc-ws-bridge in rts-monitoring-agent uses
// out of the box.

import RFB from '@novnc/novnc/lib/rfb';

const status = document.getElementById('status') as HTMLElement;
const canvas = document.getElementById('canvas') as HTMLElement;

const url = new URL(window.location.href).searchParams.get('url') || 'ws://localhost:6080';
status.textContent = 'Connecting to ' + url + '…';

let rfb: RFB;
try {
  rfb = new RFB(canvas, url, { shared: true });
} catch (e) {
  status.textContent = 'RFB constructor failed: ' + (e as Error).message;
  status.className = 'status err';
  throw e;
}
rfb.viewOnly = true;
rfb.scaleViewport = true;

rfb.addEventListener('connect', () => {
  status.textContent = 'Connected — frames flowing';
  status.className = 'status ok';
});
rfb.addEventListener('disconnect', (e) => {
  const detail = (e as { detail?: { clean?: boolean } }).detail ?? {};
  status.textContent = 'Disconnected (clean=' + (detail.clean ?? false) + ')';
  status.className = 'status err';
});
rfb.addEventListener('securityfailure', (e) => {
  const detail = (e as { detail?: { reason?: string } }).detail ?? {};
  status.textContent = 'Security failure: ' + (detail.reason ?? 'unknown');
  status.className = 'status err';
});
rfb.addEventListener('credentialsrequired', () => {
  status.textContent = 'Credentials required — server is not the RTS test server';
  status.className = 'status warn';
});
rfb.addEventListener('desktopname', (e) => {
  const detail = (e as { detail?: { name?: string } }).detail ?? {};
  document.title = 'noVNC — ' + (detail.name ?? '?');
});
