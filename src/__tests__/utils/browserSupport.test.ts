import { describe, expect, test } from '@jest/globals';
import * as browserSupport from '../../utils/browserSupport';

const setUserAgent = (value: string) => {
  Object.defineProperty(window.navigator, 'userAgent', {
    value,
    configurable: true,
    writable: true,
  });
};

describe('browserSupport', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('detectBrowser flags Firefox and Chrome from UA', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Firefox/132.0');

    const browser = browserSupport.detectBrowser();
    expect(browser.isFirefox).toBe(true);
    expect(browser.isChrome).toBe(false);
  });

  it('returns false for non-Firefox browsers', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Chrome/132.0.0.0)');
    const hasIssues = browserSupport.isFirefoxWithModuleIssues();
    expect(hasIssues).toBe(false);
  });

  it('returns false when browser-reported module/JS features are present', () => {
    jest.spyOn(browserSupport, 'detectBrowser').mockReturnValue({
      isFirefox: true,
      isChrome: false,
      isSafari: false,
      isEdge: false
    });

    expect(browserSupport.isFirefoxWithModuleIssues()).toBe(false);
  });

  it('returns true when module probes throw, without dynamic evaluation', () => {
    jest.spyOn(browserSupport, 'detectBrowser').mockReturnValue({
      isFirefox: true,
      isChrome: false,
      isSafari: false,
      isEdge: false
    });

    const createElementSpy = jest
      .spyOn(document, 'createElement')
      .mockImplementation(() => {
        throw new Error('blocked by CSP');
      });

    expect(browserSupport.isFirefoxWithModuleIssues()).toBe(true);
    expect(createElementSpy).toHaveBeenCalledWith('script');
  });

  test('checkFirefoxCompatibility returns a structured result', () => {
    setUserAgent('Mozilla/5.0 (Linux) Firefox/132.0.0');

    const compatibility = browserSupport.checkFirefoxCompatibility();
    expect(compatibility).toHaveProperty('compatible');
    expect(Array.isArray(compatibility.issues)).toBe(true);
  });
});
