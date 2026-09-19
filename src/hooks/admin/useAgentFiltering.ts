import type { AgentDevice } from '../../services/agentService';

export interface AgentFilterOptions {
  searchTerm: string;
  statusFilter: string;
  osFilter: string;
  deviceTypeFilter: string;
  updateFilter: string;
  monitoringFilter: string;
  seenFilter: string;
  businessFilter: string;
  locationFilter: string;
  patchFilter: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  updateInProgress: Map<string, string | undefined>;
  latestAgentVersion: string | null;
}

// compareSemverDesc compares two dotted-integer version strings the
// same way the Go agent does in internal/updater.compareSemver:
// numeric per-segment, missing segments treated as 0, leading "v"
// tolerated. Returns >0 if a > b, <0 if a < b, 0 if equal. We do this
// rather than naive string compare because "1.16.10" > "1.16.9"
// lexically gives the wrong answer (tested against in agent's
// updater_test.go — same regression class).
export function compareSemverDesc(a: string, b: string): number {
  const split = (v: string) =>
    v.replace(/^v/, '').trim().split('.').map((s) => {
      const n = parseInt(s, 10);
      return Number.isNaN(n) ? 0 : n;
    });
  const pa = split(a);
  const pb = split(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

// Filter and sort agents
export function filterAndSortAgents(agents: AgentDevice[], options: AgentFilterOptions): AgentDevice[] {
  const {
    searchTerm,
    statusFilter,
    osFilter,
    deviceTypeFilter,
    updateFilter,
    monitoringFilter,
    seenFilter,
    businessFilter,
    locationFilter,
    patchFilter,
    sortBy,
    sortOrder,
    updateInProgress,
    latestAgentVersion
  } = options;

  // Copy first: sort() below mutates in place and must never reorder the
  // caller's (possibly state-held) array.
  let filtered = [...agents];

  // Free-text search hits more fields than before — anything an
  // admin might reasonably type in the box should narrow the
  // list. Extra fields covered: device_type, agent_version,
  // os_version (so "11 Pro" matches Windows 11 Pro hosts),
  // and the individual contact name for individual businesses.
  if (searchTerm) {
    const search = searchTerm.toLowerCase();
    filtered = filtered.filter((agent) => {
      const haystack = [
        agent.device_name,
        agent.business_name,
        agent.location_name,
        agent.os_type,
        agent.os_version,
        agent.device_type,
        agent.agent_version,
        agent.individual_first_name,
        agent.individual_last_name,
      ]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase());
      return haystack.some((s) => s.includes(search));
    });
  }

  // Status (online/offline/warning/critical)
  if (statusFilter !== 'all') {
    filtered = filtered.filter((agent) => agent.status === statusFilter);
  }

  // OS family. Matches Go's runtime.GOOS values which is what
  // os_type stores.
  if (osFilter !== 'all') {
    filtered = filtered.filter((agent) => agent.os_type === osFilter);
  }

  // Device type — desktop / laptop / server / mobile.
  if (deviceTypeFilter !== 'all') {
    filtered = filtered.filter((agent) => agent.device_type === deviceTypeFilter);
  }

  // Update status. Computes against the manifest's latestAgentVersion
  // (already fetched and held in state) plus the live updateInProgress
  // map. Buckets:
  //   outdated     — version < latest, no update in flight
  //   in_progress  — admin clicked Update, agent hasn't returned new version yet
  //   current      — version >= latest
  //   unknown      — no agent_version reported (very old agent or
  //                  registered but never heartbeated)
  if (updateFilter !== 'all') {
    filtered = filtered.filter((agent) => {
      if (!agent.agent_version) return updateFilter === 'unknown';
      if (updateInProgress.has(agent.id)) return updateFilter === 'in_progress';
      if (!latestAgentVersion) return updateFilter === 'unknown';
      const cmp = compareSemverDesc(agent.agent_version, latestAgentVersion);
      if (cmp < 0) return updateFilter === 'outdated';
      return updateFilter === 'current';
    });
  }

  // Monitoring toggle
  if (monitoringFilter !== 'all') {
    filtered = filtered.filter((agent) =>
      monitoringFilter === 'enabled' ? agent.monitoring_enabled : !agent.monitoring_enabled
    );
  }

  // Last-seen recency. Computed off last_heartbeat (NOT created_at —
  // we want "have we heard from it recently", not "when was it
  // registered"). 'never' picks rows where last_heartbeat is null.
  if (seenFilter !== 'all') {
    const now = Date.now();
    const window: Record<string, number> = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };
    filtered = filtered.filter((agent) => {
      if (seenFilter === 'never') return !agent.last_heartbeat;
      if (!agent.last_heartbeat) return false;
      const ms = window[seenFilter];
      if (!ms) return true;
      return now - new Date(agent.last_heartbeat).getTime() <= ms;
    });
  }

  // Business / location filters. Useful for big fleets; both are
  // populated from the agents themselves so we never offer a
  // value that wouldn't return rows.
  if (businessFilter !== 'all') {
    filtered = filtered.filter((agent) => agent.business_id === businessFilter);
  }
  if (locationFilter !== 'all') {
    filtered = filtered.filter((agent) => (agent.location_name || '') === locationFilter);
  }

  // Patch availability. Pulls from the latest agent_metrics row
  // surfaced by the backend's patch_summary subquery. Agents that
  // never reported metrics (patch_summary === null) are treated
  // as "unknown" and only included in the 'all' bucket.
  if (patchFilter !== 'all') {
    filtered = filtered.filter((agent) => {
      const p = agent.patch_summary;
      if (!p) return false;
      switch (patchFilter) {
        case 'any':
          return p.os_patches > 0 || p.package_updates > 0 || p.distro_upgrade_available;
        case 'os':
          return p.os_patches > 0;
        case 'security':
          return p.os_security_patches > 0;
        case 'reboot':
          return p.os_patches_reboot;
        case 'packages':
          return p.package_updates > 0;
        case 'distro':
          return p.distro_upgrade_available;
        case 'none':
          return p.os_patches === 0 && p.package_updates === 0 && !p.distro_upgrade_available;
        default:
          return true;
      }
    });
  }

  // Sort
  filtered.sort((a, b) => {
    let compareA: string | number = '';
    let compareB: string | number = '';

    switch (sortBy) {
      case 'device_name':
        compareA = a.device_name.toLowerCase();
        compareB = b.device_name.toLowerCase();
        break;
      case 'business_name':
        compareA = (a.business_name || '').toLowerCase();
        compareB = (b.business_name || '').toLowerCase();
        break;
      case 'status':
        compareA = a.status;
        compareB = b.status;
        break;
      case 'last_heartbeat':
        compareA = a.last_heartbeat ? new Date(a.last_heartbeat).getTime() : 0;
        compareB = b.last_heartbeat ? new Date(b.last_heartbeat).getTime() : 0;
        break;
      default:
        compareA = a.device_name.toLowerCase();
        compareB = b.device_name.toLowerCase();
    }

    if (compareA < compareB) return sortOrder === 'asc' ? -1 : 1;
    if (compareA > compareB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  return filtered;
}
