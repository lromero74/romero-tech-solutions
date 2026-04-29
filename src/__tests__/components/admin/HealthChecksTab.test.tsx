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
});
