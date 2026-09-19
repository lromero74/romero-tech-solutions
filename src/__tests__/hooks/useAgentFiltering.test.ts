import { filterAndSortAgents, compareSemverDesc, type AgentFilterOptions } from '../../hooks/admin/useAgentFiltering';
import type { AgentDevice } from '../../services/agentService';

const baseFilters: AgentFilterOptions = {
  searchTerm: '',
  statusFilter: 'all',
  osFilter: 'all',
  deviceTypeFilter: 'all',
  updateFilter: 'all',
  monitoringFilter: 'all',
  seenFilter: 'all',
  businessFilter: 'all',
  locationFilter: 'all',
  patchFilter: 'all',
  sortBy: 'device_name',
  sortOrder: 'asc',
  updateInProgress: new Map(),
  latestAgentVersion: '1.20.0'
};

const agent = (overrides: Partial<AgentDevice> = {}): AgentDevice =>
  ({
    id: 'a1',
    device_name: 'web-01',
    business_name: 'Acme',
    business_id: 'b1',
    location_name: 'HQ',
    os_type: 'linux',
    os_version: 'Ubuntu 24.04',
    device_type: 'server',
    agent_version: '1.19.0',
    status: 'online',
    monitoring_enabled: true,
    last_heartbeat: new Date().toISOString(),
    patch_summary: null,
    ...overrides
  }) as AgentDevice;

describe('compareSemverDesc', () => {
  it('compares numerically per segment like the Go agent', () => {
    expect(compareSemverDesc('1.16.10', '1.16.9')).toBeGreaterThan(0);
    expect(compareSemverDesc('1.9.0', '1.16.0')).toBeLessThan(0);
    expect(compareSemverDesc('v1.20.0', '1.20.0')).toBe(0);
  });
});

describe('filterAndSortAgents', () => {
  it('searches across device, business, OS and contact fields', () => {
    const agents = [agent(), agent({ id: 'a2', device_name: 'db-01', os_version: 'Windows 11 Pro' })];
    expect(filterAndSortAgents(agents, { ...baseFilters, searchTerm: '11 pro' })).toHaveLength(1);
    expect(filterAndSortAgents(agents, { ...baseFilters, searchTerm: 'acme' })).toHaveLength(2);
  });

  it('applies status and update buckets', () => {
    const agents = [
      agent(),
      agent({ id: 'a2', status: 'offline', agent_version: '1.20.0' }),
      agent({ id: 'a3', agent_version: undefined })
    ];
    expect(filterAndSortAgents(agents, { ...baseFilters, statusFilter: 'offline' })).toHaveLength(1);
    expect(filterAndSortAgents(agents, { ...baseFilters, updateFilter: 'outdated' })).toHaveLength(1);
    expect(filterAndSortAgents(agents, { ...baseFilters, updateFilter: 'current' })).toHaveLength(1);
    expect(filterAndSortAgents(agents, { ...baseFilters, updateFilter: 'unknown' })).toHaveLength(1);
  });

  it('sorts both directions without mutating the input array', () => {
    const agents = [agent({ device_name: 'b' }), agent({ device_name: 'a' })];
    Object.freeze(agents);
    const asc = filterAndSortAgents(agents, baseFilters);
    expect(asc.map(a => a.device_name)).toEqual(['a', 'b']);
    const desc = filterAndSortAgents(agents, { ...baseFilters, sortOrder: 'desc' });
    expect(desc.map(a => a.device_name)).toEqual(['b', 'a']);
    expect(agents.map(a => a.device_name)).toEqual(['b', 'a']);
  });
});
