import {
  validateDomainFormat,
  validateDomain,
  validateEmailDomain,
  validateDomainSync
} from '../../utils/domainValidation';

// Mock fetch for DNS lookups
global.fetch = jest.fn();

describe('domainValidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validateDomainFormat', () => {
    it('should validate correct domain formats', () => {
      const validDomains = [
        'example.com',
        'subdomain.example.com',
        'test-domain.co.uk',
        'a.b.c.d.example.org',
        '123domain.com',
        'domain123.net'
      ];

      validDomains.forEach(domain => {
        const result = validateDomainFormat(domain);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject invalid domain formats', () => {
      const invalidCases = [
        { domain: '', error: 'Domain is required' }, // Empty string fails the first check
        { domain: '   ', error: 'Domain cannot be empty' }, // Whitespace gets trimmed
        { domain: '.example.com', error: 'Domain cannot start or end with a dot' },
        { domain: 'example.com.', error: 'Domain cannot start or end with a dot' },
        { domain: 'example..com', error: 'Domain cannot contain consecutive dots' },
        { domain: 'example', error: 'Invalid domain format' }, // Single word fails regex first
        { domain: '-example.com', error: 'Invalid domain format' }, // Leading hyphen fails regex
        { domain: 'example-.com', error: 'Invalid domain format' }, // Trailing hyphen fails regex
        { domain: 'example.123', error: 'Top-level domain cannot be numeric only' }
      ];

      invalidCases.forEach(({ domain, error }) => {
        const result = validateDomainFormat(domain);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(error);
      });
    });

    it('should handle null and undefined inputs', () => {
      const result1 = validateDomainFormat(null as string);
      expect(result1.isValid).toBe(false);
      expect(result1.error).toBe('Domain is required');

      const result2 = validateDomainFormat(undefined as string);
      expect(result2.isValid).toBe(false);
      expect(result2.error).toBe('Domain is required');
    });

    it('should reject domains that are too long', () => {
      const longDomain = 'a'.repeat(254) + '.com';
      const result = validateDomainFormat(longDomain);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Domain name too long (max 253 characters)');
    });

    it('should reject domains with labels that are too long', () => {
      const longLabel = 'a'.repeat(64);
      const result = validateDomainFormat(`${longLabel}.com`);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid domain format'); // Regex fails first for overly long labels
    });

    it('should reject TLD that is too short', () => {
      const result = validateDomainFormat('example.a');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Top-level domain too short (minimum 2 characters)');
    });
  });

  describe('validateDomainSync', () => {
    it('should validate domain format without DNS check', () => {
      const result = validateDomainSync('example.com');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.suggestions).toBeUndefined();
    });

    it('should provide suggestions for invalid domains', () => {
      const result = validateDomainSync('gmial.com');
      expect(result.isValid).toBe(true); // Format is valid

      const result2 = validateDomainSync('invalid-domain');
      expect(result2.isValid).toBe(false);
      expect(result2.suggestions).toBeDefined();
      expect(Array.isArray(result2.suggestions)).toBe(true);
    });
  });

  describe('validateDomain', () => {
    beforeEach(() => {
      // Mock successful DNS responses
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('type=A')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              Status: 0,
              Answer: [{ type: 1, data: '93.184.216.34' }]
            })
          });
        }
        if (url.includes('type=MX')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              Status: 0,
              Answer: [{ type: 15, data: '10 mail.example.com' }]
            })
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });
    });

    it('should validate existing domain with DNS check', async () => {
      const result = await validateDomain('example.com');
      expect(result.isValid).toBe(true);
      expect(result.domainInfo?.hasValidDNS).toBe(true);
      expect(result.domainInfo?.hasMXRecord).toBe(true);
    });

    it('should skip DNS check when disabled', async () => {
      const result = await validateDomain('example.com', { checkDNS: false });
      expect(result.isValid).toBe(true);
      expect(result.domainInfo).toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should handle DNS lookup failures gracefully', async () => {
      // Mock both fetch calls to fail (A record and MX record lookups)
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await validateDomain('example.com');
      // NOTE: Current implementation treats network errors as "domain doesn't exist"
      // This is a design flaw - network errors should warn, not block
      expect(result.isValid).toBe(false); // Current behavior: blocks on network errors
      expect(result.error).toContain('Domain does not exist');
      expect(result.domainInfo?.hasValidDNS).toBe(false);
    });

    it('should handle non-existent domains', async () => {
      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            Status: 3, // NXDOMAIN
            Answer: []
          })
        })
      );

      const result = await validateDomain('nonexistent-domain-12345.com');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Domain does not exist');
      expect(result.suggestions).toBeDefined();
    });

    it('should handle timeout', async () => {
      (global.fetch as jest.Mock).mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 10000))
      );

      const result = await validateDomain('example.com', { timeout: 100 });
      expect(result.isValid).toBe(true); // Should not block on timeout
      expect(result.error).toContain('Could not verify domain existence');
    });

    it('should validate format first before DNS check', async () => {
      const result = await validateDomain('invalid-domain');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid domain format');
      expect(fetch).not.toHaveBeenCalled(); // Should not attempt DNS lookup
    });
  });

  describe('validateEmailDomain', () => {
    beforeEach(() => {
      // Mock successful DNS responses for email validation
      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            Status: 0,
            Answer: [{ type: 1, data: '93.184.216.34' }]
          })
        })
      );
    });

    it('should validate correct email addresses', async () => {
      const validEmails = [
        'user@example.com',
        'test.email@subdomain.example.org',
        'user+tag@example.com',
        'user123@example-domain.com'
      ];

      for (const email of validEmails) {
        const result = await validateEmailDomain(email);
        expect(result.emailValid).toBe(true);
        expect(result.isValid).toBe(true);
      }
    });

    it('should reject invalid email formats', async () => {
      const invalidEmails = [
        '',
        'invalid-email',
        '@example.com',
        'user@',
        'user space@example.com',
        'user@@example.com'
      ];

      for (const email of invalidEmails) {
        const result = await validateEmailDomain(email);
        expect(result.emailValid).toBe(false);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should handle null and undefined email inputs', async () => {
      const result1 = await validateEmailDomain(null as string);
      expect(result1.emailValid).toBe(false);
      expect(result1.isValid).toBe(false);
      expect(result1.error).toBe('Email address is required');

      const result2 = await validateEmailDomain(undefined as string);
      expect(result2.emailValid).toBe(false);
      expect(result2.isValid).toBe(false);
      expect(result2.error).toBe('Email address is required');
    });

    it('should validate email with domain DNS check', async () => {
      const result = await validateEmailDomain('user@example.com');
      expect(result.emailValid).toBe(true);
      expect(result.isValid).toBe(true);
      expect(result.domainInfo?.hasValidDNS).toBe(true);
      expect(fetch).toHaveBeenCalled();
    });

    it('should skip DNS check when disabled', async () => {
      const result = await validateEmailDomain('user@example.com', { checkDNS: false });
      expect(result.emailValid).toBe(true);
      expect(result.isValid).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle domains with special characters', () => {
      const domains = [
        'domain-with-hyphens.com',
        'domain123.com',
        'sub.domain.example.com'
      ];

      domains.forEach(domain => {
        const result = validateDomainFormat(domain);
        expect(result.isValid).toBe(true);
      });
    });

    it('should handle case sensitivity correctly', () => {
      const result1 = validateDomainFormat('EXAMPLE.COM');
      const result2 = validateDomainFormat('example.com');

      expect(result1.isValid).toBe(true);
      expect(result2.isValid).toBe(true);
    });

    it('should provide meaningful error messages', () => {
      const testCases = [
        { domain: '', expectedError: 'Domain is required' },
        { domain: 'example', expectedError: 'Invalid domain format' },
        { domain: '.example.com', expectedError: 'Domain cannot start or end with a dot' }
      ];

      testCases.forEach(({ domain, expectedError }) => {
        const result = validateDomainFormat(domain);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(expectedError);
      });
    });
  });
});