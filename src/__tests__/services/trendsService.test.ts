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

import { trendsService } from '../../services/trendsService';
import apiService from '../../services/apiService';

const mockedApi = apiService as jest.Mocked<typeof apiService>;

describe('trendsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.get.mockResolvedValue({ success: true, data: {} } as never);
  });

  describe('diskForecast', () => {
    it('GETs /agents/:id/disk-forecast with default days=30', async () => {
      await trendsService.diskForecast('a-1');
      expect(mockedApi.get).toHaveBeenCalledWith('/agents/a-1/disk-forecast?days=30');
    });
    it('clamps days below 1 → 1', async () => {
      await trendsService.diskForecast('a-1', 0);
      expect(mockedApi.get).toHaveBeenCalledWith('/agents/a-1/disk-forecast?days=1');
    });
    it('clamps days above 90 → 90', async () => {
      await trendsService.diskForecast('a-1', 365);
      expect(mockedApi.get).toHaveBeenCalledWith('/agents/a-1/disk-forecast?days=90');
    });
  });

  describe('baselines', () => {
    it('GETs /agents/:id/baselines', async () => {
      await trendsService.baselines('a-1');
      expect(mockedApi.get).toHaveBeenCalledWith('/agents/a-1/baselines');
    });
  });

  describe('wanIpHistory', () => {
    it('default limit=50', async () => {
      await trendsService.wanIpHistory('a-1');
      expect(mockedApi.get).toHaveBeenCalledWith('/agents/a-1/wan-ip-history?limit=50');
    });
    it('clamps limit above 500', async () => {
      await trendsService.wanIpHistory('a-1', 9999);
      expect(mockedApi.get).toHaveBeenCalledWith('/agents/a-1/wan-ip-history?limit=500');
    });
  });
});
