import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../../services/trendsService', () => ({
  trendsService: {
    diskForecast: jest.fn(),
    baselines: jest.fn(),
    wanIpHistory: jest.fn(),
  },
}));

jest.mock('../../../hooks/usePermission', () => ({
  usePermission: jest.fn(),
}));

jest.mock('../../../contexts/ClientLanguageContext', () => ({
  useOptionalClientLanguage: () => ({
    t: (_key: string, _params: unknown, fallback: string) => fallback,
  }),
}));

// recharts breaks under jsdom because it depends on bounding-box measurements.
// Mock its container — the visual chart isn't what we're testing here.
jest.mock('recharts', () => {
  const Mock = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return new Proxy({}, {
    get: () => Mock,
  });
});

import TrendsTab from '../../../components/admin/agent-details/TrendsTab';
import { trendsService } from '../../../services/trendsService';
import { usePermission } from '../../../hooks/usePermission';

const mocked = trendsService as jest.Mocked<typeof trendsService>;
const mockedUsePermission = usePermission as jest.MockedFunction<typeof usePermission>;

function grant(perms: string[]) {
  const set = new Set(perms);
  mockedUsePermission.mockReturnValue({
    hasPermission: false,
    checkPermission: (k: string) => set.has(k),
    isExecutive: false,
    loading: false,
    error: null,
    refreshPermissions: jest.fn(),
    permissions: perms,
    roles: [],
  });
}

const ALL_PERMS = ['view.agent_trends.enable', 'view.agent_disk_forecast.enable'];

describe('TrendsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.diskForecast.mockResolvedValue({
      success: true,
      data: { forecast: null, history: [], severity: null },
    });
    mocked.baselines.mockResolvedValue({ success: true, data: [] });
    mocked.wanIpHistory.mockResolvedValue({ success: true, data: [] });
  });

  it('shows no-permission message when view.agent_trends is denied', async () => {
    grant([]);
    render(<TrendsTab agentId="a-1" />);
    expect(await screen.findByText(/don't have permission/i)).toBeInTheDocument();
    expect(mocked.diskForecast).not.toHaveBeenCalled();
  });

  it('omits the disk-forecast section when forecast permission is denied', async () => {
    grant(['view.agent_trends.enable']); // baselines + wan-ip yes; forecast no
    render(<TrendsTab agentId="a-1" />);
    // Wait for the rendered content (loading→done transition).
    await screen.findByTestId('trends-baselines');
    expect(mocked.diskForecast).not.toHaveBeenCalled();
    expect(screen.queryByTestId('trends-disk-forecast')).not.toBeInTheDocument();
    expect(screen.getByTestId('trends-wan-ip')).toBeInTheDocument();
  });

  it('renders the disk forecast when granted + populated', async () => {
    grant(ALL_PERMS);
    mocked.diskForecast.mockResolvedValue({
      success: true,
      data: {
        forecast: {
          growth_gb_per_day: 0.5,
          days_until_full: 12.3,
          forecast_full_at: '2026-05-11T00:00:00Z',
          current_used_gb: 100,
          current_total_gb: 200,
          current_percent: 50,
          sample_count: 1500,
          computed_at: '2026-04-29T03:00:00Z',
        },
        history: [
          { bucket: '2026-04-28T00:00:00Z', used_gb: 99.8, percent: 49.9 },
          { bucket: '2026-04-29T00:00:00Z', used_gb: 100.3, percent: 50.15 },
        ],
        severity: 'critical',
      },
    });
    render(<TrendsTab agentId="a-1" />);
    expect(await screen.findByText('100.0 GB')).toBeInTheDocument(); // used
    expect(screen.getByText('200.0 GB')).toBeInTheDocument();        // total
    expect(screen.getByText('0.50 GB/day')).toBeInTheDocument();     // growth
    expect(screen.getByText('12.3 days')).toBeInTheDocument();       // projected
  });

  it('renders the baseline table with mean ± 2σ band', async () => {
    grant(ALL_PERMS);
    mocked.baselines.mockResolvedValue({
      success: true,
      data: [
        { metric_type: 'cpu_percent', mean: 25.5, stddev: 5.0, sample_count: 1200, window_days: 7, computed_at: '2026-04-29T03:00:00Z' },
      ] as never,
    });
    render(<TrendsTab agentId="a-1" />);
    await screen.findByTestId('baseline-row-cpu_percent');
    // mean 25.5, stddev 5 → band 15.50–35.50
    expect(screen.getByText('15.50 – 35.50')).toBeInTheDocument();
  });

  it('renders WAN IP rows newest-first with a from→to display when there is a previous_ip', async () => {
    grant(ALL_PERMS);
    mocked.wanIpHistory.mockResolvedValue({
      success: true,
      data: [
        { id: '1', public_ip: '5.6.7.8', previous_ip: '1.2.3.4', observed_at: '2026-04-29T05:00:00Z' },
      ],
    });
    render(<TrendsTab agentId="a-1" />);
    await screen.findByTestId('trends-wan-ip');
    // Text is wrapped with arrow + bold for the new IP, so use partial matchers.
    expect(screen.getByText(/1\.2\.3\.4/)).toBeInTheDocument();
    expect(screen.getByText(/5\.6\.7\.8/)).toBeInTheDocument();
  });

  it('renders an empty-state hint per section', async () => {
    grant(ALL_PERMS);
    render(<TrendsTab agentId="a-1" />);
    expect(await screen.findByText(/No forecast yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No baselines yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No WAN IP changes recorded yet/i)).toBeInTheDocument();
  });
});
