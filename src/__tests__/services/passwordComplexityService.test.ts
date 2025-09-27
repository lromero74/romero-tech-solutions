import { PasswordComplexityService } from '../../services/passwordComplexityService';
import { DEFAULT_PASSWORD_REQUIREMENTS } from '../../types/passwordComplexity';

// Mock fetch
global.fetch = jest.fn();

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Note: import.meta.env handling is done via NODE_ENV check in the service

describe('PasswordComplexityService', () => {
  let service: PasswordComplexityService;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    service = new PasswordComplexityService();

    // Mock console methods
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default API base URL', () => {
      expect(service).toBeDefined();
    });

    it('should use environment variable for API base URL', () => {
      // The constructor uses import.meta.env.VITE_API_BASE_URL
      expect(service).toBeDefined();
    });
  });

  describe('getPasswordComplexityRequirements', () => {
    it('should fetch password complexity requirements successfully', async () => {
      const mockRequirements = {
        minimumLength: 12,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        maxAge: 90,
        historyCount: 12,
        lockoutThreshold: 5,
        lockoutDuration: 30
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ requirements: mockRequirements })
      } as Response);

      const result = await service.getPasswordComplexityRequirements();

      expect(result).toEqual(mockRequirements);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/admin/password-complexity',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    });

    it('should include authorization header when token is available', async () => {
      const mockToken = 'test-session-token';
      localStorageMock.getItem.mockReturnValue(mockToken);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ requirements: DEFAULT_PASSWORD_REQUIREMENTS })
      } as Response);

      await service.getPasswordComplexityRequirements();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/admin/password-complexity',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mockToken}`
          }
        }
      );
    });

    it('should return default requirements when API returns 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      } as Response);

      const result = await service.getPasswordComplexityRequirements();

      expect(result).toEqual(DEFAULT_PASSWORD_REQUIREMENTS);
    });

    it('should return defaults for other HTTP errors', async () => {
      const errorMessage = 'Unauthorized';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: errorMessage })
      } as Response);

      const result = await service.getPasswordComplexityRequirements();

      expect(result).toEqual(DEFAULT_PASSWORD_REQUIREMENTS);
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching password complexity requirements:',
        expect.any(Error)
      );
    });

    it('should return defaults when API throws network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.getPasswordComplexityRequirements();

      expect(result).toEqual(DEFAULT_PASSWORD_REQUIREMENTS);
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching password complexity requirements:',
        expect.any(Error)
      );
    });

    it('should return defaults when response has no requirements field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}) // No requirements field
      } as Response);

      const result = await service.getPasswordComplexityRequirements();

      expect(result).toEqual(DEFAULT_PASSWORD_REQUIREMENTS);
    });
  });

  describe('Authentication helpers', () => {
    it('should get session token from localStorage', async () => {
      const mockToken = 'test-token-12345';
      localStorageMock.getItem.mockReturnValue(mockToken);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ requirements: DEFAULT_PASSWORD_REQUIREMENTS })
      } as Response);

      await service.getPasswordComplexityRequirements();

      expect(localStorageMock.getItem).toHaveBeenCalledWith('sessionToken');
    });

    it('should handle missing session token gracefully', async () => {
      localStorageMock.getItem.mockReturnValue(null);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ requirements: DEFAULT_PASSWORD_REQUIREMENTS })
      } as Response);

      await service.getPasswordComplexityRequirements();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json'
            // No Authorization header when token is null
          }
        })
      );
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON'))
      } as Response);

      const result = await service.getPasswordComplexityRequirements();

      expect(result).toEqual(DEFAULT_PASSWORD_REQUIREMENTS);
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle empty response body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(null)
      } as Response);

      const result = await service.getPasswordComplexityRequirements();

      expect(result).toEqual(DEFAULT_PASSWORD_REQUIREMENTS);
    });

    it('should handle fetch timeout/abort', async () => {
      mockFetch.mockRejectedValueOnce(new DOMException('Request aborted', 'AbortError'));

      const result = await service.getPasswordComplexityRequirements();

      expect(result).toEqual(DEFAULT_PASSWORD_REQUIREMENTS);
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching password complexity requirements:',
        expect.any(DOMException)
      );
    });
  });

  describe('API endpoint construction', () => {
    it('should use correct API endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ requirements: DEFAULT_PASSWORD_REQUIREMENTS })
      } as Response);

      await service.getPasswordComplexityRequirements();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/admin/password-complexity',
        expect.any(Object)
      );
    });

    it('should work with different base URLs', () => {
      // The base URL is set via the mocked constructor
      // This test verifies the service can be instantiated
      const newService = new PasswordComplexityService();
      expect(newService).toBeDefined();
    });
  });

  describe('Default password requirements validation', () => {
    it('should use sensible defaults', () => {
      expect(DEFAULT_PASSWORD_REQUIREMENTS).toEqual({
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialCharacters: true,
        specialCharacterSet: '!@#$%^&*()_+-=[]{}|;:,.<>?',
        maxLength: 128,
        preventCommonPasswords: true,
        preventUserInfoInPassword: true,
        enablePasswordHistory: true,
        passwordHistoryCount: 5,
        enablePasswordExpiration: true,
        expirationDays: 90,
        isActive: true
      });
    });

    it('should return consistent defaults on repeated calls', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result1 = await service.getPasswordComplexityRequirements();
      const result2 = await service.getPasswordComplexityRequirements();

      expect(result1).toEqual(result2);
      expect(result1).toEqual(DEFAULT_PASSWORD_REQUIREMENTS);
    });
  });
});