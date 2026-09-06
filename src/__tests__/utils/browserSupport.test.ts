import { describe, expect, test } from '@jest/globals';
import {
  detectBrowser,
  isFirefoxWithModuleIssues,
  checkFirefoxCompatibility,
} from '../../utils/browserSupport';

const setUserAgent = (value: string) => {
  Object.defineProperty(window.navigator, 'userAgent', {
    value,
    configurable: true,
    writable: true,
  });
};

describe('browserSupport', () => {
  test('detectBrowser flags Firefox and Chrome from UA', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Firefox/132.0');

    const browser = detectBrowser();
    expect(browser.isFirefox).toBe(true);
    expect(browser.isChrome).toBe(false);
  });

  test('isFirefoxWithModuleIssues returns boolean and handles non-Firefox', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Chrome/132.0.0.0)');

    const hasIssues = isFirefoxWithModuleIssues();
    expect(hasIssues).toBe(false);
  });

  test('checkFirefoxCompatibility returns a structured result', () => {
    setUserAgent('Mozilla/5.0 (Linux) Firefox/132.0.0');

    const compatibility = checkFirefoxCompatibility();
    expect(compatibility).toHaveProperty('compatible');
    expect(Array.isArray(compatibility.issues)).toBe(true);
  });
});
