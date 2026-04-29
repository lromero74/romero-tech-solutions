// Mock apiService BEFORE importing the service under test.
jest.mock('../../services/apiService', () => {
  const mock = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  };
  return {
    __esModule: true,
    default: mock,
    apiService: mock,
  };
});

import { healthChecksService } from '../../services/healthChecksService';
import apiService from '../../services/apiService';

const mockedApi = apiService as jest.Mocked<typeof apiService>;

describe('healthChecksService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.get.mockResolvedValue({ success: true, data: [] } as never);
  });

  describe('list', () => {
    it('GETs /agents/:id/health-checks', async () => {
      await healthChecksService.list('agent-123');
      expect(mockedApi.get).toHaveBeenCalledWith('/agents/agent-123/health-checks');
    });

    it('encodes the agent id verbatim (caller is responsible for encoding)', async () => {
      // Defensive: a UUID is the only legal value here. If a future caller
      // supplies a value with /, regression would silently call a different
      // route — pin the format we expect.
      await healthChecksService.list('00000000-0000-0000-0000-000000000001');
      expect(mockedApi.get).toHaveBeenCalledWith(
        '/agents/00000000-0000-0000-0000-000000000001/health-checks'
      );
    });
  });

  describe('history', () => {
    it('defaults days to 30', async () => {
      await healthChecksService.history('agent-1', 'reboot_pending');
      expect(mockedApi.get).toHaveBeenCalledWith(
        '/agents/agent-1/health-checks/reboot_pending/history?days=30'
      );
    });

    it('clamps days below 1 up to 1', async () => {
      await healthChecksService.history('agent-1', 'time_drift', 0);
      expect(mockedApi.get).toHaveBeenCalledWith(
        '/agents/agent-1/health-checks/time_drift/history?days=1'
      );
    });

    it('clamps days above 90 down to 90', async () => {
      await healthChecksService.history('agent-1', 'crashdumps', 365);
      expect(mockedApi.get).toHaveBeenCalledWith(
        '/agents/agent-1/health-checks/crashdumps/history?days=90'
      );
    });

    it('clamps negative days up to 1', async () => {
      await healthChecksService.history('agent-1', 'top_processes', -50);
      expect(mockedApi.get).toHaveBeenCalledWith(
        '/agents/agent-1/health-checks/top_processes/history?days=1'
      );
    });

    it('passes valid mid-range days through unchanged', async () => {
      await healthChecksService.history('agent-1', 'listening_ports', 14);
      expect(mockedApi.get).toHaveBeenCalledWith(
        '/agents/agent-1/health-checks/listening_ports/history?days=14'
      );
    });
  });
});
