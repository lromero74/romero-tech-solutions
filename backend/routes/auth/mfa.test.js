import { test } from 'node:test';
import assert from 'node:assert/strict';
import mfaRouter, { mfaVerifyRouter } from './mfa.js';

// Guards the auth.js → auth/mfa.js split: the sub-routers must load
// (all relative imports resolve) and expose exactly the 8 MFA endpoints.
// Two routers preserve the original registration order around the
// password-routes mount: verify-* before it, the rest after it.
function routeList(router) {
  return router.stack
    .filter(layer => layer.route)
    .map(layer => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter(m => m !== '_all')
    }))
    .map(r => `${r.methods[0].toUpperCase()} ${r.path}`)
    .sort();
}

test('mfa verify router exposes pre-password MFA endpoints', () => {
  assert.deepEqual(routeList(mfaVerifyRouter), [
    'POST /verify-admin-mfa',
    'POST /verify-client-mfa'
  ]);
});

test('mfa router exposes post-password MFA endpoints', () => {
  assert.deepEqual(routeList(mfaRouter), [
    'GET /sms-stats/:phoneNumber',
    'POST /confirm-phone',
    'POST /resend-client-mfa',
    'POST /send-mfa-code',
    'POST /update-mfa-method',
    'POST /verify-phone'
  ]);
});
