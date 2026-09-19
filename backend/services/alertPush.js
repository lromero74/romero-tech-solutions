import { query } from '../config/database.js';

// Employee browser-push delivery for alert notifications. The alert service
// previously only logged "queued (not yet implemented)" while honoring
// nothing — this sends through each employee's active push_subscriptions
// (devices subscribed via /api/push/subscribe) and prunes 410-gone
// endpoints. web-push is caller-supplied so this module never configures
// VAPID at load (missing keys crash at setVapidDetails time).

export function buildAlertPushPayload(alert) {
  const severity = String(alert.severity || 'info').toUpperCase();
  return {
    title: `[${severity}] ${alert.agent_name || 'Agent'} — ${alert.alert_title || alert.alert_type || 'Alert'}`,
    body: alert.alert_description || `${alert.metric_type || 'metric'} threshold crossed`,
    tag: `rts-alert-${alert.id}`,
    url: '/admin/alerts',
    data: {
      alertId: alert.id,
      severity: alert.severity,
      agentName: alert.agent_name,
      businessName: alert.business_name || null,
    },
  };
}

export async function sendBrowserPushToEmployee({ employeeId, payload, queryFn = query, webpush }) {
  const subs = await queryFn(
    'SELECT endpoint, keys FROM push_subscriptions WHERE employee_id = $1 AND is_active = true',
    [employeeId]
  );
  if (subs.rows.length === 0) {
    return { sent: 0, failed: 0, skipped: true };
  }
  let sent = 0;
  let failed = 0;
  const body = JSON.stringify(payload);
  for (const sub of subs.rows) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body);
      sent++;
    } catch (error) {
      if (error && error.statusCode === 410) {
        await queryFn('DELETE FROM push_subscriptions WHERE employee_id = $1 AND endpoint = $2', [employeeId, sub.endpoint]);
      } else {
        failed++;
      }
    }
  }
  return { sent, failed, skipped: false };
}

// Best-effort delivery for one subscriber inside the alert fan-out: lazy
// web-push import (never at module load), graceful when VAPID is
// unconfigured, never throws into the fan-out loop.
export async function deliverEmployeeBrowserPush({ employeeId, alert, queryFn = query }) {
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) {
    return { sent: 0, failed: 0, skipped: true, reason: 'vapid-unconfigured' };
  }
  const { default: webpush } = await import('web-push');
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:info@romerotechsolutions.com',
    vapidPublic,
    vapidPrivate
  );
  return sendBrowserPushToEmployee({
    employeeId,
    payload: buildAlertPushPayload(alert),
    queryFn,
    webpush,
  });
}
