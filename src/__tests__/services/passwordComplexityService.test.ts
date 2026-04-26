import { DEFAULT_PASSWORD_REQUIREMENTS } from '../../types/passwordComplexity';

// Mock apiService BEFORE importing the service under test
jest.mock('../../services/apiService', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

import { PasswordComplexityService } from '../../services/passwordComplexityService';
import { apiService } from '../../services/apiService';

const mockedApi = apiService as jest.Mocked<typeof apiService>;

describe('PasswordComplexityService', () => {
  let service: PasswordComplexityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PasswordComplexityService();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getPasswordComplexityRequirements', () => {
    it('returns requirements when API succeeds', async () => {
      const requirements = { ...DEFAULT_PASSWORD_REQUIREMENTS, minLength: 12 };
      mockedApi.get.mockResolvedValueOnce({ requirements });

      const result = await service.getPasswordComplexityRequirements();

      expect(result).toEqual(requirements);
      expect(mockedApi.get).toHaveBeenCalledWith('/admin/password-complexity');
    });

    it('returns defaults when requirements field is missing', async () => {
      mockedApi.get.mockResolvedValueOnce({});
      const result = await service.getPasswordComplexityRequirements();
      expect(result).toEqual(DEFAULT_PASSWORD_REQUIREMENTS);
    });

    it('silently returns defaults on 404', async () => {
      const err: any = new Error('not found');
      err.status = 404;
      mockedApi.get.mockRejectedValueOnce(err);

      const result = await service.getPasswordComplexityRequirements();

      expect(result).toEqual(DEFAULT_PASSWORD_REQUIREMENTS);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('silently returns defaults on 401 (not yet authenticated)', async () => {
      const err: any = new Error('unauthorized');
      err.status = 401;
      mockedApi.get.mockRejectedValueOnce(err);

      const result = await service.getPasswordComplexityRequirements();

      expect(result).toEqual(DEFAULT_PASSWORD_REQUIREMENTS);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('logs and returns defaults on other errors', async () => {
      mockedApi.get.mockRejectedValueOnce(new Error('boom'));

      const result = await service.getPasswordComplexityRequirements();

      expect(result).toEqual(DEFAULT_PASSWORD_REQUIREMENTS);
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching password complexity requirements:',
        expect.any(Error)
      );
    });
  });

  describe('updatePasswordComplexityRequirements', () => {
    it('PUTs requirements to admin endpoint', async () => {
      const reqs = { ...DEFAULT_PASSWORD_REQUIREMENTS, minLength: 16 };
      mockedApi.put.mockResolvedValueOnce({ requirements: reqs });

      const result = await service.updatePasswordComplexityRequirements(reqs);

      expect(result).toEqual(reqs);
      expect(mockedApi.put).toHaveBeenCalledWith(
        '/admin/password-complexity',
        { requirements: reqs }
      );
    });

    it('throws and logs on update failure', async () => {
      mockedApi.put.mockRejectedValueOnce(new Error('boom'));
      await expect(
        service.updatePasswordComplexityRequirements(DEFAULT_PASSWORD_REQUIREMENTS)
      ).rejects.toThrow('boom');
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('createPasswordComplexityRequirements', () => {
    it('POSTs requirements', async () => {
      const reqs = DEFAULT_PASSWORD_REQUIREMENTS;
      mockedApi.post.mockResolvedValueOnce({ requirements: reqs });
      const result = await service.createPasswordComplexityRequirements(reqs);
      expect(result).toEqual(reqs);
      expect(mockedApi.post).toHaveBeenCalledWith(
        '/admin/password-complexity',
        { requirements: reqs }
      );
    });
  });

  describe('getAllPasswordComplexityConfigurations', () => {
    it('returns configurations array', async () => {
      mockedApi.get.mockResolvedValueOnce({
        configurations: [DEFAULT_PASSWORD_REQUIREMENTS],
      });
      const result = await service.getAllPasswordComplexityConfigurations();
      expect(result).toHaveLength(1);
    });

    it('returns empty array when configurations missing', async () => {
      mockedApi.get.mockResolvedValueOnce({});
      const result = await service.getAllPasswordComplexityConfigurations();
      expect(result).toEqual([]);
    });
  });

  describe('activatePasswordComplexityConfiguration', () => {
    it('POSTs to activate endpoint', async () => {
      mockedApi.post.mockResolvedValueOnce({
        requirements: DEFAULT_PASSWORD_REQUIREMENTS,
      });
      await service.activatePasswordComplexityConfiguration('abc-123');
      expect(mockedApi.post).toHaveBeenCalledWith(
        '/admin/password-complexity/abc-123/activate'
      );
    });
  });

  describe('deletePasswordComplexityConfiguration', () => {
    it('DELETEs config by id', async () => {
      mockedApi.delete.mockResolvedValueOnce(undefined as any);
      await service.deletePasswordComplexityConfiguration('id-1');
      expect(mockedApi.delete).toHaveBeenCalledWith(
        '/admin/password-complexity/id-1'
      );
    });
  });

  describe('validatePassword', () => {
    it('returns API result when API succeeds', async () => {
      mockedApi.post.mockResolvedValueOnce({
        isValid: true,
        feedback: [],
        strength: 4,
      });
      const result = await service.validatePassword('Strong#Password1');
      expect(result).toEqual({ isValid: true, feedback: [], strength: 4 });
      expect(mockedApi.post).toHaveBeenCalledWith(
        '/auth/validate-password',
        { password: 'Strong#Password1', userInfo: undefined }
      );
    });

    it('falls back to client-side evaluation when API fails', async () => {
      // Force API to fail, then the fallback path uses get() to fetch reqs.
      mockedApi.post.mockRejectedValueOnce(new Error('offline'));
      mockedApi.get.mockResolvedValueOnce({
        requirements: DEFAULT_PASSWORD_REQUIREMENTS,
      });

      const result = await service.validatePassword('weak');

      // Client-side eval — fields exist regardless of pass/fail
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('feedback');
      expect(result).toHaveProperty('strength');
    });
  });

  describe('addPasswordToHistory', () => {
    it('does not throw on success', async () => {
      mockedApi.post.mockResolvedValueOnce({});
      await expect(
        service.addPasswordToHistory('user1', 'hash1')
      ).resolves.toBeUndefined();
    });

    it('does not throw on error (non-critical path)', async () => {
      mockedApi.post.mockRejectedValueOnce(new Error('offline'));
      await expect(
        service.addPasswordToHistory('user1', 'hash1')
      ).resolves.toBeUndefined();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('checkPasswordHistory', () => {
    it('returns API value when present', async () => {
      mockedApi.post.mockResolvedValueOnce({ isInHistory: true });
      const result = await service.checkPasswordHistory('u1', 'h1');
      expect(result).toBe(true);
    });

    it('defaults to false on missing field', async () => {
      mockedApi.post.mockResolvedValueOnce({});
      const result = await service.checkPasswordHistory('u1', 'h1');
      expect(result).toBe(false);
    });

    it('defaults to false on error', async () => {
      mockedApi.post.mockRejectedValueOnce(new Error('offline'));
      const result = await service.checkPasswordHistory('u1', 'h1');
      expect(result).toBe(false);
    });
  });

  describe('getPasswordExpirationInfo', () => {
    it('returns expiration data', async () => {
      const info = {
        passwordChangedAt: '2026-01-01',
        passwordExpiresAt: '2026-04-01',
        daysUntilExpiration: 30,
        isExpired: false,
        forcePasswordChange: false,
      };
      mockedApi.get.mockResolvedValueOnce(info);
      const result = await service.getPasswordExpirationInfo('u1');
      expect(result).toEqual(info);
      expect(mockedApi.get).toHaveBeenCalledWith('/auth/password-expiration/u1');
    });

    it('throws on error', async () => {
      mockedApi.get.mockRejectedValueOnce(new Error('boom'));
      await expect(service.getPasswordExpirationInfo('u1')).rejects.toThrow();
    });
  });

  describe('DEFAULT_PASSWORD_REQUIREMENTS', () => {
    it('has sensible production-ready defaults', () => {
      expect(DEFAULT_PASSWORD_REQUIREMENTS.minLength).toBeGreaterThanOrEqual(8);
      expect(DEFAULT_PASSWORD_REQUIREMENTS.maxLength).toBeGreaterThanOrEqual(64);
      expect(DEFAULT_PASSWORD_REQUIREMENTS.requireUppercase).toBe(true);
      expect(DEFAULT_PASSWORD_REQUIREMENTS.requireLowercase).toBe(true);
      expect(DEFAULT_PASSWORD_REQUIREMENTS.requireNumbers).toBe(true);
      expect(DEFAULT_PASSWORD_REQUIREMENTS.requireSpecialCharacters).toBe(true);
      expect(typeof DEFAULT_PASSWORD_REQUIREMENTS.specialCharacterSet).toBe('string');
      expect(DEFAULT_PASSWORD_REQUIREMENTS.specialCharacterSet.length).toBeGreaterThan(0);
    });
  });
});
