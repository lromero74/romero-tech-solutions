/**
 * WAN IP change tracker (Stage 2.7).
 *
 * Records each agent's source IP on every authenticated request and
 * inserts a row into agent_wan_ip_history when the IP changes.
 *
 * Why server-side: the agent already authenticates over HTTPS, so
 * req.ip on the backend IS the agent's public-facing IP from the
 * server's perspective. We don't need a new agent collector or an
 * outbound IP-echo service — saves agent-version churn.
 *
 * Trade-off: NAT'd LANs all show the same WAN IP for all devices.
 * That's fine — what we want to detect is "this device's public-IP
 * group changed" (e.g., laptop moved networks), and that signal IS
 * conveyed by the WAN IP shift. Per-device LAN IP is captured
 * elsewhere (agent_devices.ip_address from heartbeat).
 *
 * Called from agentAuthMiddleware after the bearer token validates.
 *
 * See docs/PRPs/STAGE2_TRENDS.md.
 */
import { query } from '../config/database.js';

/**
 * Pure decision: should we record a new history row?
 *
 * Returns true when the proposed IP differs from the previous IP
 * (or when there's no previous IP at all — first sighting).
 *
 * Normalizes for the IPv6/IPv4-mapped corner case so "::ffff:1.2.3.4"
 * and "1.2.3.4" don't churn the history table.
 */
export function shouldRecordIpChange(newIp, previousIp) {
  if (!newIp) return false;
  const normNew = normalizeIp(newIp);
  if (!previousIp) return true;
  const normPrev = normalizeIp(previousIp);
  return normNew !== normPrev;
}

export function normalizeIp(ip) {
  if (!ip) return '';
  const s = String(ip).trim();
  // IPv6-mapped IPv4 prefix.
  if (s.toLowerCase().startsWith('::ffff:')) return s.substring(7);
  return s;
}

/**
 * Record an observation. Idempotent — only inserts when the IP differs
 * from the most-recent row for the agent.
 *
 * Returns { changed, previousIp, currentIp }. Caller decides whether
 * to fire an alert based on the boolean.
 */
export async function recordObservation(agentDeviceId, businessId, ip) {
  if (!ip) return { changed: false, previousIp: null, currentIp: null };
  const normalized = normalizeIp(ip);

  const { rows } = await query(`
    SELECT public_ip::text AS public_ip
      FROM agent_wan_ip_history
     WHERE agent_device_id = $1
     ORDER BY observed_at DESC
     LIMIT 1
  `, [agentDeviceId]);
  const previous = rows[0] ? rows[0].public_ip : null;

  if (!shouldRecordIpChange(normalized, previous)) {
    return { changed: false, previousIp: previous, currentIp: normalized };
  }

  await query(`
    INSERT INTO agent_wan_ip_history
      (agent_device_id, business_id, public_ip, previous_ip, observed_at)
    VALUES ($1, $2, $3::inet, $4, now())
  `, [agentDeviceId, businessId, normalized, previous]);

  return { changed: true, previousIp: previous, currentIp: normalized };
}

/**
 * Fetch most recent N rows for the trends UI. Default 50.
 */
export async function getHistory(agentDeviceId, limit = 50) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
  const { rows } = await query(`
    SELECT id, public_ip::text AS public_ip, previous_ip::text AS previous_ip, observed_at
      FROM agent_wan_ip_history
     WHERE agent_device_id = $1
     ORDER BY observed_at DESC
     LIMIT $2
  `, [agentDeviceId, safeLimit]);
  return rows;
}
