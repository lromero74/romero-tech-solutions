import { getSafeInternalPath } from '../../utils/urlSafety';

describe('getSafeInternalPath', () => {
  it('allows valid internal paths', () => {
    expect(getSafeInternalPath('/dashboard')).toBe('/dashboard');
    expect(getSafeInternalPath('/download?tab=schedule-service')).toBe(
      '/download?tab=schedule-service'
    );
    expect(getSafeInternalPath('/dashboard#overview')).toBe('/dashboard#overview');
  });

  it('rejects external absolute URLs', () => {
    expect(getSafeInternalPath('https://evil.com/phish')).toBeNull();
    expect(getSafeInternalPath('//evil.com/phish')).toBeNull();
  });

  it('rejects malformed or non-root relative paths', () => {
    expect(getSafeInternalPath('dashboard')).toBeNull();
    expect(getSafeInternalPath('javascript:alert(1)')).toBeNull();
  });

  it('rejects control characters', () => {
    expect(getSafeInternalPath('/dashboard\n')).toBeNull();
  });
});
