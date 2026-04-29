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

import HealthChecksTab from '../../../components/admin/agent-details/HealthChecksTab';
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
