import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAlertPushPayload, sendBrowserPushToEmployee } from './alertPush.js';

// Employee browser-push must actually deliver via the employee's active
// push_subscriptions — never log a fake "queued" line.
const alert = {
  id: 42,
  alert_title: 'CPU critical',
  alert_description: 'CPU above 95% for 5 minutes',
  severity: 'critical',
  agent_name: 'web-01',
  business_name: 'Acme',
  metric_type: 'cpu',
};

test('builds a push payload from alert details', () => {
  const payload = buildAlertPushPayload(alert);
  assert.match(payload.title, /critical/i);
  assert.match(payload.title, /web-01/);
  assert.match(payload.body, /CPU above 95%/);
  assert.equal(payload.tag, 'rts-alert-42');
  assert.ok(payload.url.includes('/'), 'payload links back to the dashboard');
});

test('no subscriptions means skipped, not failed', async () => {
  const queryFn = async () => ({ rows: [] });
  const webpush = { sendNotification: async () => { throw new Error('must not send'); } };
  const result = await sendBrowserPushToEmployee({
    employeeId: 'emp-1', payload: { title: 't' }, queryFn, webpush,
  });
  assert.deepEqual(result, { sent: 0, failed: 0, skipped: true });
});

test('sends to each active subscription', async () => {
  const queryFn = async () => ({ rows: [
    { endpoint: 'https://push/a', keys: { p256dh: 'k1', auth: 'a1' } },
    { endpoint: 'https://push/b', keys: { p256dh: 'k2', auth: 'a2' } },
  ] });
  const sentTo = [];
  const webpush = { sendNotification: async (sub) => { sentTo.push(sub.endpoint); } };
  const result = await sendBrowserPushToEmployee({
    employeeId: 'emp-1', payload: { title: 't' }, queryFn, webpush,
  });
  assert.deepEqual(result, { sent: 2, failed: 0, skipped: false });
  assert.deepEqual(sentTo, ['https://push/a', 'https://push/b']);
});

test('gone subscriptions are pruned, other failures counted', async () => {
  const queries = [];
  const queryFn = async (text) => {
    queries.push(text);
    if (text.startsWith('SELECT')) {
      return { rows: [
        { endpoint: 'https://push/gone', keys: {} },
        { endpoint: 'https://push/bad', keys: {} },
      ] };
    }
    return { rows: [] };
  };
  const webpush = { sendNotification: async (sub) => {
    if (sub.endpoint.endsWith('/gone')) {
      const err = new Error('gone');
      err.statusCode = 410;
      throw err;
    }
    throw new Error('boom');
  } };
  const result = await sendBrowserPushToEmployee({
    employeeId: 'emp-1', payload: { title: 't' }, queryFn, webpush,
  });
  assert.deepEqual(result, { sent: 0, failed: 1, skipped: false });
  assert.ok(queries.some(q => q.startsWith('DELETE')), '410 endpoint must be pruned');
});
