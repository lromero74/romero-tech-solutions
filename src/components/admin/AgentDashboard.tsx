import React, { useState, useEffect, useCallback } from 'react';
import { Monitor, Server, Laptop, Smartphone, Circle, AlertTriangle, Activity, Plus, RefreshCw, Filter, X, Eye } from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import { usePermission } from '../../hooks/usePermission';
import { agentService, AgentDevice } from '../../services/agentService';
import { PermissionDeniedModal } from './shared/PermissionDeniedModal';

interface AgentDashboardProps {
  onViewAgentDetails?: (agentId: string) => void;
  onCreateRegistrationToken?: () => void;
}

const AgentDashboard: React.FC<AgentDashboardProps> = ({
  onViewAgentDetails,
  onCreateRegistrationToken,
}) => {
  const [agents, setAgents] = useState<AgentDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('device_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Permission checks
  const { checkPermission } = usePermission();
  const canViewAgents = checkPermission('view.agents.enable');
  const canManageAgents = checkPermission('manage.agents.enable');
  const canCreateTokens = checkPermission('create.agent_tokens.enable');

  // Permission denied modal
  const [permissionDenied, setPermissionDenied] = useState<{
    show: boolean;
    action?: string;
    requiredPermission?: string;
    message?: string;
  }>({ show: false });

  // Load agents
  const loadAgents = useCallback(async () => {
    if (!canViewAgents) {
      setPermissionDenied({
        show: true,
        action: 'View Agents',
        requiredPermission: 'view.agents.enable',
        message: 'You do not have permission to view monitoring agents'
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await agentService.listAgents();
      if (response.success && response.data) {
        setAgents(response.data.agents);
      } else {
        setError(response.message || 'Failed to load agents');
      }
    } catch (err) {
      console.error('Error loading agents:', err);
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, [canViewAgents]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // Get device icon based on type
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case 'server':
        return <Server className="w-5 h-5" />;
      case 'desktop':
      case 'workstation':
        return <Monitor className="w-5 h-5" />;
      case 'laptop':
        return <Laptop className="w-5 h-5" />;
      case 'mobile':
        return <Smartphone className="w-5 h-5" />;
      default:
        return <Monitor className="w-5 h-5" />;
    }
  };

  // Get status color and icon
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'online':
        return {
          color: 'text-green-600',
          bgColor: 'bg-green-100 dark:bg-green-900/20',
          icon: <Circle className="w-3 h-3 fill-current" />,
          label: 'Online'
        };
      case 'offline':
        return {
          color: 'text-red-700 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-900/20',
          icon: <Circle className="w-3 h-3 fill-current" />,
          label: 'Offline'
        };
      case 'warning':
        return {
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
          icon: <AlertTriangle className="w-3 h-3" />,
          label: 'Warning'
        };
      case 'critical':
        return {
          color: 'text-red-600',
          bgColor: 'bg-red-100 dark:bg-red-900/20',
          icon: <AlertTriangle className="w-3 h-3" />,
          label: 'Critical'
        };
      default:
        return {
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          icon: <Circle className="w-3 h-3" />,
          label: 'Unknown'
        };
    }
  };

  // Format last heartbeat time
  const formatLastSeen = (lastHeartbeat: string | null): string => {
    if (!lastHeartbeat) return 'Never';

    const now = new Date();
    const heartbeatDate = new Date(lastHeartbeat);
    const diffMs = now.getTime() - heartbeatDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  // Filter and sort agents
  const getFilteredAndSortedAgents = (): AgentDevice[] => {
    let filtered = agents;

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(agent =>
        agent.device_name.toLowerCase().includes(search) ||
        agent.business_name?.toLowerCase().includes(search) ||
        agent.location_name?.toLowerCase().includes(search) ||
        agent.os_type.toLowerCase().includes(search)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(agent => agent.status === statusFilter);
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
  };

  const filteredAgents = getFilteredAndSortedAgents();

  // Handle sort
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  // Get sort indicator
  const getSortIndicator = (column: string) => {
    if (sortBy === column) {
      return sortOrder === 'asc' ? '↑' : '↓';
    }
    return '↕';
  };

  // Summary stats
  const stats = {
    total: agents.length,
    online: agents.filter(a => a.status === 'online').length,
    offline: agents.filter(a => a.status === 'offline').length,
    warning: agents.filter(a => a.status === 'warning').length,
    critical: agents.filter(a => a.status === 'critical').length,
  };

  if (!canViewAgents) {
    return (
      <div className="space-y-6">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Agent Monitoring</h1>
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
          <AlertTriangle className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
          <p className={`text-lg ${themeClasses.text.secondary}`}>
            You do not have permission to view monitoring agents
          </p>
        </div>
        <PermissionDeniedModal
          isOpen={permissionDenied.show}
          onClose={() => setPermissionDenied({ show: false })}
          action={permissionDenied.action}
          requiredPermission={permissionDenied.requiredPermission}
          message={permissionDenied.message}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Agent Monitoring</h1>
        <div className="flex gap-3">
          <button
            onClick={loadAgents}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            title="Refresh agent list"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          {canCreateTokens ? (
            <button
              onClick={onCreateRegistrationToken}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Deploy Agent
            </button>
          ) : (
            <button
              onClick={() => setPermissionDenied({
                show: true,
                action: 'Deploy Agent',
                requiredPermission: 'create.agent_tokens.enable',
                message: 'You do not have permission to deploy agents'
              })}
              disabled
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gray-400 cursor-not-allowed opacity-50"
              title="Permission required"
            >
              <Plus className="w-4 h-4 mr-2" />
              Deploy Agent
            </button>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Total Agents</div>
          <div className={`text-2xl font-bold ${themeClasses.text.primary}`}>{stats.total}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Online</div>
          <div className="text-2xl font-bold text-green-600">{stats.online}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Offline</div>
          <div className="text-2xl font-bold text-red-700 dark:text-red-400">{stats.offline}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Warning</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.warning}</div>
        </div>
        <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
          <div className={`text-sm font-medium ${themeClasses.text.secondary}`}>Critical</div>
          <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
        </div>
      </div>

      {/* Filters */}
      <div className={`${themeClasses.bg.card} p-4 rounded-lg ${themeClasses.shadow.md}`}>
        <h3 className={`text-lg font-medium ${themeClasses.text.primary} mb-4 flex items-center`}>
          <Filter className="w-5 h-5 mr-2" />
          Filters
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search devices, businesses..."
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${themeClasses.text.secondary}`}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`mt-1 block w-full rounded-md border ${themeClasses.border.primary} ${themeClasses.bg.primary} ${themeClasses.text.primary} shadow-sm focus:border-blue-500 focus:ring-blue-500`}
            >
              <option value="all">All Status</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
              }}
              className={`inline-flex items-center px-3 py-2 border ${themeClasses.border.primary} shadow-sm text-sm font-medium rounded-md ${themeClasses.text.secondary} ${themeClasses.bg.primary} ${themeClasses.bg.hover}`}
            >
              <X className="w-4 h-4 mr-2" />
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
          <Activity className={`w-8 h-8 mx-auto mb-4 animate-spin ${themeClasses.text.muted}`} />
          <p className={`${themeClasses.text.secondary}`}>Loading agents...</p>
        </div>
      )}

      {/* Agent Table - Desktop */}
      {!loading && (
        <div className={`hidden lg:block ${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className={themeClasses.bg.secondary}>
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('device_name')}
                      className={`flex items-center hover:${themeClasses.text.accent}`}
                    >
                      Device Name
                      <span className="ml-1">{getSortIndicator('device_name')}</span>
                    </button>
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('business_name')}
                      className={`flex items-center hover:${themeClasses.text.accent}`}
                    >
                      Business
                      <span className="ml-1">{getSortIndicator('business_name')}</span>
                    </button>
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    Location
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    Type / OS
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('status')}
                      className={`flex items-center hover:${themeClasses.text.accent}`}
                    >
                      Status
                      <span className="ml-1">{getSortIndicator('status')}</span>
                    </button>
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider border-r ${themeClasses.border.primary}`}>
                    <button
                      onClick={() => handleSort('last_heartbeat')}
                      className={`flex items-center hover:${themeClasses.text.accent}`}
                    >
                      Last Seen
                      <span className="ml-1">{getSortIndicator('last_heartbeat')}</span>
                    </button>
                  </th>
                  <th className={`px-6 py-3 text-left text-xs font-medium ${themeClasses.text.tertiary} uppercase tracking-wider`}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className={`${themeClasses.bg.primary} divide-y divide-gray-200 dark:divide-gray-700`}>
                {filteredAgents.map((agent) => {
                  const statusDisplay = getStatusDisplay(agent.status);
                  return (
                    <tr key={agent.id} className={themeClasses.bg.hover}>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        <div className="flex items-center">
                          <div className={`flex-shrink-0 h-10 w-10 rounded-full ${statusDisplay.bgColor} flex items-center justify-center ${statusDisplay.color}`}>
                            {getDeviceIcon(agent.device_type)}
                          </div>
                          <div className="ml-4">
                            <div className={`text-sm font-medium ${themeClasses.text.primary}`}>
                              {agent.device_name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        <div className={`text-sm ${themeClasses.text.primary}`}>
                          {agent.business_name || 'N/A'}
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        <div className={`text-sm ${themeClasses.text.primary}`}>
                          {agent.location_name || 'N/A'}
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        <div className={`text-sm ${themeClasses.text.primary}`}>
                          {agent.device_type}
                        </div>
                        <div className={`text-xs ${themeClasses.text.secondary}`}>
                          {agent.os_type} {agent.os_version}
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusDisplay.bgColor} ${statusDisplay.color}`}>
                          <span className="mr-1">{statusDisplay.icon}</span>
                          {statusDisplay.label}
                        </span>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap border-r ${themeClasses.border.primary}`}>
                        <div className={`text-sm ${themeClasses.text.secondary}`}>
                          {formatLastSeen(agent.last_heartbeat)}
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium`}>
                        <button
                          onClick={() => onViewAgentDetails?.(agent.id)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400"
                          title="View agent details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Agent Cards - Mobile */}
      {!loading && (
        <div className="lg:hidden space-y-4">
          {filteredAgents.map((agent) => {
            const statusDisplay = getStatusDisplay(agent.status);
            return (
              <div
                key={agent.id}
                className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg border ${themeClasses.border.primary} p-4`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className={`h-12 w-12 rounded-full ${statusDisplay.bgColor} flex items-center justify-center ${statusDisplay.color}`}>
                      {getDeviceIcon(agent.device_type)}
                    </div>
                    <div>
                      <h3 className={`text-base font-semibold ${themeClasses.text.primary}`}>
                        {agent.device_name}
                      </h3>
                      <p className={`text-sm ${themeClasses.text.secondary}`}>
                        {agent.device_type} • {agent.os_type}
                      </p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusDisplay.bgColor} ${statusDisplay.color}`}>
                    <span className="mr-1">{statusDisplay.icon}</span>
                    {statusDisplay.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <span className={`text-xs ${themeClasses.text.muted}`}>Business</span>
                    <div className={themeClasses.text.primary}>{agent.business_name || 'N/A'}</div>
                  </div>
                  <div>
                    <span className={`text-xs ${themeClasses.text.muted}`}>Location</span>
                    <div className={themeClasses.text.primary}>{agent.location_name || 'N/A'}</div>
                  </div>
                  <div className="col-span-2">
                    <span className={`text-xs ${themeClasses.text.muted}`}>Last Seen</span>
                    <div className={themeClasses.text.primary}>{formatLastSeen(agent.last_heartbeat)}</div>
                  </div>
                </div>

                <div className="flex justify-end pt-3 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => onViewAgentDetails?.(agent.id)}
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View Details
                  </button>
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {filteredAgents.length === 0 && (
            <div className={`${themeClasses.bg.card} rounded-lg border ${themeClasses.border.primary} p-8 text-center`}>
              <Monitor className={`w-16 h-16 mx-auto mb-4 ${themeClasses.text.muted}`} />
              <p className={`${themeClasses.text.secondary}`}>No agents found matching your filters.</p>
            </div>
          )}
        </div>
      )}

      {/* Permission Denied Modal */}
      <PermissionDeniedModal
        isOpen={permissionDenied.show}
        onClose={() => setPermissionDenied({ show: false })}
        action={permissionDenied.action}
        requiredPermission={permissionDenied.requiredPermission}
        message={permissionDenied.message}
      />
    </div>
  );
};

export default AgentDashboard;
