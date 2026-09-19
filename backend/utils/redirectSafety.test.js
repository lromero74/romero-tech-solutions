import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRelativeRedirectPath } from './redirectSafety.js';

test('sanitizeRelativeRedirectPath allows intended dashboard and onboarding paths', () => {
  assert.equal(sanitizeRelativeRedirectPath('/dashboard'), '/dashboard');
  assert.equal(sanitizeRelativeRedirectPath('/schedule-service'), '/schedule-service');
  assert.equal(sanitizeRelativeRedirectPath('/onboarding?next=schedule-service'), '/onboarding?next=schedule-service');
  assert.equal(sanitizeRelativeRedirectPath('/rapid-service-resume?issueTitle=test'), '/rapid-service-resume?issueTitle=test');
});

test('sanitizeRelativeRedirectPath rejects untrusted redirects', () => {
  assert.equal(sanitizeRelativeRedirectPath('https://evil.example.com'), null);
  assert.equal(sanitizeRelativeRedirectPath('//evil.example.com'), null);
  assert.equal(sanitizeRelativeRedirectPath('dashboard'), null);
  assert.equal(sanitizeRelativeRedirectPath('/foo/bar'), null);
  assert.equal(sanitizeRelativeRedirectPath('/dashboard%0Ahttps://evil.com'), null);
  assert.equal(sanitizeRelativeRedirectPath('/dashboard\r\n//evil.com'), null);
});
