import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock dependencies BEFORE importing the component under test.
jest.mock('../../../services/healthChecksService', () => ({
  healthChecksService: {
    list: jest.fn(),
    history: jest.fn(),
  },
}));

jest.mock('../../../services/websocketService', () => {
  const handlers = new Map<string, (data: unknown) => void>();
  return {
    websocketService: {
      on: jest.fn((event: string, cb: (data: unknown) => void) => { handlers.set(event, cb); }),
      off: jest.fn((event: string) => { handlers.delete(event); }),
    },
    __getHandler: (event: string) => handlers.get(event),
  };
});

jest.mock('../../../hooks/usePermission', () => ({
  usePermission: jest.fn(),
}));

jest.mock('../../../contexts/ClientLanguageContext', () => ({
  useOptionalClientLanguage: () => ({
    t: (_key: string, _params: unknown, fallback: string) => fallback,
  }),
}));

import HealthChecksTab, { basename } from '../../../components/admin/agent-details/HealthChecksTab';
import { healthChecksService } from '../../../services/healthChecksService';
import { usePermission } from '../../../hooks/usePermission';
import * as ws from '../../../services/websocketService';

const mockedList = healthChecksService.list as jest.MockedFunction<typeof healthChecksService.list>;
const mockedUsePermission = usePermission as jest.MockedFunction<typeof usePermission>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getHandler = (ws as any).__getHandler as (event: string) => ((data: unknown) => void) | undefined;

function grantPermission(granted = true) {
  mockedUsePermission.mockReturnValue({
    hasPermission: granted,
    checkPermission: () => granted,
    isExecutive: false,
    loading: false,
    error: null,
    refreshPermissions: jest.fn(),
    permissions: granted ? ['view.agent_health_checks.enable'] : [],
    roles: [],
  });
}

describe('HealthChecksTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing-permission message when permission is denied', async () => {
    grantPermission(false);
    render(<HealthChecksTab agentId="agent-1" />);
    expect(await screen.findByText(/don't have permission/i)).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('fetches the latest results on mount when permission is granted', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({
      success: true,
      data: [
        {
          check_type: 'reboot_pending',
          severity: 'warning',
          passed: false,
          payload: { pending: true, reasons: ['windows_update'] },
          collected_at: '2026-04-28T12:00:00Z',
          reported_at: '2026-04-28T12:00:00Z',
        },
      ],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await waitFor(() => expect(mockedList).toHaveBeenCalledWith('agent-1'));
    expect(await screen.findByText('Reboot pending')).toBeInTheDocument();
    expect(screen.getByText('warning')).toBeInTheDocument();
  });

  it('sorts critical above warning above info', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({
      success: true,
      data: [
        { check_type: 'time_drift', severity: 'info', passed: true, payload: {}, collected_at: '2026-04-28T00:00:00Z', reported_at: '2026-04-28T00:00:00Z' },
        { check_type: 'crashdumps', severity: 'critical', passed: false, payload: { count_30d: 3 }, collected_at: '2026-04-28T00:00:00Z', reported_at: '2026-04-28T00:00:00Z' },
        { check_type: 'reboot_pending', severity: 'warning', passed: false, payload: {}, collected_at: '2026-04-28T00:00:00Z', reported_at: '2026-04-28T00:00:00Z' },
      ],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await screen.findByText('Crash dumps');
    const rows = screen.getAllByTestId(/^health-check-row-/).map(el => el.dataset.testid);
    // Order: critical, warning, info
    expect(rows).toEqual([
      'health-check-row-crashdumps',
      'health-check-row-reboot_pending',
      'health-check-row-time_drift',
    ]);
  });

  it('expands the payload only after the row is clicked', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({
      success: true,
      data: [
        {
          check_type: 'time_drift',
          severity: 'info',
          passed: true,
          payload: { drift_seconds: 0.123, ntp_server: 'time.cloudflare.com' },
          collected_at: '2026-04-28T00:00:00Z',
          reported_at: '2026-04-28T00:00:00Z',
        },
      ],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await screen.findByText('System clock drift');
    expect(screen.queryByText(/0\.123s/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /System clock drift/i }));
    expect(await screen.findByText(/0\.123s/)).toBeInTheDocument();
    expect(screen.getByText(/time\.cloudflare\.com/)).toBeInTheDocument();
  });

  it('subscribes to agent-check-result events and updates only its own agent', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({ success: true, data: [] });
    render(<HealthChecksTab agentId="agent-1" />);
    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    const handler = getHandler('agent-check-result');
    expect(handler).toBeDefined();

    // Event for a DIFFERENT agent — must be ignored.
    act(() => {
      handler!({
        agentId: 'agent-other',
        checkType: 'reboot_pending',
        severity: 'critical',
        passed: false,
        payload: {},
        collectedAt: '2026-04-28T01:00:00Z',
        changed: true,
      });
    });
    expect(screen.queryByText('Reboot pending')).not.toBeInTheDocument();

    // Event for THIS agent — must render.
    act(() => {
      handler!({
        agentId: 'agent-1',
        checkType: 'reboot_pending',
        severity: 'warning',
        passed: false,
        payload: { pending: true, reasons: ['windows_update'] },
        collectedAt: '2026-04-28T01:00:00Z',
        changed: true,
      });
    });
    expect(await screen.findByText('Reboot pending')).toBeInTheDocument();
  });

  it('replaces (not duplicates) a check_type when a newer event arrives', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({
      success: true,
      data: [{
        check_type: 'reboot_pending',
        severity: 'info',
        passed: true,
        payload: { pending: false },
        collected_at: '2026-04-28T00:00:00Z',
        reported_at: '2026-04-28T00:00:00Z',
      }],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await screen.findByText('Reboot pending');
    expect(screen.getAllByTestId(/^health-check-row-/)).toHaveLength(1);

    const handler = getHandler('agent-check-result');
    act(() => {
      handler!({
        agentId: 'agent-1',
        checkType: 'reboot_pending',
        severity: 'critical',
        passed: false,
        payload: { pending: true },
        collectedAt: '2026-04-28T03:00:00Z',
        changed: true,
      });
    });
    // Still ONE row, but severity should now be critical.
    expect(screen.getAllByTestId(/^health-check-row-/)).toHaveLength(1);
    expect(screen.getByText('critical')).toBeInTheDocument();
  });

  it('renders an empty-state hint when no results are reported yet', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({ success: true, data: [] });
    render(<HealthChecksTab agentId="agent-1" />);
    expect(await screen.findByText(/No health-check data reported yet/i)).toBeInTheDocument();
  });

  // ----- Stage 2.4 / 2.5 / 2.6 payload renderers -----

  it('renders battery_health stats when applicable', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({
      success: true,
      data: [{
        check_type: 'battery_health',
        severity: 'info',
        passed: true,
        payload: {
          applicable: true,
          cycle_count: 234,
          capacity_ratio: 0.913,
          design_capacity_mah: 5800,
          current_max_capacity_mah: 5300,
          is_charging: false,
          percent_remaining: 78,
        },
        collected_at: '2026-04-29T00:00:00Z',
        reported_at: '2026-04-29T00:00:00Z',
      }],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await screen.findByText('Battery health');
    fireEvent.click(screen.getByRole('button', { name: /Battery health/i }));
    expect(await screen.findByText(/91\.3%/)).toBeInTheDocument();
    expect(screen.getByText(/234/)).toBeInTheDocument();
  });

  it('renders battery non-applicable hint on desktops', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({
      success: true,
      data: [{
        check_type: 'battery_health',
        severity: 'info',
        passed: true,
        payload: { applicable: false },
        collected_at: '2026-04-29T00:00:00Z',
        reported_at: '2026-04-29T00:00:00Z',
      }],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await screen.findByText('Battery health');
    fireEvent.click(screen.getByRole('button', { name: /Battery health/i }));
    expect(await screen.findByText(/desktop \/ server/i)).toBeInTheDocument();
  });

  it('flags GPU temperature > 90°C with a visual cue', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({
      success: true,
      data: [{
        check_type: 'gpu_status',
        severity: 'warning',
        passed: false,
        payload: {
          applicable: true,
          gpus: [{ name: 'NVIDIA RTX 4090', vendor: 'NVIDIA', temperature_c: 95, utilization_pct: 100 }],
        },
        collected_at: '2026-04-29T00:00:00Z',
        reported_at: '2026-04-29T00:00:00Z',
      }],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await screen.findByText('GPU status');
    fireEvent.click(screen.getByRole('button', { name: /GPU status/i }));
    expect(await screen.findByText(/temp: 95°C/)).toBeInTheDocument();
  });

  // Regression: full executable paths were overflowing the Top processes
  // grid columns (screenshot bug 2026-04-29). basename() must extract the
  // last path segment cleanly across platform separators.
  describe('basename helper', () => {
    it('handles macOS/Linux paths', () => {
      expect(basename('/System/Library/Frameworks/Foo.framework/Foo')).toBe('Foo');
      expect(basename('/sbin/launchd')).toBe('launchd');
      expect(basename('/usr/bin/python3')).toBe('python3');
    });
    it('handles Windows paths with backslashes', () => {
      expect(basename('C:\\Windows\\System32\\svchost.exe')).toBe('svchost.exe');
      expect(basename('C:/mixed\\separators/foo.exe')).toBe('foo.exe');
    });
    it('handles bare names + edge cases', () => {
      expect(basename('foo')).toBe('foo');
      expect(basename('')).toBe('');
      // Trailing separators must not produce empty results.
      expect(basename('/usr/bin/')).toBe('bin');
    });
  });

  it('Top processes renders basename prominently with full path on a second line', async () => {
    grantPermission(true);
    const longPath = '/System/Library/ExtensionKit/Extensions/SecurityPrivacyExtension.appex/Contents/MacOS/SecurityPrivacyExtension';
    mockedList.mockResolvedValue({
      success: true,
      data: [{
        check_type: 'top_processes',
        severity: 'info',
        passed: true,
        payload: {
          top_by_cpu: [{ name: longPath, pid: 59047, cpu_pct: 101.9 }],
          top_by_mem: [{ name: '/sbin/launchd', pid: 1, mem_pct: 0.4 }],
        },
        collected_at: '2026-04-29T00:00:00Z',
        reported_at: '2026-04-29T00:00:00Z',
      }],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await screen.findByText('Top processes');
    fireEvent.click(screen.getByRole('button', { name: /Top processes/i }));
    // Basename appears as its own short text node.
    expect(await screen.findByText('SecurityPrivacyExtension')).toBeInTheDocument();
    expect(screen.getByText('launchd')).toBeInTheDocument();
    // Full path also appears (somewhere) for the operator who needs it.
    expect(screen.getByText(longPath)).toBeInTheDocument();
    // PID + percent appear as a single combined dim line per row.
    expect(screen.getByText(/PID 59047 · 101\.9%/)).toBeInTheDocument();
  });

  // ----- Stage 3.7 / 3.5 / 3.2 payload renderers -----

  it('certificate_expiry highlights certs expiring < 30 days in yellow, < 7 days in red', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({
      success: true,
      data: [{
        check_type: 'certificate_expiry',
        severity: 'critical',
        passed: false,
        payload: {
          total: 3,
          soonest_expiry: '2026-05-01T00:00:00Z',
          certs: [
            { subject: 'CN=expiring-soon.example.com', issuer: 'CN=Le', not_after: '2026-05-01T00:00:00Z', days_until_expiry: 2, source: '/etc/letsencrypt/live/x/cert.pem' },
            { subject: 'CN=warning.example.com', issuer: 'CN=Le', not_after: '2026-05-20T00:00:00Z', days_until_expiry: 21, source: '/etc/ssl/server.pem' },
            { subject: 'CN=fine.example.com', issuer: 'CN=Le', not_after: '2027-04-01T00:00:00Z', days_until_expiry: 360, source: '/etc/ssl/other.pem' },
          ],
        },
        collected_at: '2026-04-29T00:00:00Z',
        reported_at: '2026-04-29T00:00:00Z',
      }],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await screen.findByText('Certificate expiry');
    fireEvent.click(screen.getByRole('button', { name: /Certificate expiry/i }));
    expect(await screen.findByText(/CN=expiring-soon/)).toBeInTheDocument();
    // Verify the days-until line for the imminent cert.
    expect(screen.getByText(/expires in 2 days/)).toBeInTheDocument();
    expect(screen.getByText(/expires in 21 days/)).toBeInTheDocument();
  });

  it('scheduled_tasks separates suspicious from routine tasks', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({
      success: true,
      data: [{
        check_type: 'scheduled_tasks',
        severity: 'warning',
        passed: false,
        payload: {
          total: 3,
          suspicious_count: 1,
          tasks: [
            { name: 'EvilPersistence', run_as: 'SYSTEM', command: 'C:\\Users\\Public\\evil.exe', source: 'task-scheduler', suspicious: true },
            { name: 'apt-daily.timer', run_as: 'root', command: 'apt-daily.service', source: 'systemd-timer' },
            { name: 'GoogleUpdater', run_as: 'SYSTEM', command: 'C:\\Program Files\\Google\\Update.exe', source: 'task-scheduler' },
          ],
        },
        collected_at: '2026-04-29T00:00:00Z',
        reported_at: '2026-04-29T00:00:00Z',
      }],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await screen.findByText('Scheduled tasks');
    fireEvent.click(screen.getByRole('button', { name: /Scheduled tasks/i }));
    // Suspicious task name + path appear prominently.
    expect(await screen.findByText('EvilPersistence')).toBeInTheDocument();
    expect(screen.getByText(/C:\\Users\\Public\\evil\.exe/)).toBeInTheDocument();
    // Routine count summary appears.
    expect(screen.getByText(/2 routine tasks/)).toBeInTheDocument();
  });

  it('peripherals renders monitors + USB device columns', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({
      success: true,
      data: [{
        check_type: 'peripherals',
        severity: 'info',
        passed: true,
        payload: {
          monitors: [
            { name: 'Built-in Retina Display', connection: 'Built-in', resolution: '3024x1964' },
            { name: 'DELL U2720Q', connection: 'DisplayPort', resolution: '3840x2160' },
          ],
          usb_devices: [
            { name: 'Magic Keyboard', manufacturer: 'Apple Inc.', vendor_id: '0x05ac' },
            { name: 'Logitech Mouse', manufacturer: 'Logitech', vendor_id: '0x046d' },
          ],
        },
        collected_at: '2026-04-29T00:00:00Z',
        reported_at: '2026-04-29T00:00:00Z',
      }],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await screen.findByText('Peripherals');
    fireEvent.click(screen.getByRole('button', { name: /Peripherals/i }));
    expect(await screen.findByText('Built-in Retina Display')).toBeInTheDocument();
    expect(screen.getByText('DELL U2720Q')).toBeInTheDocument();
    expect(screen.getByText('Magic Keyboard')).toBeInTheDocument();
    // Section headers with counts.
    expect(screen.getByText(/Monitors \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/USB devices \(2\)/)).toBeInTheDocument();
  });

  it('peripherals shows empty hint when nothing enumerated', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({
      success: true,
      data: [{
        check_type: 'peripherals',
        severity: 'info',
        passed: true,
        payload: {},
        collected_at: '2026-04-29T00:00:00Z',
        reported_at: '2026-04-29T00:00:00Z',
      }],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await screen.findByText('Peripherals');
    fireEvent.click(screen.getByRole('button', { name: /Peripherals/i }));
    expect(await screen.findByText(/No peripherals enumerated/i)).toBeInTheDocument();
  });

  // ----- Stage 3.6 / 3.3 -----

  it('logon_history highlights elevated failure counts', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({
      success: true,
      data: [{
        check_type: 'logon_history',
        severity: 'warning',
        passed: false,
        payload: {
          success_count_24h: 3,
          failure_count_24h: 25,
          last_logon: { user: 'louis', when: '2026-04-29T09:00:00Z' },
          recent: [
            { user: 'louis', when: '2026-04-29T09:00:00Z', success: true },
            { user: 'admin', when: '2026-04-29T08:00:00Z', source_ip: '1.2.3.4', success: false },
          ],
        },
        collected_at: '2026-04-29T09:00:00Z',
        reported_at: '2026-04-29T09:00:00Z',
      }],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await screen.findByText('Logon history');
    fireEvent.click(screen.getByRole('button', { name: /Logon history/i }));
    // The "25 failed" span has a coloring class — find it by exact text content.
    expect(await screen.findByText('25 failed')).toBeInTheDocument();
    // 'Last successful logon: louis' appears in the body when last_logon is set.
    expect(screen.getByText(/Last successful logon/)).toBeInTheDocument();
    // The username 'louis' appears in the strong tag.
    expect(screen.getByText('louis')).toBeInTheDocument();
  });

  it('browser_extensions groups by browser with counts', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({
      success: true,
      data: [{
        check_type: 'browser_extensions',
        severity: 'info',
        passed: true,
        payload: {
          total: 3,
          extensions: [
            { browser: 'Chrome', user: 'louis', id: 'cjpalhdlnbpafiamejdnhcphjbkeiagm', name: 'uBlock Origin', version: '1.55.0', enabled: true },
            { browser: 'Chrome', user: 'louis', id: 'somelegit', name: '1Password', version: '8.10', enabled: true },
            { browser: 'Firefox', user: 'louis', id: 'uBlock0@raymondhill.net', name: 'uBlock Origin', version: '1.55.0', enabled: true },
          ],
        },
        collected_at: '2026-04-29T00:00:00Z',
        reported_at: '2026-04-29T00:00:00Z',
      }],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await screen.findByText('Browser extensions');
    fireEvent.click(screen.getByRole('button', { name: /Browser extensions/i }));
    // Per-browser count badges in the <summary> labels.
    expect(await screen.findByText(/Chrome \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Firefox \(1\)/)).toBeInTheDocument();
  });

  it('license_keys renders Windows OEM + Office + Adobe sections', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({
      success: true,
      data: [{
        check_type: 'license_keys',
        severity: 'info',
        passed: true,
        payload: {
          applicable: true,
          windows_oem_key: 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX',
          office_licenses: [
            { product: 'Office16ProPlusVL_KMS_Client edition', license_status: 'LICENSED', partial_key: 'ABCDE', vendor: 'Microsoft' },
          ],
          adobe_products: [
            { product: 'Acrobat', vendor: 'Adobe' },
            { product: 'Photoshop CC', vendor: 'Adobe' },
          ],
        },
        collected_at: '2026-04-29T00:00:00Z',
        reported_at: '2026-04-29T00:00:00Z',
      }],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await screen.findByText('License keys');
    fireEvent.click(screen.getByRole('button', { name: /License keys/i }));
    expect(await screen.findByText(/XXXXX-XXXXX/)).toBeInTheDocument();
    expect(screen.getByText(/Microsoft Office \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Adobe \(2\)/)).toBeInTheDocument();
    expect(screen.getByText('Office16ProPlusVL_KMS_Client edition')).toBeInTheDocument();
  });

  it('license_keys non-applicable on Linux', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({
      success: true,
      data: [{
        check_type: 'license_keys',
        severity: 'info',
        passed: true,
        payload: { applicable: false },
        collected_at: '2026-04-29T00:00:00Z',
        reported_at: '2026-04-29T00:00:00Z',
      }],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await screen.findByText('License keys');
    fireEvent.click(screen.getByRole('button', { name: /License keys/i }));
    expect(await screen.findByText(/not applicable on this OS/i)).toBeInTheDocument();
  });

  it('renders power_policy active scheme + sleep timeouts', async () => {
    grantPermission(true);
    mockedList.mockResolvedValue({
      success: true,
      data: [{
        check_type: 'power_policy',
        severity: 'warning',
        passed: false,
        payload: {
          applicable: true,
          active_scheme_name: 'High performance',
          sleep_timeout_ac_min: 0,
          sleep_timeout_battery_min: 0,
          never_sleep_ac: true,
          never_sleep_battery: true,
        },
        collected_at: '2026-04-29T00:00:00Z',
        reported_at: '2026-04-29T00:00:00Z',
      }],
    });
    render(<HealthChecksTab agentId="agent-1" />);
    await screen.findByText('Power policy');
    fireEvent.click(screen.getByRole('button', { name: /Power policy/i }));
    expect(await screen.findByText(/High performance/)).toBeInTheDocument();
    // Both AC and battery rows exist with "never" + visual cue.
    expect(screen.getAllByText(/never/i).length).toBeGreaterThanOrEqual(2);
  });
});
