// Mock apiService BEFORE importing agentService. agentService imports
// the default export, so we need to provide both default and named.
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

import { agentService } from '../../services/agentService';
import { apiService } from '../../services/apiService';

const mockedApi = apiService as jest.Mocked<typeof apiService>;

describe('agentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.get.mockResolvedValue({ success: true, data: undefined } as any);
    mockedApi.post.mockResolvedValue({
      success: true,
      data: { command_id: 'cmd-1', status: 'pending' },
    } as any);
  });

  describe('listAgents', () => {
    it('GETs /agents with no params when no filter given', async () => {
      await agentService.listAgents();
      expect(mockedApi.get).toHaveBeenCalledWith('/agents', { params: {} });
    });

    it('passes filters as query params', async () => {
      await agentService.listAgents({
        business_id: 'b1',
        service_location_id: 'l1',
        status: 'online',
      });
      expect(mockedApi.get).toHaveBeenCalledWith('/agents', {
        params: { business_id: 'b1', service_location_id: 'l1', status: 'online' },
      });
    });
  });

  describe('getAgent', () => {
    it('GETs /agents/:id', async () => {
      await agentService.getAgent('agent-1');
      expect(mockedApi.get).toHaveBeenCalledWith('/agents/agent-1');
    });
  });

  describe('getAgentMetricsHistory', () => {
    it('passes hours as a string param (default 24)', async () => {
      await agentService.getAgentMetricsHistory('agent-1');
      expect(mockedApi.get).toHaveBeenCalledWith('/agents/agent-1/metrics/history', {
        params: { hours: '24' },
      });
    });

    it('passes a custom hours value and metric_type', async () => {
      await agentService.getAgentMetricsHistory('agent-1', 6, 'cpu_percent');
      expect(mockedApi.get).toHaveBeenCalledWith('/agents/agent-1/metrics/history', {
        params: { hours: '6', metric_type: 'cpu_percent' },
      });
    });
  });

  describe('createCommand', () => {
    it('POSTs /agents/:id/commands with the command data verbatim', async () => {
      await agentService.createCommand('agent-1', {
        command_type: 'ping',
        command_payload: { foo: 'bar' },
      });
      expect(mockedApi.post).toHaveBeenCalledWith('/agents/agent-1/commands', {
        command_type: 'ping',
        command_payload: { foo: 'bar' },
      });
    });
  });

  describe('requestUpdatePackages', () => {
    it('POSTs an update_packages command with sensible defaults', async () => {
      await agentService.requestUpdatePackages('a1', {
        manager: 'apt',
        scope: 'all',
        packages: [],
      });
      expect(mockedApi.post).toHaveBeenCalledWith('/agents/a1/commands', {
        command_type: 'update_packages',
        command_params: {
          manager: 'apt',
          scope: 'all',
          packages: [],
          dry_run: false,
          auto_confirm: true,
          timeout_seconds: 1800,
          stop_on_first_failure: false,
        },
        requires_approval: false,
      });
    });

    it('honors caller-provided overrides', async () => {
      await agentService.requestUpdatePackages('a1', {
        manager: 'dnf',
        scope: 'selected',
        packages: ['curl', 'vim'],
        dry_run: true,
        auto_confirm: false,
        timeout_seconds: 600,
        stop_on_first_failure: true,
      });
      const call = mockedApi.post.mock.calls[0];
      expect(call[1].command_params).toMatchObject({
        manager: 'dnf',
        scope: 'selected',
        packages: ['curl', 'vim'],
        dry_run: true,
        auto_confirm: false,
        timeout_seconds: 600,
        stop_on_first_failure: true,
      });
    });
  });

  describe('requestRebootHost', () => {
    it('POSTs a reboot_host command with default delay (60s) and message', async () => {
      await agentService.requestRebootHost('a1');
      expect(mockedApi.post).toHaveBeenCalledWith('/agents/a1/commands', {
        command_type: 'reboot_host',
        command_params: {
          delay_seconds: 60,
          message: 'RTS Agent: rebooting to apply pending updates',
        },
        requires_approval: false,
      });
    });

    it('passes through a custom delay (e.g. 5 min = 300s)', async () => {
      await agentService.requestRebootHost('a1', { delay_seconds: 300 });
      const call = mockedApi.post.mock.calls[0];
      expect(call[1].command_params.delay_seconds).toBe(300);
    });

    it('passes through a custom user message', async () => {
      await agentService.requestRebootHost('a1', { message: 'Maintenance window' });
      const call = mockedApi.post.mock.calls[0];
      expect(call[1].command_params.message).toBe('Maintenance window');
    });
  });

  describe('requestRefreshPatches', () => {
    it('POSTs a refresh_patches command with empty params', async () => {
      await agentService.requestRefreshPatches('a1');
      expect(mockedApi.post).toHaveBeenCalledWith('/agents/a1/commands', {
        command_type: 'refresh_patches',
        command_params: {},
        requires_approval: false,
      });
    });

    it('returns the API response unchanged', async () => {
      mockedApi.post.mockResolvedValueOnce({
        success: true,
        data: { command_id: 'cmd-99', status: 'pending' },
      } as any);

      const result = await agentService.requestRefreshPatches('a1');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ command_id: 'cmd-99', status: 'pending' });
    });
  });

  describe('createRegistrationToken', () => {
    it('POSTs to the registration tokens endpoint', async () => {
      await agentService.createRegistrationToken({
        business_id: 'b1',
        service_location_id: 'l1',
        expires_in_hours: 24,
      });
      expect(mockedApi.post).toHaveBeenCalledWith('/agents/registration-tokens', {
        business_id: 'b1',
        service_location_id: 'l1',
        expires_in_hours: 24,
      });
    });
  });
});
