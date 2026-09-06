import {
  sanitizeRelativeDashboardRedirect
} from '../../utils/redirectSafety';

describe('sanitizeRelativeDashboardRedirect', () => {
  it('allows dashboard route and expected app routes', () => {
    expect(sanitizeRelativeDashboardRedirect('/dashboard')).toBe('/dashboard');
    expect(sanitizeRelativeDashboardRedirect('/dashboard?tab=schedule-service')).toBe('/dashboard?tab=schedule-service');
    expect(sanitizeRelativeDashboardRedirect('/schedule-service')).toBe('/schedule-service');
    expect(sanitizeRelativeDashboardRedirect('/onboarding')).toBe('/onboarding');
    expect(sanitizeRelativeDashboardRedirect('/rapid-service-resume')).toBe('/rapid-service-resume');
  });

  it('falls back to dashboard for absolute or malformed values', () => {
    expect(sanitizeRelativeDashboardRedirect('https://evil.com')).toBe('/dashboard');
    expect(sanitizeRelativeDashboardRedirect('//evil.com')).toBe('/dashboard');
    expect(sanitizeRelativeDashboardRedirect('dashboard')).toBe('/dashboard');
    expect(sanitizeRelativeDashboardRedirect('/../../etc/passwd')).toBe('/dashboard');
    expect(sanitizeRelativeDashboardRedirect('/foo/bar')).toBe('/dashboard');
  });

  it('rejects hidden control characters used in header/injection attacks', () => {
    expect(sanitizeRelativeDashboardRedirect('/dashboard%0A%0Dhttps://evil.com')).toBe('/dashboard');
    expect(sanitizeRelativeDashboardRedirect('/dashboard\r\n//evil.com')).toBe('/dashboard');
  });
});
